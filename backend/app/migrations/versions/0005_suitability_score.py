"""suitability score

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-02 12:00:00.000000

Adds two review answers (sales angle strength, demo potential) and a stored copy of the suitability
score. Existing reviews have suitability_version NULL and are scored at app startup
(services/review/scoring.recompute_stale), so the formula lives only in the service.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('manual_reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sales_angle_strength', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('demo_potential', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('suitability_score', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('suitability_band', sa.String(length=2), nullable=True))
        batch_op.add_column(sa.Column('suitability_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('suitability_completeness', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('suitability_recommendation', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('suitability_version', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_manual_reviews_suitability_score'), ['suitability_score'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('manual_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_manual_reviews_suitability_score'))
        batch_op.drop_column('suitability_version')
        batch_op.drop_column('suitability_recommendation')
        batch_op.drop_column('suitability_completeness')
        batch_op.drop_column('suitability_status')
        batch_op.drop_column('suitability_band')
        batch_op.drop_column('suitability_score')
        batch_op.drop_column('demo_potential')
        batch_op.drop_column('sales_angle_strength')
