"""Dữ liệu EIP-712 giống hệt contract (domain DatasetMarketplace/1, typehash §9.2) và khôi phục người ký.

Ba typehash gốc Consent/Revoke/Claim giữ nguyên. Bốn typehash CreateCampaign/Buy/Withdraw/WithdrawSeed dành cho giao dịch
nền tảng trả phí mạng hộ (implementation-plan §3 #25); `Permit` (EIP-2612) ký trên domain của token, không phải DatasetMarketplace.

Tên domain "DatasetMarketplace" là định danh kỹ thuật khắc trong contract — KHÔNG đổi theo tên thương hiệu hiển thị.

Cùng một hàm dựng typed data được dùng cho: endpoint trả dữ liệu cần ký, CLI ký bằng ví test,
và backend xác minh chữ ký trước khi relayer tốn gas.
"""
from __future__ import annotations

from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from hexbytes import HexBytes

DOMAIN_NAME = "DatasetMarketplace"
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
    "CreateCampaign": [
        {"name": "creator", "type": "address"},
        {"name": "targetSec", "type": "uint64"},
        {"name": "fullPrice", "type": "uint128"},
        {"name": "contributorBps", "type": "uint16"},
        {"name": "creatorBps", "type": "uint16"},
        {"name": "campaignDeadline", "type": "uint64"},
        {"name": "promptSetHash", "type": "bytes32"},
        {"name": "termsHash", "type": "bytes32"},
        {"name": "metadataURI", "type": "string"},
        {"name": "seedRatePerSec", "type": "uint256"},
        {"name": "seedAmount", "type": "uint256"},
        {"name": "fee", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    "Buy": [
        {"name": "campaignId", "type": "uint256"},
        {"name": "buyer", "type": "address"},
        {"name": "maxPrice", "type": "uint256"},
        {"name": "fee", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    "Withdraw": [
        {"name": "account", "type": "address"},
        {"name": "fee", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    "WithdrawSeed": [
        {"name": "campaignId", "type": "uint256"},
        {"name": "creator", "type": "address"},
        {"name": "fee", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    # Chủ chiến dịch đồng ý công bố đúng phiên bản dataset này (§3 #28)
    "PublishSnapshot": [
        {"name": "campaignId", "type": "uint256"},
        {"name": "merkleRoot", "type": "bytes32"},
        {"name": "uri", "type": "string"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
    # EIP-2612 — domain là token (tên + phiên bản của token), không phải DatasetMarketplace
    "Permit": [
        {"name": "owner", "type": "address"},
        {"name": "spender", "type": "address"},
        {"name": "value", "type": "uint256"},
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


@dataclass(frozen=True)
class TokenDomain:
    """Domain EIP-712 của token cho permit (MockUSDC: "Mock USDC"/"1"; USDC Circle: "USD Coin"/"2")."""

    name: str
    version: str
    chain_id: int
    verifying_contract: str

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "chainId": self.chain_id,
            "verifyingContract": self.verifying_contract,
        }


def typed_data(domain: Domain | TokenDomain, primary_type: str, message: dict) -> dict:
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


def create_message(creator: str, params: dict, fee: int, nonce: int, deadline: int) -> dict:
    """params: tham số createCampaign (CreateCampaignArgs: targetSec, fullPrice, ..., deadline = hạn thu thập)."""
    return {
        "creator": creator,
        "targetSec": int(params["targetSec"]),
        "fullPrice": int(params["fullPrice"]),
        "contributorBps": int(params["contributorBps"]),
        "creatorBps": int(params["creatorBps"]),
        "campaignDeadline": int(params["deadline"]),
        "promptSetHash": params["promptSetHash"],
        "termsHash": params["termsHash"],
        "metadataURI": params["metadataURI"],
        "seedRatePerSec": int(params["seedRatePerSec"]),
        "seedAmount": int(params["seedAmount"]),
        "fee": fee,
        "nonce": nonce,
        "deadline": deadline,
    }


def buy_message(campaign_id: int, buyer: str, max_price: int, fee: int, nonce: int, deadline: int) -> dict:
    return {"campaignId": campaign_id, "buyer": buyer, "maxPrice": max_price, "fee": fee, "nonce": nonce, "deadline": deadline}


def withdraw_message(account: str, fee: int, nonce: int, deadline: int) -> dict:
    return {"account": account, "fee": fee, "nonce": nonce, "deadline": deadline}


def withdraw_seed_message(campaign_id: int, creator: str, fee: int, nonce: int, deadline: int) -> dict:
    return {"campaignId": campaign_id, "creator": creator, "fee": fee, "nonce": nonce, "deadline": deadline}


def publish_snapshot_message(campaign_id: int, merkle_root: str, uri: str, nonce: int, deadline: int) -> dict:
    return {"campaignId": campaign_id, "merkleRoot": merkle_root, "uri": uri, "nonce": nonce, "deadline": deadline}


def permit_message(owner: str, spender: str, value: int, nonce: int, deadline: int) -> dict:
    return {"owner": owner, "spender": spender, "value": value, "nonce": nonce, "deadline": deadline}


def split_signature(signature: str) -> tuple[int, bytes, bytes]:
    """Chữ ký 65 byte (r || s || v) -> (v, r, s) cho hàm permit của token."""
    raw = bytes.fromhex(signature.removeprefix("0x"))
    if len(raw) != 65:
        raise ValueError("chữ ký phải dài 65 byte")
    v = raw[64]
    return (v + 27 if v < 27 else v), raw[:32], raw[32:64]


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
