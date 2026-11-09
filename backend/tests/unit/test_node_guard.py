"""Chặn nhầm node: Hardhat/Scaffold-ETH cũng là chain 31337 (thường ở cổng 8545) — backend local và fund-wallet
phải từ chối node không phải Anvil (implementation-plan §3 #26). Node giả chỉ trả eth_chainId + web3_clientVersion."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from eth_account import Account

from app.core.config import PROFILES, load_settings
from app.services.container import StartupError, build_container, check_chain_not_rewound
from scripts import fund_wallet

PK = "0x" + "11" * 32


def _fake_node(client: str) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            result = {"eth_chainId": "0x7a69", "net_version": "31337", "web3_clientVersion": client}.get(req["method"], "0x0")
            body = json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": result}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args) -> None:  # noqa: ANN002
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


@pytest.fixture
def hardhat():
    srv = _fake_node("HardhatNetwork/3.21.2/@nomicfoundation/edr/0.3.8")
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_local_default_rpc_is_8386():
    assert PROFILES["local"].rpc_url == "http://127.0.0.1:8386"


def test_backend_refuses_non_anvil_node(hardhat, tmp_path):
    settings = load_settings(env_file=tmp_path / "none.env", overrides={
        "NETWORK": "local", "RPC_URL": hardhat, "VOICE_CAMPAIGNS": "0x" + "1" * 40, "TOKEN_ADDRESS": "0x" + "2" * 40,
        "RELAYER_PRIVATE_KEY": PK, "STORAGE_DIR": str(tmp_path / "storage"),
    })
    with pytest.raises(StartupError, match="không phải Anvil"):
        build_container(settings)


def test_rewound_chain_is_refused():
    check_chain_not_rewound(7, 7)  # đã đọc tới đúng block hiện tại: bình thường
    check_chain_not_rewound(-1, 0)  # database mới
    with pytest.raises(StartupError, match="quay về"):
        check_chain_not_rewound(9, 7)  # Anvil mất các block 8–9 (tắt không bằng Ctrl+C)


def test_fund_wallet_refuses_non_anvil_node(hardhat, monkeypatch, capsys):
    monkeypatch.setenv("NETWORK", "local")
    monkeypatch.setenv("RPC_URL", hardhat)
    monkeypatch.setenv("DATASETMARKETPLACE_API", "http://127.0.0.1:9")  # không được gọi tới
    assert fund_wallet.main([Account.create().address]) == 2
    out = capsys.readouterr().out
    assert "HardhatNetwork" in out and "không nạp tiền" in out
