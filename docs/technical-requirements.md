# Technical requirements

**Product:** Berlin Cannabis Zone Map — mapped KCanG § 5 buffers via PostGIS.

**Stack:** FastAPI · SQLAlchemy/GeoAlchemy2 · PostGIS · Vite/MapLibre. Browser → API only. Analysis SQL in `backend/sql/`.

## Data layer

- Tables: `districts`, `schools`, `playgrounds`, `kitas`, `sports_facilities`, `green_spaces` (context), `restriction_buffers`, `dataset_catalog`.
- Buffers: `ST_Buffer(geom, 100)` in EPSG:25833; GiST on facility + buffer geoms.
- Imports transactional; rebuild buffers after facility load.
- Parameterized SQL only.

## Acceptance

- Import schools + playgrounds + kitas + sports; buffers present.
- `GET /analyses/consumption-check` returns verdict + nearest facilities.
- Borough coverage analysis returns % mapped buffer area.
- UI: click map, show disclaimer, toggle buffer/facility layers.
- Fixture for 100 m buffer distance; no client DB secrets.

## Verdict semantics

- `likely_restricted` — point within a mapped 100 m buffer
- `outside_mapped_buffers` — outside known buffers (still not a legal permit)
- `unknown` — missing data / query failure
