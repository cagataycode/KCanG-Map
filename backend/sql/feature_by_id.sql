-- Feature by id for a given layer table.
-- Params: :id
-- Table name is substituted safely by the app (whitelist only).
SELECT jsonb_build_object(
  'type', 'Feature',
  'id', f.id,
  'geometry', ST_AsGeoJSON(ST_Transform(f.geom, 4326))::jsonb,
  'properties', to_jsonb(f) - 'geom'
)
FROM {table} f
WHERE f.id = :id;
