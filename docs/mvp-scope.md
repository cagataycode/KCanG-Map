# MVP scope

Primary UX: map of **Berlin open-data amenities** + click-to-nearest. Distances are Euclidean metres in EPSG:25833 — not walking or legal advice.

## Map and layers

- Context: districts, neighborhoods (Ortsteile), green spaces (parks), schools.
- Amenities: street trees, bike parking, EV chargers, drinking fountains, bathing waters, public toilets, playgrounds, sports facilities (toggleable).
- Trees are **off by default** and only fetch/render at **zoom ≥ 14** with bbox and/or borough filter — never dump the full city inventory to the browser.
- Click map → Nearby tab (one hit per layer, distances).
- Sidebar: grouped layers stay visible; a task slot switches among **Nearby**, **Compare**, and **Query**. Amenity counts, green cover, and school–park proximity live under Compare (one measure at a time). SQL appears when the user pins it.

## SQL learning

- The Query tab is one document: the statement opened from a layer **Query** or **Show query** (`GET /sql/{name}`, `sql_ref` on responses). Map pans and clicks do not overwrite it.
- **Fill from map** substitutes named binds (`:minx`, `:lon`, `:district_id`, …) from the viewport, last click, and borough filter. **Run** / **Explain** fill remaining binds if needed, then call the SELECT-only playground (`POST /sql/run`); they do not rename the document. Optional map overlay when results include GeoJSON geometry.

## Analyses

1. **Nearest amenities (point)** — transform lon/lat → 25833; KNN (`<->`) per layer; return name + distance_m.
2. **Amenity density by borough** — feature counts per district for point amenity layers.
3. **Green by borough** — mapped park area share of district.
4. **School–green proximity** (secondary) — median / p90 distance from schools to nearest park.

## UX

Keyboard-accessible controls; don’t rely on color alone; readable units/dates; usable narrow layout (map above, pane below); `prefers-reduced-motion`.
