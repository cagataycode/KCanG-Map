/** Berlin SQL explore kit: schema glossary + ready-made patterns to run and analyze. */

import type { LayerSlug } from "./layers";

export type SchemaColumn = {
  name: string;
  note?: string;
};

export type SchemaTable = {
  table: string;
  label: string;
  about: string;
  alias?: string;
  columns: SchemaColumn[];
};

/** Glossary of tables and fields in this database. */
export const SCHEMA_TABLES: SchemaTable[] = [
  {
    table: "districts",
    label: "Boroughs (Bezirke)",
    about: "12 Berlin borough polygons. Amenities link here via district_id.",
    alias: "d",
    columns: [
      { name: "id", note: "PK" },
      { name: "name", note: "e.g. Mitte" },
      { name: "official_id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "MULTIPOLYGON · EPSG:25833" },
    ],
  },
  {
    table: "neighborhoods",
    label: "Neighborhoods (Ortsteile)",
    about: "Finer place boundaries inside boroughs.",
    alias: "n",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "MULTIPOLYGON" },
    ],
  },
  {
    table: "green_spaces",
    label: "Parks",
    about: "Public green / park polygons.",
    alias: "g",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "space_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "MULTIPOLYGON" },
    ],
  },
  {
    table: "playgrounds",
    label: "Playgrounds",
    about: "Playground areas.",
    alias: "p",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "space_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "MULTIPOLYGON" },
    ],
  },
  {
    table: "schools",
    label: "Schools",
    about: "School points (context for park proximity).",
    alias: "s",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "school_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "trees",
    label: "Street trees",
    about: "Large inventory — use a bbox or borough filter.",
    alias: "t",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "species" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "park_trees",
    label: "Park trees",
    about: "Trees in green spaces — also bbox/borough scoped.",
    alias: "pt",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "species" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "kitas",
    label: "Daycare (Kitas)",
    about: "Publicly funded daycare centres.",
    alias: "k",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "facility_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "hospitals",
    label: "Hospitals",
    about: "Plan hospitals and other hospital sites.",
    alias: "h",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "hospital_type", note: "plan | other" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "cemeteries",
    label: "Cemeteries",
    about: "Cemetery polygons (open and closed).",
    alias: "c",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "denomination" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "MULTIPOLYGON" },
    ],
  },
  {
    table: "park_and_ride",
    label: "Park & Ride",
    about: "P+R facilities near transit.",
    alias: "pr",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "facility_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "bike_parking",
    label: "Bike parking",
    about: "Public bike racks.",
    alias: "b",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "facility_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "ev_chargers",
    label: "EV chargers",
    about: "Electric vehicle charging sites.",
    alias: "e",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "charger_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "drinking_fountains",
    label: "Drinking fountains",
    about: "Public drinking water points.",
    alias: "f",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "fountain_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "toilets",
    label: "Public toilets",
    about: "Public toilet locations.",
    alias: "o",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "facility_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "bathing_waters",
    label: "Bathing waters",
    about: "Official bathing sites.",
    alias: "w",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "quality_rating" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
  {
    table: "sports_facilities",
    label: "Sports facilities",
    about: "Sports / recreation sites.",
    alias: "r",
    columns: [
      { name: "id", note: "PK" },
      { name: "name" },
      { name: "facility_type" },
      { name: "district_id", note: "FK → districts.id" },
      { name: "attrs", note: "full source properties (jsonb)" },
      { name: "geom", note: "POINT" },
    ],
  },
];

export type ReadyPattern = {
  id: string;
  title: string;
  blurb: string;
  /** Short note on what to look at when you Run / Explain. */
  analyze: string;
  sql: string;
  tables: string[];
  refFile?: string;
  refLayer?: LayerSlug;
};

const GEO = (alias: string) =>
  `ST_AsGeoJSON(ST_Transform(${alias}.geom, 4326))::json AS geometry`;

/** Complete, ready-to-run queries. :binds fill from the map at Run. */
export const PATTERNS: ReadyPattern[] = [
  {
    id: "bikes-in-view",
    title: "Bike racks in view",
    blurb: "What the map is showing for bike parking right now.",
    analyze: "Pan/zoom and Run again — :minx… follow the viewport. Explain to see ix_bike_parking_geom.",
    tables: ["bike_parking"],
    refLayer: "bike_parking",
    sql: `SELECT b.id, b.name, b.facility_type, b.district_id,
  ${GEO("b")}
FROM bike_parking b
WHERE b.geom && ST_Transform(
  ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326),
  25833
)
ORDER BY b.id
LIMIT 200;`,
  },
  {
    id: "fountains-in-view",
    title: "Fountains in view",
    blurb: "Drinking fountains inside the current map frame.",
    analyze: "Same bbox pattern as bike racks — swap the table to explore another layer.",
    tables: ["drinking_fountains"],
    refLayer: "drinking_fountains",
    sql: `SELECT f.id, f.name, f.district_id,
  ${GEO("f")}
FROM drinking_fountains f
WHERE f.geom && ST_Transform(
  ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326),
  25833
)
ORDER BY f.id
LIMIT 200;`,
  },
  {
    id: "nearest-toilet",
    title: "Nearest toilets to click",
    blurb: "Five closest public toilets to your last map click.",
    analyze: "Click the map first. <-> is KNN distance; ST_Distance is metres in EPSG:25833.",
    tables: ["toilets"],
    refFile: "analysis_nearest_amenities.sql",
    sql: `WITH pt AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326),
    25833
  ) AS geom
)
SELECT o.id, o.name,
  ST_Distance(o.geom, pt.geom) AS distance_m,
  ${GEO("o")}
FROM toilets o, pt
ORDER BY o.geom <-> pt.geom
LIMIT 5;`,
  },
  {
    id: "nearest-park",
    title: "Nearest parks to click",
    blurb: "Five closest parks to your click.",
    analyze: "Same KNN pattern on polygons — distance is still planar metres.",
    tables: ["green_spaces"],
    sql: `WITH pt AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326),
    25833
  ) AS geom
)
SELECT g.id, g.name, g.space_type,
  ST_Distance(g.geom, pt.geom) AS distance_m,
  ${GEO("g")}
FROM green_spaces g, pt
ORDER BY g.geom <-> pt.geom
LIMIT 5;`,
  },
  {
    id: "playgrounds-with-borough",
    title: "Playgrounds + borough name",
    blurb: "Join playgrounds to districts through district_id.",
    analyze: "p.district_id → d.id. Rows with NULL district_id disappear in a plain JOIN.",
    tables: ["playgrounds", "districts"],
    sql: `SELECT p.id, p.name, d.name AS borough,
  ${GEO("p")}
FROM playgrounds p
JOIN districts d ON p.district_id = d.id
ORDER BY d.name, p.name
LIMIT 100;`,
  },
  {
    id: "chargers-by-borough",
    title: "EV chargers per borough",
    blurb: "How many chargers in each Bezirk.",
    analyze: "LEFT JOIN keeps boroughs with zero chargers. COUNT(e.id) skips NULLs.",
    tables: ["districts", "ev_chargers"],
    refFile: "analysis_amenity_density_by_borough.sql",
    sql: `SELECT d.id, d.name AS borough,
  COUNT(e.id)::int AS chargers
FROM districts d
LEFT JOIN ev_chargers e ON e.district_id = d.id
GROUP BY d.id, d.name
ORDER BY chargers DESC, d.name;`,
  },
  {
    id: "bikes-by-borough",
    title: "Bike racks per borough",
    blurb: "Rack counts by Bezirk.",
    analyze: "Swap bike_parking for toilets or fountains to compare densities.",
    tables: ["districts", "bike_parking"],
    refFile: "analysis_amenity_density_by_borough.sql",
    sql: `SELECT d.id, d.name AS borough,
  COUNT(b.id)::int AS bike_racks
FROM districts d
LEFT JOIN bike_parking b ON b.district_id = d.id
GROUP BY d.id, d.name
ORDER BY bike_racks DESC, d.name;`,
  },
  {
    id: "green-cover",
    title: "Park area share by borough",
    blurb: "Mapped park area as a share of each borough.",
    analyze: "ST_Area on polygons in EPSG:25833. Compare with the Compare tab green cover measure.",
    tables: ["districts", "green_spaces"],
    refFile: "analysis_green_by_borough.sql",
    sql: `SELECT d.name AS borough,
  COUNT(g.id)::int AS park_features,
  ROUND(
    (COALESCE(SUM(ST_Area(g.geom)), 0) / NULLIF(ST_Area(d.geom), 0) * 100)::numeric,
    1
  ) AS park_pct
FROM districts d
LEFT JOIN green_spaces g ON g.district_id = d.id
GROUP BY d.id, d.name, d.geom
ORDER BY park_pct DESC NULLS LAST;`,
  },
  {
    id: "trees-in-view",
    title: "Street trees in view",
    blurb: "Trees in the current viewport (keep the map zoomed in).",
    analyze: "Citywide trees are huge — bbox keeps the scan small. Explain and look for the GiST index.",
    tables: ["trees"],
    refLayer: "trees",
    sql: `SELECT t.id, t.name, t.species, t.district_id,
  ${GEO("t")}
FROM trees t
WHERE t.geom && ST_Transform(
  ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326),
  25833
)
ORDER BY t.id
LIMIT 300;`,
  },
  {
    id: "schools-with-borough",
    title: "Schools + borough name",
    blurb: "Join schools to districts through district_id.",
    analyze: "Same FK join as playgrounds — s.district_id → d.id. Try filtering WHERE d.name = 'Mitte'.",
    tables: ["schools", "districts"],
    sql: `SELECT s.id, s.name, s.school_type, d.name AS borough,
  ${GEO("s")}
FROM schools s
JOIN districts d ON s.district_id = d.id
ORDER BY d.name, s.name
LIMIT 100;`,
  },
  {
    id: "bathing-with-borough",
    title: "Bathing waters + borough",
    blurb: "Official bathing sites with their Bezirk name.",
    analyze: "Small table — drop the LIMIT and still get every site. quality_rating is in the source attributes.",
    tables: ["bathing_waters", "districts"],
    sql: `SELECT w.id, w.name, w.quality_rating, d.name AS borough,
  ${GEO("w")}
FROM bathing_waters w
JOIN districts d ON w.district_id = d.id
ORDER BY d.name, w.name;`,
  },
  {
    id: "sports-in-view",
    title: "Sports facilities in view",
    blurb: "Sports / recreation sites inside the current map frame.",
    analyze: "Same bbox pattern as bike racks and fountains — pan/zoom and Run again.",
    tables: ["sports_facilities"],
    refLayer: "sports_facilities",
    sql: `SELECT r.id, r.name, r.facility_type, r.district_id,
  ${GEO("r")}
FROM sports_facilities r
WHERE r.geom && ST_Transform(
  ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326),
  25833
)
ORDER BY r.id
LIMIT 200;`,
  },
  {
    id: "kitas-by-borough",
    title: "Daycare centres per borough",
    blurb: "Kita counts by Bezirk.",
    analyze: "Same density pattern as bike racks — swap kitas for hospitals or P+R.",
    tables: ["districts", "kitas"],
    refFile: "analysis_amenity_density_by_borough.sql",
    sql: `SELECT d.id, d.name AS borough,
  COUNT(k.id)::int AS kitas
FROM districts d
LEFT JOIN kitas k ON k.district_id = d.id
GROUP BY d.id, d.name
ORDER BY kitas DESC, d.name;`,
  },
  {
    id: "nearest-hospital",
    title: "Nearest hospitals to click",
    blurb: "Five closest hospitals to your last map click.",
    analyze: "Click the map first. hospital_type is plan vs other.",
    tables: ["hospitals"],
    refFile: "analysis_nearest_amenities.sql",
    sql: `WITH pt AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326),
    25833
  ) AS geom
)
SELECT h.id, h.name, h.hospital_type,
  ST_Distance(h.geom, pt.geom) AS distance_m,
  ${GEO("h")}
FROM hospitals h, pt
ORDER BY h.geom <-> pt.geom
LIMIT 5;`,
  },
  {
    id: "park-trees-in-view",
    title: "Park trees in view",
    blurb: "Anlagenbäume in the current viewport (zoom in first).",
    analyze: "Same bbox pattern as street trees — compare species mix in parks vs streets.",
    tables: ["park_trees"],
    refLayer: "park_trees",
    sql: `SELECT pt.id, pt.name, pt.species, pt.district_id,
  ${GEO("pt")}
FROM park_trees pt
WHERE pt.geom && ST_Transform(
  ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326),
  25833
)
ORDER BY pt.id
LIMIT 300;`,
  },
  {
    id: "charger-source-attrs",
    title: "EV charger source fields",
    blurb: "Full open-data properties for chargers (attrs jsonb).",
    analyze: "attrs holds every source key (betreiber, ladeleistung_1, …). Curated columns stay for joins.",
    tables: ["ev_chargers"],
    sql: `SELECT e.id, e.name, e.charger_type, e.attrs
FROM ev_chargers e
ORDER BY e.id
LIMIT 50;`,
  },
];


