## ADR-020 — Migrationen nur vorwärts, mit Prüfsumme und Fixture je Version

**Status:** entschieden

**Entscheidung:** Eine Schemaversion ist eine numerierte SQL-Datei in `docs/schema/`. Der
Versionszähler ist `PRAGMA user_version`, gesetzt **innerhalb derselben Transaktion** wie die
Migration. Zusätzlich eine Tabelle `schema_migration` mit Datei, Prüfsumme, Zeitpunkt und
App-Version. Keine Rückwärtsmigrationen. Vor jeder Migration ein Schnappschuss. Trigger werden
am Ende jeder Migration gelöscht und neu erzeugt. Für jede Version liegt eine
Fixture-Datenbank mit echten Beispieldaten im Repository.

**Begründung:**
1. **Keine `down`-Migrationen:** Sie werden geschrieben, nie ausgeführt, nie getestet — und im Notfall stellt sich heraus, dass sie Daten verwerfen, die es beim Schreiben noch nicht gab. Der Schnappschuss ist bitgenau, braucht keinen Code und funktioniert auch für Migrationen, an die niemand gedacht hat.
2. **Die Prüfsumme ist die Zeile, die KI-gestützte Entwicklung braucht.** Der typische Vorfall: Migration 0002 ist in echten Projektdateien angewendet, jemand „korrigiert" sie nachträglich, und ab dann haben neue und alte Projekte unterschiedliche Schemata bei identischer Versionsnummer. Praktisch nicht mehr zu entwirren. Mit Prüfsumme fällt es beim nächsten Öffnen auf.
3. **Der wertvollste Test ist die Schemagleichheit:** Das Schema einer migrierten Datei muss dem einer frisch angelegten entsprechen. Er fängt genau die Fehlerklasse, bei der die Migration eine Spalte anders hinzufügt als die Neuanlage.

**Konsequenz:** Eine angewendete Migration wird nie geändert, auch nicht kosmetisch. Eine neue
Migration ohne neue Fixture-Datenbank macht einen Test rot.
