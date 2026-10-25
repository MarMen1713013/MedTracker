"""add dosage to medications

Revision ID: 004
Revises: 003
Create Date: 2026-10-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "medications",
        sa.Column("dosage", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medications", "dosage")
