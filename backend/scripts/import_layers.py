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
    "neighborhoods": {
        "slug": "neighborhoods",
        "name": "Berlin neighborhoods (Ortsteile)",
        "description": "ALKIS Ortsteil boundaries (e.g. Prenzlauer Berg).",
        "source_organization": "Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/alkis-berlin-ortsteile-wfs-61bd3084",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "Official Ortsteile — finer than Bezirke; for map context, not amenity filters.",
        "sample_file": "neighborhoods.geojson",
        "cache_file": "neighborhoods.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/alkis_ortsteile",
        "wfs_layer": "alkis_ortsteile:ortsteile",
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
            "Street trees (baumbestand:strassenbaeume). "
            "Large layer — map GeoJSON requires a bbox. Park trees are a separate layer."
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
    "toilets": {
        "slug": "toilets",
        "name": "Public toilets",
        "description": "Öffentliche Toilettenanlagen (Berlin inventory).",
        "source_organization": "Senatsverwaltung Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/toiletten-wfs",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Public toilet inventory; opening hours and accessibility vary by facility.",
        "sample_file": "toilets.geojson",
        "cache_file": "toilets.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/toiletten",
        "wfs_layer": "toiletten:toiletten",
    },
    "playgrounds": {
        "slug": "playgrounds",
        "name": "Playgrounds",
        "description": "Öffentliche Spielplätze (dedicated playground polygons).",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/spielplaetze-wfs",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "Mapped public playground inventory — not every playable open space.",
        "sample_file": "playgrounds.geojson",
        "cache_file": "playgrounds.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/spielplaetze",
        "wfs_layer": "spielplaetze:spielplaetze",
    },
    "sports_facilities": {
        "slug": "sports_facilities",
        "name": "Sports facilities",
        "description": "Öffentliche Sportstandorte / Sportanlagen.",
        "source_organization": "Senatsverwaltung Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/sportstandorte-wfs",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Public sports sites inventory; club-only facilities may be incomplete.",
        "sample_file": "sports_facilities.geojson",
        "cache_file": "sports_facilities.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/sportstandorte",
        "wfs_layer": "sportstandorte:sportstandorte",
    },
    "kitas": {
        "slug": "kitas",
        "name": "Daycare centres (Kitas)",
        "description": "Öffentlich geförderte Kindertagesstätten.",
        "source_organization": "Senatsverwaltung für Bildung, Jugend und Familie Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/kindertagesstatten-wfs-d03b94d2",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Publicly funded daycare sites; private-only facilities not included.",
        "sample_file": "kitas.geojson",
        "cache_file": "kitas.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/kita",
        "wfs_layer": "kita:kita",
    },
    "hospitals": {
        "slug": "hospitals",
        "name": "Hospitals",
        "description": "Berlin hospital sites (plan hospitals + other hospitals).",
        "source_organization": "Senatsverwaltung für Wissenschaft, Gesundheit, Pflege und Gleichstellung",
        "source_url": "https://daten.berlin.de/datensaetze/krankenhaeuser-wfs",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Merges plankrankenhaeuser and weitere_krankenhaeuser; bed counts in attrs.",
        "sample_file": "hospitals.geojson",
        "cache_file": "hospitals.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/krankenhaeuser",
        # Two source layers merged into one FeatureCollection at fetch time.
        "wfs_layers": (
            ("krankenhaeuser:plankrankenhaeuser", "plan"),
            ("krankenhaeuser:weitere_krankenhaeuser", "other"),
        ),
    },
    "cemeteries": {
        "slug": "cemeteries",
        "name": "Cemeteries",
        "description": "Berlin Friedhofsbestand (open and closed cemeteries).",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/friedhofsbestand-berlin-wfs-b6e64b05",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "MultiPolygon",
        "coverage_caveat": "Official cemetery inventory including closed sites and Soviet memorials.",
        "sample_file": "cemeteries.geojson",
        "cache_file": "cemeteries.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/friedhofsbestand",
        "wfs_layer": "friedhofsbestand:friedhofsbestand_berlin",
    },
    "park_and_ride": {
        "slug": "park_and_ride",
        "name": "Park and Ride",
        "description": "P+R Anlagen in Berlin (VBB / SenMVKU inventory).",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/park-and-ride-anlagen-wfs-c9d9f2e4",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": "Berlin P+R sites only (umland layer not imported).",
        "sample_file": "park_and_ride.geojson",
        "cache_file": "park_and_ride.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/park_and_ride",
        "wfs_layer": "park_and_ride:park_and_ride",
    },
    "park_trees": {
        "slug": "park_trees",
        "name": "Park trees",
        "description": "Trees in green spaces (Anlagenbäume) from the Berlin tree inventory.",
        "source_organization": "SenMVKU Berlin",
        "source_url": "https://daten.berlin.de/datensaetze/baumbestand-berlin-wfs-48ad3a23",
        "license_text": "dl-de/zero-2.0",
        "geometry_type": "Point",
        "coverage_caveat": (
            "Park / green-space trees (baumbestand:anlagenbaeume). "
            "Large layer — map GeoJSON requires a bbox."
        ),
        "sample_file": "park_trees.geojson",
        "cache_file": "park_trees.geojson",
        "wfs": "WFS:https://gdi.berlin.de/services/wfs/baumbestand",
        "wfs_layer": "baumbestand:anlagenbaeume",
    },
}

FEATURE_TABLES = (
    "bathing_waters",
    "drinking_fountains",
    "ev_chargers",
    "bike_parking",
    "trees",
    "park_trees",
    "toilets",
    "playgrounds",
    "sports_facilities",
    "schools",
    "green_spaces",
    "kitas",
    "hospitals",
    "cemeteries",
    "park_and_ride",
)

# Generic per-layer import config: GeoJSON property key chains tried in order
# (first truthy wins, mirroring the original `or` chains).
IMPORT_CONFIG = {
    "green_spaces": {
        "kind": "polygon",
        "table": "green_spaces",
        "extra_col": "space_type",
        "source_id_keys": ("pitid", "source_id"),
        "name_keys": ("namenr", "name"),
        "extra_keys": ("objartname", "space_type"),
    },
    "schools": {
        "kind": "point",
        "table": "schools",
        "extra_col": "school_type",
        "source_id_keys": ("bsn", "source_id"),
        "name_keys": ("schulname", "name"),
        "extra_keys": ("schulart", "school_type"),
    },
    "bike_parking": {
        "kind": "point",
        "table": "bike_parking",
        "extra_col": "facility_type",
        "source_id_keys": ("projektnummer", "source_id"),
        "name_keys": ("strassenname_oa", "name"),
        "extra_keys": ("faa_typ1", "facility_type"),
    },
    "ev_chargers": {
        "kind": "point",
        "table": "ev_chargers",
        "extra_col": "charger_type",
        "source_id_keys": ("importid", "source_id"),
        "name_keys": ("adresse", "name"),
        "extra_keys": ("art_ladeeinrichtung", "charger_type"),
        "name_suffix_key": "betreiber",
    },
    "drinking_fountains": {
        "kind": "point",
        "table": "drinking_fountains",
        "extra_col": "fountain_type",
        "source_id_keys": ("nummer", "source_id"),
        "name_keys": ("standort", "name"),
        "extra_keys": ("trinkbrunnenart", "fountain_type"),
    },
    "bathing_waters": {
        "kind": "point",
        "table": "bathing_waters",
        "extra_col": "quality_rating",
        "source_id_keys": ("bathingwat", "source_id"),
        "name_keys": ("badegewaes", "name"),
        "extra_keys": ("eu_einst", "quality_rating"),
    },
    "toilets": {
        "kind": "point",
        "table": "toilets",
        "extra_col": "facility_type",
        "source_id_keys": ("nummer", "id", "source_id"),
        "name_keys": ("ortsangabe", "strasse", "name"),
        "extra_keys": ("anlagenart", "art", "facility_type"),
    },
    "playgrounds": {
        "kind": "polygon",
        "table": "playgrounds",
        "extra_col": "space_type",
        "source_id_keys": ("pitid", "kennzeich", "source_id"),
        "name_keys": ("namenr", "name"),
        "extra_keys": ("objartname", "spielplatzart", "space_type"),
    },
    "sports_facilities": {
        "kind": "point",
        "table": "sports_facilities",
        "extra_col": "facility_type",
        "source_id_keys": ("objekt_id", "id", "source_id"),
        "name_keys": ("name", "bezeichnung", "sportstaette"),
        "extra_keys": ("sportart", "kategorie", "facility_type"),
    },
    "kitas": {
        "kind": "point",
        "table": "kitas",
        "extra_col": "facility_type",
        "source_id_keys": ("e_nr", "source_id"),
        "name_keys": ("e_name", "name"),
        "extra_keys": ("e_art", "facility_type"),
    },
    "hospitals": {
        "kind": "point",
        "table": "hospitals",
        "extra_col": "hospital_type",
        "source_id_keys": ("source_id", "gisid"),
        "name_keys": ("kkh_standort", "name", "kkh"),
        "extra_keys": ("hospital_type", "fachabteilungen"),
    },
    "cemeteries": {
        "kind": "polygon",
        "table": "cemeteries",
        "extra_col": "denomination",
        "source_id_keys": ("pitid", "frhkennz", "source_id"),
        "name_keys": ("name",),
        "extra_keys": ("konfess", "denomination"),
    },
    "park_and_ride": {
        "kind": "point",
        "table": "park_and_ride",
        "extra_col": "facility_type",
        "source_id_keys": ("id", "source_id"),
        "name_keys": ("anlagennam", "bahnhofsna", "name"),
        "extra_keys": ("art", "facility_type"),
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


def first_prop(props: dict, keys: tuple[str, ...]):
    """First truthy property across the ordered key chain (mirrors `or` chains)."""
    value = None
    for key in keys:
        value = value or props.get(key)
    return value


def attrs_json(props: dict | None) -> str:
    """Serialize full source GeoJSON properties for the attrs JSONB column."""
    return json.dumps(props or {}, ensure_ascii=False, default=str)


def download_url(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, dest)


def geojson_cache_ok(path: Path) -> bool:
    """True if path looks like a complete GeoJSON object (rejects truncated WFS dumps)."""
    if not path.exists() or path.stat().st_size < 1000:
        return False
    with path.open("rb") as f:
        head = f.read(64)
        f.seek(max(-256, -path.stat().st_size), 2)
        tail = f.read().rstrip()
    return head.lstrip().startswith(b"{") and tail.endswith(b"}")


def fetch_wfs(wfs: str, layer: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if geojson_cache_ok(dest):
        print(f"Using cached {dest.name}")
        return True
    if dest.exists():
        print(f"Discarding incomplete cache {dest.name}", file=sys.stderr)
        dest.unlink()
    tmp = dest.with_name(f".{dest.name}.tmp")
    if tmp.exists():
        tmp.unlink()
    try:
        cmd = [
            "ogr2ogr",
            "-f",
            "GeoJSON",
            str(tmp),
            wfs,
            layer,
            "-t_srs",
            "EPSG:4326",
            "--config",
            "OGR_WFS_PAGE_SIZE",
            "1000",
        ]
        print(" ".join(cmd))
        # Tree inventories can take a long time to page from WFS.
        timeout = 3600 if "baumbestand" in layer else 900
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout)
        if not geojson_cache_ok(tmp):
            print(f"WFS fetch produced incomplete GeoJSON for {layer}", file=sys.stderr)
            if tmp.exists():
                tmp.unlink()
            return False
        tmp.replace(dest)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        print(f"WFS fetch failed ({exc})", file=sys.stderr)
        if tmp.exists():
            tmp.unlink()
        return False


def fetch_merged_wfs(wfs: str, layers: tuple[tuple[str, str], ...], dest: Path) -> bool:
    """Fetch several WFS layers and merge into one GeoJSON, tagging hospital_type/source_id."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if geojson_cache_ok(dest):
        print(f"Using cached {dest.name}")
        return True
    if dest.exists():
        print(f"Discarding incomplete cache {dest.name}", file=sys.stderr)
        dest.unlink()
    features: list[dict] = []
    for wfs_layer, tag in layers:
        part = dest.with_name(f"{dest.stem}_{tag}.geojson")
        if not fetch_wfs(wfs, wfs_layer, part):
            return False
        for feat in load_geojson_features(part):
            props = dict(feat.get("properties") or {})
            gisid = props.get("gisid")
            props["hospital_type"] = tag
            props["source_id"] = f"{tag}:{gisid}" if gisid is not None else f"{tag}:{props.get('gml_id')}"
            features.append({**feat, "properties": props})
    dest.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    return geojson_cache_ok(dest)


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
        ok = False
        if meta.get("wfs_layers"):
            ok = fetch_merged_wfs(meta["wfs"], meta["wfs_layers"], cache)
        elif meta.get("wfs_layer"):
            ok = fetch_wfs(meta["wfs"], meta["wfs_layer"], cache)
        if ok:
            return cache
        if sample.exists():
            print(f"Falling back to sample for {layer}", file=sys.stderr)
            return sample
        raise RuntimeError(f"Could not fetch {layer}")
    return sample


def insert_polygon_feature(
    session, table: str, catalog_id: int, source_id, name, extra_col, extra_val, geom_json: str, attrs: str
) -> None:
    session.execute(
        text(
            f"""
            INSERT INTO {table} (source_id, name, {extra_col}, catalog_id, attrs, geom)
            VALUES (
              :source_id, :name, :extra, :catalog_id, CAST(:attrs AS jsonb),
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
            "attrs": attrs,
            "geom": geom_json,
            "srid": TARGET_SRID,
        },
    )


def insert_point_feature(
    session, table: str, catalog_id: int, source_id, name, extra_col, extra_val, geom_json: str, attrs: str
) -> None:
    """Insert a point; MultiPoint/GeometryCollection reduced via ST_PointOnSurface."""
    session.execute(
        text(
            f"""
            INSERT INTO {table} (source_id, name, {extra_col}, catalog_id, attrs, geom)
            VALUES (
              :source_id, :name, :extra, :catalog_id, CAST(:attrs AS jsonb),
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
            "attrs": attrs,
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
    # Neighborhoods reference districts — clear them before wiping Bezirke.
    for t in (*FEATURE_TABLES, "neighborhoods", "districts"):
        session.execute(text(f"DELETE FROM {t}"))
    for feat in features:
        props = feat.get("properties") or {}
        official = str(props.get("Gemeinde_schluessel") or props.get("official_id") or props.get("name"))
        name = str(props.get("Gemeinde_name") or props.get("name") or "Unknown")
        session.execute(
            text(
                """
                INSERT INTO districts (official_id, name, catalog_id, attrs, geom)
                VALUES (
                  :official_id, :name, :catalog_id, CAST(:attrs AS jsonb),
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
                "attrs": attrs_json(props),
                "geom": json.dumps(feat["geometry"]),
                "srid": TARGET_SRID,
            },
        )


def import_neighborhoods(session, features: list[dict], catalog_id: int) -> None:
    session.execute(text("DELETE FROM neighborhoods"))
    for feat in features:
        props = feat.get("properties") or {}
        official = str(props.get("sch") or props.get("uuid") or props.get("official_id") or props.get("name"))
        name = str(props.get("nam") or props.get("name") or "Unknown")
        session.execute(
            text(
                """
                INSERT INTO neighborhoods (official_id, name, catalog_id, attrs, geom)
                VALUES (
                  :official_id, :name, :catalog_id, CAST(:attrs AS jsonb),
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
                "attrs": attrs_json(props),
                "geom": json.dumps(feat["geometry"]),
                "srid": TARGET_SRID,
            },
        )
    # Assign parent Bezirk by point-on-surface when districts are present.
    session.execute(
        text(
            """
            UPDATE neighborhoods n SET district_id = d.id
            FROM districts d
            WHERE ST_Intersects(ST_PointOnSurface(n.geom), d.geom)
            """
        )
    )


def import_tree_inventory(session, table: str, features: list[dict], catalog_id: int) -> None:
    """Batch-insert a large tree point inventory (street or park trees)."""
    session.execute(text(f"DELETE FROM {table}"))
    batch: list[dict] = []
    sql = text(
        f"""
        INSERT INTO {table} (source_id, name, species, catalog_id, attrs, geom)
        VALUES (
          :source_id, :name, :extra, :catalog_id, CAST(:attrs AS jsonb),
          ST_Transform(
            ST_SetSRID(
              ST_PointOnSurface(ST_MakeValid(ST_GeomFromGeoJSON(:geom))),
              4326
            ),
            :srid
          )
        )
        """
    )
    for i, feat in enumerate(features, start=1):
        props = feat.get("properties") or {}
        batch.append(
            {
                "source_id": str(props.get("gisid") or props.get("pitid") or props.get("source_id") or "")
                or None,
                "name": props.get("art_dtsch") or props.get("namenr") or props.get("name"),
                "extra": props.get("art_bot") or props.get("gattung") or props.get("species"),
                "catalog_id": catalog_id,
                "attrs": attrs_json(props),
                "geom": json.dumps(feat["geometry"]),
                "srid": TARGET_SRID,
            }
        )
        if len(batch) >= 1000:
            session.execute(sql, batch)
            batch.clear()
            if i % 20000 == 0:
                print(f"  {table} inserted: {i}")
    if batch:
        session.execute(sql, batch)
    assign_district(session, table, False)


def import_trees(session, features: list[dict], catalog_id: int) -> None:
    import_tree_inventory(session, "trees", features, catalog_id)


def import_park_trees(session, features: list[dict], catalog_id: int) -> None:
    import_tree_inventory(session, "park_trees", features, catalog_id)


def import_generic(session, layer: str, features: list[dict], catalog_id: int) -> None:
    """DELETE + reinsert one config-driven layer, then assign districts."""
    cfg = IMPORT_CONFIG[layer]
    table = cfg["table"]
    session.execute(text(f"DELETE FROM {table}"))
    insert = insert_polygon_feature if cfg["kind"] == "polygon" else insert_point_feature
    for feat in features:
        props = feat.get("properties") or {}
        name = first_prop(props, cfg["name_keys"])
        suffix_key = cfg.get("name_suffix_key")
        if suffix_key and props.get(suffix_key) and name:
            name = f"{name} ({props.get(suffix_key)})"
        insert(
            session,
            table,
            catalog_id,
            str(first_prop(props, cfg["source_id_keys"]) or "") or None,
            name,
            cfg["extra_col"],
            first_prop(props, cfg["extra_keys"]),
            json.dumps(feat["geometry"]),
            attrs_json(props),
        )
    assign_district(session, table, cfg["kind"] == "polygon")


def _generic_importer(layer: str):
    def run_import(session, features: list[dict], catalog_id: int) -> None:
        import_generic(session, layer, features, catalog_id)

    return run_import


IMPORTERS = {
    "districts": import_districts,
    "neighborhoods": import_neighborhoods,
    "trees": import_trees,
    "park_trees": import_park_trees,
    **{slug: _generic_importer(slug) for slug in IMPORT_CONFIG},
}

DEFAULT_ORDER = [
    "districts",
    "neighborhoods",
    "green_spaces",
    "schools",
    "trees",
    "park_trees",
    "bike_parking",
    "ev_chargers",
    "drinking_fountains",
    "bathing_waters",
    "toilets",
    "playgrounds",
    "sports_facilities",
    "kitas",
    "hospitals",
    "cemeteries",
    "park_and_ride",
]


def run(source: str, layers: list[str] | None = None) -> None:
    selected = layers or DEFAULT_ORDER
    for layer in selected:
        if layer not in IMPORTERS:
            raise SystemExit(f"Unknown layer: {layer}")
    # Re-importing districts clears dependent feature tables — put it first when present.
    # Neighborhoods need districts for district_id assignment — import after districts.
    ordered: list[str] = []
    if "districts" in selected:
        ordered.append("districts")
    if "neighborhoods" in selected:
        ordered.append("neighborhoods")
    ordered.extend(l for l in selected if l not in ("districts", "neighborhoods"))
    selected = ordered

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
                      (SELECT COUNT(*) FROM neighborhoods) AS neighborhoods,
                      (SELECT COUNT(*) FROM green_spaces) AS green_spaces,
                      (SELECT COUNT(*) FROM schools) AS schools,
                      (SELECT COUNT(*) FROM trees) AS trees,
                      (SELECT COUNT(*) FROM park_trees) AS park_trees,
                      (SELECT COUNT(*) FROM bike_parking) AS bike_parking,
                      (SELECT COUNT(*) FROM ev_chargers) AS ev_chargers,
                      (SELECT COUNT(*) FROM drinking_fountains) AS drinking_fountains,
                      (SELECT COUNT(*) FROM bathing_waters) AS bathing_waters,
                      (SELECT COUNT(*) FROM toilets) AS toilets,
                      (SELECT COUNT(*) FROM playgrounds) AS playgrounds,
                      (SELECT COUNT(*) FROM sports_facilities) AS sports_facilities,
                      (SELECT COUNT(*) FROM kitas) AS kitas,
                      (SELECT COUNT(*) FROM hospitals) AS hospitals,
                      (SELECT COUNT(*) FROM cemeteries) AS cemeteries,
                      (SELECT COUNT(*) FROM park_and_ride) AS park_and_ride
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
