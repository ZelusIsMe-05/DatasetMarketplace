"""Fixture tích hợp: tự khởi chạy Anvil (cổng ngẫu nhiên), deploy contract THẬT từ artifact Foundry,
dựng app FastAPI thật với QC thật. Yêu cầu: `forge build` đã chạy và có anvil (Foundry)."""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest
from eth_account import Account
from fastapi.testclient import TestClient
from web3 import Web3

from app.core.config import CONTRACTS_DIR, QcSettings, load_settings
from app.qc.service import QcService

Account.enable_unaudited_hdwallet_features()
MNEMONIC = "test test test test test test test test test test test junk"
KEYS = {
    name: "0x" + Account.from_mnemonic(MNEMONIC, account_path=f"m/44'/60'/0'/0/{i}").key.hex().removeprefix("0x")
    for name, i in {"deployer": 0, "buyer": 1, "creator": 2, "an": 3, "binh": 4, "labx": 5, "laby": 6, "eve": 7}.items()
}
ADDR = {k: Account.from_key(v).address for k, v in KEYS.items()}


def _anvil_bin() -> str:
    for c in (shutil.which("anvil"), str(Path.home() / ".foundry" / "bin" / "anvil.exe"), str(Path.home() / ".foundry" / "bin" / "anvil")):
        if c and Path(c).exists():
            return c
    pytest.skip("Không tìm thấy anvil (cài Foundry: scripts\\setup.bat)")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_anvil(chain_id: int):  # noqa: ANN201
    port = _free_port()
    proc = subprocess.Popen([_anvil_bin(), "--port", str(port), "--chain-id", str(chain_id), "--silent"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    w3 = Web3(Web3.HTTPProvider(url))
    for _ in range(100):
        try:
            w3.eth.block_number
            return proc, url, w3
        except Exception:  # noqa: BLE001
            time.sleep(0.2)
    proc.kill()
    raise RuntimeError("anvil không khởi động được")


def _artifact(sol: str, name: str) -> dict:
    p = CONTRACTS_DIR / "out" / sol / f"{name}.json"
    if not p.exists():
        pytest.skip("Chưa có artifact Foundry — chạy `forge build` trong contracts/")
    return json.loads(p.read_text(encoding="utf-8"))


def send(w3: Web3, key: str, fn=None, deploy: dict | None = None, args: tuple = ()):  # noqa: ANN001, ANN201
    acct = Account.from_key(key)
    if deploy is not None:
        fn = w3.eth.contract(abi=deploy["abi"], bytecode=deploy["bytecode"]["object"]).constructor(*args)
    tx = fn.build_transaction({"from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address, "pending"),
                               "chainId": w3.eth.chain_id})
    r = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction))
    assert r["status"] == 1
    return r


def deploy_all(w3: Web3, claim_fee: int = 100_000) -> dict:
    usdc_art, vc_art = _artifact("MockUSDC.sol", "MockUSDC"), _artifact("VoiceCampaigns.sol", "VoiceCampaigns")
    start = w3.eth.block_number
    token = send(w3, KEYS["deployer"], deploy=usdc_art)["contractAddress"]
    vc = send(w3, KEYS["deployer"], deploy=vc_art, args=(token, ADDR["deployer"], ADDR["deployer"]))["contractAddress"]
    vcc = w3.eth.contract(address=vc, abi=vc_art["abi"])
    send(w3, KEYS["deployer"], vcc.functions.setClaimFee(claim_fee, ADDR["deployer"]))
    return {"token": token, "vc": vc, "deploy_block": start, "vc_abi": vc_art["abi"], "token_abi": usdc_art["abi"]}


@pytest.fixture(scope="session")
def qc_service() -> QcService:
    svc = QcService(QcSettings())
    svc.get()
    return svc


@pytest.fixture(scope="session")
def chain():
    proc, url, w3 = start_anvil(31337)
    d = deploy_all(w3)
    yield {"url": url, "w3": w3, **d,
           "vc_c": w3.eth.contract(address=d["vc"], abi=d["vc_abi"]),
           "token_c": w3.eth.contract(address=d["token"], abi=d["token_abi"])}
    proc.kill()


def make_settings(chain: dict, tmp: Path, **extra: str):  # noqa: ANN201
    return load_settings(
        env_file=tmp / "none.env",
        overrides={
            "NETWORK": "local",
            "RPC_URL": chain["url"],
            "VOICE_CAMPAIGNS": chain["vc"],
            "TOKEN_ADDRESS": chain["token"],
            "DEPLOY_BLOCK": str(chain["deploy_block"]),
            "RELAYER_PRIVATE_KEY": KEYS["deployer"],
            "STORAGE_DIR": str(tmp / "storage"),
            "ADMIN_API_KEY": "test-admin",
            "DEV_AUTH_ENABLED": "true",
            "RATE_LIMIT_ENABLED": "false",
            "INDEXER_INTERVAL_SEC": "0",
            "API_PUBLIC_URL": "http://testserver",
            **extra,
        },
    )


@pytest.fixture(scope="session")
def app_client(chain, qc_service, tmp_path_factory):
    from app.main import create_app

    settings = make_settings(chain, tmp_path_factory.mktemp("gq"))
    app = create_app(settings, qc_service=qc_service)
    with TestClient(app) as client:
        client.container = app.state.container  # type: ignore[attr-defined]
        yield client


@pytest.fixture(autouse=True)
def _env_guard(monkeypatch):
    monkeypatch.setenv("NETWORK", os.environ.get("NETWORK", "local"))
