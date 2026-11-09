"""Relayer: ví nóng ký + gửi giao dịch, trả gas AVAX thay người dùng (đề xuất §7.2, §8.4, §10.5).

- Mô phỏng (eth_call) trước khi gửi: lỗi nghiệp vụ (BadSignature, NotCollecting...) bị chặn mà không tốn gas.
- Quản lý nonce cục bộ có khóa (đồng bộ với `pending`), tránh trùng nonce khi gửi liên tiếp.
- Ước lượng gas + 20% dự phòng, phí EIP-1559 do web3 tính.
- Chờ receipt (Avalanche final ~1 giây), giải mã revert, ghi trạng thái vào bảng relay_txs.
"""
from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass

from eth_account import Account
from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError, TimeExhausted

from app.blockchain.errors import decode_revert, message_for
from app.core.errors import ChainError
from app.models import RelayTx

log = logging.getLogger("datasetmarketplace.relayer")


@dataclass(frozen=True)
class TxResult:
    tx_hash: str
    block: int
    gas_used: int
    receipt: dict


class Relayer:
    def __init__(
        self,
        w3: Web3,
        private_key: str,
        session_factory: sessionmaker[Session] | None,
        *,
        receipt_timeout: int = 120,
        gas_buffer: float = 1.2,
    ):
        self.w3 = w3
        self._account = Account.from_key(private_key)
        self.address: str = self._account.address
        self._sf = session_factory
        self._lock = threading.Lock()
        self._next_nonce: int | None = None
        self.receipt_timeout = receipt_timeout
        self.gas_buffer = gas_buffer

    def balance_wei(self) -> int:
        return int(self.w3.eth.get_balance(self.address))

    # ------------------------------------------------------------------ ghi nhận trạng thái

    def _record(self, row_id: int | None, **fields) -> int | None:
        if self._sf is None:
            return None
        with self._sf() as s:
            if row_id is None:
                row = RelayTx(from_address=self.address, **fields)
                s.add(row)
            else:
                row = s.get(RelayTx, row_id)
                for k, v in fields.items():
                    setattr(row, k, v)
            s.commit()
            return row.id

    @staticmethod
    def _decode(e: Exception) -> tuple[str | None, str]:
        name = decode_revert(getattr(e, "data", None))
        return name, message_for(name, f"Giao dịch bị từ chối: {getattr(e, 'message', None) or e}")

    # ------------------------------------------------------------------ gửi giao dịch

    def send(self, fn, kind: str, meta: dict | None = None, value: int = 0) -> TxResult:  # noqa: ANN001
        meta_json = json.dumps(meta or {}, default=str)
        # 1) Mô phỏng: không tốn gas nếu chắc chắn revert
        try:
            fn.call({"from": self.address, "value": value})
        except (ContractCustomError, ContractLogicError) as e:
            name, msg = self._decode(e)
            self._record(None, kind=kind, status="rejected", error=name or msg, meta_json=meta_json)
            raise ChainError(msg, code=name or "reverted") from e

        # 2) Ký + gửi dưới khóa nonce
        with self._lock:
            pending = int(self.w3.eth.get_transaction_count(self.address, "pending"))
            nonce = max(pending, self._next_nonce or 0)
            try:
                tx = fn.build_transaction(
                    {"from": self.address, "nonce": nonce, "chainId": int(self.w3.eth.chain_id), "value": value}
                )
                tx["gas"] = int(tx["gas"] * self.gas_buffer)
                signed = self._account.sign_transaction(tx)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            except (ContractCustomError, ContractLogicError) as e:
                self._next_nonce = None
                name, msg = self._decode(e)
                self._record(None, kind=kind, status="rejected", error=name or msg, meta_json=meta_json)
                raise ChainError(msg, code=name or "reverted") from e
            except Exception as e:
                self._next_nonce = None  # đồng bộ lại nonce ở lần sau
                self._record(None, kind=kind, status="failed", nonce=nonce, error=type(e).__name__, meta_json=meta_json)
                raise ChainError(f"Không gửi được giao dịch: {type(e).__name__}", code="send_failed") from e
            self._next_nonce = nonce + 1
        h = "0x" + bytes(tx_hash).hex()
        row_id = self._record(None, kind=kind, status="sent", nonce=nonce, tx_hash=h, meta_json=meta_json)
        log.info("relayer %s gửi %s nonce=%s tx=%s", self.address[:10], kind, nonce, h)

        # 3) Chờ receipt
        try:
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.receipt_timeout)
        except TimeExhausted as e:
            self._record(row_id, status="timeout", error="receipt timeout")
            raise ChainError("Giao dịch chưa được xác nhận, thử lại sau", code="timeout", details={"tx": h}) from e
        if receipt["status"] != 1:
            name = None
            try:  # phát lại tại block đó để lấy lý do revert
                fn.call({"from": self.address, "value": value}, block_identifier=receipt["blockNumber"])
            except (ContractCustomError, ContractLogicError) as e:
                name, _ = self._decode(e)
            self._record(row_id, status="failed", block=receipt["blockNumber"], error=name or "reverted")
            raise ChainError(message_for(name, "Giao dịch thất bại"), code=name or "reverted", details={"tx": h})
        self._record(row_id, status="confirmed", block=receipt["blockNumber"], gas_used=receipt["gasUsed"])
        return TxResult(tx_hash=h, block=int(receipt["blockNumber"]), gas_used=int(receipt["gasUsed"]), receipt=receipt)


class SignerPool:
    """Một Relayer cho mỗi địa chỉ: relayer và QC oracle dùng chung ví thì cũng dùng chung bộ đếm nonce."""

    def __init__(self, factory: Callable[[str], Relayer]):
        self._factory = factory
        self._by_addr: dict[str, Relayer] = {}
        self._lock = threading.Lock()

    def get(self, private_key: str) -> Relayer:
        addr = Account.from_key(private_key).address
        with self._lock:
            if addr not in self._by_addr:
                self._by_addr[addr] = self._factory(private_key)
            return self._by_addr[addr]
