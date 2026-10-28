"""Layer registry: single source of truth for the map layers."""

from __future__ import annotations

from dataclasses import dataclass

from app.sql_loader import load_sql

LAYER_SQL_NAME = "layer_geojson.sql"

# Max lon/lat span for requires_filter layers (blocks citywide-ish dumps).
MAX_FILTERED_BBOX_SPAN_DEG = 0.2


@dataclass(frozen=True)
class LayerDef:
    slug: str  # snake_case layer slug
    path: str  # kebab-case URL path segment
    table: str  # PostGIS table name
    alias: str  # SQL alias in rendered queries
    extra_col: str | None  # extra per-layer properties column
    official_id: bool  # include official_id in properties
    has_district_id: bool  # include district_id property and district filter clause
    requires_filter: bool  # block unfiltered citywide dumps
    include_attrs: bool = True  # merge source attrs into map GeoJSON properties
    feature_limit: int | None = None  # hard cap for huge inventories


# Column order: slug, path, table, alias, extra_col, official_id, has_district_id, requires_filter.
LAYERS: tuple[LayerDef, ...] = (
    LayerDef("districts", "districts", "districts", "d", None, True, False, False),
    LayerDef("neighborhoods", "neighborhoods", "neighborhoods", "n", None, True, True, False),
    LayerDef("green_spaces", "green-spaces", "green_spaces", "g", "space_type", False, True, False),
    LayerDef("cemeteries", "cemeteries", "cemeteries", "c", "denomination", False, True, False),
    LayerDef("schools", "schools", "schools", "s", "school_type", False, True, False),
    LayerDef("kitas", "kitas", "kitas", "k", "facility_type", False, True, False),
    LayerDef("hospitals", "hospitals", "hospitals", "h", "hospital_type", False, True, False),
    LayerDef(
        "trees", "trees", "trees", "t", "species", False, True, True,
        include_attrs=False, feature_limit=8_000,
    ),
    LayerDef(
        "park_trees", "park-trees", "park_trees", "pt", "species", False, True, True,
        include_attrs=False, feature_limit=8_000,
    ),
    LayerDef("bike_parking", "bike-parking", "bike_parking", "b", "facility_type", False, True, False),
    LayerDef("ev_chargers", "ev-chargers", "ev_chargers", "e", "charger_type", False, True, False),
    LayerDef("drinking_fountains", "drinking-fountains", "drinking_fountains", "f", "fountain_type", False, True, False),
    LayerDef("bathing_waters", "bathing-waters", "bathing_waters", "w", "quality_rating", False, True, False),
    LayerDef("toilets", "toilets", "toilets", "o", "facility_type", False, True, False),
    LayerDef("playgrounds", "playgrounds", "playgrounds", "p", "space_type", False, True, False),
    LayerDef("sports_facilities", "sports-facilities", "sports_facilities", "sf", "facility_type", False, True, False),
    LayerDef("park_and_ride", "park-and-ride", "park_and_ride", "pr", "facility_type", False, True, False),
)

LAYER_BY_SLUG: dict[str, LayerDef] = {layer.slug: layer for layer in LAYERS}


def render_layer_sql(layer: LayerDef) -> str:
    """Render the shared layer_geojson.sql template for one layer."""
    a = layer.alias

    curated = [f"      'id', {a}.id,"]
    if layer.official_id:
        curated.append(f"      'official_id', {a}.official_id,")
    curated.append(f"      'name', {a}.name,")
    if layer.extra_col:
        curated.append(f"      '{layer.extra_col}', {a}.{layer.extra_col},")
    if layer.has_district_id:
        curated.append(f"      'district_id', {a}.district_id,")
    curated.append(f"      'layer', '{layer.slug}',")
    curated.append(f"      'catalog_id', {a}.catalog_id")
    curated_obj = "jsonb_build_object(\n" + "\n".join(curated) + "\n    )"

    if layer.include_attrs:
        properties_expr = f"COALESCE({a}.attrs, '{{}}'::jsonb) || {curated_obj}"
    else:
        properties_expr = curated_obj

    where = []
    if layer.has_district_id:
        where.append(
            f"(CAST(:district_id AS integer) IS NULL OR {a}.district_id = CAST(:district_id AS integer))"
        )
    if layer.requires_filter:
        # Citywide dump blocked: require bbox and/or district filter.
        where.append(
            "(\n"
            "      CAST(:district_id AS integer) IS NOT NULL\n"
            "      OR CAST(:minx AS double precision) IS NOT NULL\n"
            "    )"
        )
    where.append(
        "(\n"
        "      CAST(:minx AS double precision) IS NULL\n"
        f"      OR {a}.geom && ST_Transform(\n"
        "           ST_MakeEnvelope(\n"
        "             CAST(:minx AS double precision),\n"
        "             CAST(:miny AS double precision),\n"
        "             CAST(:maxx AS double precision),\n"
        "             CAST(:maxy AS double precision),\n"
        "             4326\n"
        "           ),\n"
        "           25833\n"
        "         )\n"
        "    )"
    )

    limit_clause = f"LIMIT {int(layer.feature_limit)}" if layer.feature_limit else ""

    return load_sql(LAYER_SQL_NAME).format(
        slug=layer.slug,
        table=layer.table,
        alias=a,
        district_param=", :district_id" if layer.has_district_id else "",
        properties_expr=properties_expr,
        where_clause="\n    AND ".join(where),
        limit_clause=limit_clause,
    )
