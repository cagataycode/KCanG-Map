import json
from pathlib import Path
from time import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import check_db
from app.routers import analyses, layers

app = FastAPI(title="Berlin Amenities Map API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(layers.router)
app.include_router(analyses.router)

# #region agent log
_DEBUG_LOGS = [
    Path("/Users/cagatayuslu/projects/postgis-berlin/.cursor/debug-fdc9ac.log"),
    Path("/tmp/debug-fdc9ac.log"),
]


def _write_debug(row: dict[str, Any]) -> None:
    line = json.dumps(row, ensure_ascii=False) + "\n"
    print(f"[debug-fdc9ac] {line}", flush=True)
    for path in _DEBUG_LOGS:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(line)
                fh.flush()
        except Exception as exc:  # noqa: BLE001
            print(f"[debug-fdc9ac] write failed {path}: {exc}", flush=True)


@app.post("/debug/client-log")
def debug_client_log(payload: dict[str, Any]) -> dict[str, str]:
    """Debug-mode sink so browser logs persist even if the ingest proxy is down."""
    try:
        _write_debug(
            {
                "sessionId": "fdc9ac",
                "timestamp": int(time() * 1000),
                **payload,
            }
        )
    except Exception:
        return {"status": "error"}
    return {"status": "ok"}


# #endregion


@app.get("/health")
def health() -> dict:
    try:
        return {"status": "ok", **check_db()}
    except Exception as exc:  # noqa: BLE001
        return {"status": "degraded", "error": str(exc)}
