# Overview

**Berlin Cannabis Zone Map** — PostGIS learning app that maps **KCanG § 5** public-consumption restriction zones in Berlin.

Click the map to see whether a point falls inside a **mapped 100 m buffer** around schools, playgrounds, Kitas, or public sports facilities. This is **mapped restriction coverage**, not legal advice and never a “you may consume here” warrant.

Parks / Grünanlagen are **not** blanket-banned under § 5; only listed facility types (and Fußgängerzonen 07:00–20:00, not modeled yet) are.

## Tech stack

| Layer | Choice |
| --- | --- |
| Database | PostgreSQL + PostGIS |
| Backend | FastAPI + SQLAlchemy 2 / GeoAlchemy2; SQL in `backend/sql/` |
| Migrations | Alembic |
| Import | Offline WFS / GeoJSON → PostGIS |
| Frontend | Vite + React + MapLibre |

## Legal model (summary)

Per [§ 5 KCanG](https://www.gesetze-im-internet.de/kcang/__5.html) / [BMG FAQ](https://www.bundesgesundheitsministerium.de/themen/cannabis/faq-cannabisgesetz/):

- Ban at schools, playgrounds, children/youth facilities, public sports facilities + **Sichtweite**
- Sichtweite ends beyond **100 m** from the **entrance area**
- Also: no consumption in immediate presence of minors; Fußgängerzonen 07:00–20:00

**App approximation:** `ST_Buffer(facility_geom, 100)` in EPSG:25833 (geometry ≠ surveyed entrance).

## Goals

1. Show mapped 100 m restriction buffers from open Berlin inventories.
2. Point-check and borough coverage analyses in PostGIS.
3. Keep provenance, caveats, and “not legal advice” visible.
4. Demonstrate schema, spatial SQL, GiST, and buffer/union workflows.

## Non-goals

Legal certainty; modeling minors’ presence; Fußgängerzone clock (MVP gap); Anbauvereinigungen; treating all parks as banned; production multi-tenant.

## Docs

[MVP scope](mvp-scope.md) · [Data sources](data-sources.md) · [Technical requirements](technical-requirements.md)
