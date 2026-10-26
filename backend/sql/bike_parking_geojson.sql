-- Bbox GeoJSON for bike parking.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', b.id,
    'geometry', ST_AsGeoJSON(ST_Transform(b.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'facility_type', b.facility_type,
      'district_id', b.district_id,
      'layer', 'bike_parking',
      'catalog_id', b.catalog_id
    )
  ) AS feature
  FROM bike_parking b
  WHERE (CAST(:district_id AS integer) IS NULL OR b.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR b.geom && ST_Transform(
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
