"""Kho ví test + phiên đăng nhập của CLI (file JSON cục bộ, đã nằm trong .gitignore).

CẢNH BÁO: khóa riêng lưu dạng rõ — chỉ dành cho ví test trên Anvil/Fuji, không dùng cho ví có tiền thật.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

from eth_account import Account

STATE_DIR = Path(os.environ.get("DATASETMARKETPLACE_CLI_HOME", Path(__file__).resolve().parents[1] / ".datasetmarketplace-cli"))
STATE_FILE = STATE_DIR / "state.json"

ANVIL_MNEMONIC = "test test test test test test test test test test test junk"  # mnemonic công khai của Anvil
# Vai trò mặc định trên Anvil (deployer = owner/nền tảng = relayer/QC oracle, theo mặc định của Deploy.s.sol)
LOCAL_ROLES = {
    "deployer": 0,
    "buyer": 1,  # DEMO_BUYER của SeedDemo.s.sol
    "creator": 2,  # TổngĐài AI
    "an": 3,
    "binh": 4,
    "labx": 5,
    "laby": 6,
}


@dataclass
class Wallet:
    name: str
    address: str
    private_key: str


class CliState:
    def __init__(self, path: Path = STATE_FILE):
        self.path = path
        self.data: dict = {"wallets": {}, "sessions": {}}
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
            self.data.setdefault("wallets", {})
            self.data.setdefault("sessions", {})

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------ ví

    def add_wallet(self, name: str, private_key: str) -> Wallet:
        acct = Account.from_key(private_key)
        self.data["wallets"][name] = {"address": acct.address, "private_key": "0x" + acct.key.hex().removeprefix("0x")}
        self.save()
        return self.wallet(name)

    def wallet(self, name: str) -> Wallet:
        w = self.data["wallets"].get(name)
        if w is None:
            raise KeyError(name)
        return Wallet(name=name, address=w["address"], private_key=w["private_key"])

    def wallets(self) -> list[Wallet]:
        return [self.wallet(n) for n in self.data["wallets"]]

    def init_local(self) -> list[Wallet]:
        Account.enable_unaudited_hdwallet_features()
        out = []
        for name, idx in LOCAL_ROLES.items():
            acct = Account.from_mnemonic(ANVIL_MNEMONIC, account_path=f"m/44'/60'/0'/0/{idx}")
            out.append(self.add_wallet(name, "0x" + acct.key.hex().removeprefix("0x")))
        return out

    # ------------------------------------------------------------------ phiên đăng nhập

    def set_session(self, name: str, api: str, token: str, expires_at: int, email: str) -> None:
        self.data["sessions"][f"{api}|{name}"] = {"token": token, "expires_at": expires_at, "email": email}
        self.save()

    def session(self, name: str, api: str) -> str | None:
        s = self.data["sessions"].get(f"{api}|{name}")
        if not s or s["expires_at"] < time.time() + 30:
            return None
        return s["token"]
