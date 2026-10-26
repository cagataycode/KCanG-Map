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
    "trees": "trees",
    "bike_parking": "bike_parking",
    "ev_chargers": "ev_chargers",
    "drinking_fountains": "drinking_fountains",
    "bathing_waters": "bathing_waters",
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
    payload = _geojson(db, "districts_geojson.sql", bbox=bbox)
    # #region agent log
    try:
        from time import time

        from app.main import _write_debug

        feats = payload.get("features") or []
        samples = []
        for f in feats[:3]:
            g = f.get("geometry") or {}
            coords = g.get("coordinates") or []
            ring = (
                coords[0][0]
                if g.get("type") == "MultiPolygon" and coords
                else (coords[0] if coords else [])
            )
            samples.append(
                {
                    "name": (f.get("properties") or {}).get("name"),
                    "type": g.get("type"),
                    "ringPts": len(ring) if isinstance(ring, list) else 0,
                }
            )
        _write_debug(
            {
                "sessionId": "fdc9ac",
                "runId": "pre-fix",
                "hypothesisId": "B",
                "location": "layers.py:get_districts",
                "message": "districts response built",
                "data": {"featureCount": len(feats), "bbox": bbox, "samples": samples},
                "timestamp": int(time() * 1000),
            }
        )
    except Exception:
        pass
    # #endregion
    return payload


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


@router.get("/trees")
def get_trees(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if bbox is None and district_id is None:
        raise HTTPException(
            status_code=400,
            detail="trees requires bbox and/or district_id (citywide dump blocked)",
        )
    return _geojson(db, "trees_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/bike-parking")
def get_bike_parking(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "bike_parking_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/ev-chargers")
def get_ev_chargers(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "ev_chargers_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/drinking-fountains")
def get_drinking_fountains(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "drinking_fountains_geojson.sql", bbox=bbox, district_id=district_id)


@router.get("/bathing-waters")
def get_bathing_waters(
    bbox: str | None = Query(None),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _geojson(db, "bathing_waters_geojson.sql", bbox=bbox, district_id=district_id)


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
