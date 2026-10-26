# MVP scope

Primary UX: map of **Berlin open-data amenities** + click-to-nearest. Distances are Euclidean metres in EPSG:25833 — not walking or legal advice.

## Map and layers

- Context: districts, green spaces (parks), schools.
- Amenities: street trees, bike parking, EV chargers, drinking fountains, bathing waters (toggleable).
- Trees load with bbox and/or borough filter (and prefer higher zoom) — never dump the full city inventory to the browser.
- Click map → nearest amenities panel (one hit per layer, distances).
- Sidebar: amenity counts by borough; green cover by borough.

## Analyses

1. **Nearest amenities (point)** — transform lon/lat → 25833; KNN (`<->`) per layer; return name + distance_m.
2. **Amenity density by borough** — feature counts per district for point amenity layers.
3. **Green by borough** — mapped park area share of district.
4. **School–green proximity** (secondary) — median / p90 distance from schools to nearest park.

## UX

Keyboard-accessible controls; don’t rely on color alone; readable units/dates; usable narrow layout; `prefers-reduced-motion`.
