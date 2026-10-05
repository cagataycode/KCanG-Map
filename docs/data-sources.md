# Data sources

## Ban-rule layers (KCanG § 5 modeled)

| Layer | Source | Role |
| --- | --- | --- |
| Schools | [Schulen WFS](https://daten.berlin.de/datensaetze/schulen-wfs-ebc64e18) | 100 m buffer seed |
| Playgrounds | WFS `gruenanlagen:spielplaetze` | 100 m buffer seed |
| Kitas | [Kindertagesstätten WFS](https://daten.berlin.de/datensaetze/kindertagesstatten-wfs-d03b94d2) | 100 m buffer seed (publicly funded inventory) |
| Public sports | [Sportanlagen WFS](http://daten.berlin.de/datensaetze/standorte-offentlicher-sportanlagen-wfs-a291318f) | 100 m buffer seed (land-owned Kernsportanlagen) |

Derived in PostGIS: `restriction_buffers` = `ST_Buffer(geom, 100)` in EPSG:25833; optional `restriction_union`.

**Caveat:** law references **Eingangsbereich**; we buffer facility geometry as a conservative mapped approximation.

## Context (not ban rules)

| Layer | Role |
| --- | --- |
| Districts | Borough filter / coverage denominator |
| Green parks (`gruenanlagen`) | Optional context — **not** blanketed banned under § 5 |

## Known gaps

Fußgängerzonen 07:00–20:00; Anbauvereinigungen; private/incomplete inventories; presence of minors.

## Schema

`dataset_catalog` 1:N facilities; facilities → `district_id` at import; `restriction_buffers` derived after load.
