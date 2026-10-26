"""Add toilets, playgrounds, sports_facilities."""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0005_more_amenities"
down_revision = "0004_amenities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "toilets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("facility_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=25833), nullable=False),
    )
    op.create_index("ix_toilets_geom", "toilets", ["geom"], postgresql_using="gist")
    op.create_index("ix_toilets_district_id", "toilets", ["district_id"])

    op.create_table(
        "playgrounds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("space_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_playgrounds_geom", "playgrounds", ["geom"], postgresql_using="gist")
    op.create_index("ix_playgrounds_district_id", "playgrounds", ["district_id"])

    op.create_table(
        "sports_facilities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("facility_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=25833), nullable=False),
    )
    op.create_index("ix_sports_facilities_geom", "sports_facilities", ["geom"], postgresql_using="gist")
    op.create_index("ix_sports_facilities_district_id", "sports_facilities", ["district_id"])


def downgrade() -> None:
    op.drop_table("sports_facilities")
    op.drop_table("playgrounds")
    op.drop_table("toilets")
