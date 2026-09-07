## ADR-022 — Zustandsverwaltung im Renderer, Auto-Speicherung ohne Puffer

**Status:** entschieden

**Entscheidung:** Vier streng getrennte Zustandsarten: Datenbestand (SQLite, gelesen über
TanStack Query — ein **Cache**, kein Speicher) · Projektzustand (SQLite, `ansicht_zustand`) ·
Sitzungszustand (Zustand-Bibliothek, nur Speicher) · Entwurf (React-Komponentenzustand,
zwischen Tastendruck und Übernahme). **Keine optimistischen Aktualisierungen in Phase 0 und 1.**
Kein Speichern-Knopf: Ein Befehl kehrt erst zurück, wenn seine Transaktion committet ist.

**Begründung:**
- Der häufigste Architekturfehler in Electron-Apps ist, Datenbestand in den globalen Frontend-Speicher zu kopieren und dort zu pflegen. Dann gibt es zwei Wahrheiten, und die im Speicher gewinnt gelegentlich.
- Auto-Speicherung (F-01) ist damit keine Funktion, sondern eine **Abwesenheit**: Es gibt keinen ungespeicherten Zustand, also auch keinen Dialog „Änderungen verwerfen?" und keinen Zeitgeber, der ausfallen kann.
- Optimistische Aktualisierungen brächten Rücknahmelogik in den Renderer — also eine zweite, schlechtere Undo-Mechanik neben ADR-018. Bei einem lokalen Rundlauf unter 5 ms ist der Gewinn null.
- Der Speicherstatus in der Fußzeile hat drei Zustände, und der dritte (`fehler`) ist der wichtigste: **eine Auto-Speicherung, die stillschweigend scheitert, ist schlimmer als ein Speichern-Knopf.**

**Konsequenz:** Der Entprellwert beim Tippen (800 ms) muss kleiner sein als das
Koaleszenzfenster (2.000 ms, ADR-018), sonst wird ein Satz zu mehreren Undo-Schritten. Beim
Fensterschließen fordert der Hauptprozess die Übernahme offener Entwürfe an und wartet maximal
2.000 ms.
