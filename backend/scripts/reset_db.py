"""Xóa TOÀN BỘ dữ liệu off-chain của một mạng: bảng database (SQLite hoặc PostgreSQL/Neon) + audio riêng tư.

Database và audio luôn được xóa CÙNG NHAU để không còn file audio "mồ côi" (dữ liệu giọng nói cá nhân).
Không đụng tới blockchain — với local, hãy khởi động lại Anvil + deploy lại để chain cũng sạch (README §8).

    python -m scripts.reset_db              # NETWORK lấy từ biến môi trường (mặc định local), hỏi xác nhận
    python -m scripts.reset_db --yes        # không hỏi (dùng trong script)

Mainnet: luôn từ chối. Fuji: chỉ chạy khi có thêm --allow-fuji (không nên khi contract còn đang dùng).
Lần chạy backend tiếp theo tự tạo lại bảng (Alembic), nạp chiến dịch mẫu từ seed/ và đọc lại sự kiện từ chain.
"""
from __future__ import annotations

import argparse
import shutil
import sys

from sqlalchemy.engine import make_url

from app.core.config import load_db_config
from app.models.session import drop_all_data


def _mask(url: str) -> str:
    """Hiện host/database, che mật khẩu."""
    u = make_url(url)
    return u.render_as_string(hide_password=True)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="python -m scripts.reset_db", description="Xóa toàn bộ dữ liệu off-chain (database + audio)")
    ap.add_argument("--yes", action="store_true", help="không hỏi xác nhận")
    ap.add_argument("--allow-fuji", action="store_true", help="cho phép chạy với NETWORK=fuji")
    ap.add_argument("--keep-audio", action="store_true", help="chỉ xóa database (không khuyến khích)")
    args = ap.parse_args(argv)

    cfg = load_db_config()
    if cfg.network == "mainnet":
        print("[TỪ CHỐI] Không bao giờ reset dữ liệu mainnet.")
        return 2
    if cfg.network == "fuji" and not args.allow_fuji:
        print("[TỪ CHỐI] NETWORK=fuji: dữ liệu đang phục vụ contract trên Fuji. Thêm --allow-fuji nếu thật sự muốn xóa.")
        return 2

    audio_dirs = sorted(p for p in cfg.storage_root.glob(f"{cfg.network}-*") if p.is_dir())
    target_db = _mask(cfg.database_url) if cfg.database_url else "SQLite trong từng thư mục dữ liệu bên dưới"
    print(f"Mạng: {cfg.network}")
    print(f"Database: {target_db}" + (f" (schema {cfg.database_schema})" if cfg.database_schema else ""))
    action = "GIỮ LẠI (--keep-audio)" if args.keep_audio else "sẽ xóa"
    print(f"Thư mục dữ liệu/audio {action} ({len(audio_dirs)}): " + (", ".join(p.name for p in audio_dirs) or "không có"))
    print("Hãy TẮT backend trước khi reset.")
    if not args.yes:
        if input('Gõ RESET để xác nhận: ').strip() != "RESET":
            print("Đã hủy.")
            return 1

    if cfg.database_url:
        dropped = drop_all_data(cfg.database_url, cfg.database_schema)
        print(f"✔ Đã xóa trên database: {', '.join(dropped)}")
    if not args.keep_audio:
        for d in audio_dirs:
            shutil.rmtree(d)  # audio + (nếu dùng SQLite) file database
        print(f"✔ Đã xóa {len(audio_dirs)} thư mục dữ liệu/audio trong {cfg.storage_root}")
    print("Xong. Lần chạy backend tiếp theo sẽ tạo lại bảng, nạp chiến dịch mẫu từ seed/ và đồng bộ lại từ chain.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
