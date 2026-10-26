#!/usr/bin/env python3
"""Load Berlin open amenity data into PostGIS."""

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

DISTRICTS_URL = (
    "https://tsb-opendata.s3.eu-central-1.amazonaws.com/bezirksgrenzen/bezirksgrenzen.geojson"
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
        "name": "Public green spaces",
        "description": "Dedicated public Grünanlagen (parks and green areas).",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "Mapped public green inventory only — not private gardens.",
        "sample_file": "green_spaces.geojson",
        "cache_file": "green_spaces.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/gruenanlagen",
        "wfs_layer": "gruenanlagen:gruenanlagen",
    },
    "schools": {
        "slug": "schools",
        "name": "Schools",
        "description": "Main school locations (context for green proximity).",
        "source_organization": "Senatsverwaltung Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/schulen-wfs-ebc64e18",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Main school sites only; catchment polygons not imported.",
        "sample_file": "schools.geojson",
        "cache_file": "schools.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/schulen",
        "wfs_layer": "schulen:schulen",
    },
    "trees": {
        "slug": "trees",
        "name": "Street trees",
        "description": "Berlin street-tree inventory (Straßenbäume).",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/baumbestand-berlin-wfs-48ad3a23",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": (
            "Street trees only in MVP (baumbestand:strassenbaeume). "
            "Large layer — map GeoJSON requires a bbox."
        ),
        "sample_file": "trees.geojson",
        "cache_file": "trees.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/baumbestand",
        "wfs_layer": "baumbestand:strassenbaeume",
    },
    "bike_parking": {
        "slug": "bike_parking",
        "name": "Bike parking",
        "description": "Fahrradabstellanlagen (infraVelo inventory since 2021).",
        "source_organization": "GB infraVelo GmbH",
        "source_url": "https://daten.berlin.de/datensaetze/fahrradabstellanlagen-seit-2021-wfs-4f226c23",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Public bike-parking inventory; private racks not included.",
        "sample_file": "bike_parking.geojson",
        "cache_file": "bike_parking.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/fahrradabstellanlagen",
        "wfs_layer": "fahrradabstellanlagen:fahrradabstellanlagen",
    },
    "ev_chargers": {
        "slug": "ev_chargers",
        "name": "EV chargers",
        "description": "Elektro-Ladesäulen standorte (Energieatlas).",
        "source_organization": "SenWEB Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/elektro-ladesaulen-und-ladepunkte-wfs-f306dd51",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Public and publicly accessible chargers; MultiPoint sites reduced to a point.",
        "sample_file": "ev_chargers.geojson",
        "cache_file": "ev_chargers.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/eladesaeulen",
        "wfs_layer": "eladesaeulen:lades_standorte",
    },
    "drinking_fountains": {
        "slug": "drinking_fountains",
        "name": "Drinking fountains",
        "description": "Public Trinkwasserbrunnen (Berliner Wasserbetriebe).",
        "source_organization": "Berliner Wasserbetriebe",
        "source_url": "https://daten.berlin.de/datensaetze/trinkwasserbrunnen-wfs-47dba2c3",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Typically seasonal (May–October); check source for outages.",
        "sample_file": "drinking_fountains.geojson",
        "cache_file": "drinking_fountains.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/trinkwasserbrunnen",
        "wfs_layer": "trinkwasserbrunnen:trinkwasserbrunnen",
    },
    "bathing_waters": {
        "slug": "bathing_waters",
        "name": "Bathing waters",
        "description": "Official Badegewässer / Badestellen with EU quality rating.",
        "source_organization": "LAGeSo Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/badegewasserqualitat-wfs-6ba85d36",
        "license_text": "cc-by/4.0 — Geoportal Berlin / LAGeSo; BWB where noted",
        "geometry_type": "Point",
        "coverage_caveat": "Official designated bathing sites only (~39); not every swimming spot.",
        "sample_file": "bathing_waters.geojson",
        "cache_file": "bathing_waters.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/badegewaesser",
        "wfs_layer": "badegewaesser:aa_badestellen",
    },
}

FEATURE_TABLES = (
    "bathing_waters",
    "drinking_fountains",
    "ev_chargers",
    "bike_parking",
    "trees",
    "schools",
    "green_spaces",
)


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
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=900)
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
    """Insert a point; MultiPoint/GeometryCollection reduced via ST_PointOnSurface."""
    session.execute(
        text(
            f"""
            INSERT INTO {table} (source_id, name, {extra_col}, catalog_id, geom)
            VALUES (
              :source_id, :name, :extra, :catalog_id,
              ST_Transform(
                ST_SetSRID(
                  ST_PointOnSurface(ST_MakeValid(ST_GeomFromGeoJSON(:geom))),
                  4326
                ),
                :srid
              )
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
    for t in (*FEATURE_TABLES, "districts"):
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


def import_trees(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM trees"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "trees",
            catalog_id,
            str(props.get("gisid") or props.get("pitid") or props.get("source_id") or "") or None,
            props.get("art_dtsch") or props.get("namenr") or props.get("name"),
            "species",
            props.get("art_bot") or props.get("gattung") or props.get("species"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "trees", False)


def import_bike_parking(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM bike_parking"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "bike_parking",
            catalog_id,
            str(props.get("projektnummer") or props.get("source_id") or "") or None,
            props.get("strassenname_oa") or props.get("name"),
            "facility_type",
            props.get("faa_typ1") or props.get("facility_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "bike_parking", False)


def import_ev_chargers(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM ev_chargers"))
    for feat in features:
        props = feat.get("properties") or {}
        name = props.get("adresse") or props.get("name")
        if props.get("betreiber") and name:
            name = f"{name} ({props.get('betreiber')})"
        insert_point_feature(
            session,
            "ev_chargers",
            catalog_id,
            str(props.get("importid") or props.get("source_id") or "") or None,
            name,
            "charger_type",
            props.get("art_ladeeinrichtung") or props.get("charger_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "ev_chargers", False)


def import_drinking_fountains(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM drinking_fountains"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "drinking_fountains",
            catalog_id,
            str(props.get("nummer") or props.get("source_id") or "") or None,
            props.get("standort") or props.get("name"),
            "fountain_type",
            props.get("trinkbrunnenart") or props.get("fountain_type"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "drinking_fountains", False)


def import_bathing_waters(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM bathing_waters"))
    for feat in features:
        props = feat.get("properties") or {}
        insert_point_feature(
            session,
            "bathing_waters",
            catalog_id,
            str(props.get("bathingwat") or props.get("source_id") or "") or None,
            props.get("badegewaes") or props.get("name"),
            "quality_rating",
            props.get("eu_einst") or props.get("quality_rating"),
            json.dumps(feat["geometry"]),
        )
    assign_district(session, "bathing_waters", False)


IMPORTERS = {
    "districts": import_districts,
    "green_spaces": import_green,
    "schools": import_schools,
    "trees": import_trees,
    "bike_parking": import_bike_parking,
    "ev_chargers": import_ev_chargers,
    "drinking_fountains": import_drinking_fountains,
    "bathing_waters": import_bathing_waters,
}

DEFAULT_ORDER = [
    "districts",
    "green_spaces",
    "schools",
    "trees",
    "bike_parking",
    "ev_chargers",
    "drinking_fountains",
    "bathing_waters",
]


def run(source: str, layers: list[str] | None = None) -> None:
    selected = layers or DEFAULT_ORDER
    for layer in selected:
        if layer not in IMPORTERS:
            raise SystemExit(f"Unknown layer: {layer}")
    # Re-importing districts clears dependent feature tables — put it first when present.
    if "districts" in selected:
        selected = ["districts", *[l for l in selected if l != "districts"]]

    session = SessionLocal()
    try:
        with session.begin():
            for layer in selected:
                meta = CATALOG[layer]
                catalog_id = upsert_catalog(session, meta)
                path = resolve_path(layer, source)
                features = load_geojson_features(path)
                print(f"Importing {layer}: {len(features)} from {path.name}")
                IMPORTERS[layer](session, features, catalog_id)

            counts = session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM districts) AS districts,
                      (SELECT COUNT(*) FROM green_spaces) AS green_spaces,
                      (SELECT COUNT(*) FROM schools) AS schools,
                      (SELECT COUNT(*) FROM trees) AS trees,
                      (SELECT COUNT(*) FROM bike_parking) AS bike_parking,
                      (SELECT COUNT(*) FROM ev_chargers) AS ev_chargers,
                      (SELECT COUNT(*) FROM drinking_fountains) AS drinking_fountains,
                      (SELECT COUNT(*) FROM bathing_waters) AS bathing_waters
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
    parser.add_argument(
        "--layers",
        help="Comma-separated layer slugs (default: all). Useful to skip trees for a quick smoke run.",
    )
    args = parser.parse_args()
    layers = [s.strip() for s in args.layers.split(",") if s.strip()] if args.layers else None
    with engine.connect() as conn:
        conn.execute(text("SELECT PostGIS_Version()"))
    run(args.source, layers)


if __name__ == "__main__":
    main()
