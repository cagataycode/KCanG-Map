"""Store full source GeoJSON properties on every feature table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_source_attrs"
down_revision = "0006_neighborhoods"
branch_labels = None
depends_on = None

TABLES = (
    "districts",
    "neighborhoods",
    "green_spaces",
    "schools",
    "trees",
    "bike_parking",
    "ev_chargers",
    "drinking_fountains",
    "bathing_waters",
    "toilets",
    "playgrounds",
    "sports_facilities",
)


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "attrs",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_column(table, "attrs")
