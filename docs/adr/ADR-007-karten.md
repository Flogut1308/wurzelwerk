## ADR-007 — Karten: MapLibre GL + PMTiles, offline im Anwendungsordner

**Status:** entschieden

**Entscheidung:** MapLibre GL JS mit **PMTiles** (eine einzige Datei, per Range-Request lesbar,
kein Tile-Server). Basiskarte: Protomaps Basemaps (Code BSD, Daten ODbL — OSM-Attribution
Pflicht). Für kleine Zoomstufen zusätzlich **Natural Earth** (Public Domain, wenige MB) als
immer mitgeliefertes Minimum.

**Konsequenzen / offene Punkte:**
- In Electron über ein eigenes Protokoll oder einen lokalen Loopback-Handler laden. `[unverified]`, ob Range-Requests auf `file://` zuverlässig funktionieren — Custom-Protocol ist der sichere Weg.
- **GOV-Daten:** fachlich die richtige Quelle für historische deutsche Orte (zeitlich gültige Namen und Zugehörigkeiten, stabile IDs). Lizenz für Bulk-Download und Mitausliefern ist `[unverified]` — **vor jeder Auslieferung von GOV-Daten direkt bei CompGen klären**. Online-Abfrage widerspricht dem Offline-Ziel; Kompromiss: einmaliger, nutzerinitiierter Abgleich mit lokalem Cache.
- GeoNames (CC BY 4.0, Volldump) als Offline-Geocoder-Fallback, historisch schwach.
- Historische Kartenlayer (z. B. Messtischblätter) als eigene Raster-PMTiles; nur klar gemeinfreie Bestände mitliefern, ansonsten Nutzer eigene Dateien einbinden lassen.
