"""Chiến dịch: nháp metadata, bộ câu mẫu, điều khoản, liên kết với chiến dịch on-chain, đọc tiến độ/giá."""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from pathlib import Path

from eth_utils import keccak
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import CampaignView, ChainClient
from app.blockchain.indexer import EventIndexer
from app.core.config import Settings
from app.core.errors import BadRequest, NotFound
from app.models import Campaign, CampaignDraft, Prompt, User
from app.qc.service import QcService
from app.qc.text import canonical_prompt_set, has_digits, normalize_text, parse_prompt_set
from app.repositories.queries import CampaignRepo, ContributionRepo, SnapshotRepo
from app.schemas.campaign import (
    CampaignDetail,
    CampaignDraftRequest,
    CampaignDraftResponse,
    CampaignSummary,
    CreateCampaignArgs,
    SnapshotRef,
    Split,
    TermsResponse,
)
from app.services.fx_service import FxService
from app.services.review_service import review_stats

log = logging.getLogger("datasetmarketplace.campaigns")

_VI_LETTERS = re.compile(r"^[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ ]+$")
SAMPLE_COUNT = 3


def keccak_text(text: str) -> str:
    return "0x" + keccak(text.encode("utf-8")).hex()


def campaign_status(view: CampaignView, now: int) -> str:
    if view.is_collecting:
        return "collecting"
    if view.total_weight >= view.target_sec:
        return "stopped_target"
    if now >= view.deadline:
        return "stopped_deadline"
    return "stopped"


class CampaignService:
    def __init__(
        self,
        settings: Settings,
        sf: sessionmaker[Session],
        chain: ChainClient,
        indexer: EventIndexer,
        fx: FxService,
        qc: QcService,
    ):
        self.settings, self.sf, self.chain, self.indexer, self.fx, self.qc = settings, sf, chain, indexer, fx, qc
        indexer.on_campaign.append(self.link_campaign)

    # ------------------------------------------------------------------ kiểm tra câu mẫu (§10.2)

    def validate_prompts(self, prompts: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        vocab = None
        try:
            vocab = self.qc.get().vocab
        except Exception:  # noqa: BLE001 - model chưa tải được: dùng bảng chữ cái tiếng Việt
            log.warning("Không nạp được model QC, kiểm tra câu mẫu bằng bảng chữ cái tiếng Việt")
        errors: list[str] = []
        for i, p in enumerate(prompts):
            p = " ".join(p.split())
            norm = normalize_text(p)
            n_words = len(norm.split())
            if has_digits(p):
                errors.append(f"câu {i + 1}: viết số bằng chữ (§10.2)")
            if not 6 <= n_words <= 20:
                errors.append(f"câu {i + 1}: cần 6–20 từ (hiện {n_words})")
            if vocab is not None:
                oov = sorted({c for c in norm.replace(" ", "") if c not in vocab})
                if oov:
                    errors.append(f"câu {i + 1}: ký tự ngoài vocab của model {oov}")
            elif not _VI_LETTERS.match(norm):
                errors.append(f"câu {i + 1}: có ký tự ngoài bảng chữ cái tiếng Việt")
            if norm in seen:
                errors.append(f"câu {i + 1}: trùng câu trước")
            seen.add(norm)
            cleaned.append(p)
        if errors:
            raise BadRequest("Bộ câu mẫu không hợp lệ", code="invalid_prompts", details={"errors": errors[:50]})
        return cleaned

    # ------------------------------------------------------------------ nháp chiến dịch

    def _store_draft(
        self, s: Session, *, creator: str, creator_user_id: int | None, prompts: list[str], terms_text: str,
        meta: dict, metadata_uri: str, params: dict, source: str, draft_id: str | None = None,
    ) -> CampaignDraft:
        canon = canonical_prompt_set(prompts)
        draft = CampaignDraft(
            id=draft_id or str(uuid.uuid4()),
            creator_user_id=creator_user_id,
            creator_address=creator,
            name=meta["name"],
            description=meta["description"],
            purpose=meta["purpose"],
            license=meta.get("license", "research-and-commercial"),
            language=meta.get("language", "vi"),
            accent=meta.get("accent"),
            prompts_canonical=canon,
            terms_text=terms_text,
            prompt_set_hash=keccak_text(canon),
            terms_hash=keccak_text(terms_text),
            metadata_uri=metadata_uri,
            params_json=json.dumps(params),
            source=source,
        )
        s.add(draft)
        s.flush()
        for i, p in enumerate(parse_prompt_set(canon)):
            s.add(Prompt(draft_id=draft.id, idx=i, text=p))
        return draft

    def create_draft(self, user: User, req: CampaignDraftRequest) -> CampaignDraftResponse:
        if req.contributor_bps + req.creator_bps > 10_000:
            raise BadRequest("Tổng tỷ lệ người đóng góp + người tạo vượt 100%")
        prompts = self.validate_prompts(req.prompts)
        full_price, rate = self.fx.vnd_to_units(req.full_price_vnd)
        seed_amount, _ = self.fx.vnd_to_units(req.seed_vnd) if req.seed_vnd else (0, rate)
        seed_per_min, _ = self.fx.vnd_to_units(req.seed_vnd_per_minute) if req.seed_vnd_per_minute else (0, rate)
        seed_rate = seed_per_min // 60
        if full_price <= 0:
            raise BadRequest("Giá quá nhỏ")
        draft_id_hint = str(uuid.uuid4())
        uri = f"{self.settings.api_public_url}/metadata/{draft_id_hint}"
        deadline = self.chain.block_timestamp() + req.duration_days * 86_400
        params = {
            "targetSec": req.target_sec,
            "fullPrice": full_price,
            "contributorBps": req.contributor_bps,
            "creatorBps": req.creator_bps,
            "deadline": deadline,
            "seedRatePerSec": seed_rate,
            "seedAmount": seed_amount,
            "fxRate": rate,
        }
        with self.sf() as s:
            draft = self._store_draft(
                s,
                creator=user.wallet_address,
                creator_user_id=user.id,
                prompts=prompts,
                terms_text=req.terms_text,
                meta=req.model_dump(),
                metadata_uri=uri,
                params=params,
                source="api",
                draft_id=draft_id_hint,
            )
            s.commit()
            args = CreateCampaignArgs(
                targetSec=req.target_sec,
                fullPrice=full_price,
                contributorBps=req.contributor_bps,
                creatorBps=req.creator_bps,
                deadline=deadline,
                promptSetHash=draft.prompt_set_hash,
                termsHash=draft.terms_hash,
                metadataURI=uri,
                seedRatePerSec=seed_rate,
                seedAmount=seed_amount,
            )
            return CampaignDraftResponse(
                draft_id=draft.id,
                metadata_uri=uri,
                prompt_count=len(prompts),
                fx_rate=rate,
                full_price=self.fx.money(full_price, rate),
                seed_amount=self.fx.money(seed_amount, rate),
                contract=self.chain.address,
                token=self.chain.token_address,
                create_campaign_args=args,
                note="Mặc định nền tảng trả phí mạng: GET /campaigns/drafts/{draft_id}/create-quote → ký CreateCampaign "
                "(+ permit nếu cần) → POST /campaigns/drafts/{draft_id}/create. Hoặc tự gửi createCampaign bằng ví "
                "của mình (approve token trước nếu có quỹ mồi) rồi gọi POST /campaigns/sync.",
            )

    def import_seed(self, seed_dir: Path) -> str | None:
        """Nạp metadata chiến dịch mẫu (khớp SeedDemo.s.sol). Idempotent."""
        meta_path = seed_dir / "campaign.json"
        if not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        prompts_bytes = (seed_dir / "prompts.txt").read_bytes()
        terms_bytes = (seed_dir / "terms.md").read_bytes()
        prompts_text = prompts_bytes.decode("utf-8")
        if canonical_prompt_set(parse_prompt_set(prompts_text)).encode("utf-8") != prompts_bytes:
            raise ValueError(f"{seed_dir}/prompts.txt không ở dạng chuẩn (NFC, LF, xuống dòng cuối)")
        with self.sf() as s:
            existing = CampaignRepo.draft_by_uri(s, meta["metadata_uri"])
            if existing:
                return existing.id
            draft = self._store_draft(
                s,
                creator="seed",
                creator_user_id=None,
                prompts=parse_prompt_set(prompts_text),
                terms_text=terms_bytes.decode("utf-8"),
                meta=meta,
                metadata_uri=meta["metadata_uri"],
                params={},
                source="seed",
            )
            s.commit()
            return draft.id

    def link_campaign(self, s: Session, campaign_id: int) -> None:
        """Hook của indexer: gắn metadata off-chain khi URI + hai hash khớp đúng giá trị on-chain."""
        c = s.get(Campaign, campaign_id)
        if c is None:
            return
        draft = CampaignRepo.draft_by_uri(s, c.metadata_uri)
        if draft is None or draft.campaign_id is not None:
            return
        if draft.prompt_set_hash != c.prompt_set_hash or draft.terms_hash != c.terms_hash:
            log.warning("Chiến dịch %s dùng URI %s nhưng hash không khớp metadata", campaign_id, c.metadata_uri)
            return
        if draft.source == "api" and draft.creator_address != c.creator:
            log.warning("Chiến dịch %s: người tạo on-chain khác người soạn nháp", campaign_id)
            return
        c.draft_id = draft.id
        c.metadata_verified = True
        draft.campaign_id = campaign_id

    def sync(self) -> int:
        return self.indexer.sync()

    def relink_unverified(self) -> None:
        """Thử liên kết lại các chiến dịch chưa có metadata (ví dụ nháp được tạo sau khi indexer đã thấy sự kiện)."""
        with self.sf() as s:
            for c in s.scalars(select(Campaign).where(Campaign.metadata_verified.is_(False))):
                self.link_campaign(s, c.id)
            s.commit()

    # ------------------------------------------------------------------ đọc

    def _view(self, campaign_id: int) -> CampaignView:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        return view

    def summary(self, s: Session, view: CampaignView, now: int, rate: float) -> CampaignSummary:
        draft = CampaignRepo.draft_for(s, view.id)
        return CampaignSummary(
            id=view.id,
            name=draft.name if draft else None,
            accent=draft.accent if draft else None,
            metadata_verified=draft is not None,
            creator=view.creator,
            progress_bps=view.progress_bps,
            total_sec=view.total_weight,
            target_sec=view.target_sec,
            price=self.fx.money(view.current_price, rate),
            full_price=self.fx.money(view.full_price, rate),
            is_collecting=view.is_collecting,
            status=campaign_status(view, now),
            deadline=view.deadline,
        )

    def list(self) -> list[CampaignSummary]:
        self.indexer.sync_if_stale()
        rate, now = self.fx.rate(), self.chain.block_timestamp()
        out: list[CampaignSummary] = []
        with self.sf() as s:
            for cid in range(self.chain.campaign_count()):
                view = self.chain.campaign(cid)
                if view is not None:
                    out.append(self.summary(s, view, now, rate))
        return out

    def detail(self, campaign_id: int) -> CampaignDetail:
        self.indexer.sync_if_stale()
        view = self._view(campaign_id)
        rate, now = self.fx.rate(), self.chain.block_timestamp()
        with self.sf() as s:
            base = self.summary(s, view, now, rate)
            draft = CampaignRepo.draft_for(s, campaign_id)
            purchases = CampaignRepo.purchases(s, campaign_id)
            revenue = sum(int(p.price_units) for p in purchases)
            samples = [
                f"{self.settings.api_public_url}/campaigns/{campaign_id}/samples/{c.onchain_id}"
                for c in ContributionRepo.active_registered(s, campaign_id)[:SAMPLE_COUNT]
            ]
            snap = SnapshotRepo.latest(s, campaign_id)
            explorer = self.settings.network.explorer
            return CampaignDetail(
                **base.model_dump(),
                description=draft.description if draft else None,
                purpose=draft.purpose if draft else None,
                license=draft.license if draft else None,
                language=draft.language if draft else None,
                split=Split(
                    contributor_bps=view.contributor_bps, creator_bps=view.creator_bps, platform_bps=view.platform_bps
                ),
                contributors=CampaignRepo.active_contributor_count(s, campaign_id),
                buyers=len({p.buyer for p in purchases}),
                revenue_total=self.fx.money(revenue, rate),
                seed_rate_per_sec=self.fx.money(view.seed_rate_per_sec, rate),
                seed_balance=self.fx.money(view.seed_balance, rate),
                prompt_count=len(CampaignRepo.prompts(s, draft.id)) if draft else 0,
                prompt_set_hash=view.prompt_set_hash,
                terms_hash=view.terms_hash,
                metadata_uri=view.metadata_uri,
                samples=samples,
                review=review_stats(s, campaign_id),
                latest_snapshot=SnapshotRef(
                    version=snap.version, merkle_root=snap.merkle_root, uri=snap.uri, leaf_count=snap.leaf_count,
                    total_sec=snap.total_sec, status=snap.status, tx_hash=snap.tx_hash,
                ) if snap else None,
                explorer_url=f"{explorer}/address/{self.chain.address}" if explorer else None,
            )

    def terms(self, campaign_id: int) -> TermsResponse:
        self.indexer.sync_if_stale()
        view = self._view(campaign_id)
        with self.sf() as s:
            draft = CampaignRepo.draft_for(s, campaign_id)
            if draft is None:
                raise NotFound("Chiến dịch chưa có điều khoản đã xác minh trên server")
            h = keccak_text(draft.terms_text)
            return TermsResponse(
                campaign_id=campaign_id,
                terms_text=draft.terms_text,
                terms_hash=h,
                onchain_terms_hash=view.terms_hash,
                matches=h == view.terms_hash,
            )

    def public_metadata(self, draft_id: str) -> dict:
        """Nội dung metadataURI. KHÔNG công bố bộ câu mẫu (câu chỉ hiện khi ghi âm, §6.4)."""
        with self.sf() as s:
            d = s.get(CampaignDraft, draft_id)
            if d is None:
                raise NotFound("Không có metadata")
            return {
                "name": d.name,
                "description": d.description,
                "purpose": d.purpose,
                "license": d.license,
                "language": d.language,
                "accent": d.accent,
                "promptCount": len(CampaignRepo.prompts(s, d.id)),
                "promptSetHash": d.prompt_set_hash,
                "termsHash": d.terms_hash,
                "campaignId": d.campaign_id,
                "generatedAt": int(time.time()),
            }

    def campaign_ids(self) -> list[int]:
        with self.sf() as s:
            return list(s.scalars(select(Campaign.id).order_by(Campaign.id)))
