"""user profile: display name + avatar preset

Cài đặt tài khoản (implementation-plan §3 #31): tên hiển thị và mẫu ảnh đại diện do người dùng tự chọn.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10 09:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("avatar", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("avatar")
        batch_op.drop_column("display_name")
