-- Feature by id for a given layer table.
-- Params: :id
-- Table name is substituted safely by the app (whitelist only).
-- Flatten source attrs under curated columns (curated wins on collision).
SELECT jsonb_build_object(
  'type', 'Feature',
  'id', f.id,
  'geometry', ST_AsGeoJSON(ST_Transform(f.geom, 4326))::jsonb,
  'properties', COALESCE(f.attrs, '{{}}'::jsonb) || (to_jsonb(f) - 'geom' - 'attrs')
)
FROM {table} f
WHERE f.id = :id;
