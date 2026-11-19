"""Deploy backend (NETWORK=fuji) lên một máy ảo Azure: Ubuntu 22.04 + Docker Compose (API + Caddy HTTPS tự động).

    scripts\\deploy-azure.bat              # KIỂM TRA: az đã đăng nhập, subscription, cỡ máy dùng được ở vùng; dựng + quét
                                          #           thư mục build. Không tạo gì, không gửi gì.
    scripts\\deploy-azure.bat --create     # tạo resource group + máy ảo (một lần), mở cổng 80/443, rồi deploy
    scripts\\deploy-azure.bat --deploy     # cập nhật mã + biến môi trường lên máy ảo đã có, build lại, chờ /health

Tùy chọn: --region eastasia (Hong Kong) · --size Standard_B2als_v2 (2 vCPU, 4 GB RAM). Azure for Students chỉ cho deploy ở
koreacentral, japanwest, malaysiawest, eastasia, uaenorth (policy "Allowed resource deployment regions", kiểm 20/11/2026);
malaysiawest không có cỡ máy nào cho subscription này, eastasia gần Neon (Singapore) nhất trong số còn lại.

- Đăng nhập Azure một lần trước đó: `az login` (tài khoản Azure for Students). Script không đọc/in mật khẩu hay token.
- Khóa SSH riêng cho máy ảo: ~/.ssh/datasetmarketplace_azure (tự tạo, không mật khẩu, chỉ nằm trên máy này).
- Bí mật (khóa relayer, JWT/TOKEN secret, DATABASE_URL, B2) lấy từ backend/.env.fuji, gửi qua SSH thành ~/dm/backend.env
  (chmod 600) trên máy ảo — không nằm trong image, không nằm trong repo. API_PUBLIC_URL = https://<tên miền máy ảo>.
- KHÔNG chạy song song backend Fuji ở nơi khác (chung ví relayer ⇒ trùng nonce; chung database).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import httpx

from scripts._deploy_common import DEPLOY_DIR, VERCEL_ORIGIN, cors_with, load_fuji_env, scan, stage

RG = "datasetmarketplace-rg"
VM = "dm-api"
ADMIN = "azureuser"
IMAGE = "Ubuntu2204"
KEY = Path.home() / ".ssh" / "datasetmarketplace_azure"
FALLBACK_SIZES = ("Standard_B2als_v2", "Standard_B2s", "Standard_B2as_v2", "Standard_D2als_v6", "Standard_D2as_v5")
AZURE_DIR = DEPLOY_DIR / "azure"


def _az_bin() -> str:
    for c in (shutil.which("az"), r"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
              r"C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"):
        if c and Path(c).exists():
            return c
    sys.exit("[LỖI] Chưa có Azure CLI. Cài: winget install -e --id Microsoft.AzureCLI — rồi mở cửa sổ mới, chạy az login")


def az(*args: str, check: bool = True) -> object:
    r = subprocess.run([_az_bin(), *args, "-o", "json", "--only-show-errors"], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        if check:
            sys.exit(f"[LỖI] az {' '.join(args[:3])}: {r.stderr.strip()[:1500]}")
        return None
    return json.loads(r.stdout) if r.stdout.strip() else None


def _ssh_base(host: str) -> list[str]:
    return ["-i", str(KEY), "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30",
            "-o", "ConnectTimeout=20", f"{ADMIN}@{host}"]


def ssh(host: str, command: str, check: bool = True) -> int:
    rc = subprocess.run([shutil.which("ssh") or "ssh", *_ssh_base(host), command]).returncode
    if check and rc != 0:
        sys.exit(f"[LỖI] Lệnh trên máy ảo thất bại (mã {rc}): {command[:120]}")
    return rc


def _ensure_key() -> None:
    if not KEY.exists():
        KEY.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([shutil.which("ssh-keygen") or "ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C",
                        "datasetmarketplace-azure", "-f", str(KEY)], check=True)
        print(f"  ✓ Tạo khóa SSH {KEY}")


def _size_ok(region: str, size: str) -> bool:
    skus = az("vm", "list-skus", "-l", region, "--size", size, "--resource-type", "virtualMachines", "--all", check=False) or []
    for s in skus:
        if s.get("name") == size:
            return not any(r.get("type") == "Location" or r.get("reasonCode") == "NotAvailableForSubscription"
                           for r in s.get("restrictions") or [])
    return False


def _pick_size(region: str, wanted: str) -> str | None:
    for size in dict.fromkeys([wanted, *FALLBACK_SIZES]):
        if _size_ok(region, size):
            return size
    return None


def _vm_host() -> str | None:
    vm = az("vm", "show", "-d", "-g", RG, "-n", VM, check=False)
    if not vm:
        return None
    return vm.get("fqdns") or vm.get("publicIps")


def _backend_env(env: dict[str, str], host: str) -> str:
    vals = dict(env)
    vals["API_PUBLIC_URL"] = f"https://{host}"
    vals["CORS_ORIGINS"] = cors_with(env, VERCEL_ORIGIN, "http://localhost:3000")
    vals.setdefault("QC_PRELOAD", "true")
    # env_file của Compose có thể nội suy "$" ⇒ nhân đôi để giữ nguyên giá trị
    return "".join(f"{k}={v.replace('$', '$$')}\n" for k, v in vals.items())


def _bundle(env: dict[str, str], host: str) -> bytes:
    tmp = Path(tempfile.mkdtemp(prefix="dm-azure-"))
    try:
        files = stage(tmp)
        for f in ("docker-compose.yml", "Caddyfile"):
            shutil.copy2(AZURE_DIR / f, tmp / f)
        scan(tmp, env)  # quét TRƯỚC khi thêm backend.env (file bí mật duy nhất, chỉ gửi qua SSH)
        print(f"  Thư mục build: {len(files) + 3} file — đã quét, không lẫn bí mật")
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(tmp, arcname=".")
            data = _backend_env(env, host).encode("utf-8")
            info = tarfile.TarInfo("./backend.env")
            info.size, info.mode = len(data), 0o600
            tar.addfile(info, io.BytesIO(data))
            dom = f"DOMAIN={host}\n".encode()
            info = tarfile.TarInfo("./.env")
            info.size, info.mode = len(dom), 0o600
            tar.addfile(info, io.BytesIO(dom))
        return buf.getvalue()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _deploy(env: dict[str, str], host: str, wait_min: int) -> int:
    print(f"\n==== Deploy lên {host} ====")
    blob = _bundle(env, host)
    local = Path(tempfile.mkdtemp(prefix="dm-azure-tar-")) / "dm.tar.gz"
    local.write_bytes(blob)
    try:
        print("  Chờ máy ảo cài xong Docker (cloud-init)…", flush=True)
        ssh(host, "cloud-init status --wait >/dev/null; docker --version")
        rc = subprocess.run([shutil.which("scp") or "scp", *_ssh_base(host)[:-1], str(local), f"{ADMIN}@{host}:dm.tar.gz"]).returncode
        if rc != 0:
            sys.exit(f"[LỖI] scp thất bại (mã {rc})")
    finally:
        shutil.rmtree(local.parent, ignore_errors=True)
    print("  Build image + khởi động (lần đầu ~10–15 phút: tải torch, model QC)…", flush=True)
    ssh(host, "set -e; mkdir -p ~/dm && cd ~/dm && rm -rf backend seed contracts && tar xzf ~/dm.tar.gz -C ~/dm && rm ~/dm.tar.gz"
              " && chmod 600 backend.env .env && sudo docker compose up -d --build && sudo docker image prune -f >/dev/null")
    t0 = time.time()
    while time.time() - t0 < wait_min * 60:
        try:
            h = httpx.get(f"https://{host}/health", timeout=20).json()
            print(f"\n✓ Backend chạy: network={h.get('network')} chain={h.get('chain_id')} db={h.get('database')} "
                  f"storage={h.get('storage')} qc={h.get('qc_model_loaded')}")
            print(f"  API: https://{host}  ·  Swagger: https://{host}/docs")
            return 0
        except (httpx.HTTPError, ValueError):
            time.sleep(15)
    print(f"[CẢNH BÁO] Sau {wait_min} phút https://{host}/health chưa trả lời. Log gần nhất:")
    ssh(host, "cd ~/dm && sudo docker compose ps && sudo docker compose logs --tail 60", check=False)
    return 1


def main(argv: list[str] | None = None) -> int:  # noqa: C901
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Deploy backend lên máy ảo Azure (mặc định chỉ kiểm tra)")
    ap.add_argument("--create", action="store_true", help="tạo resource group + máy ảo rồi deploy")
    ap.add_argument("--deploy", action="store_true", help="cập nhật mã lên máy ảo đã có")
    ap.add_argument("--region", default="eastasia")
    ap.add_argument("--size", default="Standard_B2als_v2")
    ap.add_argument("--wait-min", type=int, default=30)
    a = ap.parse_args(argv)

    env = load_fuji_env()
    acct = az("account", "show", check=False)
    if not acct:
        sys.exit("[LỖI] Chưa đăng nhập Azure. Chạy: az login (chọn subscription Azure for Students)")
    print(f"Azure: subscription \"{acct['name']}\" ({acct['state']}) · tài khoản {acct['user']['name']}")
    host = _vm_host()

    if not a.create and not a.deploy:
        size = _pick_size(a.region, a.size)
        print(f"  Vùng {a.region}: cỡ máy dùng được = {size or 'KHÔNG CÓ (thử --region khác, vd. koreacentral / japanwest)'}")
        print(f"  Máy ảo {RG}/{VM}: {host or 'chưa tạo'}")
        tmp = Path(tempfile.mkdtemp())
        try:
            stage(tmp)
            scan(tmp, env)
            print("  Thư mục build: đã quét, không lẫn bí mật")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        print("\n✓ Kiểm tra xong (chưa tạo gì). Tạo máy ảo + deploy: scripts\\deploy-azure.bat --create")
        return 0

    if a.create and not host:
        size = _pick_size(a.region, a.size)
        if not size:
            sys.exit(f"[DỪNG] Vùng {a.region} không có cỡ máy phù hợp cho subscription này — thử --region khác")
        _ensure_key()
        label = "datasetmarketplace-" + hashlib.sha256(acct["id"].encode()).hexdigest()[:6]
        print(f"\n==== Tạo máy ảo {VM} ({size}, {a.region}) ====")
        az("group", "create", "-n", RG, "-l", a.region)
        az("vm", "create", "-g", RG, "-n", VM, "--image", IMAGE, "--size", size, "--admin-username", ADMIN,
           "--ssh-key-values", str(KEY.with_suffix(".pub")), "--public-ip-sku", "Standard",
           "--public-ip-address-dns-name", label, "--os-disk-size-gb", "32",
           "--custom-data", str(AZURE_DIR / "cloud-init.yaml"))
        az("vm", "open-port", "-g", RG, "-n", VM, "--port", "80,443", "--priority", "1010")
        host = _vm_host()
        print(f"  ✓ Máy ảo: {host}")
    elif a.create:
        print(f"  Máy ảo đã có: {host} — chỉ deploy")
    if not host:
        sys.exit("[LỖI] Chưa có máy ảo — chạy scripts\\deploy-azure.bat --create")
    _ensure_key()
    return _deploy(env, host, a.wait_min)


if __name__ == "__main__":
    raise SystemExit(main())
