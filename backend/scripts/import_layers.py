#!/usr/bin/env python3
"""Load Berlin open data into PostGIS and rebuild KCanG 100 m restriction buffers."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "data" / "samples"
CACHE = ROOT / "data" / "cache"
sys.path.insert(0, str(BACKEND))

from app.db import SessionLocal, engine  # noqa: E402

TARGET_SRID = 25833
BUFFER_M = 100

DISTRICTS_URL = (
    "https://tsb-opendata.s3.eu-central-1.amazonaws.com/bezirksgrenzen/bezirksgrenzen.geojson"
)

BUFFER_CAVEAT = (
    "100 m ST_Buffer of facility geometry in EPSG:25833 approximates § 5 KCanG Sichtweite "
    "from Eingangsbereich — not a surveyed entrance buffer. Not legal advice."
)

CATALOG = {
    "districts": {
        "slug": "districts",
        "name": "Berlin borough boundaries",
        "description": "Administrative Bezirksgrenzen.",
        "source_organization": "Land Berlin / ODIS / TSB",
        "source_url": "https://daten.odis-berlin.de/de/dataset/bezirksgrenzen/",
        "license_text": "Open data — see source page.",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "12 Bezirke for filters and coverage denominators.",
        "sample_file": "districts.geojson",
        "cache_file": "bezirksgrenzen.geojson",
        "download_url": DISTRICTS_URL,
    },
    "green_spaces": {
        "slug": "green_spaces",
        "name": "Public green spaces (context)",
        "description": "Grünanlagen — context only; not a § 5 blanket ban.",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "Parks are not automatically banned under § 5 KCanG.",
        "sample_file": "green_spaces.geojson",
        "cache_file": "green_spaces.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/gruenanlagen",
        "wfs_layer": "gruenanlagen:gruenanlagen",
    },
    "schools": {
        "slug": "schools",
        "name": "Schools",
        "description": "School points — § 5 ban seed.",
        "source_organization": "Senatsverwaltung Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/schulen-wfs-ebc64e18",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": BUFFER_CAVEAT,
        "sample_file": "schools.geojson",
        "cache_file": "schools.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/schulen",
        "wfs_layer": "schulen:schulen",
        "rule_type": "school",
    },
    "playgrounds": {
        "slug": "playgrounds",
        "name": "Playgrounds",
        "description": "Public playgrounds — § 5 ban seed.",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": BUFFER_CAVEAT,
        "sample_file": "playgrounds.geojson",
        "cache_file": "playgrounds.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/gruenanlagen",
        "wfs_layer": "gruenanlagen:spielplaetze",
        "rule_type": "playground",
    },
    "kitas": {
        "slug": "kitas",
        "name": "Kindertagesstätten",
        "description": "Publicly funded Kita points — § 5 children/youth facility seed.",
        "source_organization": "SenBJF Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/kindertagesstatten-wfs-d03b94d2",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": BUFFER_CAVEAT + " Inventory is publicly funded Kitas only.",
        "sample_file": "kitas.geojson",
        "cache_file": "kitas.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/kita",
        "wfs_layer": "kita:kita",
        "rule_type": "kita",
    },
    "sports_facilities": {
        "slug": "sports_facilities",
        "name": "Public sports facilities",
        "description": "Land-owned Kernsportanlagen points — § 5 sports seed.",
        "source_organization": "SenInnSport Berlin",
        "source_url": "http://daten.berlin.de/datensaetze/standorte-offentlicher-sportanlagen-wfs-a291318f",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": BUFFER_CAVEAT + " Land-owned public Kernsportanlagen inventory.",
        "sample_file": "sports_facilities.geojson",
        "cache_file": "sports_facilities.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/sportstandorte",
        "wfs_layer": "sportstandorte:sportstandorte",
        "rule_type": "sports",
    },
}


def upsert_catalog(session, meta: dict) -> int:
    session.execute(
        text(
            """
            INSERT INTO dataset_catalog (
              slug, name, description, source_organization, source_url, license_text,
              source_vintage, srid, geometry_type, coverage_caveat, imported_at
            ) VALUES (
              :slug, :name, :description, :source_organization, :source_url, :license_text,
              NULL, :srid, :geometry_type, :coverage_caveat, NOW()
            )
            ON CONFLICT (slug) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              source_organization = EXCLUDED.source_organization,
              source_url = EXCLUDED.source_url,
              license_text = EXCLUDED.license_text,
              srid = EXCLUDED.srid,
              geometry_type = EXCLUDED.geometry_type,
              coverage_caveat = EXCLUDED.coverage_caveat,
              imported_at = NOW()
            """
        ),
        {
            "slug": meta["slug"],
            "name": meta["name"],
            "description": meta["description"],
            "source_organization": meta["source_organization"],
            "source_url": meta["source_url"],
            "license_text": meta["license_text"],
            "srid": TARGET_SRID,
            "geometry_type": meta["geometry_type"],
            "coverage_caveat": meta["coverage_caveat"],
        },
    )
    return session.execute(
        text("SELECT id FROM dataset_catalog WHERE slug = :slug"),
        {"slug": meta["slug"]},
    ).scalar_one()


def load_geojson_features(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def download_url(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, dest)


def fetch_wfs(wfs: str, layer: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"Using cached {dest.name}")
        return True
    try:
        cmd = [
            "ogr2ogr",
            "-f",
            "GeoJSON",
            str(dest),
            wfs,
            layer,
            "-t_srs",
            "EPSG:4326",
            "--config",
            "OGR_WFS_PAGE_SIZE",
            "1000",
        ]
        print(" ".join(cmd))
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
        return dest.exists() and dest.stat().st_size > 1000
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        print(f"WFS fetch failed ({exc})", file=sys.stderr)
        return False


def resolve_path(layer: str, source: str) -> Path:
    meta = CATALOG[layer]
    sample = SAMPLES / meta["sample_file"]
    if source == "samples":
        if not sample.exists():
            raise FileNotFoundError(f"Missing sample {sample}")
        return sample
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / meta["cache_file"]
    if meta.get("download_url"):
        if not cache.exists():
            download_url(meta["download_url"], cache)
        return cache
    if meta.get("wfs"):
        if fetch_wfs(meta["wfs"], meta["wfs_layer"], cache):
            return cache
        if sample.exists():
            print(f"Falling back to sample for {layer}", file=sys.stderr)
            return sample
        raise RuntimeError(f"Could not fetch {layer}")
    return sample


def insert_polygon_feature(session, table: str, catalog_id: int, source_id, name, extra_col, extra_val, geom_json: str) -> None:
    session.execute(
        text(
            f"""
            INSERT INTO {table} (source_id, name, {extra_col}, catalog_id, geom)
            VALUES (
              :source_id, :name, :extra, :catalog_id,
              ST_Multi(ST_CollectionExtract(ST_MakeValid(
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326), :srid)
              ), 3))
            )
            """
        ),
        {
            "source_id": source_id,
            "name": name,
            "extra": extra_val,
            "catalog_id": catalog_id,
            "geom": geom_json,
            "srid": TARGET_SRID,
        },
    )


def insert_point_feature(session, table: str, catalog_id: int, source_id, name, extra_col, extra_val, geom_json: str) -> None:
    session.execute(
        text(
            f"""
            INSERT INTO {table} (source_id, name, {extra_col}, catalog_id, geom)
            VALUES (
              :source_id, :name, :extra, :catalog_id,
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326), :srid)
            )
            """
        ),
        {
            "source_id": source_id,
            "name": name,
            "extra": extra_val,
            "catalog_id": catalog_id,
            "geom": geom_json,
            "srid": TARGET_SRID,
        },
    )


def assign_district(session, table: str, point_on_surface: bool) -> None:
    if point_on_surface:
        session.execute(
            text(
                f"""
                UPDATE {table} t SET district_id = d.id
                FROM districts d
                WHERE ST_Intersects(ST_PointOnSurface(t.geom), d.geom)
                """
            )
        )
    else:
        session.execute(
            text(
                f"""
                UPDATE {table} t SET district_id = d.id
                FROM districts d
                WHERE ST_Within(t.geom, d.geom)
                """
            )
        )


def import_districts(session, features: list[dict], catalog_id: int) -> None:
    for t in (
        "restriction_union",
        "restriction_buffers",
        "sports_facilities",
        "kitas",
        "playgrounds",
        "schools",
        "green_spaces",
        "districts",
    ):
        session.execute(text(f"DELETE FROM {t}"))
    for feat in features:
        props = feat.get("properties") or {}
        official = str(props.get("Gemeinde_schluessel") or props.get("official_id") or props.get("name"))
        name = str(props.get("Gemeinde_name") or props.get("name") or "Unknown")
        session.execute(
            text(
                """
                INSERT INTO districts (official_id, name, catalog_id, geom)
                VALUES (
                  :official_id, :name, :catalog_id,
                  ST_Multi(ST_CollectionExtract(ST_MakeValid(
                    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326), :srid)
                  ), 3))
                )
                """
            ),
            {
                "official_id": official,
                "name": name,
                "catalog_id": catalog_id,
                "geom": json.dumps(feat["geometry"]),
                "srid": TARGET_SRID,
            },
        )


def import_green(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM green_spaces"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_polygon_feature(
            session,
            "green_spaces",
            catalog_id,
            str(props.get("pitid") or props.get("source_id") or "") or None,
            props.get("namenr") or props.get("name"),
            "space_type",
            props.get("objartname") or props.get("space_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "green_spaces", True)


def import_schools(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM schools"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "schools",
            catalog_id,
            str(props.get("bsn") or props.get("source_id") or "") or None,
            props.get("schulname") or props.get("name"),
            "school_type",
            props.get("schulart") or props.get("school_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "schools", False)


def import_playgrounds(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM playgrounds"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_polygon_feature(
            session,
            "playgrounds",
            catalog_id,
            str(props.get("pitid") or props.get("source_id") or "") or None,
            props.get("namenr") or props.get("name"),
            "space_type",
            props.get("objartname") or props.get("space_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "playgrounds", True)


def import_kitas(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM kitas"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "kitas",
            catalog_id,
            str(props.get("e_nr") or props.get("source_id") or "") or None,
            props.get("e_name") or props.get("name"),
            "facility_type",
            props.get("e_art") or props.get("facility_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "kitas", False)


def import_sports(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM sports_facilities"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "sports_facilities",
            catalog_id,
            str(props.get("id") or props.get("source_id") or "") or None,
            props.get("name"),
            "facility_type",
            props.get("facility_type") or "sports",
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "sports_facilities", False)


def build_restriction_buffers(session) -> None:
    session.execute(text("DELETE FROM restriction_union"))
    session.execute(text("DELETE FROM restriction_buffers"))
    session.execute(
        text(
            f"""
            INSERT INTO restriction_buffers (rule_type, source_table, source_id, name, district_id, buffer_m, geom)
            SELECT 'school', 'schools', source_id, name, district_id, {BUFFER_M},
                   ST_Multi(ST_Buffer(geom, {BUFFER_M}))
            FROM schools
            UNION ALL
            SELECT 'playground', 'playgrounds', source_id, name, district_id, {BUFFER_M},
                   ST_Multi(ST_Buffer(geom, {BUFFER_M}))
            FROM playgrounds
            UNION ALL
            SELECT 'kita', 'kitas', source_id, name, district_id, {BUFFER_M},
                   ST_Multi(ST_Buffer(geom, {BUFFER_M}))
            FROM kitas
            UNION ALL
            SELECT 'sports', 'sports_facilities', source_id, name, district_id, {BUFFER_M},
                   ST_Multi(ST_Buffer(geom, {BUFFER_M}))
            FROM sports_facilities
            """
        )
    )
    # Per-district unions keep ST_Union tractable vs one citywide collect.
    session.execute(
        text(
            """
            INSERT INTO restriction_union (note, geom)
            SELECT
              'district_id=' || d.id::text,
              ST_Multi(ST_UnaryUnion(ST_Collect(ST_Intersection(d.geom, b.geom))))
            FROM districts d
            JOIN restriction_buffers b ON ST_Intersects(d.geom, b.geom)
            GROUP BY d.id
            HAVING ST_UnaryUnion(ST_Collect(ST_Intersection(d.geom, b.geom))) IS NOT NULL
            """
        )
    )


def run(source: str) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            # Clear dependents first via districts import order
            steps = [
                ("districts", import_districts),
                ("green_spaces", import_green),
                ("schools", import_schools),
                ("playgrounds", import_playgrounds),
                ("kitas", import_kitas),
                ("sports_facilities", import_sports),
            ]
            for layer, importer in steps:
                meta = CATALOG[layer]
                catalog_id = upsert_catalog(session, meta)
                path = resolve_path(layer, source)
                features = load_geojson_features(path)
                print(f"Importing {layer}: {len(features)} from {path.name}")
                importer(session, features, catalog_id)

            print("Building restriction_buffers (100 m)…")
            build_restriction_buffers(session)
            counts = session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM districts) AS districts,
                      (SELECT COUNT(*) FROM schools) AS schools,
                      (SELECT COUNT(*) FROM playgrounds) AS playgrounds,
                      (SELECT COUNT(*) FROM kitas) AS kitas,
                      (SELECT COUNT(*) FROM sports_facilities) AS sports,
                      (SELECT COUNT(*) FROM restriction_buffers) AS buffers
                    """
                )
            ).mappings().one()
            print("PostGIS counts:", dict(counts))
        print("Import committed.")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["open", "samples"], default="open")
    args = parser.parse_args()
    with engine.connect() as conn:
        conn.execute(text("SELECT PostGIS_Version()"))
    run(args.source)


if __name__ == "__main__":
    main()
