-- Bbox GeoJSON for drinking fountains.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', f.id,
    'geometry', ST_AsGeoJSON(ST_Transform(f.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'fountain_type', f.fountain_type,
      'district_id', f.district_id,
      'layer', 'drinking_fountains',
      'catalog_id', f.catalog_id
    )
  ) AS feature
  FROM drinking_fountains f
  WHERE (CAST(:district_id AS integer) IS NULL OR f.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR f.geom && ST_Transform(
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
