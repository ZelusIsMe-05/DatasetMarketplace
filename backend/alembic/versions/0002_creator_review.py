"""creator review of gray-zone contributions

Bản ghi vùng xám do CHỦ CHIẾN DỊCH duyệt (implementation-plan §3 #28): lưu quyết định và thời điểm duyệt để hiện tỉ lệ
duyệt/loại công khai và phân biệt "tự duyệt khi quá hạn".

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-09 12:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("contributions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("review_decision", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(batch_op.f("ix_contributions_review_decision"), ["review_decision"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("contributions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_contributions_review_decision"))
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("review_decision")
