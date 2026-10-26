-- Bbox GeoJSON for EV chargers.
-- Params: :minx, :miny, :maxx, :maxy, :district_id
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', e.id,
    'geometry', ST_AsGeoJSON(ST_Transform(e.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'charger_type', e.charger_type,
      'district_id', e.district_id,
      'layer', 'ev_chargers',
      'catalog_id', e.catalog_id
    )
  ) AS feature
  FROM ev_chargers e
  WHERE (CAST(:district_id AS integer) IS NULL OR e.district_id = CAST(:district_id AS integer))
    AND (
      CAST(:minx AS double precision) IS NULL
      OR e.geom && ST_Transform(
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
