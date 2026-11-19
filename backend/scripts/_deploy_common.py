"""Phần chung của các script deploy backend (Azure, Hugging Face): đọc backend/.env.fuji, dựng thư mục build chỉ từ file
Git theo dõi / không bị gitignore (không bao giờ có .env, .venv), và quét để chắc không lẫn giá trị bí mật nào."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

from app.core.config import BACKEND_DIR, REPO_DIR

DEPLOY_DIR = REPO_DIR / "deploy"
SECRET_KEYS = ("RELAYER_PRIVATE_KEY", "QC_ORACLE_PRIVATE_KEY", "JWT_SECRET", "TOKEN_SECRET", "DATABASE_URL",
               "B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET", "GOOGLE_CLIENT_ID")
SKIP_PREFIXES = ("backend/tests/", "backend/.datasetmarketplace-cli/")
SOURCES = ["backend", "seed", "contracts/deployments/43113.json"]
VERCEL_ORIGIN = "https://dataset-marketplace-team1-2026.vercel.app"


def load_fuji_env() -> dict[str, str]:
    env_file = BACKEND_DIR / ".env.fuji"
    if not env_file.exists():
        sys.exit("[LỖI] Chưa có backend\\.env.fuji")
    env = {k: (v or "").strip() for k, v in dotenv_values(env_file).items() if v is not None}
    if env.get("NETWORK") != "fuji":
        sys.exit("[DỪNG] backend\\.env.fuji phải có NETWORK=fuji")
    for k in ("RELAYER_PRIVATE_KEY", "JWT_SECRET", "TOKEN_SECRET", "DATABASE_URL"):
        if not env.get(k):
            sys.exit(f"[LỖI] backend\\.env.fuji thiếu {k}")
    if not (REPO_DIR / "contracts" / "deployments" / "43113.json").exists():
        sys.exit("[LỖI] Chưa có contracts\\deployments\\43113.json — deploy contract Fuji trước")
    return env


def cors_with(env: dict[str, str], *origins: str) -> str:
    have = [o.strip() for o in env.get("CORS_ORIGINS", "").split(",") if o.strip()]
    return ",".join(dict.fromkeys([*have, *origins]))


def stage(dest: Path) -> list[str]:
    """Chép mã cần cho image vào `dest` (giữ cấu trúc thư mục repo) + deploy/Dockerfile ở gốc."""
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "--", *SOURCES], cwd=REPO_DIR,
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout.splitlines()
    files = []
    for rel in out:
        name = rel.rsplit("/", 1)[-1]
        if rel.startswith(SKIP_PREFIXES) or "__pycache__" in rel:
            continue
        if name.startswith(".env") and not name.endswith(".example"):
            sys.exit(f"[DỪNG] File bí mật lọt vào danh sách build: {rel}")
        src = REPO_DIR / rel
        if not src.is_file():
            continue
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest / rel)
        files.append(rel)
    shutil.copy2(DEPLOY_DIR / "Dockerfile", dest / "Dockerfile")
    return files


def scan(dest: Path, env: dict[str, str]) -> None:
    """Dừng nếu bất kỳ file nào trong `dest` chứa giá trị bí mật (khóa ví, secret, mật khẩu database, khóa B2)."""
    needles = {}
    for k in SECRET_KEYS:
        v = env.get(k, "")
        if not v or k in ("GOOGLE_CLIENT_ID", "B2_BUCKET"):  # Client ID công khai trong bundle web; tên bucket không bí mật
            continue
        needles[k] = v.removeprefix("0x")
        if k == "DATABASE_URL" and "@" in v:
            needles[k + " (mật khẩu)"] = v.split("://", 1)[-1].split("@", 1)[0].split(":", 1)[-1]
    for p in dest.rglob("*"):
        if p.is_file():
            text = p.read_bytes().decode("utf-8", "ignore")
            for k, n in needles.items():
                if len(n) >= 8 and n in text:
                    sys.exit(f"[DỪNG] Phát hiện giá trị {k} trong {p.relative_to(dest)} — không gửi đi")
