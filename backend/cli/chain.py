"""Giao dịch do chính ví người dùng gửi (người tạo, người mua, tự rút/tự thu hồi) — không qua relayer.

Đúng kiến trúc §8.1: màn Đặt hàng/Mua gọi thẳng contract bằng Core/MetaMask; ở CLI dùng ví test.
"""
from __future__ import annotations

from dataclasses import dataclass

from eth_account import Account
from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError

from app.blockchain.abi import load_abi
from app.blockchain.errors import decode_revert, message_for


class TxError(Exception):
    pass


@dataclass
class TxOut:
    tx_hash: str
    receipt: dict


class Chain:
    def __init__(self, rpc_url: str, voice_campaigns: str, token: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 60}))
        self.vc = self.w3.eth.contract(address=Web3.to_checksum_address(voice_campaigns), abi=load_abi("VoiceCampaigns"))
        self.token = self.w3.eth.contract(address=Web3.to_checksum_address(token), abi=load_abi("MockUSDC"))

    def send(self, private_key: str, fn) -> TxOut:  # noqa: ANN001
        acct = Account.from_key(private_key)
        try:
            fn.call({"from": acct.address})
            tx = fn.build_transaction(
                {
                    "from": acct.address,
                    "nonce": self.w3.eth.get_transaction_count(acct.address, "pending"),
                    "chainId": self.w3.eth.chain_id,
                }
            )
        except (ContractCustomError, ContractLogicError) as e:
            name = decode_revert(getattr(e, "data", None))
            raise TxError(f"{name or 'revert'}: {message_for(name, str(e))}") from e
        signed = acct.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        r = self.w3.eth.wait_for_transaction_receipt(h, timeout=120)
        if r["status"] != 1:
            raise TxError(f"Giao dịch thất bại: 0x{bytes(h).hex()}")
        return TxOut("0x" + bytes(h).hex(), r)

    def approve_if_needed(self, private_key: str, amount: int) -> str | None:
        owner = Account.from_key(private_key).address
        if self.token.functions.allowance(owner, self.vc.address).call() >= amount:
            return None
        return self.send(private_key, self.token.functions.approve(self.vc.address, amount)).tx_hash

    def token_balance(self, address: str) -> int:
        return int(self.token.functions.balanceOf(Web3.to_checksum_address(address)).call())

    def native_balance(self, address: str) -> int:
        return int(self.w3.eth.get_balance(Web3.to_checksum_address(address)))

    def snapshot_events(self, campaign_id: int) -> list[dict]:
        logs = self.vc.events.SnapshotPublished().get_logs(from_block=0, argument_filters={"campaignId": campaign_id})
        return [
            {"merkleRoot": "0x" + bytes(e["args"]["merkleRoot"]).hex(), "uri": e["args"]["uri"],
             "tx": "0x" + bytes(e["transactionHash"]).hex(), "block": e["blockNumber"]}
            for e in logs
        ]
