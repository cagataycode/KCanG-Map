/** Berlin SQL explore kit: schema glossary + ready-made patterns to run and analyze. */

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
    refFile: "bike_parking_geojson.sql",
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
    refFile: "drinking_fountains_geojson.sql",
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
    refFile: "trees_geojson.sql",
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
];

export function schemaTablesFor(names: string[]): SchemaTable[] {
  const set = new Set(names);
  return SCHEMA_TABLES.filter((t) => set.has(t.table));
}
