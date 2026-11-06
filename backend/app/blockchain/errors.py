"""Giải mã custom error của VoiceCampaigns (revert data 4 byte) thành tên + thông báo tiếng Việt."""
from __future__ import annotations

from functools import cache

from eth_utils import keccak

from app.blockchain.abi import load_abi

MESSAGES: dict[str, str] = {
    "NotQcOracle": "Chỉ QC oracle được gọi hàm này",
    "InvalidParams": "Tham số không hợp lệ",
    "NotCollecting": "Chiến dịch đã ngừng thu thập (đủ mục tiêu hoặc quá hạn)",
    "NoConsent": "Người đóng góp chưa ký đồng thuận cho chiến dịch này",
    "AlreadyConsented": "Đã đồng thuận trước đó",
    "DuplicateCommitment": "Bản ghi trùng (commitment đã được dùng)",
    "AlreadyRevoked": "Bản ghi đã bị thu hồi",
    "NotContributor": "Không phải người đóng góp của bản ghi này",
    "BadSignature": "Chữ ký không hợp lệ (sai người ký, sai nonce hoặc sai dữ liệu)",
    "Expired": "Chữ ký đã hết hạn",
    "AlreadyLicensed": "Ví này đã có license cho chiến dịch",
    "NothingToSell": "Chưa có bản ghi hợp lệ nào để bán",
    "PriceTooHigh": "Giá hiện tại cao hơn mức tối đa bạn chấp nhận",
    "NotCreator": "Chỉ người tạo chiến dịch được thực hiện",
    "TooEarly": "Chưa đến hạn",
    "NothingToClaim": "Không có tiền để rút (hoặc không đủ trả phí rút hộ)",
    "FeeTooHigh": "Phí rút hộ hiện tại cao hơn mức tối đa bạn đã ký",
    "OwnableUnauthorizedAccount": "Chỉ owner được thực hiện",
    "ERC20InsufficientBalance": "Số dư token không đủ",
    "ERC20InsufficientAllowance": "Chưa approve đủ token cho contract",
    "ECDSAInvalidSignature": "Chữ ký không hợp lệ",
    "ECDSAInvalidSignatureLength": "Độ dài chữ ký không hợp lệ",
    "ECDSAInvalidSignatureS": "Chữ ký không hợp lệ",
}


@cache
def _selectors() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in ("VoiceCampaigns", "MockUSDC"):
        for e in load_abi(name):
            if e.get("type") == "error":
                sig = f"{e['name']}({','.join(i['type'] for i in e['inputs'])})"
                out["0x" + keccak(text=sig)[:4].hex()] = e["name"]
    # Lỗi của OpenZeppelin có thể không nằm trong ABI xuất ra
    for sig in (
        "ERC20InsufficientBalance(address,uint256,uint256)",
        "ERC20InsufficientAllowance(address,uint256,uint256)",
        "ECDSAInvalidSignature()",
        "ECDSAInvalidSignatureLength(uint256)",
        "ECDSAInvalidSignatureS(bytes32)",
        "OwnableUnauthorizedAccount(address)",
    ):
        out.setdefault("0x" + keccak(text=sig)[:4].hex(), sig.split("(")[0])
    return out


def decode_revert(data: str | bytes | None) -> str | None:
    """revert data -> tên lỗi (None nếu không nhận ra)."""
    if data is None:
        return None
    if isinstance(data, bytes):
        data = "0x" + data.hex()
    data = data if data.startswith("0x") else "0x" + data
    return _selectors().get(data[:10].lower())


def message_for(name: str | None, fallback: str) -> str:
    return MESSAGES.get(name or "", fallback)
