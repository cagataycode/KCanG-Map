import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers.sql import _validate_select


client = TestClient(app)


def test_validate_select_allows_with():
    sql = _validate_select("WITH x AS (SELECT 1 AS n) SELECT * FROM x")
    assert "WITH x AS" in sql


def test_validate_select_rejects_writes():
    with pytest.raises(HTTPException) as exc:
        _validate_select("DELETE FROM trees")
    assert exc.value.status_code == 400


def test_validate_select_rejects_multi_statement():
    with pytest.raises(HTTPException) as exc:
        _validate_select("SELECT 1; SELECT 2")
    assert exc.value.status_code == 400


def test_get_sql_file():
    res = client.get("/sql/trees_geojson.sql")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "trees_geojson.sql"
    assert "FROM trees" in body["sql"]


def test_get_sql_file_rejects_path_traversal():
    res = client.get("/sql/../main.py")
    assert res.status_code == 404


def test_run_sql_select():
    res = client.post("/sql/run", json={"sql": "SELECT 1 AS n", "explain": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["columns"] == ["n"]
    assert body["rows"] == [[1]]
    assert body["explain"] is False
