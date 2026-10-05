from pathlib import Path

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


def load_sql(name: str) -> str:
    path = SQL_DIR / name
    return path.read_text(encoding="utf-8")
