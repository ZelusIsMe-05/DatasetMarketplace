"""Cấu hình database: chuỗi Neon/Postgres, schema, cấu hình cho script reset (không cần chain)."""
from __future__ import annotations

import pytest

from app.core.config import load_db_config, normalize_database_url, validate_schema


def test_neon_url_uses_psycopg_driver_and_keeps_params():
    raw = "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert normalize_database_url(raw) == raw.replace("postgresql://", "postgresql+psycopg://")
    assert normalize_database_url("postgres://u:p@h/db").startswith("postgresql+psycopg://")


def test_explicit_driver_and_sqlite_untouched():
    assert normalize_database_url("postgresql+psycopg://u@h/db") == "postgresql+psycopg://u@h/db"
    assert normalize_database_url("sqlite:///x.db") == "sqlite:///x.db"
    assert normalize_database_url(None) is None and normalize_database_url("") is None


@pytest.mark.parametrize("name", ["public", "dev_1", "test_ab12"])
def test_valid_schema(name):
    assert validate_schema(name) == name


@pytest.mark.parametrize("name", ["Dev", "1abc", "a-b", "x;drop", "a" * 64])
def test_invalid_schema_rejected(name):
    with pytest.raises(ValueError):
        validate_schema(name)


def test_load_db_config_without_chain(tmp_path):
    cfg = load_db_config(env_file=tmp_path / "none.env", overrides={"NETWORK": "local", "DATABASE_URL": "postgresql://u:p@h/db", "DATABASE_SCHEMA": "dev", "STORAGE_DIR": str(tmp_path)})
    assert cfg.is_postgres and cfg.database_schema == "dev" and cfg.storage_root == tmp_path
    sqlite = load_db_config(env_file=tmp_path / "none.env", overrides={"NETWORK": "local", "DATABASE_URL": "", "STORAGE_DIR": str(tmp_path)})
    assert sqlite.database_url is None and not sqlite.is_postgres
