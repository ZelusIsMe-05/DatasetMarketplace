"""Tiền của người đóng góp (§6.7): xem bản ghi + tiền chưa rút, báo giá rút hộ, relayer gửi claimWithSig."""
from __future__ import annotations

from web3.logs import DISCARD

import json

from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.eip712 import claim_message, recover_typed, typed_data
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.errors import BadRequest, NotFound, Unauthorized
from app.models import Prompt, User
from app.repositories.queries import ContributionRepo
from app.schemas.common import TypedDataResponse
from app.schemas.contribution import (
    CampaignEarnings,
    ClaimQuote,
    ClaimResponse,
    ContributionItem,
    MyContributions,
)
from app.services.consent_service import MAX_DEADLINE_SEC, SIGNATURE_WINDOW_SEC
from app.services.fx_service import FxService


class RewardsService:
    def __init__(
        self, sf: sessionmaker[Session], chain: ChainClient, relayer: Relayer, indexer: EventIndexer, fx: FxService
    ):
        self.sf, self.chain, self.relayer, self.indexer, self.fx = sf, chain, relayer, indexer, fx

    def my_contributions(self, user: User) -> MyContributions:
        self.indexer.sync_if_stale()
        rate = self.fx.rate()
        with self.sf() as s:
            rows = ContributionRepo.for_user(s, user.id)
            items = []
            for c in rows:
                p = s.get(Prompt, c.prompt_id)
                reasons = json.loads(c.qc_json).get("reasons", []) if c.qc_json else []
                items.append(
                    ContributionItem(
                        id=c.id,
                        campaign_id=c.campaign_id,
                        prompt_text=p.text if p else "",
                        status=c.status,
                        duration_sec=round(c.duration_sec, 2),
                        weight_sec=c.weight_sec,
                        onchain_id=c.onchain_id,
                        tx_hash=c.tx_hash,
                        revoke_tx_hash=c.revoke_tx_hash,
                        reasons=reasons + ([c.error] if c.error else [])
                        + ([f"Chủ chiến dịch loại: {c.review_note}"] if c.review_decision == "rejected" and c.review_note else []),
                        created_at=int(c.created_at.timestamp()),
                    )
                )
            campaigns = sorted({c.campaign_id for c in rows})
        earnings = []
        total = 0
        for cid in campaigns:
            weight, _, _ = self.chain.account(cid, user.wallet_address)
            pending = self.chain.pending_reward(cid, user.wallet_address)
            total += pending
            earnings.append(CampaignEarnings(campaign_id=cid, active_weight_sec=weight, pending=self.fx.money(pending, rate)))
        return MyContributions(
            address=user.wallet_address, contributions=items, earnings=earnings, total_pending=self.fx.money(total, rate)
        )

    def claim_quote(self, user: User, campaign_id: int) -> ClaimQuote:
        if self.chain.campaign(campaign_id) is None:
            raise NotFound("Không tìm thấy chiến dịch")
        rate = self.fx.rate()
        addr = user.wallet_address
        pending = self.chain.pending_reward(campaign_id, addr)
        fee = self.chain.claim_fee()
        can = pending > 0 and pending > fee
        reason = None if can else ("Chưa có tiền để rút" if pending == 0 else "Số tiền chưa đủ trả phí rút hộ")
        sign = None
        if can:
            nonce = self.chain.nonce_of(addr)
            deadline = self.chain.block_timestamp() + SIGNATURE_WINDOW_SEC
            td = typed_data(self.chain.domain(), "Claim", claim_message(campaign_id, addr, fee, nonce, deadline))
            sign = TypedDataResponse(typed_data=td, nonce=nonce, deadline=deadline)
        return ClaimQuote(
            campaign_id=campaign_id,
            contributor=addr,
            pending=self.fx.money(pending, rate),
            fee=self.fx.money(fee, rate),
            net=self.fx.money(max(pending - fee, 0), rate),
            can_claim=can,
            reason=reason,
            sign=sign,
        )

    def claim(self, user: User, campaign_id: int, max_fee: int, deadline: int, signature: str) -> ClaimResponse:
        addr = user.wallet_address
        now = self.chain.block_timestamp()
        if deadline <= now or deadline > now + MAX_DEADLINE_SEC:
            raise BadRequest("deadline không hợp lệ")
        fee = self.chain.claim_fee()
        if fee > max_fee:
            raise BadRequest("Phí rút hộ hiện tại cao hơn mức tối đa bạn đã ký", code="FeeTooHigh")
        pending = self.chain.pending_reward(campaign_id, addr)
        if pending <= fee:
            raise BadRequest("Không có tiền để rút (hoặc không đủ trả phí)", code="NothingToClaim")
        nonce = self.chain.nonce_of(addr)
        td = typed_data(self.chain.domain(), "Claim", claim_message(campaign_id, addr, max_fee, nonce, deadline))
        try:
            signer = recover_typed(td, signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != addr:
            raise Unauthorized("Chữ ký Claim không khớp ví của tài khoản")
        res = self.relayer.send(
            self.chain.contract.functions.claimWithSig(campaign_id, addr, max_fee, deadline, bytes.fromhex(signature[2:])),
            kind="claim",
            meta={"campaign_id": campaign_id, "contributor": addr},
        )
        ev = self.chain.contract.events.Claimed().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        self.indexer.sync()
        rate = self.fx.rate()
        return ClaimResponse(
            campaign_id=campaign_id,
            contributor=addr,
            received=self.fx.money(int(ev["amount"]), rate),
            fee=self.fx.money(int(ev["fee"]), rate),
            tx_hash=res.tx_hash,
        )
