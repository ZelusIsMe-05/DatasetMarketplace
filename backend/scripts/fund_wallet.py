"""Nạp tiền thử cho MỘT ví cụ thể trên Anvil local, để tự test bằng MetaMask/Core (tạo chiến dịch, mua dữ liệu).

    python -m scripts.fund_wallet 0xVI_CUA_BAN                     # +2.000 mUSDC
    python -m scripts.fund_wallet 0xVI_CUA_BAN --usdc 500
    python -m scripts.fund_wallet 0xVI_CUA_BAN --usdc 0 --eth 1    # chỉ nạp ETH (tự gửi giao dịch, vd. CLI)

- mUSDC: mint qua faucet của backend (POST /demo/faucet) ⇒ backend phải đang chạy.
- ETH: KHÔNG cần cho web — nền tảng trả phí mạng hộ người tạo/người mua (implementation-plan §3 #25). `--eth` chỉ dùng
  khi muốn tự gửi giao dịch bằng ví (createCampaign/buy trực tiếp); cộng số dư bằng `anvil_setBalance` của Anvil.
Chỉ chạy với NETWORK=local và RPC là Anvil (chain id 31337). Tiền nằm trên chain: sau reset-local phải nạp lại.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal, InvalidOperation

import httpx
from dotenv import dotenv_values
from eth_utils import is_address, to_checksum_address

from app.core.config import BACKEND_DIR, PROFILES, load_db_config

ANVIL_CHAIN_ID = 31337
WEI = Decimal(10**18)


def _rpc_url() -> str:
    file_vals = dotenv_values(BACKEND_DIR / ".env.local") if (BACKEND_DIR / ".env.local").exists() else {}
    return os.environ.get("RPC_URL") or file_vals.get("RPC_URL") or PROFILES["local"].rpc_url  # Anvil cổng 8386


def _vn(x: Decimal | float, digits: int = 0) -> str:
    """Số kiểu Việt Nam: 10000 -> 10.000; 1.5 -> 1,5."""
    s = f"{x:,.{digits}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def _rpc(rpc: str, method: str, params: list) -> object:
    r = httpx.post(rpc, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=10)
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error'].get('message', body['error'])}")
    return body["result"]


def _amount(text: str) -> Decimal:
    try:
        v = Decimal(text.replace(",", "."))
    except InvalidOperation:
        raise argparse.ArgumentTypeError(f"không phải số: {text}") from None
    if v < 0:
        raise argparse.ArgumentTypeError("không được âm")
    return v


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="scripts\\fund-wallet.bat",
        description="Nạp mUSDC (và ETH nếu cần) cho một ví trên Anvil local để tự test bằng MetaMask/Core",
    )
    ap.add_argument("address", help="địa chỉ ví nhận tiền, dạng 0x… (MetaMask: bấm tên tài khoản → biểu tượng sao chép)")
    ap.add_argument("--usdc", type=int, default=2000, help="số mUSDC nạp thêm (mặc định 2000, tối đa FAUCET_MAX_USDC; 0 = bỏ qua)")
    ap.add_argument("--eth", type=_amount, default=Decimal(0),
                    help="số ETH nạp thêm (mặc định 0: web không cần ETH vì nền tảng trả phí mạng)")
    args = ap.parse_args(argv)

    if not is_address(args.address) or int(args.address, 16) == 0:
        print(f"[LỖI] Địa chỉ ví không hợp lệ: {args.address}. Cần 0x + 40 ký tự hex — dán đủ địa chỉ sao chép từ MetaMask.")
        return 2
    if args.usdc < 0:
        print("[LỖI] --usdc không được âm.")
        return 2
    address = to_checksum_address(args.address)

    network = load_db_config().network
    if network != "local":
        print(f"[TỪ CHỐI] NETWORK={network}. Script này chỉ dành cho Anvil local; trên Fuji dùng nút \"Nhận mUSDC thử nghiệm\" trên web.")
        return 2

    rpc = _rpc_url()
    try:
        chain_id = int(str(_rpc(rpc, "eth_chainId", [])), 16)
    except (httpx.HTTPError, RuntimeError, ValueError):
        print(f"[LỖI] Không gọi được chain ở {rpc}. Chạy scripts\\start-anvil.bat persist trước.")
        return 1
    if chain_id != ANVIL_CHAIN_ID:
        print(f"[TỪ CHỐI] RPC {rpc} là chain {chain_id}, không phải Anvil local ({ANVIL_CHAIN_ID}).")
        return 2
    # Hardhat/Scaffold-ETH cũng dùng chain id 31337: chỉ nạp khi node đúng là Anvil của dự án.
    client = str(_rpc(rpc, "web3_clientVersion", []))
    if not client.lower().startswith("anvil"):
        print(f"[TỪ CHỐI] Node ở {rpc} là \"{client}\", không phải Anvil của dự án — không nạp tiền.")
        return 2

    print(f"Nạp tiền thử cho ví {address}\n")
    ok = True

    if args.eth > 0:
        before = int(str(_rpc(rpc, "eth_getBalance", [address, "latest"])), 16)
        after = before + int(args.eth * WEI)
        try:
            _rpc(rpc, "anvil_setBalance", [address, hex(after)])
            print(f"  ✔ ETH (phí mạng): +{_vn(args.eth, 2)} → số dư {_vn(Decimal(after) / WEI, 4)} ETH")
        except RuntimeError as e:
            ok = False
            print(f"  ✘ ETH (phí mạng): {e}")

    if args.usdc > 0:
        api = (os.environ.get("DATASETMARKETPLACE_API") or "http://127.0.0.1:8000").rstrip("/")
        try:
            r = httpx.post(f"{api}/demo/faucet", json={"address": address, "amount_usdc": args.usdc}, timeout=60)
        except httpx.HTTPError:
            ok = False
            print(f"  ✘ mUSDC: không gọi được backend ở {api}. Chạy deploy-local → start-backend trước.")
        else:
            if r.status_code == 200:
                bal = r.json()["balance"]
                print(f"  ✔ mUSDC: +{_vn(args.usdc)} → số dư {_vn(bal['units'] / 1e6, 2)} mUSDC ({bal['display']})")
            else:
                ok = False
                try:
                    reason = r.json()["error"]["message"]
                except (ValueError, KeyError, TypeError):
                    reason = r.text[:160]
                print(f"  ✘ mUSDC: {r.status_code} {reason}")

    deployments = BACKEND_DIR.parent / "contracts" / "deployments" / f"{ANVIL_CHAIN_ID}.json"
    token = json.loads(deployments.read_text(encoding="utf-8"))["token"] if deployments.exists() else "(chưa deploy)"
    print(
        "\nĐể thấy số dư trong MetaMask / Core:\n"
        f"  Mạng:   RPC {rpc} · Chain ID {ANVIL_CHAIN_ID} · ký hiệu ETH\n"
        f"  Token:  Import token {token} (mUSDC, 6 số thập phân)\n"
        "Đây là tiền thử trên chain local, không có giá trị thật. Sau reset-local (chain mới) phải nạp lại."
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
