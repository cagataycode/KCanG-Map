# MVP scope

Primary UX: map of **mapped KCanG § 5 restriction buffers** + click-to-check. Verdict labels: `likely_restricted` | `outside_mapped_buffers` | `unknown` — never “legal to consume.”

## Map and layers

- Facilities: schools, playgrounds, Kitas, public sports (toggleable).
- Derived: 100 m restriction buffers (EPSG:25833).
- Optional context: districts, parks (not a ban rule).
- Click map → consumption check panel (nearest facilities, distances, caveats).
- Persistent disclaimer: not legal advice; buffer approximates entrance rule; incomplete inventories; minors rule unmapped; no Fußgängerzone time engine yet.

## Analyses

1. **Consumption check (point)** — transform lon/lat → 25833; test against `restriction_buffers`; return status + nearest hits.
2. **Borough restriction coverage** — % of district area intersecting buffer union (mapped density, not “safest borough”).

## UX

Keyboard-accessible controls; don’t rely on color alone; readable units/dates; usable narrow layout; `prefers-reduced-motion`.
