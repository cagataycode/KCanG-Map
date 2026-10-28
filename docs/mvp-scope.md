# MVP scope

Primary UX: map of **Berlin open-data amenities** + click-to-nearest. Distances are Euclidean metres in EPSG:25833 — not walking or legal advice.

## Map and layers

- Context: districts, neighborhoods (Ortsteile), green spaces (parks), schools, cemeteries.
- Amenities: street trees, park trees, bike parking, EV chargers, drinking fountains, bathing waters, public toilets, playgrounds, sports facilities, daycare (Kitas), hospitals, Park & Ride (toggleable).
- Street and park trees are **off by default** and only fetch/render at **zoom ≥ 15** with a tight bbox and/or borough filter (capped server-side) — never dump the full city inventory to the browser.
- Click map → Nearby tab (one hit per layer, distances).
- Sidebar is a fixed viewport grid (no pane scroll): compact layer chips on top; task slot switches **Nearby** / **Compare** / **Query**. Compare holds amenity counts, green cover, and school–park proximity (one measure at a time).

## SQL playground

- Query is an **explore tool** for Berlin open data: pick a ready **pattern** (complete SELECT), edit freely, **Run** / **Explain**.
- **Glossary** lists every table and field (PK/FK notes); click a name to insert it into the editor. Patterns that use specific tables are highlighted in the glossary.
- Patterns live in `frontend/src/exercises.ts` (bbox, KNN nearest, joins, borough counts, park cover, trees in view). Layer **Query** / **Show query** also load into the same editor.
- Named binds (`:minx`, `:lon`, …) stay in the text and fill from the map at run time. **Run** syncs layer filters to tables in the SQL and draws GeoJSON on the map.

## Analyses

1. **Nearest amenities (point)** — transform lon/lat → 25833; KNN (`<->`) per layer; return name + distance_m.
2. **Amenity density by borough** — feature counts per district for point amenity layers.
3. **Green by borough** — mapped park area share of district.
4. **School–green proximity** (secondary) — median / p90 distance from schools to nearest park.

## UX

Keyboard-accessible controls; don’t rely on color alone; readable units/dates; usable narrow layout (map above, pane below); `prefers-reduced-motion`.
