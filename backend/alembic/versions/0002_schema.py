"""Create catalog, districts, green_spaces, schools with FKs and GiST indexes.

Schema rationale (normalized):
- dataset_catalog holds provenance once (1:N to feature tables).
- districts are the borough filter/aggregate key.
- green_spaces and schools reference catalog_id and district_id
  (district_id assigned at import via centroid / point-in-polygon).
"""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0002_schema"
down_revision = "0001_postgis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_catalog",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("source_organization", sa.String(255)),
        sa.Column("source_url", sa.Text()),
        sa.Column("license_text", sa.Text()),
        sa.Column("source_vintage", sa.Date()),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("srid", sa.Integer(), nullable=False, server_default="25833"),
        sa.Column("geometry_type", sa.String(64)),
        sa.Column("coverage_caveat", sa.Text()),
    )

    op.create_table(
        "districts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("official_id", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_districts_geom", "districts", ["geom"], postgresql_using="gist")

    op.create_table(
        "green_spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("space_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False),
    )
    op.create_index("ix_green_spaces_geom", "green_spaces", ["geom"], postgresql_using="gist")
    op.create_index("ix_green_spaces_district_id", "green_spaces", ["district_id"])

    op.create_table(
        "schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.String(128)),
        sa.Column("name", sa.String(255)),
        sa.Column("school_type", sa.String(128)),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("dataset_catalog.id"), nullable=False),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id")),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=25833), nullable=False),
    )
    op.create_index("ix_schools_geom", "schools", ["geom"], postgresql_using="gist")
    op.create_index("ix_schools_district_id", "schools", ["district_id"])


def downgrade() -> None:
    op.drop_table("schools")
    op.drop_table("green_spaces")
    op.drop_table("districts")
    op.drop_table("dataset_catalog")
