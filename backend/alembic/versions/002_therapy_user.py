"""add user_id to therapies

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('therapies', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_therapy_user', 'therapies', 'users',
        ['user_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_therapy_user', 'therapies', type_='foreignkey')
    op.drop_column('therapies', 'user_id')
