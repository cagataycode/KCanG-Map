# Berlin Amenities Map

PostGIS learning app: **mapped Berlin open-data amenities** — parks, trees, daycare, hospitals, mobility, and more.

**Stack:** Docker PostGIS · FastAPI · SQLAlchemy 2 / GeoAlchemy2 · Alembic · Vite / React / MapLibre

**Data:** 100% official Berlin open data (daten.berlin.de / Geoportal Berlin WFS) — full source list with links and licenses: [docs/data-sources.md](docs/data-sources.md)

Product docs: [docs/overview.md](docs/overview.md) · [mvp-scope](docs/mvp-scope.md) · [data-sources](docs/data-sources.md) · [technical-requirements](docs/technical-requirements.md)

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
# Skip tree inventories for a faster first open-data import:
# python -m scripts.import_layers --layers districts,green_spaces,schools,bike_parking,ev_chargers,drinking_fountains,bathing_waters,toilets,playgrounds,sports_facilities,kitas,hospitals,cemeteries,park_and_ride
# (omit trees/park_trees for a quick smoke run — full tree import is large)

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
| `neighborhoods` | Ortsteil polygons (map context) |
| `green_spaces` | Public parks (polygons) |
| `cemeteries` | Cemetery polygons |
| `schools` | Context for school↔green proximity |
| `kitas` | Daycare centres |
| `hospitals` | Hospital sites (plan + other) |
| `trees` | Street trees (bbox-scoped on the map) |
| `park_trees` | Park / green-space trees (bbox-scoped) |
| `bike_parking` | Bike parking points |
| `ev_chargers` | EV charging sites |
| `drinking_fountains` | Public drinking fountains |
| `bathing_waters` | Official bathing sites |
| `toilets` | Public toilets |
| `playgrounds` | Playground polygons |
| `sports_facilities` | Sports sites |
| `park_and_ride` | Park & Ride sites |

All geometries EPSG:25833; sources per layer: [docs/data-sources.md](docs/data-sources.md). Each feature keeps full source properties in `attrs` (jsonb).

## Analyses

1. **Nearest amenities** — `GET /analyses/nearest-amenities?lon=&lat=`  
2. **Amenity density by borough** — counts per district  
3. **Green by borough** — mapped park area share  
4. **School–green proximity** — secondary distance summary  

## Tests

```bash
cd backend && source .venv/bin/activate
pytest -q        # DB-backed tests need the database up (docker compose up -d); they skip cleanly otherwise
```

Visible SQL: [backend/sql/](backend/sql/) — explore with ready Patterns, the schema Glossary, and free SQL in the Query tab. Smoke checklist: [docs/smoke-test.md](docs/smoke-test.md).
