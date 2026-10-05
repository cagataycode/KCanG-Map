-- Params: :lon, :lat (WGS84)
WITH pt AS (
  SELECT ST_Transform(ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326), 25833) AS geom
),
hits AS (
  SELECT
    b.id,
    b.rule_type,
    b.source_table,
    b.source_id,
    b.name,
    b.buffer_m,
    ST_Distance(b.geom, pt.geom) AS distance_inside_m,
    ST_Distance(ST_Boundary(b.geom), pt.geom) AS distance_to_boundary_m
  FROM restriction_buffers b, pt
  WHERE ST_Intersects(b.geom, pt.geom)
  ORDER BY ST_Distance(b.geom, pt.geom)
  LIMIT 20
),
nearest AS (
  SELECT
    b.rule_type,
    b.source_table,
    b.source_id,
    b.name,
    ST_Distance(b.geom, pt.geom) AS distance_m
  FROM restriction_buffers b, pt
  ORDER BY b.geom <-> pt.geom
  LIMIT 5
)
SELECT jsonb_build_object(
  'status', CASE
    WHEN EXISTS (SELECT 1 FROM hits) THEN 'likely_restricted'
    WHEN EXISTS (SELECT 1 FROM restriction_buffers) THEN 'outside_mapped_buffers'
    ELSE 'unknown'
  END,
  'crs', 'EPSG:25833',
  'buffer_m', 100,
  'lon', CAST(:lon AS double precision),
  'lat', CAST(:lat AS double precision),
  'hits', COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM hits h), '[]'::jsonb),
  'nearest', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM nearest n), '[]'::jsonb),
  'caveats', jsonb_build_array(
    'Not legal advice.',
    '100 m buffer uses facility geometry as a proxy for Eingangsbereich under § 5 KCanG.',
    'Incomplete inventories: not mapped does not mean allowed.',
    'Consumption in the immediate presence of minors is always banned and cannot be mapped.',
    'Fußgängerzonen 07:00–20:00 are not modeled in this MVP.'
  )
);
