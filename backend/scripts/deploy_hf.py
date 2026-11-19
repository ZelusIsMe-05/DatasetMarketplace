"""Deploy backend lên Hugging Face Spaces (Docker) với NETWORK=fuji — CẦN gói HF PRO (từ 11/2026 Docker Space trên CPU free
    cpu-basic yêu cầu PRO; lỗi 402 khi tạo Space nếu chưa có). Đang dùng Azure: scripts\\deploy-azure.bat.

    scripts\\deploy-hf.bat                       # CHẠY THỬ: dựng thư mục build, quét bí mật, KHÔNG tải gì lên
    scripts\\deploy-hf.bat --upload              # tạo/cập nhật Space, đặt secrets + variables, tải mã, chờ Space chạy
    scripts\\deploy-hf.bat --upload --space ten  # tên Space khác (mặc định dataset-marketplace-api)

- Đăng nhập HF một lần trước đó: backend\\.venv\\Scripts\\hf.exe auth login (token quyền Write) — script không bao giờ
  nhận/in token.
- Giá trị lấy từ backend/.env.fuji: biến bí mật ⇒ Space *secrets*; còn lại ⇒ Space *variables*; API_PUBLIC_URL tự đặt
  bằng địa chỉ https://<chủ>-<space>.hf.space.
- Thư mục build chỉ gồm file Git theo dõi / không bị gitignore (không bao giờ có .env, .venv), bỏ tests; quét mọi file
  xem có lẫn giá trị bí mật nào không trước khi tải lên Space công khai.
- KHÔNG chạy song song backend Fuji ở máy khác: chung ví relayer (nonce) và chung database.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

import httpx

from scripts._deploy_common import DEPLOY_DIR, SECRET_KEYS, load_fuji_env, scan, stage

DONE = {"RUNNING"}
FAILED = {"BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE", "DELETING"}


def _stage(dest: Path) -> list[str]:
    files = stage(dest)
    shutil.copy2(DEPLOY_DIR / "huggingface" / "README.md", dest / "README.md")  # thẻ Space (sdk: docker, app_port)
    return files


def _space_host(api, repo_id: str) -> str:  # noqa: ANN001
    info = api.space_info(repo_id)
    host = getattr(info, "host", None)
    if host:
        return host.rstrip("/")
    owner, name = repo_id.split("/")
    return f"https://{owner}-{name}".lower().replace("_", "-").replace(".", "-") + ".hf.space"


def _logs(repo_id: str, kind: str, token: str, lines: int = 40) -> str:
    url = f"https://huggingface.co/api/spaces/{repo_id}/logs/{kind}"
    got: list[str] = []
    try:
        with httpx.stream("GET", url, headers={"Authorization": f"Bearer {token}"}, timeout=httpx.Timeout(20, read=8)) as r:
            for ln in r.iter_lines():
                if ln.startswith("data:"):
                    got.append(ln[5:].strip()[:300])
    except httpx.HTTPError:
        pass
    return "\n".join(got[-lines:])


def main(argv: list[str] | None = None) -> int:  # noqa: C901, PLR0915
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Deploy backend lên Hugging Face Spaces (mặc định chỉ chạy thử)")
    ap.add_argument("--upload", action="store_true", help="tạo/cập nhật Space và tải mã lên")
    ap.add_argument("--space", default="dataset-marketplace-api", help="tên Space")
    ap.add_argument("--wait-min", type=int, default=45, help="số phút tối đa chờ Space chạy")
    a = ap.parse_args(argv)

    env = load_fuji_env()
    secrets = {k: env[k] for k in SECRET_KEYS if env.get(k)}
    variables = {k: v for k, v in env.items() if k not in SECRET_KEYS and v != ""}

    stage = Path(tempfile.mkdtemp(prefix="hf-space-"))
    try:
        files = _stage(stage)
        scan(stage, env)
        size = sum(p.stat().st_size for p in stage.rglob("*") if p.is_file())
        print(f"Thư mục build: {len(files) + 2} file, {size / 1024:.0f} KB — đã quét, không lẫn bí mật")
        print(f"  Secrets ({len(secrets)}): {', '.join(secrets)}")
        print(f"  Variables ({len(variables) + 1}): {', '.join(sorted({*variables, 'API_PUBLIC_URL'}))}")
        if not a.upload:
            print("\n✓ Chạy thử đạt (không tải gì lên). Deploy thật: scripts\\deploy-hf.bat --upload")
            return 0

        from huggingface_hub import HfApi, get_token

        token = get_token()
        if not token:
            sys.exit("[LỖI] Chưa đăng nhập Hugging Face. Chạy: backend\\.venv\\Scripts\\hf.exe auth login (token quyền Write)")
        api = HfApi(token=token)
        user = api.whoami()["name"]
        repo_id = f"{user}/{a.space}"
        api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=False, exist_ok=True)
        host = _space_host(api, repo_id)
        variables["API_PUBLIC_URL"] = host
        print(f"\nSpace: https://huggingface.co/spaces/{repo_id}  ·  API: {host}")
        for k, v in secrets.items():
            api.add_space_secret(repo_id, k, v)
        for k, v in variables.items():
            api.add_space_variable(repo_id, k, v)
        print(f"  ✓ Đặt {len(secrets)} secrets + {len(variables)} variables")
        api.upload_folder(folder_path=str(stage), repo_id=repo_id, repo_type="space",
                          commit_message="Deploy backend (Fuji) từ scripts/deploy-hf.bat",
                          delete_patterns=["backend/**", "seed/**", "contracts/**"])
        print("  ✓ Đã tải mã lên — Hugging Face đang build image (lần đầu ~10–20 phút)")
    finally:
        shutil.rmtree(stage, ignore_errors=True)

    stage_name, t0 = "", time.time()
    time.sleep(20)
    while time.time() - t0 < a.wait_min * 60:
        rt = api.get_space_runtime(repo_id)
        if rt.stage != stage_name:
            stage_name = rt.stage
            print(f"  [{int(time.time() - t0) // 60:>2} phút] {stage_name}", flush=True)
        if stage_name in DONE:
            break
        if stage_name in FAILED:
            kind = "build" if stage_name == "BUILD_ERROR" else "run"
            print(f"\n[LỖI] Space {stage_name}. Log {kind} cuối:\n" + _logs(repo_id, kind, token))
            return 1
        time.sleep(15)
    else:
        print(f"[CẢNH BÁO] Hết {a.wait_min} phút mà Space chưa chạy — xem https://huggingface.co/spaces/{repo_id}")
        return 1

    for _ in range(40):  # Space RUNNING nhưng uvicorn có thể còn đang nạp model + đồng bộ chain
        try:
            h = httpx.get(f"{host}/health", timeout=30).json()
            print(f"\n✓ Backend chạy: network={h.get('network')} chain={h.get('chain_id')} db={h.get('database')} "
                  f"storage={h.get('storage')} qc={h.get('qc_model_loaded')}")
            print(f"  API: {host}  ·  Swagger: {host}/docs")
            return 0
        except (httpx.HTTPError, ValueError):
            time.sleep(15)
    print(f"[CẢNH BÁO] Space RUNNING nhưng {host}/health chưa trả lời — xem log tại https://huggingface.co/spaces/{repo_id}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
