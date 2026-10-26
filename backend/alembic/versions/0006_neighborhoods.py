"""Add neighborhoods (Ortsteile) boundary table."""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0006_neighborhoods"
down_revision = "0005_more_amenities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "neighborhoods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("official_id", sa.String(32), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_neighborhoods_geom", "neighborhoods", ["geom"], postgresql_using="gist")
    op.create_index("ix_neighborhoods_district_id", "neighborhoods", ["district_id"])


def downgrade() -> None:
    op.drop_table("neighborhoods")
