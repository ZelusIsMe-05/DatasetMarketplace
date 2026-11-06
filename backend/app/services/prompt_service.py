"""Cấp câu mẫu chưa đọc + prompt token HMAC có hạn ~60 giây, dùng một lần (§6.4)."""
from __future__ import annotations

import secrets

from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.core.config import Settings
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.security import sign_token
from app.models import Prompt, PromptToken, User
from app.repositories.queries import CampaignRepo, ContributionRepo
from app.schemas.contribution import PromptResponse

PROMPT_PURPOSE = "prompt"


class PromptService:
    def __init__(self, settings: Settings, sf: sessionmaker[Session], chain: ChainClient):
        self.settings, self.sf, self.chain = settings, sf, chain
        self._rng = secrets.SystemRandom()

    def issue(self, user: User, campaign_id: int, prompt_index: int | None = None) -> PromptResponse:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        if not view.is_collecting:
            raise Conflict("Chiến dịch đã ngừng thu thập (đủ mục tiêu hoặc quá hạn)", code="not_collecting")
        if self.chain.consent_at(campaign_id, user.wallet_address) == 0:
            raise Forbidden("Bạn cần ký đồng thuận cho chiến dịch trước khi ghi âm", code="no_consent")
        with self.sf() as s:
            draft = CampaignRepo.draft_for(s, campaign_id)
            if draft is None:
                raise Conflict("Chiến dịch chưa có bộ câu mẫu đã xác minh trên server")
            prompts = CampaignRepo.prompts(s, draft.id)
            read = ContributionRepo.read_prompt_ids(s, user.id, campaign_id)
            available = [p for p in prompts if p.id not in read]
            if not available:
                raise Conflict("Bạn đã đọc hết câu mẫu của chiến dịch này", code="no_prompts_left")
            chosen: Prompt
            if prompt_index is not None and self.settings.dev_mode:
                # Chỉ để kiểm thử local bằng file audio có sẵn; môi trường khác luôn chọn ngẫu nhiên.
                match = [p for p in available if p.idx == prompt_index]
                if not match:
                    raise Conflict("Câu mẫu này không còn khả dụng cho bạn")
                chosen = match[0]
            else:
                chosen = self._rng.choice(available)
            tok = sign_token(
                self.settings.token_secret,
                PROMPT_PURPOSE,
                {"uid": user.id, "cid": campaign_id, "pid": chosen.id},
                self.settings.prompt_token_ttl_sec,
            )
            s.add(
                PromptToken(
                    jti=tok.jti, user_id=user.id, campaign_id=campaign_id, prompt_id=chosen.id,
                    issued_at=tok.issued_at, expires_at=tok.expires_at,
                )
            )
            s.commit()
            return PromptResponse(
                campaign_id=campaign_id,
                prompt_id=chosen.id,
                prompt_index=chosen.idx,
                text=chosen.text,
                token=tok.token,
                issued_at=tok.issued_at,
                expires_at=tok.expires_at,
                remaining_prompts=len(available) - 1,
            )
