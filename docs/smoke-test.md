# Smoke-test checklist

1. `docker compose up -d` — PostGIS healthy.
2. `cd backend && alembic upgrade head` — migrations apply through `0003_kcang`.
3. `python -m scripts.import_layers --source samples` — districts + green + schools + playgrounds + kitas + sports + `restriction_buffers`.
4. `uvicorn app.main:app --reload` — `GET /health` returns PostGIS version.
5. Layer GeoJSON: `/districts`, `/schools`, `/playgrounds`, `/kitas`, `/sports-facilities`, `/restriction-buffers`.
6. `GET /analyses/consumption-check?lon=13.37&lat=52.525` → `likely_restricted` (sample school).
7. `GET /analyses/consumption-check?lon=13.36&lat=52.515` → `outside_mapped_buffers` (away from sample seeds).
8. `GET /analyses/restriction-coverage` returns borough `%` with caveats.
9. Frontend: buffer layer, facility toggles, map click check panel, persistent disclaimer.
10. Empty DB: API returns empty FeatureCollections / unknown status without crashing.
