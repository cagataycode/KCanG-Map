from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class DatasetCatalog(Base):
    __tablename__ = "dataset_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_organization: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(Text)
    license_text: Mapped[str | None] = mapped_column(Text)
    source_vintage: Mapped[date | None] = mapped_column(Date)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    srid: Mapped[int] = mapped_column(Integer, nullable=False, default=25833)
    geometry_type: Mapped[str | None] = mapped_column(String(64))
    coverage_caveat: Mapped[str | None] = mapped_column(Text)


class District(Base):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    official_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False)


class GreenSpace(Base):
    __tablename__ = "green_spaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    space_type: Mapped[str | None] = mapped_column(String(128))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False)


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    school_type: Mapped[str | None] = mapped_column(String(128))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    geom = mapped_column(Geometry(geometry_type="POINT", srid=25833), nullable=False)


class Playground(Base):
    __tablename__ = "playgrounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    space_type: Mapped[str | None] = mapped_column(String(128))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False)


class Kita(Base):
    __tablename__ = "kitas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    facility_type: Mapped[str | None] = mapped_column(String(128))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    geom = mapped_column(Geometry(geometry_type="POINT", srid=25833), nullable=False)


class SportsFacility(Base):
    __tablename__ = "sports_facilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    facility_type: Mapped[str | None] = mapped_column(String(128))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    geom = mapped_column(Geometry(geometry_type="POINT", srid=25833), nullable=False)


class RestrictionBuffer(Base):
    __tablename__ = "restriction_buffers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_table: Mapped[str] = mapped_column(String(64), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str | None] = mapped_column(String(255))
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    buffer_m: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=25833), nullable=False)
