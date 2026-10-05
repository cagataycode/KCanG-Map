# KCanG-Map

PostGIS learning app: **mapped KCanG § 5** public-consumption restriction buffers in Berlin — not legal advice.

**Stack:** Docker PostGIS · FastAPI · SQLAlchemy 2 / GeoAlchemy2 · Alembic · Vite / React / MapLibre

Product docs: [docs/overview.md](docs/overview.md) · [mvp-scope](docs/mvp-scope.md) · [data-sources](docs/data-sources.md) · [technical-requirements](docs/technical-requirements.md)

Legal basis: [§ 5 KCanG](https://www.gesetze-im-internet.de/kcang/__5.html) · [BMG FAQ](https://www.bundesgesundheitsministerium.de/themen/cannabis/faq-cannabisgesetz/)

## Quick start

```bash
# 1. Env
cp .env.example .env

# 2. Database (pick one)
docker compose up -d
# OR local Homebrew Postgres + PostGIS:
#   createdb berlin && psql -d berlin -c "CREATE EXTENSION postgis;"
#   then set DATABASE_URL=postgresql+psycopg://YOUR_USER@localhost:5432/berlin in .env

# 3. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m scripts.import_layers                 # Berlin open data → PostGIS (default)
# python -m scripts.import_layers --source samples  # tiny offline fixtures only

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- API: http://localhost:8000/docs  
- App: http://localhost:5173  

No external API keys. Only local `DATABASE_URL` in `.env` (gitignored).

## Schema

| Table | Role |
| --- | --- |
| `dataset_catalog` | Provenance, vintage, caveats |
| `districts` | Borough polygons (EPSG:25833) |
| `schools` / `playgrounds` / `kitas` / `sports_facilities` | § 5 ban seeds |
| `restriction_buffers` | `ST_Buffer(facility, 100)` in EPSG:25833 |
| `restriction_union` | Unary union for coverage stats |
| `green_spaces` | Optional context — **not** a ban rule |

Verdict labels: `likely_restricted` | `outside_mapped_buffers` | `unknown` — never “legal to consume here.”

## Analyses

1. **Consumption check** — `GET /analyses/consumption-check?lon=&lat=`  
2. **Borough buffer coverage** — share of district area intersecting mapped buffers  

Parks are not blanket-banned under § 5. Fußgängerzonen 07:00–20:00 and presence of minors are not modeled.

## Tests

```bash
cd backend && source .venv/bin/activate
pytest -q
```

Visible SQL: [backend/sql/](backend/sql/). Smoke checklist: [docs/smoke-test.md](docs/smoke-test.md).
