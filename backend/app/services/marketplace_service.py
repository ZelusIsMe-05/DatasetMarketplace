"""Mua bán (§6.5, §6.6, §6.7): báo giá theo tiến độ, license on-chain, doanh thu đã chia.

Mặc định người mua chỉ ký (Buy + permit) và relayer gửi `buyWithSig` (sponsor_service, nền tảng trả phí mạng);
vẫn có thể tự gửi `approve` + `buy(campaignId, maxPrice)` (CLI ở local). Backend không giữ tiền: token đi thẳng từ
ví người mua vào hợp đồng.
"""
from __future__ import annotations

from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3

from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer
from app.core.errors import BadRequest, NotFound
from app.repositories.queries import CampaignRepo
from app.schemas.campaign import LicenseResponse, PriceQuote, PurchaseItem, RevenueResponse
from app.services.fx_service import FxService

BPS = 10_000
ACC = 10**18


def split_of_sale(price: int, total_weight: int, contributor_bps: int, creator_bps: int) -> tuple[int, int, int]:
    """Tái hiện đúng phép chia của `buy()` (kể cả làm tròn lên phần người đóng góp)."""
    contributor_share = price * contributor_bps // BPS
    creator_share = price * creator_bps // BPS
    acc_delta = contributor_share * ACC // total_weight
    distributed = (acc_delta * total_weight + ACC - 1) // ACC
    return distributed, creator_share, price - creator_share - distributed


class MarketplaceService:
    def __init__(self, sf: sessionmaker[Session], chain: ChainClient, indexer: EventIndexer, fx: FxService):
        self.sf, self.chain, self.indexer, self.fx = sf, chain, indexer, fx

    def quote(self, campaign_id: int) -> PriceQuote:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        rate = self.fx.rate()
        can = view.total_weight > 0
        return PriceQuote(
            campaign_id=campaign_id,
            progress_bps=view.progress_bps,
            price=self.fx.money(view.current_price, rate),
            full_price=self.fx.money(view.full_price, rate),
            can_buy=can,
            reason=None if can else "Chưa có bản ghi hợp lệ nào (không bán khi tiến độ 0)",
            contract=self.chain.address,
            token=self.chain.token_address,
        )

    def license(self, campaign_id: int, buyer: str) -> LicenseResponse:
        if not Web3.is_address(buyer):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        addr = Web3.to_checksum_address(buyer)
        lic = self.chain.license(campaign_id, addr)
        return LicenseResponse(
            campaign_id=campaign_id,
            buyer=addr,
            licensed=lic.active,
            purchased_at=lic.purchased_at,
            progress_bps_at_purchase=lic.progress_bps_at_purchase,
            price_paid=self.fx.money(lic.price_paid),
        )

    def revenue(self, campaign_id: int) -> RevenueResponse:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        self.indexer.sync_if_stale(0)
        rate = self.fx.rate()
        with self.sf() as s:
            purchases = CampaignRepo.purchases(s, campaign_id)
        total = to_contrib = to_creator = to_platform = 0
        items = []
        for p in purchases:
            price = int(p.price_units)
            # trọng số tại thời điểm bán = progress * target (chính xác tới bps); chỉ dùng để ước tính bụi làm tròn
            weight_at_sale = max(1, p.progress_bps * view.target_sec // BPS)
            c, cr, pl = split_of_sale(price, weight_at_sale, view.contributor_bps, view.creator_bps)
            total += price
            to_contrib += c
            to_creator += cr
            to_platform += pl
            items.append(
                PurchaseItem(buyer=p.buyer, price=self.fx.money(price, rate), progress_bps=p.progress_bps,
                             block=p.block, tx_hash=p.tx_hash)
            )
        return RevenueResponse(
            campaign_id=campaign_id,
            sales=len(items),
            total=self.fx.money(total, rate),
            to_contributors=self.fx.money(to_contrib, rate),
            to_creator=self.fx.money(to_creator, rate),
            to_platform=self.fx.money(to_platform, rate),
            purchases=items,
            creator_withdrawable=self.fx.money(self.chain.withdrawable(view.creator), rate),
            note="Phần người tạo chính xác theo contract; phần người đóng góp/nền tảng có thể lệch vài đơn vị 1e-6 "
            "do bụi làm tròn (nền tảng nhận phần lẻ).",
        )
