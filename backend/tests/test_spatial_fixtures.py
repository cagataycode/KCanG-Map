"""Known-answer fixtures for EPSG:25833 metric ops and 100 m KCanG buffers."""

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


def test_hundred_metre_buffer_contains_point_at_50m():
    """Point 50 m east of a school seed is inside ST_Buffer(..., 100)."""
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        inside = conn.execute(
            text(
                """
                WITH school AS (
                  SELECT ST_SetSRID(ST_MakePoint(390000, 5820000), 25833) AS geom
                ),
                buf AS (
                  SELECT ST_Buffer(geom, 100) AS geom FROM school
                ),
                probe AS (
                  SELECT ST_SetSRID(ST_MakePoint(390050, 5820000), 25833) AS geom
                )
                SELECT ST_Contains(buf.geom, probe.geom) FROM buf, probe
                """
            )
        ).scalar()
    assert inside is True


def test_hundred_metre_buffer_excludes_point_at_150m():
    """Point 150 m east of a school seed is outside ST_Buffer(..., 100)."""
    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        inside = conn.execute(
            text(
                """
                WITH school AS (
                  SELECT ST_SetSRID(ST_MakePoint(390000, 5820000), 25833) AS geom
                ),
                buf AS (
                  SELECT ST_Buffer(geom, 100) AS geom FROM school
                ),
                probe AS (
                  SELECT ST_SetSRID(ST_MakePoint(390150, 5820000), 25833) AS geom
                )
                SELECT ST_Contains(buf.geom, probe.geom) FROM buf, probe
                """
            )
        ).scalar()
    assert inside is False
