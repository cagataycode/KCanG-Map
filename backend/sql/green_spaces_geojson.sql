-- Bbox GeoJSON for green spaces.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', g.id,
    'geometry', ST_AsGeoJSON(ST_Transform(g.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'space_type', g.space_type,
      'district_id', g.district_id,
      'layer', 'green_spaces',
      'catalog_id', g.catalog_id
    )
  ) AS feature
  FROM green_spaces g
  WHERE (CAST(:district_id AS integer) IS NULL OR g.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR g.geom && ST_Transform(
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
