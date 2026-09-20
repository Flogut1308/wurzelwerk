# fixtures/import/v1/ — LIESMICH

`gueltig/eigenstaendig/` enthält Importdateien, die gegen ein **frisches, leeres** Projekt
fehlerfrei durchlaufen — keine `db:`-Referenz auf eine bereits vorhandene Person, jedes
referenzierte Medium liegt daneben. `gueltig/braucht-bestand/` enthält Importdateien, die
**voraussetzen**, dass eine bestimmte Person bereits im Projekt existiert (`beispiel-3-interview.json`
referenziert eine feste `db:`-Kennung) — sie schlagen in einem frischen Projekt absichtlich mit
`IMP-202` fehl, bis diese Person angelegt wurde. Zum Ausprobieren zuerst eine Datei aus
`eigenstaendig/` importieren (z. B. `beispiel-1-einfach.json`); `fehlerhaft/` bleibt unverändert
und dient ausschließlich den Fehlercode-Tests (jede Datei dort verletzt genau eine Regel
absichtlich, kein Import-Kandidat).
