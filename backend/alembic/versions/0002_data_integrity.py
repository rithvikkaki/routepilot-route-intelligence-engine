"""data integrity, sequences, and optimization_runs foreign key

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create concurrency-safe sequences for order numbers and route codes
    op.execute("CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1")
    op.execute("CREATE SEQUENCE IF NOT EXISTS route_code_seq START WITH 1 INCREMENT BY 1")

    # 2. Add foreign key from optimization_runs.depot_id to depots.id (PostgreSQL only)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Check if foreign key constraint already exists
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_optimization_runs_depot_id'
                ) THEN
                    ALTER TABLE optimization_runs
                    ADD CONSTRAINT fk_optimization_runs_depot_id
                    FOREIGN KEY (depot_id) REFERENCES depots(id) ON DELETE SET NULL;
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE optimization_runs DROP CONSTRAINT IF EXISTS fk_optimization_runs_depot_id")
    op.execute("DROP SEQUENCE IF EXISTS order_number_seq")
    op.execute("DROP SEQUENCE IF EXISTS route_code_seq")