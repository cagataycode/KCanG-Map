from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.sql_loader import load_sql

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.get("/nearest-amenities")
def nearest_amenities(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.execute(
        text(load_sql("analysis_nearest_amenities.sql")),
        {"lon": lon, "lat": lat},
    ).scalar()
    payload = row if isinstance(row, dict) else {}
    return {
        "id": "nearest-amenities",
        "title": "Nearest amenities",
        "inputs": [
            "trees",
            "bike_parking",
            "ev_chargers",
            "drinking_fountains",
            "bathing_waters",
            "green_spaces",
        ],
        "operation": (
            "Transform WGS84 point to EPSG:25833; KNN (<->) nearest feature per amenity layer; "
            "return planar distance in metres"
        ),
        "units": {"distance": "metres"},
        "crs": "EPSG:25833",
        "caveat": (
            "Mapped open-data inventories only. Distances are Euclidean in EPSG:25833, "
            "not walking or routing distance."
        ),
        **payload,
    }


@router.get("/amenity-density-by-borough")
def amenity_density_by_borough(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(text(load_sql("analysis_amenity_density_by_borough.sql"))).mappings().all()
    return {
        "id": "amenity-density-by-borough",
        "title": "Amenity counts by borough",
        "inputs": [
            "districts",
            "trees",
            "bike_parking",
            "ev_chargers",
            "drinking_fountains",
            "bathing_waters",
        ],
        "operation": "COUNT features per district_id for each point amenity layer",
        "units": {"count": "features"},
        "crs": "EPSG:25833",
        "caveat": (
            "Mapped inventory counts assigned by point-in-polygon at import — "
            "not a service-need ranking."
        ),
        "results": [dict(r) for r in rows],
    }


@router.get("/green-by-borough")
def green_by_borough(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(text(load_sql("analysis_green_by_borough.sql"))).mappings().all()
    return {
        "id": "green-by-borough",
        "title": "Mapped public green by borough",
        "inputs": ["districts", "green_spaces"],
        "operation": "COUNT features and SUM ST_Area(geom) per district_id (EPSG:25833)",
        "units": {"count": "features", "area": "m²", "share": "% of district land area"},
        "crs": "EPSG:25833",
        "caveat": "Mapped public green inventory coverage — not planning need or private greenery.",
        "results": [dict(r) for r in rows],
    }


@router.get("/school-green-proximity")
def school_green_proximity(
    threshold_m: float = Query(500, ge=0),
    district_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = (
        db.execute(
            text(load_sql("analysis_school_green_proximity.sql")),
            {"threshold_m": threshold_m, "district_id": district_id},
        )
        .mappings()
        .all()
    )
    return {
        "id": "school-green-proximity",
        "title": "School-to-green proximity",
        "inputs": ["schools", "green_spaces"],
        "operation": (
            "Shortest planar ST_Distance from each school point to nearest green polygon edge; "
            "summarize median, p90, and count beyond threshold per borough"
        ),
        "units": {"distance": "metres"},
        "crs": "EPSG:25833",
        "threshold_m": threshold_m,
        "caveat": "Euclidean proximity to mapped green inventory only — not walking distance.",
        "results": [dict(r) for r in rows],
    }
