"""Giao dịch nền tảng trả phí mạng hộ cho người tạo chiến dịch và người mua (implementation-plan §3 #25).

Người dùng chỉ KÝ (EIP-712 của thao tác + permit EIP-2612 nếu cần trừ tiền); relayer gửi giao dịch, trả gas AVAX,
hợp đồng thu lại một khoản **phí xử lý** bằng chính token của app trong cùng giao dịch. Người dùng ký ĐÚNG số phí hiển
thị trên hóa đơn nên nền tảng không thể thu vượt.

Chính sách phí nằm trọn trong `FeePolicy` (hợp đồng không biết cách tính): hiện là phí cố định theo cấu hình;
chế độ "tiền gas thực tế + % biên" sẽ thay `FeePolicy` mà không đổi hợp đồng hay giao diện.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3
from web3.logs import DISCARD

from app.blockchain.client import ChainClient
from app.blockchain.eip712 import (
    TokenDomain,
    buy_message,
    create_message,
    permit_message,
    recover_typed,
    split_signature,
    typed_data,
    withdraw_message,
    withdraw_seed_message,
)
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.config import Settings
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from app.models import CampaignDraft, User
from app.schemas.common import TypedDataResponse
from app.schemas.sponsor import (
    FeeSchedule,
    PermitSign,
    PermitSubmit,
    SponsoredBuyRequest,
    SponsoredCreateRequest,
    SponsoredQuote,
    SponsoredResult,
    SponsoredSeedWithdrawRequest,
    SponsoredWithdrawRequest,
)
from app.services.campaign_service import CampaignService
from app.services.consent_service import MAX_DEADLINE_SEC, SIGNATURE_WINDOW_SEC
from app.services.fx_service import FxService

_NO_PERMIT = (0, 0, 0, b"\x00" * 32, b"\x00" * 32)


class FeePolicy:
    """Phí xử lý (đã gồm phí mạng) theo thao tác, đơn vị on-chain của token.

    Hiện tại: cố định theo cấu hình RELAY_FEE_*_USDC (0,5 USDC ≈ 13.000 ₫ tạo/mua; 0,1 USDC ≈ 2.600 ₫ rút).
    Kế hoạch: phí = gas ước tính × giá gas × giá AVAX (Chainlink) quy ra USDC, cộng % biên, có mức tối thiểu.
    """

    def __init__(self, settings: Settings):
        self._fees = {
            "create": settings.relay_fee_create,
            "buy": settings.relay_fee_buy,
            "withdraw": settings.relay_fee_withdraw,
            "withdraw_seed": settings.relay_fee_withdraw,
        }

    def fee(self, action: str) -> int:
        return self._fees[action]


class SponsorService:
    def __init__(
        self,
        settings: Settings,
        sf: sessionmaker[Session],
        chain: ChainClient,
        relayer: Relayer,
        indexer: EventIndexer,
        fx: FxService,
        campaigns: CampaignService,
    ):
        self.settings, self.sf, self.chain, self.relayer = settings, sf, chain, relayer
        self.indexer, self.fx, self.campaigns = indexer, fx, campaigns
        self.policy = FeePolicy(settings)
        self._token_domain: TokenDomain | None = None

    # ------------------------------------------------------------------ dùng chung

    def fees(self) -> FeeSchedule:
        rate = self.fx.rate()
        return FeeSchedule(
            mode="fixed",
            create=self.fx.money(self.policy.fee("create"), rate),
            buy=self.fx.money(self.policy.fee("buy"), rate),
            withdraw=self.fx.money(self.policy.fee("withdraw"), rate),
            claim=self.fx.money(self.chain.claim_fee(), rate),
        )

    def token_domain(self) -> TokenDomain:
        """Domain EIP-712 của token: đọc EIP-5267 nếu token hỗ trợ, nếu không dùng name() + phiên bản theo mạng."""
        if self._token_domain is None:
            name, version = None, None
            try:
                d = self.chain.token.functions.eip712Domain().call()
                name, version = str(d[1]), str(d[2])
            except Exception:  # noqa: BLE001 - token không có EIP-5267 (vd. USDC của Circle)
                name, version = self.chain.token_name(), self.settings.network.token_permit_version
            self._token_domain = TokenDomain(name, version, self.chain.chain_id, self.chain.token_address)
        return self._token_domain

    def _deadline(self) -> int:
        return self.chain.block_timestamp() + SIGNATURE_WINDOW_SEC

    def _check_deadline(self, deadline: int) -> None:
        now = self.chain.block_timestamp()
        if deadline <= now or deadline > now + MAX_DEADLINE_SEC:
            raise BadRequest("Chữ ký đã hết hạn hoặc hạn ký không hợp lệ — hãy ký lại", code="Expired")

    def _require_fee(self, action: str, fee: int) -> None:
        if fee < self.policy.fee(action):
            raise BadRequest("Phí xử lý vừa thay đổi — hãy xem lại hóa đơn rồi ký lại", code="fee_changed")

    @staticmethod
    def _checksum(address: str) -> str:
        if not Web3.is_address(address):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        return Web3.to_checksum_address(address)

    @staticmethod
    def _verify(td: dict, signature: str, expected: str, what: str) -> None:
        try:
            signer = recover_typed(td, signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != expected:
            raise Unauthorized(f"Chữ ký {what} không khớp ví {expected}")

    def _sign(self, primary: str, message: dict, nonce: int, deadline: int) -> TypedDataResponse:
        return TypedDataResponse(typed_data=typed_data(self.chain.domain(), primary, message), nonce=nonce, deadline=deadline)

    def _permit_request(self, owner: str, needed: int, deadline: int) -> PermitSign | None:
        """Chữ ký permit cho đúng số cần trừ; None nếu không trừ gì hoặc allowance sẵn có đã đủ."""
        if needed == 0 or self.chain.token_allowance(owner, self.chain.address) >= needed:
            return None
        nonce = self.chain.token_nonce(owner)
        msg = permit_message(owner, self.chain.address, needed, nonce, deadline)
        return PermitSign(typed_data=typed_data(self.token_domain(), "Permit", msg), value=needed, nonce=nonce, deadline=deadline)

    def _permit_args(self, owner: str, needed: int, permit: PermitSubmit | None) -> tuple:
        """Kiểm tra chữ ký permit TRƯỚC khi relayer tốn gas; trả tuple PermitSig cho hợp đồng."""
        if permit is None or permit.value == 0:
            if needed > 0 and self.chain.token_allowance(owner, self.chain.address) < needed:
                raise BadRequest("Thiếu chữ ký cho phép trừ tiền (permit) — hãy ký lại", code="permit_required")
            return _NO_PERMIT
        if permit.value < needed:
            raise BadRequest("Chữ ký cho phép trừ tiền nhỏ hơn số cần trả — hãy ký lại", code="permit_too_low")
        msg = permit_message(owner, self.chain.address, permit.value, self.chain.token_nonce(owner), permit.deadline)
        self._verify(typed_data(self.token_domain(), "Permit", msg), permit.signature, owner, "cho phép trừ tiền")
        try:
            v, r, s = split_signature(permit.signature)
        except ValueError as e:
            raise Unauthorized("Chữ ký cho phép trừ tiền không đúng định dạng") from e
        return (permit.value, permit.deadline, v, r, s)

    def _require_balance(self, owner: str, needed: int) -> None:
        if self.chain.token_balance(owner) < needed:
            raise BadRequest("Số dư ví không đủ cho số tiền + phí xử lý", code="ERC20InsufficientBalance")

    def _quote(self, action: str, payer: str, amount: int, fee: int, total: int, *, balance: int | None,
               reason: str | None, sign: TypedDataResponse | None = None, permit: PermitSign | None = None) -> SponsoredQuote:
        rate = self.fx.rate()
        return SponsoredQuote(
            action=action,
            payer=payer,
            amount=self.fx.money(amount, rate),
            fee=self.fx.money(fee, rate),
            total=self.fx.money(total, rate),
            balance=self.fx.money(balance, rate) if balance is not None else None,
            can_submit=reason is None,
            reason=reason,
            sign=sign if reason is None else None,
            permit=permit if reason is None else None,
        )

    def _result(self, action: str, tx_hash: str, amount: int, fee: int, campaign_id: int | None = None) -> SponsoredResult:
        rate = self.fx.rate()
        return SponsoredResult(action=action, tx_hash=tx_hash, amount=self.fx.money(amount, rate),
                               fee=self.fx.money(fee, rate), campaign_id=campaign_id)

    # ------------------------------------------------------------------ tạo chiến dịch

    def _draft_args(self, user: User, draft_id: str) -> dict:
        with self.sf() as s:
            d = s.get(CampaignDraft, draft_id)
            if d is None or d.source != "api":
                raise NotFound("Không tìm thấy nháp chiến dịch")
            if d.creator_user_id != user.id or d.creator_address != user.wallet_address:
                raise Forbidden("Nháp này thuộc người tạo khác")
            if d.campaign_id is not None:
                raise Conflict("Nháp này đã được dùng để tạo chiến dịch", code="draft_used")
            p = json.loads(d.params_json)
            return {
                "targetSec": int(p["targetSec"]), "fullPrice": int(p["fullPrice"]),
                "contributorBps": int(p["contributorBps"]), "creatorBps": int(p["creatorBps"]),
                "deadline": int(p["deadline"]), "promptSetHash": d.prompt_set_hash, "termsHash": d.terms_hash,
                "metadataURI": d.metadata_uri, "seedRatePerSec": int(p["seedRatePerSec"]), "seedAmount": int(p["seedAmount"]),
            }

    def create_quote(self, user: User, draft_id: str) -> SponsoredQuote:
        a = self._draft_args(user, draft_id)
        creator, fee, seed = user.wallet_address, self.policy.fee("create"), a["seedAmount"]
        needed = seed + fee
        balance = self.chain.token_balance(creator)
        reason = None
        if a["deadline"] <= self.chain.block_timestamp():
            reason = "Nháp đã quá hạn thu thập — hãy soạn lại chiến dịch"
        elif balance < needed:
            reason = "Số dư ví không đủ cho quỹ mồi + phí xử lý"
        deadline = self._deadline()
        nonce = self.chain.nonce_of(creator)
        sign = self._sign("CreateCampaign", create_message(creator, a, fee, nonce, deadline), nonce, deadline)
        permit = self._permit_request(creator, needed, deadline)
        return self._quote("create", creator, seed, fee, needed, balance=balance, reason=reason, sign=sign, permit=permit)

    def create(self, user: User, draft_id: str, body: SponsoredCreateRequest) -> SponsoredResult:
        a = self._draft_args(user, draft_id)
        creator = user.wallet_address
        self._check_deadline(body.deadline)
        self._require_fee("create", body.fee)
        needed = a["seedAmount"] + body.fee
        nonce = self.chain.nonce_of(creator)
        td = typed_data(self.chain.domain(), "CreateCampaign", create_message(creator, a, body.fee, nonce, body.deadline))
        self._verify(td, body.signature, creator, "tạo chiến dịch")
        permit = self._permit_args(creator, needed, body.permit)
        self._require_balance(creator, needed)
        params = (
            a["targetSec"], a["fullPrice"], a["contributorBps"], a["creatorBps"], a["deadline"],
            bytes.fromhex(a["promptSetHash"][2:]), bytes.fromhex(a["termsHash"][2:]), a["metadataURI"],
            a["seedRatePerSec"], a["seedAmount"],
        )
        res = self.relayer.send(
            self.chain.contract.functions.createCampaignWithSig(
                params, creator, body.fee, body.deadline, bytes.fromhex(body.signature.removeprefix("0x")), permit
            ),
            kind="create_sponsored",
            meta={"draft_id": draft_id, "creator": creator},
        )
        ev = self.chain.contract.events.CampaignCreated().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        self.indexer.sync()
        self.campaigns.relink_unverified()
        return self._result("create", res.tx_hash, a["seedAmount"], body.fee, campaign_id=int(ev["campaignId"]))

    # ------------------------------------------------------------------ mua

    def buy_quote(self, campaign_id: int, buyer: str) -> SponsoredQuote:
        addr = self._checksum(buyer)
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        fee, price = self.policy.fee("buy"), view.current_price
        balance = self.chain.token_balance(addr)
        reason = None
        if view.total_weight == 0:
            reason = "Chưa có bản ghi hợp lệ nào (không bán khi tiến độ 0)"
        elif self.chain.license(campaign_id, addr).active:
            reason = "Ví này đã có license cho bộ dữ liệu"
        elif balance < price + fee:
            reason = "Số dư ví không đủ cho giá + phí xử lý"
        deadline = self._deadline()
        nonce = self.chain.nonce_of(addr)
        sign = self._sign("Buy", buy_message(campaign_id, addr, price, fee, nonce, deadline), nonce, deadline)
        permit = self._permit_request(addr, price + fee, deadline)
        return self._quote("buy", addr, price, fee, price + fee, balance=balance, reason=reason, sign=sign, permit=permit)

    def buy(self, campaign_id: int, body: SponsoredBuyRequest) -> SponsoredResult:
        addr = self._checksum(body.buyer)
        if self.chain.campaign(campaign_id) is None:
            raise NotFound("Không tìm thấy chiến dịch")
        self._check_deadline(body.deadline)
        self._require_fee("buy", body.fee)
        nonce = self.chain.nonce_of(addr)
        msg = buy_message(campaign_id, addr, body.max_price, body.fee, nonce, body.deadline)
        self._verify(typed_data(self.chain.domain(), "Buy", msg), body.signature, addr, "mua")
        permit = self._permit_args(addr, body.max_price + body.fee, body.permit)
        res = self.relayer.send(
            self.chain.contract.functions.buyWithSig(
                campaign_id, addr, body.max_price, body.fee, body.deadline,
                bytes.fromhex(body.signature.removeprefix("0x")), permit,
            ),
            kind="buy_sponsored",
            meta={"campaign_id": campaign_id, "buyer": addr},
        )
        ev = self.chain.contract.events.Purchased().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        self.indexer.sync()
        return self._result("buy", res.tx_hash, int(ev["price"]), body.fee, campaign_id=campaign_id)

    # ------------------------------------------------------------------ rút doanh thu (người tạo)

    def withdraw_quote(self, address: str) -> SponsoredQuote:
        addr = self._checksum(address)
        fee, amount = self.policy.fee("withdraw"), self.chain.withdrawable(address)
        reason = None
        if amount == 0:
            reason = "Chưa có doanh thu để rút"
        elif amount <= fee:
            reason = "Số tiền chưa đủ trả phí xử lý"
        deadline = self._deadline()
        nonce = self.chain.nonce_of(addr)
        sign = self._sign("Withdraw", withdraw_message(addr, fee, nonce, deadline), nonce, deadline)
        return self._quote("withdraw", addr, amount, fee, max(amount - fee, 0), balance=None, reason=reason, sign=sign)

    def withdraw(self, body: SponsoredWithdrawRequest) -> SponsoredResult:
        addr = self._checksum(body.account)
        self._check_deadline(body.deadline)
        self._require_fee("withdraw", body.fee)
        nonce = self.chain.nonce_of(addr)
        td = typed_data(self.chain.domain(), "Withdraw", withdraw_message(addr, body.fee, nonce, body.deadline))
        self._verify(td, body.signature, addr, "rút doanh thu")
        res = self.relayer.send(
            self.chain.contract.functions.withdrawWithSig(
                addr, body.fee, body.deadline, bytes.fromhex(body.signature.removeprefix("0x"))
            ),
            kind="withdraw_sponsored",
            meta={"account": addr},
        )
        ev = self.chain.contract.events.Withdrawn().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        self.indexer.sync()
        return self._result("withdraw", res.tx_hash, int(ev["amount"]), body.fee)

    # ------------------------------------------------------------------ rút quỹ mồi còn dư (người tạo, sau hạn)

    def seed_quote(self, campaign_id: int) -> SponsoredQuote:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        fee, amount = self.policy.fee("withdraw_seed"), view.seed_balance
        reason = None
        if amount == 0:
            reason = "Quỹ mồi đã hết"
        elif self.chain.block_timestamp() < view.deadline:
            reason = "Chỉ rút được quỹ mồi còn dư sau khi chiến dịch hết hạn"
        elif amount <= fee:
            reason = "Quỹ mồi còn lại chưa đủ trả phí xử lý"
        deadline = self._deadline()
        nonce = self.chain.nonce_of(view.creator)
        msg = withdraw_seed_message(campaign_id, view.creator, fee, nonce, deadline)
        sign = self._sign("WithdrawSeed", msg, nonce, deadline)
        return self._quote("withdraw_seed", view.creator, amount, fee, max(amount - fee, 0), balance=None,
                           reason=reason, sign=sign)

    def withdraw_seed(self, campaign_id: int, body: SponsoredSeedWithdrawRequest) -> SponsoredResult:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        self._check_deadline(body.deadline)
        self._require_fee("withdraw_seed", body.fee)
        nonce = self.chain.nonce_of(view.creator)
        msg = withdraw_seed_message(campaign_id, view.creator, body.fee, nonce, body.deadline)
        self._verify(typed_data(self.chain.domain(), "WithdrawSeed", msg), body.signature, view.creator, "rút quỹ mồi")
        res = self.relayer.send(
            self.chain.contract.functions.withdrawSeedWithSig(
                campaign_id, body.fee, body.deadline, bytes.fromhex(body.signature.removeprefix("0x"))
            ),
            kind="withdraw_seed_sponsored",
            meta={"campaign_id": campaign_id, "creator": view.creator},
        )
        ev = self.chain.contract.events.SeedWithdrawn().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        self.indexer.sync()
        return self._result("withdraw_seed", res.tx_hash, int(ev["amount"]), body.fee, campaign_id=campaign_id)
