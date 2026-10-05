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
      'rule_type', b.rule_type,
      'source_table', b.source_table,
      'buffer_m', b.buffer_m,
      'layer', 'restriction_buffers',
      'district_id', b.district_id
    )
  ) AS feature
  FROM restriction_buffers b
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
  LIMIT 5000
) q;
