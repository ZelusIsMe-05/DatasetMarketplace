"""Chốt chặn mainnet (§12.2, §12.6) chạy THẬT trên Anvil giả lập chain id 43114."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core.config import CONTRACTS_DIR, load_settings
from app.services.container import StartupError, build_container
from tests.integration.conftest import KEYS, deploy_all, start_anvil

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def mainnet_like():
    proc, url, w3 = start_anvil(43114)
    yield url, w3
    proc.kill()


def _forge() -> str:
    for c in (shutil.which("forge"), str(Path.home() / ".foundry" / "bin" / "forge.exe")):
        if c and Path(c).exists():
            return c
    pytest.skip("không có forge")


def _script(url: str, script: str, env: dict) -> subprocess.CompletedProcess:
    return subprocess.run([_forge(), "script", script, "--rpc-url", url], cwd=CONTRACTS_DIR, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", env={**os.environ, **env}, timeout=300)


def test_deploy_script_refuses_mock_on_mainnet(mainnet_like):
    url, _ = mainnet_like
    r = _script(url, "script/Deploy.s.sol", {"PRIVATE_KEY": KEYS["deployer"], "USDC_ADDRESS": "0x000000000000000000000000000000000000dEaD"})
    assert r.returncode != 0 and "USDC_ADDRESS is not a contract" in (r.stdout + r.stderr)


def test_seed_demo_refuses_mainnet(mainnet_like):
    url, _ = mainnet_like
    r = _script(url, "script/SeedDemo.s.sol", {"PRIVATE_KEY": KEYS["deployer"],
                                              "VOICE_CAMPAIGNS": "0x000000000000000000000000000000000000dEaD",
                                              "DEMO_BUYER": "0x000000000000000000000000000000000000dEaD"})
    assert r.returncode != 0 and "SeedDemo must never run on mainnet" in (r.stdout + r.stderr)


def test_backend_refuses_mock_token_on_mainnet(mainnet_like, tmp_path):
    url, w3 = mainnet_like
    d = deploy_all(w3)
    s = load_settings(env_file=tmp_path / "none.env", overrides={
        "NETWORK": "mainnet", "RPC_URL": url, "VOICE_CAMPAIGNS": d["vc"], "TOKEN_ADDRESS": d["token"],
        "RELAYER_PRIVATE_KEY": KEYS["deployer"], "FX_URL": "https://fx.invalid/rate", "JWT_SECRET": "j" * 40,
        "TOKEN_SECRET": "t" * 40, "ADMIN_API_KEY": "a", "DEV_AUTH_ENABLED": "false", "STORAGE_DIR": str(tmp_path)})
    with pytest.raises(StartupError, match="MockUSDC"):
        build_container(s)
