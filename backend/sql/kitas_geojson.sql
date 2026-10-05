-- Bbox GeoJSON for kitas.
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', k.id,
    'geometry', ST_AsGeoJSON(ST_Transform(k.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', k.id,
      'name', k.name,
      'facility_type', k.facility_type,
      'district_id', k.district_id,
      'layer', 'kitas',
      'catalog_id', k.catalog_id
    )
  ) AS feature
  FROM kitas k
  WHERE (CAST(:district_id AS integer) IS NULL OR k.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR k.geom && ST_Transform(
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
