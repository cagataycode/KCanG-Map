# Smoke test

1. `alembic upgrade head`
2. `python -m scripts.import_layers --source samples`
3. `GET /health` → ok + PostGIS
4. `GET /layers` lists amenity catalog slugs (no restriction buffers)
5. `GET /bike-parking` / `/ev-chargers` / `/drinking-fountains` / `/bathing-waters` / `/toilets` / `/playgrounds` / `/sports-facilities` return FeatureCollections
6. `GET /trees` without bbox/district → 400; with bbox → features
7. `GET /analyses/nearest-amenities?lon=13.405&lat=52.52` → `nearest` array with distances (incl. toilets / playgrounds / sports)
8. `GET /analyses/amenity-density-by-borough` → 12 (or sample) borough rows
9. UI: click map → Nearby tab fills; layer toggles for toilets / playgrounds / sports; Compare measure rows populate; clicking a borough filters and focuses the map
10. Trees stay off until zoom ≥ 14 when enabled (row shows “Zoom to 14”); Query: open a ready **pattern**, **Run** draws GeoJSON and syncs layer filters; **Glossary** lists tables/fields; EXPLAIN on a bbox pattern can show a GiST index when zoomed in; layer **Query** / **Show query** load into the same editor; binds stay as `:name` and fill only at run time; `POST /sql/run` accepts SELECT / rejects writes
11. Toggle Neighborhoods → lighter Ortsteil borders + names (zoom ≥ 11); `GET /neighborhoods` returns FeatureCollection
