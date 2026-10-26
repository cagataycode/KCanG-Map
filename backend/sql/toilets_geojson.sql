-- Bbox GeoJSON for public toilets.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', t.id,
    'geometry', ST_AsGeoJSON(ST_Transform(t.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'facility_type', t.facility_type,
      'district_id', t.district_id,
      'layer', 'toilets',
      'catalog_id', t.catalog_id
    )
  ) AS feature
  FROM toilets t
  WHERE (CAST(:district_id AS integer) IS NULL OR t.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR t.geom && ST_Transform(
           ST_MakeEnvelope(
             CAST(:minx AS double precision),
             CAST(:miny AS double precision),
             CAST(:maxx AS double precision),
             CAST(:maxy AS double precision),
             4326
           ),
           25833
         )
    )
) q;
