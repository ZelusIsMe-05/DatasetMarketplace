"""Đóng góp giọng nói (§6.4, §10): prompt token → giải mã → chống trùng → QC → commitment → registerContribution.

Chống chuẩn bị audio trước (§6.4 "chỉ ghi âm trực tiếp"):
- prompt token ký HMAC, hết hạn sau PROMPT_TOKEN_TTL_SEC (mặc định 60 giây), dùng đúng một lần;
- thời lượng audio không được dài hơn thời gian từ lúc server hiện câu mẫu đến lúc nhận file.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker
from web3.logs import DISCARD
from web3 import Web3

from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.config import Settings
from app.core.errors import BadRequest, ChainError, Conflict, Forbidden, PayloadTooLarge, ServiceUnavailable
from app.core.security import TokenError, verify_token
from app.models import Contribution, ContributionStatus, Prompt, PromptToken, User
from app.qc.audio import AudioDecodeError, decode_audio, duration_sec, to_wav_bytes
from app.qc.checker import QCResult, weight_seconds
from app.qc.service import QcService
from app.repositories.queries import ContributionRepo
from app.schemas.contribution import ContributionResult, QcReport
from app.services.fx_service import FxService
from app.services.prompt_service import PROMPT_PURPOSE
from app.services.storage import PrivateStorage

log = logging.getLogger("giongque.contributions")

LIVE_GRACE_SEC = 1.5  # dung sai đồng hồ/mạng khi so thời lượng audio với thời gian từ lúc cấp câu
PERMANENT_CHAIN_ERRORS = {"NotCollecting", "NoConsent", "DuplicateCommitment", "InvalidParams"}


def make_commitment(audio_bytes: bytes) -> tuple[str, bytes]:
    """commitment = keccak256(audioBytes ‖ salt), salt 32 byte ngẫu nhiên lưu off-chain (§7.3, §10.5)."""
    salt = os.urandom(32)
    return "0x" + Web3.keccak(audio_bytes + salt).hex().removeprefix("0x"), salt


def qc_report(res: QCResult) -> QcReport:
    d = res.to_dict()
    return QcReport(**{k: d[k] for k in QcReport.model_fields})


class ContributionService:
    def __init__(
        self,
        settings: Settings,
        sf: sessionmaker[Session],
        chain: ChainClient,
        qc_signer: Relayer,
        indexer: EventIndexer,
        qc: QcService,
        storage: PrivateStorage,
        fx: FxService,
    ):
        self.settings, self.sf, self.chain, self.qc_signer = settings, sf, chain, qc_signer
        self.indexer, self.qc, self.storage, self.fx = indexer, qc, storage, fx

    # ------------------------------------------------------------------ nhận bản ghi

    def _consume_token(self, user: User, token: str) -> tuple[PromptToken, Prompt]:
        try:
            body = verify_token(self.settings.token_secret, PROMPT_PURPOSE, token)
        except TokenError as e:
            raise Forbidden(f"Prompt token không hợp lệ: {e}", code="bad_prompt_token") from e
        if body.get("uid") != user.id:
            raise Forbidden("Prompt token không thuộc tài khoản này", code="bad_prompt_token")
        with self.sf() as s:
            # Đánh dấu đã dùng một cách nguyên tử: hai request song song không thể cùng dùng một token
            n = s.execute(
                update(PromptToken)
                .where(PromptToken.jti == body["jti"], PromptToken.used_at.is_(None))
                .values(used_at=datetime.now(UTC))
            ).rowcount
            s.commit()
            if n != 1:
                raise Forbidden("Prompt token đã được dùng hoặc không tồn tại", code="bad_prompt_token")
            pt = s.get(PromptToken, body["jti"])
            prompt = s.get(Prompt, pt.prompt_id)
            return pt, prompt

    def submit(self, user: User, token: str, audio: bytes) -> ContributionResult:
        if len(audio) > self.settings.max_upload_bytes:
            raise PayloadTooLarge("File audio quá lớn")
        received_at = time.time()
        pt, prompt = self._consume_token(user, token)
        try:
            wav = decode_audio(audio)
        except AudioDecodeError as e:
            raise BadRequest(f"Không đọc được audio: {e}", code="bad_audio") from e

        elapsed = received_at - pt.issued_at
        dur = duration_sec(wav)
        if dur > elapsed + LIVE_GRACE_SEC:
            raise BadRequest(
                f"Bản ghi dài {dur:.1f}s nhưng câu mẫu mới hiện {elapsed:.1f}s: chỉ chấp nhận ghi âm trực tiếp",
                code="not_live",
            )

        with self.sf() as s:
            if prompt.id in ContributionRepo.read_prompt_ids(s, user.id, pt.campaign_id):
                raise Conflict("Bạn đã đọc câu này rồi", code="prompt_already_read")

        stored_bytes = to_wav_bytes(wav)
        audio_sha = hashlib.sha256(stored_bytes).hexdigest()
        with self.sf() as s:
            if ContributionRepo.duplicate_audio(s, audio_sha):
                raise Conflict("Bản ghi trùng với bản ghi đã nộp", code="duplicate_audio")

        try:
            checker = self.qc.get()
        except Exception as e:  # noqa: BLE001
            raise ServiceUnavailable("Dịch vụ QC chưa sẵn sàng (model chưa tải được)") from e
        res = checker.check(wav, prompt.text)
        weight = weight_seconds(res, self.settings.qc.weight_source)
        if res.decision != "reject" and weight < 1:
            res.decision = "reject"
            res.reasons.append("số giây giọng nói hợp lệ dưới 1 giây")

        with self.sf() as s:
            c = Contribution(
                user_id=user.id,
                address=user.wallet_address,
                campaign_id=pt.campaign_id,
                prompt_id=prompt.id,
                status=ContributionStatus.SUBMITTED,
                qc_json=json.dumps(res.to_dict(), ensure_ascii=False),
                duration_sec=res.duration_sec,
                speech_sec=res.speech_sec,
                weight_sec=weight if res.decision != "reject" else 0,
            )
            if res.decision == "reject":
                c.status = ContributionStatus.REJECTED  # không giữ audio của bản ghi bị loại
            else:
                c.audio_path = self.storage.save_audio(pt.campaign_id, stored_bytes)
                c.audio_sha256 = audio_sha
                c.status = ContributionStatus.GRAY if res.decision == "gray" else ContributionStatus.PENDING_CHAIN
            s.add(c)
            s.commit()
            cid = c.id

        if res.decision == "pass":
            return self.register(cid, qc=res)
        msg = "Bản ghi ở vùng xám, đang chờ duyệt tay" if res.decision == "gray" else "Bản ghi chưa đạt, hãy đọc lại"
        return self._result(cid, res, msg)

    # ------------------------------------------------------------------ ghi nhận on-chain

    def register(self, contribution_id: int, qc: QCResult | None = None) -> ContributionResult:
        """Sinh salt + commitment, QC oracle gọi registerContribution. Dùng cho bản ghi đạt / được duyệt / thử lại."""
        with self.sf() as s:
            c = s.get(Contribution, contribution_id)
            if c.status not in (ContributionStatus.PENDING_CHAIN, ContributionStatus.GRAY):
                raise Conflict(f"Bản ghi đang ở trạng thái {c.status}")
            audio = self.storage.read(c.audio_path)
            if c.salt_hex and c.commitment:
                commitment, salt = c.commitment, bytes.fromhex(c.salt_hex[2:])
            else:
                commitment, salt = make_commitment(audio)
                c.salt_hex, c.commitment = "0x" + salt.hex(), commitment
            c.status = ContributionStatus.PENDING_CHAIN
            s.commit()
            campaign_id, address, weight = c.campaign_id, c.address, c.weight_sec

        try:
            res = self.qc_signer.send(
                self.chain.contract.functions.registerContribution(
                    campaign_id, Web3.to_checksum_address(address), bytes.fromhex(commitment[2:]), weight
                ),
                kind="register",
                meta={"contribution": contribution_id, "campaign_id": campaign_id, "weight": weight},
            )
        except ChainError as e:
            with self.sf() as s:
                c = s.get(Contribution, contribution_id)
                c.error = f"{e.code}: {e.message}"
                if e.code in PERMANENT_CHAIN_ERRORS:
                    c.status = ContributionStatus.FAILED
                    self.storage.delete(c.audio_path)
                    c.audio_path, c.salt_hex, c.audio_sha256 = None, None, None
                s.commit()
            return self._result(contribution_id, qc, f"Đạt QC nhưng không ghi được lên chain: {e.message}")

        ev = self.chain.contract.events.ContributionRegistered().process_receipt(res.receipt, errors=DISCARD)[0]["args"]
        with self.sf() as s:
            c = s.get(Contribution, contribution_id)
            c.status = ContributionStatus.REGISTERED
            c.onchain_id = int(ev["contributionId"])
            c.tx_hash = res.tx_hash
            c.seed_paid_units = str(int(ev["seedPaid"]))
            c.error = None
            s.commit()
        self.indexer.sync()
        return self._result(contribution_id, qc, "Bản ghi đạt và đã được ghi nhận trên Avalanche")

    def _result(self, contribution_id: int, qc: QCResult | None, message: str) -> ContributionResult:
        with self.sf() as s:
            c = s.get(Contribution, contribution_id)
            report = qc_report(qc) if qc else (QcReport(**{
                k: v for k, v in json.loads(c.qc_json).items() if k in QcReport.model_fields
            }) if c.qc_json else None)
            seed = int(c.seed_paid_units or 0)
            return ContributionResult(
                id=c.id,
                campaign_id=c.campaign_id,
                prompt_id=c.prompt_id,
                status=c.status,
                qc=report,
                weight_sec=c.weight_sec,
                onchain_id=c.onchain_id,
                commitment=c.commitment,
                tx_hash=c.tx_hash,
                seed_paid=self.fx.money(seed) if c.status == ContributionStatus.REGISTERED else None,
                message=message,
            )
