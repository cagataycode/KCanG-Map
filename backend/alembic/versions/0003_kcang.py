"""Add playgrounds, kitas, sports_facilities, restriction_buffers, restriction_union."""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0003_kcang"
down_revision = "0002_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
        "kitas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("facility_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=25833), nullable=False),
    )
    op.create_index("ix_kitas_geom", "kitas", ["geom"], postgresql_using="gist")
    op.create_index("ix_kitas_district_id", "kitas", ["district_id"])

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

    op.create_table(
        "restriction_buffers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_type", sa.String(64), nullable=False),
        sa.Column("source_table", sa.String(64), nullable=False),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("buffer_m", sa.Integer(), nullable=False, server_default="100"),
        sa.Column(
            "geom",
            Geometry(geometry_type="MULTIPOLYGON", srid=25833),
            nullable=False,
        ),
    )
    op.create_index("ix_restriction_buffers_geom", "restriction_buffers", ["geom"], postgresql_using="gist")
    op.create_index("ix_restriction_buffers_rule_type", "restriction_buffers", ["rule_type"])

    op.create_table(
        "restriction_union",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note", sa.Text()),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_restriction_union_geom", "restriction_union", ["geom"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_table("restriction_union")
    op.drop_table("restriction_buffers")
    op.drop_table("sports_facilities")
    op.drop_table("kitas")
    op.drop_table("playgrounds")
