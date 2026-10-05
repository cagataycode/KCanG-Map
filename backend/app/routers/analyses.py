from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.sql_loader import load_sql

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.get("/consumption-check")
def consumption_check(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.execute(
        text(load_sql("analysis_consumption_check.sql")),
        {"lon": lon, "lat": lat},
    ).scalar()
    payload = row if isinstance(row, dict) else {}
    return {
        "id": "consumption-check",
        "title": "KCanG mapped restriction check",
        "inputs": ["restriction_buffers"],
        "operation": (
            "Transform WGS84 point to EPSG:25833; ST_Intersects against 100 m "
            "facility buffers; report nearest buffers"
        ),
        "units": {"distance": "metres"},
        "crs": "EPSG:25833",
        "caveat": (
            "Mapped restriction coverage only — not legal advice. "
            "100 m buffer uses facility geometry as a proxy for Eingangsbereich. "
            "outside_mapped_buffers does not mean consumption is allowed."
        ),
        **payload,
    }


@router.get("/restriction-coverage")
def restriction_coverage(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(text(load_sql("analysis_restriction_coverage.sql"))).mappings().all()
    return {
        "id": "restriction-coverage",
        "title": "Mapped KCanG buffer coverage by borough",
        "inputs": ["districts", "restriction_union"],
        "operation": (
            "ST_Area(ST_Intersection(district, buffer union)) / ST_Area(district) "
            "in EPSG:25833"
        ),
        "units": {"area": "m²", "share": "% of district land area"},
        "crs": "EPSG:25833",
        "caveat": (
            "Share of borough land intersecting mapped 100 m buffers — "
            "mapped restriction density, not a 'safest borough' ranking."
        ),
        "results": [dict(r) for r in rows],
    }


@router.get("/green-by-borough")
def green_by_borough(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(text(load_sql("analysis_green_by_borough.sql"))).mappings().all()
    return {
        "id": "green-by-borough",
        "title": "Mapped public green by borough (context)",
        "inputs": ["districts", "green_spaces"],
        "operation": "COUNT features and SUM ST_Area(geom) per district_id (EPSG:25833)",
        "units": {"count": "features", "area": "m²", "share": "% of district land area"},
        "crs": "EPSG:25833",
        "caveat": (
            "Context layer only. Parks are not a § 5 blanket ban. "
            "Mapped public green inventory coverage — not planning need."
        ),
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
        "title": "School-to-green proximity (mapped, secondary)",
        "inputs": ["schools", "green_spaces"],
        "operation": (
            "Shortest planar ST_Distance from each school point to nearest green polygon edge; "
            "summarize median, p90, and count beyond threshold per borough"
        ),
        "units": {"distance": "metres"},
        "crs": "EPSG:25833",
        "threshold_m": threshold_m,
        "caveat": (
            "Secondary context analysis. Euclidean proximity to mapped green inventory only."
        ),
        "results": [dict(r) for r in rows],
    }
