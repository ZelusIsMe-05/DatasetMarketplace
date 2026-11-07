"""Chạy THẬT trên PostgreSQL (vd. Neon) trong một schema tạm `test_<ngẫu nhiên>` — không đụng dữ liệu dev.

Bật bằng biến môi trường TEST_DATABASE_URL (chuỗi postgresql://... của Neon). Không có biến này thì bỏ qua.
Kiểm tra: migration + toàn bộ luồng nghiệp vụ (tái dùng test_full_business_flow), chốt chặn deployment,
script reset (xóa database + audio cùng lúc) và lần khởi động sau chỉ còn seed + dữ liệu đọc lại từ chain.
"""
from __future__ import annotations

import os
import secrets

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.config import normalize_database_url
from app.models import CampaignDraft, Contribution, KvState, User
from app.models.session import make_engine
from app.services.container import DEPLOYMENT_KEY, StartupError, build_container
from tests.integration import test_api_flow as flow
from tests.integration.conftest import make_settings

pytestmark = [pytest.mark.integration, pytest.mark.postgres]
PG_URL = os.environ.get("TEST_DATABASE_URL")
if not PG_URL:
    pytest.skip("Đặt TEST_DATABASE_URL để chạy test PostgreSQL/Neon", allow_module_level=True)


@pytest.fixture(scope="module")
def pg(chain, qc_service, tmp_path_factory):
    from app.main import create_app

    schema = f"test_{secrets.token_hex(4)}"
    storage = tmp_path_factory.mktemp("pg")
    settings = make_settings(chain, storage, DATABASE_URL=PG_URL, DATABASE_SCHEMA=schema)
    app = create_app(settings, qc_service=qc_service)
    flow._tokens.clear()  # phiên đăng nhập của DB SQLite không dùng được ở DB này
    with TestClient(app) as client:
        client.container = app.state.container  # type: ignore[attr-defined]
        yield {"client": client, "settings": settings, "schema": schema, "storage": settings.storage_root}
    flow._tokens.clear()
    app.state.container.engine.dispose()
    eng = make_engine(normalize_database_url(PG_URL))
    with eng.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    eng.dispose()


def test_runs_on_postgres(pg):
    c = pg["client"]
    assert c.get("/health").json()["database"] == "postgresql"
    with c.container.sf() as s:
        assert s.execute(text("select current_schema()")).scalar() == pg["schema"]
        assert s.get(KvState, DEPLOYMENT_KEY) is not None


def test_full_business_flow_on_postgres(pg, chain):
    flow.test_full_business_flow(pg["client"], chain)
    with pg["client"].container.sf() as s:
        assert s.scalar(select(func.count()).select_from(Contribution)) >= 4


def test_guard_refuses_other_deployment(pg):
    sf = pg["client"].container.sf
    with sf() as s:
        row = s.get(KvState, DEPLOYMENT_KEY)
        original = row.value
        row.value = '{"fingerprint": "khac", "chainId": 31337, "contract": "0xOld"}'
        s.commit()
    try:
        with pytest.raises(StartupError, match="deployment khác"):
            build_container(pg["settings"])
    finally:
        with sf() as s:
            s.get(KvState, DEPLOYMENT_KEY).value = original
            s.commit()


def test_reset_script_wipes_db_and_audio_then_restart_reloads(pg, monkeypatch):
    from scripts import reset_db

    data_dirs = list(pg["storage"].glob("local-*"))
    assert data_dirs and any(data_dirs[0].rglob("*.wav")), "luồng nghiệp vụ phải để lại audio"
    pg["client"].container.engine.dispose()
    monkeypatch.setenv("NETWORK", "local")
    monkeypatch.setenv("DATABASE_URL", PG_URL)
    monkeypatch.setenv("DATABASE_SCHEMA", pg["schema"])
    monkeypatch.setenv("STORAGE_DIR", str(pg["storage"]))
    assert reset_db.main(["--yes"]) == 0
    assert not list(pg["storage"].glob("local-*")), "audio phải bị xóa cùng database"

    # Khởi động lại: bảng tạo lại, seed nạp lại, dữ liệu on-chain đọc lại từ chain; dữ liệu off-chain đã mất
    c2 = build_container(pg["settings"])
    try:
        with c2.sf() as s:
            assert s.scalar(select(func.count()).select_from(User)) == 0
            assert s.scalar(select(func.count()).select_from(Contribution)) == 0
            drafts = s.scalars(select(CampaignDraft)).all()
            assert [d.source for d in drafts] == ["seed"]
    finally:
        c2.engine.dispose()


def test_reset_refuses_mainnet_and_guarded_fuji(monkeypatch, capsys):
    from scripts import reset_db

    monkeypatch.setenv("NETWORK", "mainnet")
    assert reset_db.main(["--yes"]) == 2
    monkeypatch.setenv("NETWORK", "fuji")
    assert reset_db.main(["--yes"]) == 2
    assert "--allow-fuji" in capsys.readouterr().out
