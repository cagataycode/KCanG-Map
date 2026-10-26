-- Bbox GeoJSON for playgrounds.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', p.id,
    'geometry', ST_AsGeoJSON(ST_Transform(p.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'space_type', p.space_type,
      'district_id', p.district_id,
      'layer', 'playgrounds',
      'catalog_id', p.catalog_id
    )
  ) AS feature
  FROM playgrounds p
  WHERE (CAST(:district_id AS integer) IS NULL OR p.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR p.geom && ST_Transform(
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
