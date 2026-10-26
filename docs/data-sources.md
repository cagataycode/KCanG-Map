# Data sources

## Layers

| Layer | Source | Role |
| --- | --- | --- |
| Districts | [Bezirksgrenzen](https://daten.odis-berlin.de/de/dataset/bezirksgrenzen/) | Borough filter / coverage denominator |
| Green spaces | [Grünanlagen WFS](https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4) | Parks (polygons) |
| Schools | [Schulen WFS](https://daten.berlin.de/datensaetze/schulen-wfs-ebc64e18) | Context for school↔green proximity |
| Trees | [Baumbestand WFS](https://daten.berlin.de/datensaetze/baumbestand-berlin-wfs-48ad3a23) (`baumbestand:strassenbaeume`) | Street trees |
| Bike parking | [Fahrradabstellanlagen WFS](https://daten.berlin.de/datensaetze/fahrradabstellanlagen-seit-2021-wfs-4f226c23) | Bike racks |
| EV chargers | [Elektro-Ladesäulen WFS](https://daten.berlin.de/datensaetze/elektro-ladesaulen-und-ladepunkte-wfs-f306dd51) (`eladesaeulen:lades_standorte`) | Charging sites |
| Drinking fountains | [Trinkwasserbrunnen WFS](https://daten.berlin.de/datensaetze/trinkwasserbrunnen-wfs-47dba2c3) | Public fountains |
| Bathing waters | [Badegewässerqualität WFS](https://daten.berlin.de/datensaetze/badegewasserqualitat-wfs-6ba85d36) (`badegewaesser:aa_badestellen`) | Official bathing sites (cc-by) |

Most layers: **dl-de/zero-2.0**. Bathing waters: **cc-by/4.0** (attribute LAGeSo / Geoportal Berlin).

## Known gaps

Park trees (`anlagenbaeume`) not imported in MVP; fountain seasonality; private bike racks / chargers; routing distance.

## Schema

`dataset_catalog` 1:N facilities; features → `district_id` at import (`ST_Within` / point-on-surface).
