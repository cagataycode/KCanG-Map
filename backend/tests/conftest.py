"""Shared fixtures: skip db-marked tests when PostGIS is unreachable."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import engine


def _db_available() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


DB_AVAILABLE = _db_available()


@pytest.fixture(autouse=True)
def _skip_db_tests_when_offline(request: pytest.FixtureRequest) -> None:
    if request.node.get_closest_marker("db") and not DB_AVAILABLE:
        pytest.skip("requires live PostGIS")
