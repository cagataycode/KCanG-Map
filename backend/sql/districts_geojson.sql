-- Bbox GeoJSON for districts (EPSG:4326 output for MapLibre).
-- Params: :minx, :miny, :maxx, :maxy (WGS84 lon/lat); null bbox = all features
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', d.id,
    'geometry', ST_AsGeoJSON(ST_Transform(d.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', d.id,
      'official_id', d.official_id,
      'name', d.name,
      'layer', 'districts',
      'catalog_id', d.catalog_id
    )
  ) AS feature
  FROM districts d
  WHERE CAST(:minx AS double precision) IS NULL
     OR d.geom && ST_Transform(
          ST_MakeEnvelope(
            CAST(:minx AS double precision),
            CAST(:miny AS double precision),
            CAST(:maxx AS double precision),
            CAST(:maxy AS double precision),
            4326
          ),
          25833
        )
) q;
