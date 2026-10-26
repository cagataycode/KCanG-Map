# Smoke test

1. `alembic upgrade head`
2. `python -m scripts.import_layers --source samples`
3. `GET /health` → ok + PostGIS
4. `GET /layers` lists amenity catalog slugs (no restriction buffers)
5. `GET /bike-parking` / `/ev-chargers` / `/drinking-fountains` / `/bathing-waters` return FeatureCollections
6. `GET /trees` without bbox/district → 400; with bbox → features
7. `GET /analyses/nearest-amenities?lon=13.405&lat=52.52` → `nearest` array with distances
8. `GET /analyses/amenity-density-by-borough` → 12 (or sample) borough rows
9. UI: click map → nearest panel; sidebar density table populates
