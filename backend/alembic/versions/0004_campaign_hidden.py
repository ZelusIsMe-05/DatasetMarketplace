"""campaign hidden: chủ chiến dịch ẩn chiến dịch khỏi trang chủ / Khám phá / danh sách đóng góp

implementation-plan §3 #35: cờ off-chain, không đổi contract; chiến dịch vẫn mở được bằng đường dẫn trực tiếp, vẫn hiện trong
bảng điều khiển của người tạo, Thu nhập của người đóng góp và Thư viện của người mua.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-20 03:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.drop_column("hidden")
