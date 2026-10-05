-- Bbox GeoJSON for sports facilities.
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', s.id,
    'geometry', ST_AsGeoJSON(ST_Transform(s.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'facility_type', s.facility_type,
      'district_id', s.district_id,
      'layer', 'sports_facilities',
      'catalog_id', s.catalog_id
    )
  ) AS feature
  FROM sports_facilities s
  WHERE (CAST(:district_id AS integer) IS NULL OR s.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR s.geom && ST_Transform(
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
