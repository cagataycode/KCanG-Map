"""Add kitas, hospitals, cemeteries, park_and_ride, park_trees."""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "0008_more_amenities_v2"
down_revision = "0007_source_attrs"
branch_labels = None
depends_on = None


def _point_table(name: str, extra_col: str) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column(extra_col, sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column(
            "attrs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=25833), nullable=False),
    )
    op.create_index(f"ix_{name}_geom", name, ["geom"], postgresql_using="gist")
    op.create_index(f"ix_{name}_district_id", name, ["district_id"])


def upgrade() -> None:
    _point_table("kitas", "facility_type")
    _point_table("hospitals", "hospital_type")
    _point_table("park_and_ride", "facility_type")
    _point_table("park_trees", "species")

    op.create_table(
        "cemeteries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("denomination", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column(
            "attrs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_cemeteries_geom", "cemeteries", ["geom"], postgresql_using="gist")
    op.create_index("ix_cemeteries_district_id", "cemeteries", ["district_id"])


def downgrade() -> None:
    op.drop_table("park_trees")
    op.drop_table("park_and_ride")
    op.drop_table("cemeteries")
    op.drop_table("hospitals")
    op.drop_table("kitas")
