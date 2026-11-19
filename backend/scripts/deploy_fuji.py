"""Deploy MockUSDC + VoiceCampaigns + chiến dịch mẫu lên Avalanche Fuji (43113), rồi verify trên Snowtrace.

    scripts\\deploy-fuji.bat                 # CHẠY THỬ (mô phỏng, KHÔNG gửi giao dịch): kiểm tra ví, số dư, chain, build
    scripts\\deploy-fuji.bat --broadcast     # gửi giao dịch THẬT lên Fuji, seed chiến dịch mẫu, verify
    scripts\\deploy-fuji.bat --verify-only   # verify lại hai contract trong contracts/deployments/43113.json
    scripts\\deploy-fuji.bat --resume        # đã deploy nhưng bước sau lỗi: chạy tiếp SeedDemo (nếu chưa có chiến dịch) + verify

- Khóa ví đọc từ contracts/.env.fuji (mẫu: contracts/.env.fuji.example), KHÔNG phải contracts/.env: Foundry tự đọc
  contracts/.env ở MỌI lần chạy (kể cả deploy local, test) nên khóa Fuji không được đặt ở đó.
- Chỉ chạy khi RPC trả chain id 43113; mọi chain khác (kể cả mainnet 43114) đều bị từ chối.
- Địa chỉ ghi ra contracts/deployments/43113.json (Deploy.s.sol) — backend NETWORK=fuji tự đọc file này.
- Verify qua API kiểu Etherscan của Routescan (Snowtrace testnet chạy trên Routescan, không cần API key thật).
- Không bao giờ in khóa ví.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import dotenv_values
from eth_account import Account
from eth_utils import is_address, to_checksum_address
from web3 import Web3

from app.core.config import PROFILES, REPO_DIR

FUJI_CHAIN_ID = 43113
CONTRACTS = REPO_DIR / "contracts"
ENV_FILE = CONTRACTS / ".env.fuji"
DEPLOYMENT = CONTRACTS / "deployments" / f"{FUJI_CHAIN_ID}.json"
EXPLORER = "https://testnet.snowtrace.io"
VERIFIER_URL = f"https://api.routescan.io/v2/network/testnet/evm/{FUJI_CHAIN_ID}/etherscan"
VERIFIER_KEY = "verifyContract"  # Routescan nhận chuỗi giữ chỗ cho testnet
# Gas đo trên Anvil (Deploy ~4,6 triệu + SeedDemo ~0,24 triệu); nhân dư để ước tính phí
DEPLOY_GAS = 5_000_000
MIN_BALANCE_WEI = Web3.to_wei(Decimal("0.01"), "ether")  # còn lại cho relayer gửi giao dịch demo
CAMPAIGN_COUNT_ABI = [{"type": "function", "name": "campaignCount", "stateMutability": "view", "inputs": [],
                       "outputs": [{"name": "", "type": "uint256"}]}]
CONTRACT_PATHS = {"token": "src/mocks/MockUSDC.sol:MockUSDC", "voiceCampaigns": "src/VoiceCampaigns.sol:VoiceCampaigns"}


def _forge() -> str:
    for c in (shutil.which("forge"), str(Path.home() / ".foundry" / "bin" / "forge.exe")):
        if c and Path(c).exists():
            return c
    sys.exit("[LỖI] Chưa có forge (Foundry). Chạy scripts\\setup.bat")


def _avax(wei: int) -> str:
    return f"{Decimal(wei) / Decimal(10**18):.6f}".rstrip("0").rstrip(".") + " AVAX"


def _run(args: list[str], env: dict[str, str]) -> None:
    print("  $ forge " + " ".join(args[1:]), flush=True)  # khóa ví chỉ nằm trong env, không có trong tham số
    rc = subprocess.run(args, cwd=CONTRACTS, env=env).returncode
    if rc != 0:
        sys.exit(f"[LỖI] forge trả mã {rc}")


def _load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        sys.exit(f"[LỖI] Chưa có {ENV_FILE} — chép từ contracts\\.env.fuji.example và điền PRIVATE_KEY")
    vals = {k: (v or "").strip() for k, v in dotenv_values(ENV_FILE).items()}
    if not vals.get("PRIVATE_KEY"):
        sys.exit(f"[LỖI] {ENV_FILE} thiếu PRIVATE_KEY")
    return vals


def _verify(forge: str, rpc: str, env: dict[str, str], addresses: dict[str, str]) -> bool:
    ok = True
    for key, path in CONTRACT_PATHS.items():
        addr = addresses[key]
        print(f"\nVerify {path.split(':')[1]} {addr}")
        args = [forge, "verify-contract", addr, path, "--rpc-url", rpc, "--guess-constructor-args", "--watch",
                "--retries", "10", "--delay", "10", "--verifier", "custom", "--verifier-url", VERIFIER_URL,
                "--verifier-api-key", VERIFIER_KEY]
        rc = subprocess.run(args, cwd=CONTRACTS, env=env).returncode
        if rc != 0:
            print(f"[CẢNH BÁO] Chưa verify được {addr} (mã {rc}) — chạy lại: scripts\\deploy-fuji.bat --verify-only")
            ok = False
        else:
            print(f"  ✓ {EXPLORER}/address/{addr}#code")
    return ok


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="Deploy + verify lên Avalanche Fuji (mặc định chỉ chạy thử)")
    p.add_argument("--broadcast", action="store_true", help="gửi giao dịch THẬT lên Fuji")
    p.add_argument("--verify-only", action="store_true", help="chỉ verify contract đã deploy")
    p.add_argument("--force-new", action="store_true", help="deploy bộ contract MỚI dù đã có deployments/43113.json")
    p.add_argument("--resume", action="store_true",
                   help="bộ contract đã deploy (deployments/43113.json): chỉ chạy tiếp SeedDemo (nếu chưa có chiến dịch nào) + verify")
    a = p.parse_args(argv)

    vals = _load_env()
    rpc = os.environ.get("FUJI_RPC_URL") or PROFILES["fuji"].rpc_url
    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 20}))
    chain_id = w3.eth.chain_id
    if chain_id != FUJI_CHAIN_ID:
        sys.exit(f"[DỪNG] RPC {rpc} là chain id {chain_id}, không phải Fuji {FUJI_CHAIN_ID} — không làm gì cả")
    try:
        deployer = Account.from_key(vals["PRIVATE_KEY"]).address
    except Exception:  # noqa: BLE001 — không in khóa
        sys.exit("[LỖI] PRIVATE_KEY trong contracts\\.env.fuji không hợp lệ")
    buyer = vals.get("DEMO_BUYER") or deployer
    if not is_address(buyer):
        sys.exit(f"[LỖI] DEMO_BUYER không phải địa chỉ ví: {buyer}")
    buyer = to_checksum_address(buyer)

    forge = _forge()
    env = dict(os.environ)
    # Biến cho forge script: chỉ đặt cho tiến trình forge, không ghi ra đâu
    for k in ("PRIVATE_KEY", "CLAIM_FEE", "QC_ORACLE", "FEE_COLLECTOR", "SEED_TARGET_SEC", "SEED_DAYS", "SEED_METADATA_URI"):
        if vals.get(k):
            env[k] = vals[k]
    env.setdefault("CLAIM_FEE", "100000")
    env["DEMO_BUYER"] = buyer
    env["DEMO_BUYER_GAS_WEI"] = vals.get("DEMO_BUYER_GAS_WEI") or "0"

    if a.verify_only:
        if not DEPLOYMENT.exists():
            sys.exit(f"[LỖI] Chưa có {DEPLOYMENT} — deploy trước")
        d = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        return 0 if _verify(forge, rpc, env, {"token": d["token"], "voiceCampaigns": d["voiceCampaigns"]}) else 1

    balance = w3.eth.get_balance(deployer)
    gas_price = w3.eth.gas_price
    need = DEPLOY_GAS * gas_price * 2 + int(env["DEMO_BUYER_GAS_WEI"])
    print("Avalanche Fuji C-Chain (43113)")
    print(f"  Ví deploy = owner = relayer = QC oracle: {deployer}")
    print(f"  Số dư: {_avax(balance)} · giá gas hiện tại: {gas_price} wei · ước tính phí deploy (x2): {_avax(need)}")
    print(f"  Ví người mua demo (nhận mUSDC thử): {buyer}")
    funded = balance >= max(need, MIN_BALANCE_WEI)
    faucet_hint = (f"Ví cần ít nhất {_avax(max(need, MIN_BALANCE_WEI))}. Xin AVAX test tại "
                   "https://build.avax.network/console/primary-network/faucet rồi chạy lại.")
    if (a.broadcast or a.resume) and not funded:
        print(f"\n[DỪNG] {faucet_hint}")
        return 1

    if a.resume:
        if not DEPLOYMENT.exists():
            sys.exit(f"[LỖI] Chưa có {DEPLOYMENT} — chưa deploy thì dùng --broadcast")
        d = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        if int(d.get("chainId", 0)) != FUJI_CHAIN_ID or not w3.eth.get_code(d["voiceCampaigns"]):
            sys.exit(f"[LỖI] Không có contract VoiceCampaigns của Fuji tại {d.get('voiceCampaigns')}")
    elif DEPLOYMENT.exists() and a.broadcast and not a.force_new:
        d = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        print(f"\n[DỪNG] Đã có bộ contract Fuji: VoiceCampaigns {d.get('voiceCampaigns')} (block {d.get('deployBlock')}).")
        print("  Deploy lại tạo contract MỚI ⇒ phải đổi DATABASE_SCHEMA trong backend\\.env.fuji. Cố ý thì thêm --force-new.")
        return 1

    _run([forge, "build"], env)
    if not a.broadcast and not a.resume:
        # Mô phỏng: Deploy.s.sol vẫn ghi deployments/43113.json bằng địa chỉ giả lập ⇒ khôi phục nguyên trạng sau đó
        before = DEPLOYMENT.read_bytes() if DEPLOYMENT.exists() else None
        try:
            _run([forge, "script", "script/Deploy.s.sol", "--rpc-url", rpc], env)
        finally:
            if before is None:
                DEPLOYMENT.unlink(missing_ok=True)
            else:
                DEPLOYMENT.write_bytes(before)
        if not funded:
            print(f"\n✓ Mô phỏng chạy được (không gửi giao dịch nào) — nhưng CHƯA đủ AVAX để deploy thật. {faucet_hint}")
            return 1
        print("\n✓ Chạy thử đạt (không gửi giao dịch nào). Deploy thật: scripts\\deploy-fuji.bat --broadcast")
        return 0

    if a.resume:
        print(f"\n==== 1/3 Đã deploy: VoiceCampaigns {d['voiceCampaigns']} (bỏ qua) ====")
    else:
        print("\n==== 1/3 Deploy MockUSDC + VoiceCampaigns (giao dịch thật) ====")
        _run([forge, "script", "script/Deploy.s.sol", "--rpc-url", rpc, "--broadcast", "--slow"], env)
        d = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        if int(d.get("chainId", 0)) != FUJI_CHAIN_ID:
            sys.exit(f"[LỖI] {DEPLOYMENT} không phải của Fuji")
    env["VOICE_CAMPAIGNS"] = d["voiceCampaigns"]

    print("\n==== 2/3 SeedDemo: chiến dịch mẫu #0 + mUSDC cho ví người mua demo ====")
    vc = w3.eth.contract(address=to_checksum_address(d["voiceCampaigns"]), abi=CAMPAIGN_COUNT_ABI)
    count = vc.functions.campaignCount().call()
    if count:
        print(f"  Đã có {count} chiến dịch on-chain ⇒ bỏ qua SeedDemo (không tạo chiến dịch mẫu thứ hai)")
    else:
        _run([forge, "script", "script/SeedDemo.s.sol", "--rpc-url", rpc, "--broadcast", "--slow"], env)

    print("\n==== 3/3 Verify trên Snowtrace (Routescan) ====")
    verified = _verify(forge, rpc, env, {"token": d["token"], "voiceCampaigns": d["voiceCampaigns"]})

    print("\n==== Xong ====")
    print(f"  VoiceCampaigns: {d['voiceCampaigns']}  {EXPLORER}/address/{d['voiceCampaigns']}")
    print(f"  MockUSDC:       {d['token']}  {EXPLORER}/address/{d['token']}")
    print(f"  Deploy block:   {d['deployBlock']}  (đã ghi trong {DEPLOYMENT.relative_to(REPO_DIR)}; backend tự đọc)")
    print(f"  Số dư còn:      {_avax(w3.eth.get_balance(deployer))}")
    print("  Tiếp theo: scripts\\start-backend.bat fuji   rồi   scripts\\start-frontend.bat fuji")
    return 0 if verified else 1


if __name__ == "__main__":
    raise SystemExit(main())
