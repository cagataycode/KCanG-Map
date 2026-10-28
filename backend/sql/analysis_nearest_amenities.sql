-- Nearest amenity per layer from a WGS84 click point (EPSG:25833 metres).
-- Params: :lon, :lat
WITH pt AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326),
    25833
  ) AS geom
),
nearest_trees AS (
  SELECT 'trees'::text AS layer, t.id, t.name, ST_Distance(t.geom, pt.geom) AS distance_m
  FROM trees t, pt
  ORDER BY t.geom <-> pt.geom
  LIMIT 1
),
nearest_park_trees AS (
  SELECT 'park_trees'::text AS layer, pt_t.id, pt_t.name, ST_Distance(pt_t.geom, pt.geom) AS distance_m
  FROM park_trees pt_t, pt
  ORDER BY pt_t.geom <-> pt.geom
  LIMIT 1
),
nearest_bike AS (
  SELECT 'bike_parking'::text AS layer, b.id, b.name, ST_Distance(b.geom, pt.geom) AS distance_m
  FROM bike_parking b, pt
  ORDER BY b.geom <-> pt.geom
  LIMIT 1
),
nearest_ev AS (
  SELECT 'ev_chargers'::text AS layer, e.id, e.name, ST_Distance(e.geom, pt.geom) AS distance_m
  FROM ev_chargers e, pt
  ORDER BY e.geom <-> pt.geom
  LIMIT 1
),
nearest_fountains AS (
  SELECT 'drinking_fountains'::text AS layer, f.id, f.name, ST_Distance(f.geom, pt.geom) AS distance_m
  FROM drinking_fountains f, pt
  ORDER BY f.geom <-> pt.geom
  LIMIT 1
),
nearest_bathing AS (
  SELECT 'bathing_waters'::text AS layer, w.id, w.name, ST_Distance(w.geom, pt.geom) AS distance_m
  FROM bathing_waters w, pt
  ORDER BY w.geom <-> pt.geom
  LIMIT 1
),
nearest_toilets AS (
  SELECT 'toilets'::text AS layer, o.id, o.name, ST_Distance(o.geom, pt.geom) AS distance_m
  FROM toilets o, pt
  ORDER BY o.geom <-> pt.geom
  LIMIT 1
),
nearest_playgrounds AS (
  SELECT 'playgrounds'::text AS layer, p.id, p.name, ST_Distance(p.geom, pt.geom) AS distance_m
  FROM playgrounds p, pt
  ORDER BY p.geom <-> pt.geom
  LIMIT 1
),
nearest_sports AS (
  SELECT 'sports_facilities'::text AS layer, sf.id, sf.name, ST_Distance(sf.geom, pt.geom) AS distance_m
  FROM sports_facilities sf, pt
  ORDER BY sf.geom <-> pt.geom
  LIMIT 1
),
nearest_kitas AS (
  SELECT 'kitas'::text AS layer, k.id, k.name, ST_Distance(k.geom, pt.geom) AS distance_m
  FROM kitas k, pt
  ORDER BY k.geom <-> pt.geom
  LIMIT 1
),
nearest_hospitals AS (
  SELECT 'hospitals'::text AS layer, h.id, h.name, ST_Distance(h.geom, pt.geom) AS distance_m
  FROM hospitals h, pt
  ORDER BY h.geom <-> pt.geom
  LIMIT 1
),
nearest_cemeteries AS (
  SELECT 'cemeteries'::text AS layer, c.id, c.name, ST_Distance(c.geom, pt.geom) AS distance_m
  FROM cemeteries c, pt
  ORDER BY c.geom <-> pt.geom
  LIMIT 1
),
nearest_pr AS (
  SELECT 'park_and_ride'::text AS layer, pr.id, pr.name, ST_Distance(pr.geom, pt.geom) AS distance_m
  FROM park_and_ride pr, pt
  ORDER BY pr.geom <-> pt.geom
  LIMIT 1
),
nearest_green AS (
  SELECT 'green_spaces'::text AS layer, g.id, g.name, ST_Distance(g.geom, pt.geom) AS distance_m
  FROM green_spaces g, pt
  ORDER BY g.geom <-> pt.geom
  LIMIT 1
),
nearest AS (
  SELECT * FROM nearest_trees
  UNION ALL SELECT * FROM nearest_park_trees
  UNION ALL SELECT * FROM nearest_bike
  UNION ALL SELECT * FROM nearest_ev
  UNION ALL SELECT * FROM nearest_fountains
  UNION ALL SELECT * FROM nearest_bathing
  UNION ALL SELECT * FROM nearest_toilets
  UNION ALL SELECT * FROM nearest_playgrounds
  UNION ALL SELECT * FROM nearest_sports
  UNION ALL SELECT * FROM nearest_kitas
  UNION ALL SELECT * FROM nearest_hospitals
  UNION ALL SELECT * FROM nearest_cemeteries
  UNION ALL SELECT * FROM nearest_pr
  UNION ALL SELECT * FROM nearest_green
)
SELECT jsonb_build_object(
  'lon', CAST(:lon AS double precision),
  'lat', CAST(:lat AS double precision),
  'crs', 'EPSG:25833',
  'nearest', COALESCE(
    (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.distance_m) FROM nearest n),
    '[]'::jsonb
  )
);
