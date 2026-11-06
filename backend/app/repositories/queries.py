"""Truy vấn dùng chung (repository layer). Service không viết SQL trực tiếp cho các truy vấn lặp lại."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Campaign,
    CampaignDraft,
    Contribution,
    ContributionStatus,
    OnchainContribution,
    Prompt,
    Purchase,
    Snapshot,
    User,
)

# Câu đã đọc = mọi trạng thái trừ bị loại (bị loại thì được đọc lại, §6.4 + §10.1)
READ_STATUSES = (
    ContributionStatus.SUBMITTED,
    ContributionStatus.GRAY,
    ContributionStatus.PENDING_CHAIN,
    ContributionStatus.REGISTERED,
    ContributionStatus.REVOKED,
)


class UserRepo:
    @staticmethod
    def by_email(s: Session, email: str) -> User | None:
        return s.scalar(select(User).where(User.email == email))

    @staticmethod
    def by_wallet(s: Session, address: str) -> User | None:
        return s.scalar(select(User).where(User.wallet_address == address))


class CampaignRepo:
    @staticmethod
    def draft_for(s: Session, campaign_id: int) -> CampaignDraft | None:
        c = s.get(Campaign, campaign_id)
        if c is None or not c.draft_id or not c.metadata_verified:
            return None
        return s.get(CampaignDraft, c.draft_id)

    @staticmethod
    def draft_by_uri(s: Session, uri: str) -> CampaignDraft | None:
        return s.scalar(select(CampaignDraft).where(CampaignDraft.metadata_uri == uri))

    @staticmethod
    def prompts(s: Session, draft_id: str) -> list[Prompt]:
        return list(s.scalars(select(Prompt).where(Prompt.draft_id == draft_id).order_by(Prompt.idx)))

    @staticmethod
    def active_contributor_count(s: Session, campaign_id: int) -> int:
        q = select(func.count(func.distinct(OnchainContribution.contributor))).where(
            OnchainContribution.campaign_id == campaign_id, OnchainContribution.revoked_at.is_(None)
        )
        return int(s.scalar(q) or 0)

    @staticmethod
    def purchases(s: Session, campaign_id: int) -> list[Purchase]:
        return list(s.scalars(select(Purchase).where(Purchase.campaign_id == campaign_id).order_by(Purchase.block)))


class ContributionRepo:
    @staticmethod
    def read_prompt_ids(s: Session, user_id: int, campaign_id: int) -> set[int]:
        q = select(Contribution.prompt_id).where(
            Contribution.user_id == user_id,
            Contribution.campaign_id == campaign_id,
            Contribution.status.in_(READ_STATUSES),
        )
        return set(s.scalars(q))

    @staticmethod
    def by_onchain_id(s: Session, onchain_id: int) -> Contribution | None:
        return s.scalar(select(Contribution).where(Contribution.onchain_id == onchain_id))

    @staticmethod
    def active_registered(s: Session, campaign_id: int) -> list[Contribution]:
        q = (
            select(Contribution)
            .where(Contribution.campaign_id == campaign_id, Contribution.status == ContributionStatus.REGISTERED)
            .order_by(Contribution.onchain_id)
        )
        return list(s.scalars(q))

    @staticmethod
    def for_user(s: Session, user_id: int) -> list[Contribution]:
        return list(s.scalars(select(Contribution).where(Contribution.user_id == user_id).order_by(Contribution.id)))

    @staticmethod
    def duplicate_audio(s: Session, sha256: str) -> Contribution | None:
        q = select(Contribution).where(
            Contribution.audio_sha256 == sha256,
            Contribution.status.in_(
                (ContributionStatus.GRAY, ContributionStatus.PENDING_CHAIN, ContributionStatus.REGISTERED)
            ),
        )
        return s.scalar(q)


class SnapshotRepo:
    @staticmethod
    def latest(s: Session, campaign_id: int) -> Snapshot | None:
        return s.scalar(
            select(Snapshot).where(Snapshot.campaign_id == campaign_id).order_by(Snapshot.version.desc()).limit(1)
        )

    @staticmethod
    def published(s: Session, campaign_id: int) -> list[Snapshot]:
        return list(
            s.scalars(
                select(Snapshot)
                .where(Snapshot.campaign_id == campaign_id, Snapshot.status == "published")
                .order_by(Snapshot.version)
            )
        )
