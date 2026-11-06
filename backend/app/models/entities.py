"""Thực thể off-chain. Tiền, quyền, bằng chứng nằm trên chain; ở đây là dữ liệu + cache chỉ mục.

Số tiền on-chain lưu dạng chuỗi thập phân (`*_units`) vì có thể vượt giới hạn INTEGER 64-bit của SQLite.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, utcnow


class ContributionStatus(StrEnum):
    SUBMITTED = "submitted"  # DaNop: đã nhận, đang QC
    REJECTED = "rejected"  # BiLoai: QC trượt (audio đã xóa)
    GRAY = "gray"  # vùng xám: chờ duyệt tay (audio giữ riêng tư)
    PENDING_CHAIN = "pending_chain"  # đạt nhưng giao dịch chưa thành công (thử lại được)
    REGISTERED = "registered"  # HopLe: đã ghi lên chain
    REVOKED = "revoked"  # DaThuHoi: audio + salt đã xóa
    FAILED = "failed"  # đạt QC nhưng chain từ chối vĩnh viễn (ví dụ chiến dịch ngừng thu thập)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    wallet_address: Mapped[str] = mapped_column(String(42), unique=True, index=True)
    auth_provider: Mapped[str] = mapped_column(String(16))  # google | dev
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"
    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    address: Mapped[str] = mapped_column(String(42), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CampaignDraft(Base, TimestampMixin):
    """Metadata off-chain của chiến dịch. Hash bộ câu mẫu + điều khoản được ghi lên chain."""

    __tablename__ = "campaign_drafts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    creator_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    creator_address: Mapped[str] = mapped_column(String(42))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    license: Mapped[str] = mapped_column(String(64))
    language: Mapped[str] = mapped_column(String(32), default="vi")
    accent: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompts_canonical: Mapped[str] = mapped_column(Text)  # đúng các byte đã băm
    terms_text: Mapped[str] = mapped_column(Text)  # đúng các byte đã băm
    prompt_set_hash: Mapped[str] = mapped_column(String(66))
    terms_hash: Mapped[str] = mapped_column(String(66))
    metadata_uri: Mapped[str] = mapped_column(String(300), unique=True)
    params_json: Mapped[str] = mapped_column(Text)  # tham số createCampaign đề xuất
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    source: Mapped[str] = mapped_column(String(16), default="api")  # api | seed


class Campaign(Base, TimestampMixin):
    """Cache của chiến dịch on-chain (khóa = campaignId on-chain)."""

    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    creator: Mapped[str] = mapped_column(String(42), index=True)
    draft_id: Mapped[str | None] = mapped_column(ForeignKey("campaign_drafts.id"), nullable=True)
    metadata_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    target_sec: Mapped[int] = mapped_column(BigInteger)
    full_price_units: Mapped[str] = mapped_column(String(80))
    contributor_bps: Mapped[int] = mapped_column(Integer)
    creator_bps: Mapped[int] = mapped_column(Integer)
    deadline: Mapped[int] = mapped_column(BigInteger)
    prompt_set_hash: Mapped[str] = mapped_column(String(66))
    terms_hash: Mapped[str] = mapped_column(String(66))
    metadata_uri: Mapped[str] = mapped_column(String(300))
    created_block: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String(66))


class Prompt(Base):
    __tablename__ = "prompts"
    __table_args__ = (UniqueConstraint("draft_id", "idx"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[str] = mapped_column(ForeignKey("campaign_drafts.id"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("campaign_id", "address"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    address: Mapped[str] = mapped_column(String(42), index=True)
    terms_hash: Mapped[str] = mapped_column(String(66))
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    via_relayer: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PromptToken(Base):
    __tablename__ = "prompt_tokens"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    campaign_id: Mapped[int] = mapped_column(Integer)
    prompt_id: Mapped[int] = mapped_column(ForeignKey("prompts.id"))
    issued_at: Mapped[int] = mapped_column(BigInteger)
    expires_at: Mapped[int] = mapped_column(BigInteger)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Contribution(Base, TimestampMixin):
    __tablename__ = "contributions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    address: Mapped[str] = mapped_column(String(42), index=True)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    prompt_id: Mapped[int] = mapped_column(ForeignKey("prompts.id"))
    status: Mapped[str] = mapped_column(String(16), index=True)
    qc_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float, default=0.0)
    speech_sec: Mapped[float] = mapped_column(Float, default=0.0)
    weight_sec: Mapped[int] = mapped_column(Integer, default=0)
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audio_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    salt_hex: Mapped[str | None] = mapped_column(String(66), nullable=True)  # KHÔNG BAO GIỜ log
    commitment: Mapped[str | None] = mapped_column(String(66), nullable=True, unique=True)
    onchain_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    seed_paid_units: Mapped[str] = mapped_column(String(80), default="0")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)


class OnchainContribution(Base):
    """Chỉ mục sự kiện ContributionRegistered / ConsentRevoked (nguồn sự thật = chain)."""

    __tablename__ = "onchain_contributions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    contributor: Mapped[str] = mapped_column(String(42), index=True)
    commitment: Mapped[str] = mapped_column(String(66))
    duration_sec: Mapped[int] = mapped_column(Integer)
    seed_paid_units: Mapped[str] = mapped_column(String(80), default="0")
    block: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String(66))
    revoked_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (UniqueConstraint("tx_hash", "log_index"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    buyer: Mapped[str] = mapped_column(String(42), index=True)
    price_units: Mapped[str] = mapped_column(String(80))
    progress_bps: Mapped[int] = mapped_column(Integer)
    block: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String(66))
    log_index: Mapped[int] = mapped_column(Integer)


class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (UniqueConstraint("tx_hash", "log_index"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    contributor: Mapped[str] = mapped_column(String(42), index=True)
    amount_units: Mapped[str] = mapped_column(String(80))
    fee_units: Mapped[str] = mapped_column(String(80))
    block: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String(66))
    log_index: Mapped[int] = mapped_column(Integer)


class RelayTx(Base, TimestampMixin):
    __tablename__ = "relay_txs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)  # sent | confirmed | failed
    from_address: Mapped[str] = mapped_column(String(42))
    nonce: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    gas_used: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class Snapshot(Base, TimestampMixin):
    __tablename__ = "snapshots"
    __table_args__ = (UniqueConstraint("campaign_id", "version"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(Integer, index=True)
    version: Mapped[int] = mapped_column(Integer)
    merkle_root: Mapped[str] = mapped_column(String(66))
    uri: Mapped[str] = mapped_column(String(300))
    manifest_json: Mapped[str] = mapped_column(Text)
    leaf_count: Mapped[int] = mapped_column(Integer)
    total_sec: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))  # published | stale
    stale_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)


class UsedSignature(Base):
    """Chống phát lại chữ ký off-chain (ví dụ chữ ký yêu cầu tải dataset)."""

    __tablename__ = "used_signatures"
    sig_hash: Mapped[str] = mapped_column(String(66), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KvState(Base):
    __tablename__ = "kv_state"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
