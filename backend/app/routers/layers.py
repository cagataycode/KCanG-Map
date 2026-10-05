from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DatasetCatalog, District
from app.sql_loader import load_sql

router = APIRouter(tags=["layers"])

LAYER_TABLES = {
    "districts": "districts",
    "green_spaces": "green_spaces",
    "schools": "schools",
    "playgrounds": "playgrounds",
    "kitas": "kitas",
    "sports_facilities": "sports_facilities",
    "restriction_buffers": "restriction_buffers",
}


@router.get("/layers")
def list_layers(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(DatasetCatalog).order_by(DatasetCatalog.slug).all()
    return [
        {
            "slug": r.slug,
            "name": r.name,
            "description": r.description,
            "source_organization": r.source_organization,
            "source_url": r.source_url,
            "license_text": r.license_text,
            "source_vintage": r.source_vintage.isoformat() if r.source_vintage else None,
            "imported_at": r.imported_at.isoformat() if r.imported_at else None,
            "srid": r.srid,
            "geometry_type": r.geometry_type,
            "coverage_caveat": r.coverage_caveat,
        }
        for r in rows
    ]


@router.get("/districts")
def get_districts(
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "districts_geojson.sql", bbox=bbox)


@router.get("/green-spaces")
def get_green_spaces(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "green_spaces_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/schools")
def get_schools(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "schools_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/playgrounds")
def get_playgrounds(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "playgrounds_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/kitas")
def get_kitas(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "kitas_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/sports-facilities")
def get_sports_facilities(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "sports_facilities_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/restriction-buffers")
def get_restriction_buffers(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "restriction_buffers_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/districts/list")
def list_district_names(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(District).order_by(District.name).all()
    return [{"id": d.id, "official_id": d.official_id, "name": d.name} for d in rows]


@router.get("/features/{layer}/{feature_id}")
def get_feature(layer: str, feature_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    table = LAYER_TABLES.get(layer)
    if not table:
        raise HTTPException(status_code=404, detail="Unknown layer")
    sql = load_sql("feature_by_id.sql").format(table=table)
    row = db.execute(text(sql), {"id": feature_id}).scalar()
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return row if isinstance(row, dict) else json.loads(row)


def _parse_bbox(bbox: str | None) -> dict[str, float | None]:
    if not bbox:
        return {"minx": None, "miny": None, "maxx": None, "maxy": None}
    parts = [p.strip() for p in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be minLon,minLat,maxLon,maxLat")
    minx, miny, maxx, maxy = map(float, parts)
    return {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy}


def _geojson(
    db: Session,
    sql_name: str,
    bbox: str | None = None,
    district_id: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = _parse_bbox(bbox)
    sql = load_sql(sql_name)
    if ":district_id" in sql:
        params["district_id"] = district_id
    row = db.execute(text(sql), params).scalar()
    if row is None:
        return {"type": "FeatureCollection", "features": []}
    return row if isinstance(row, dict) else json.loads(row)
