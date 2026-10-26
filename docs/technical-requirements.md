# Technical requirements

**Product:** Berlin Amenities Map — PostGIS amenity explorer.

**Stack:** FastAPI · SQLAlchemy/GeoAlchemy2 · PostGIS · Vite/MapLibre. Browser → API only. Analysis SQL in `backend/sql/`.

## Data layer

- Tables: `districts`, `neighborhoods`, `green_spaces`, `schools`, `trees`, `bike_parking`, `ev_chargers`, `drinking_fountains`, `bathing_waters`, `toilets`, `playgrounds`, `sports_facilities`, `dataset_catalog`.
- GiST on facility geoms (EPSG:25833).
- Imports transactional; `--layers` can skip heavy layers (e.g. trees) for smoke runs.
- Parameterized SQL only.
- `GET /trees` requires `bbox` and/or `district_id`.

## Acceptance

- Import samples (or open WFS) for amenity layers; ban/buffer tables absent.
- `GET /analyses/nearest-amenities` returns nearest hit per layer + distances.
- Amenity density and green-by-borough analyses return borough rows.
- UI: click map, toggle amenity layers, show provenance.
- Spatial fixture for KNN / metric distance; no client DB secrets.
