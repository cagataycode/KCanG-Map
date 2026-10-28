# EXPLAIN note (hot spatial query)

After importing sample or WFS data, run:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT g.id
FROM green_spaces g
WHERE g.geom && ST_Transform(ST_MakeEnvelope(13.3, 52.45, 13.5, 52.55, 4326), 25833);
```

Expected: an **Index Scan** using `ix_green_spaces_geom` (GiST), not a sequential scan of the whole table, once the table has more than a trivial number of rows. Bounding the request by viewport (or borough) keeps map payloads small; loading every Berlin polygon (or every street tree) into the browser does not scale.

For trees, always pass a bbox (or district filter):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.id
FROM trees t
WHERE t.geom && ST_Transform(ST_MakeEnvelope(13.38, 52.50, 13.42, 52.53, 4326), 25833);
```

Schema relationships:

- `dataset_catalog` 1:N feature tables (provenance once)
- `districts` 1:N features via `district_id` assigned at import (`ST_Within` / point-on-surface)
- Full source attributes live in `attrs` (jsonb) and are merged into GeoJSON properties
