-- Bbox GeoJSON for neighborhoods / Ortsteile (EPSG:4326 output for MapLibre).
-- Params: :minx, :miny, :maxx, :maxy (WGS84 lon/lat); null bbox = all features
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'id', n.id,
    'geometry', ST_AsGeoJSON(ST_Transform(n.geom, 4326))::jsonb,
    'properties', jsonb_build_object(
      'id', n.id,
      'official_id', n.official_id,
      'name', n.name,
      'district_id', n.district_id,
      'layer', 'neighborhoods',
      'catalog_id', n.catalog_id
    )
  ) AS feature
  FROM neighborhoods n
  WHERE CAST(:minx AS double precision) IS NULL
     OR n.geom && ST_Transform(
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
