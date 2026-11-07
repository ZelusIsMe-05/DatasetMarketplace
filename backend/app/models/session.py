"""Engine + session factory, migration Alembic khi khởi động, và xóa dữ liệu (chỉ dùng cho script reset).

Hỗ trợ hai loại database:
- SQLite (mặc định): một file trong thư mục dữ liệu của từng deployment.
- PostgreSQL (vd. Neon) qua `DATABASE_URL`; tùy chọn `DATABASE_SCHEMA` để tách dữ liệu theo schema.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import BACKEND_DIR


def is_postgres(url: str) -> bool:
    return url.startswith("postgresql")


def make_engine(url: str, schema: str | None = None) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30}, future=True)

        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine

    connect_args: dict = {"connect_timeout": 15}
    if schema:
        # Kết nối trực tiếp (không qua pooler) nên tham số khởi động search_path hoạt động
        connect_args["options"] = f"-csearch_path={schema}"
    return create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,  # Neon tự tắt compute khi rảnh: kiểm tra kết nối trước khi dùng
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
        future=True,
    )


def ensure_schema(url: str, schema: str | None) -> None:
    if not schema or not is_postgres(url):
        return
    engine = make_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    finally:
        engine.dispose()


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def run_migrations(url: str, schema: str | None = None) -> None:
    from alembic import command
    from alembic.config import Config

    ensure_schema(url, schema)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    cfg.attributes["configure_logger"] = False
    engine = make_engine(url, schema)
    try:
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn  # alembic/env.py dùng kết nối này (đúng schema)
            command.upgrade(cfg, "head")
    finally:
        engine.dispose()


def drop_all_data(url: str, schema: str | None = None) -> list[str]:
    """XÓA TOÀN BỘ bảng của ứng dụng. Chỉ gọi từ scripts/reset_db.py. Trả về danh sách đã xóa."""
    from app.models import Base

    if schema and is_postgres(url):
        engine = make_engine(url)
        try:
            with engine.begin() as conn:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        finally:
            engine.dispose()
        return [f"schema {schema}"]
    engine = make_engine(url, schema)
    try:
        names = sorted(Base.metadata.tables)
        Base.metadata.drop_all(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        return names + ["alembic_version"]
    finally:
        engine.dispose()


def sqlite_url(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path.as_posix()}"


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    s = factory()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
