"""Dữ liệu EIP-712 giống hệt contract (domain GiongQue/1, ba typehash §9.2) và khôi phục người ký.

Tên domain "GiongQue" là định danh kỹ thuật khắc trong contract — KHÔNG đổi theo tên thương hiệu hiển thị.

Cùng một hàm dựng typed data được dùng cho: endpoint trả dữ liệu cần ký, CLI ký bằng ví test,
và backend xác minh chữ ký trước khi relayer tốn gas.
"""
from __future__ import annotations

from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from hexbytes import HexBytes

DOMAIN_NAME = "GiongQue"
DOMAIN_VERSION = "1"

EIP712_DOMAIN = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]

TYPES: dict[str, list[dict[str, str]]] = {
    "Consent": [
        {"name": "campaignId", "type": "uint256"},
        {"name": "contributor", "type": "address"},
        {"name": "termsHash", "type": "bytes32"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    "Revoke": [
        {"name": "contributionId", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    "Claim": [
        {"name": "campaignId", "type": "uint256"},
        {"name": "contributor", "type": "address"},
        {"name": "maxFee", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
}


@dataclass(frozen=True)
class Domain:
    chain_id: int
    verifying_contract: str

    def as_dict(self) -> dict:
        return {
            "name": DOMAIN_NAME,
            "version": DOMAIN_VERSION,
            "chainId": self.chain_id,
            "verifyingContract": self.verifying_contract,
        }


def typed_data(domain: Domain, primary_type: str, message: dict) -> dict:
    """Định dạng `eth_signTypedData_v4` (dùng được trực tiếp với viem/MetaMask)."""
    return {
        "types": {"EIP712Domain": EIP712_DOMAIN, primary_type: TYPES[primary_type]},
        "primaryType": primary_type,
        "domain": domain.as_dict(),
        "message": message,
    }


def consent_message(campaign_id: int, contributor: str, terms_hash: str, nonce: int, deadline: int) -> dict:
    return {
        "campaignId": campaign_id,
        "contributor": contributor,
        "termsHash": terms_hash,
        "nonce": nonce,
        "deadline": deadline,
    }


def revoke_message(contribution_id: int, nonce: int, deadline: int) -> dict:
    return {"contributionId": contribution_id, "nonce": nonce, "deadline": deadline}


def claim_message(campaign_id: int, contributor: str, max_fee: int, nonce: int, deadline: int) -> dict:
    return {
        "campaignId": campaign_id,
        "contributor": contributor,
        "maxFee": max_fee,
        "nonce": nonce,
        "deadline": deadline,
    }


def _normalize(td: dict) -> dict:
    """bytes32 dạng hex -> bytes để eth_account mã hóa đúng."""
    msg = dict(td["message"])
    for field in TYPES[td["primaryType"]]:
        if field["type"] == "bytes32" and isinstance(msg[field["name"]], str):
            msg[field["name"]] = HexBytes(msg[field["name"]])
    return {**td, "message": msg}


def sign_typed(private_key: str, td: dict) -> str:
    signed = Account.sign_message(encode_typed_data(full_message=_normalize(td)), private_key)
    return "0x" + signed.signature.hex().removeprefix("0x")


def recover_typed(td: dict, signature: str) -> str:
    return Account.recover_message(encode_typed_data(full_message=_normalize(td)), signature=signature)


# ------------------------------------------------------------------ EIP-191 (đăng nhập, tải dataset)


def sign_text(private_key: str, text: str) -> str:
    signed = Account.sign_message(encode_defunct(text=text), private_key)
    return "0x" + signed.signature.hex().removeprefix("0x")


def recover_text(text: str, signature: str) -> str:
    return Account.recover_message(encode_defunct(text=text), signature=signature)
