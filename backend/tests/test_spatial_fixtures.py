"""Known-answer fixtures for EPSG:25833 metric ops and KNN distance."""

from sqlalchemy import create_engine, text

from app.config import settings


def test_metric_distance_epsg25833():
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        dist = conn.execute(
            text(
                """
                SELECT ST_Distance(
                  ST_SetSRID(ST_MakePoint(390000, 5820000), 25833),
                  ST_SetSRID(ST_MakePoint(391000, 5820000), 25833)
                )
                """
            )
        ).scalar()
    assert dist is not None
    assert abs(float(dist) - 1000.0) < 0.01


def test_metric_area_epsg25833():
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        area = conn.execute(
            text(
                """
                SELECT ST_Area(
                  ST_SetSRID(
                    ST_GeomFromText('POLYGON((390000 5820000, 391000 5820000, 391000 5821000, 390000 5821000, 390000 5820000))'),
                    25833
                  )
                )
                """
            )
        ).scalar()
    assert area is not None
    assert abs(float(area) - 1_000_000.0) < 1.0


def test_knn_nearest_of_two_points():
    """KNN (<->) picks the closer of two amenity points."""
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        dist = conn.execute(
            text(
                """
                WITH amenity AS (
                  SELECT ST_SetSRID(ST_MakePoint(390000, 5820000), 25833) AS geom
                  UNION ALL
                  SELECT ST_SetSRID(ST_MakePoint(391000, 5820000), 25833)
                ),
                probe AS (
                  SELECT ST_SetSRID(ST_MakePoint(390100, 5820000), 25833) AS geom
                )
                SELECT ST_Distance(a.geom, probe.geom)
                FROM amenity a, probe
                ORDER BY a.geom <-> probe.geom
                LIMIT 1
                """
            )
        ).scalar()
    assert dist is not None
    assert abs(float(dist) - 100.0) < 0.01


def test_point_on_surface_multipoint():
    """MultiPoint sites (e.g. EV chargers) reduce to a usable point."""
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        gtype = conn.execute(
            text(
                """
                SELECT GeometryType(
                  ST_PointOnSurface(
                    ST_GeomFromText('MULTIPOINT(390000 5820000, 390010 5820000)', 25833)
                  )
                )
                """
            )
        ).scalar()
    assert gtype == "POINT"
