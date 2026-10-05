-- Mapped KCanG buffer coverage by borough (not a safety ranking).
WITH clipped AS (
  SELECT
    d.id AS district_id,
    d.name AS district_name,
    d.geom AS dgeom,
    ST_Intersection(
      d.geom,
      COALESCE(
        (
          SELECT ST_UnaryUnion(ST_Collect(u.geom))
          FROM restriction_union u
          WHERE u.note = 'district_id=' || d.id::text
        ),
        (
          SELECT ST_UnaryUnion(ST_Collect(ST_Intersection(d.geom, b.geom)))
          FROM restriction_buffers b
          WHERE ST_Intersects(b.geom, d.geom)
        )
      )
    ) AS clipped
  FROM districts d
)
SELECT
  district_id,
  district_name,
  ST_Area(dgeom)::float AS district_area_m2,
  CASE
    WHEN clipped IS NULL OR ST_IsEmpty(clipped) OR ST_Area(dgeom) = 0 THEN 0
    ELSE ST_Area(clipped)::float
  END AS restricted_area_m2,
  CASE
    WHEN clipped IS NULL OR ST_IsEmpty(clipped) OR ST_Area(dgeom) = 0 THEN 0
    ELSE LEAST((ST_Area(clipped) / ST_Area(dgeom) * 100.0)::float, 100.0)
  END AS pct_mapped_restricted
FROM clipped
ORDER BY district_name;
