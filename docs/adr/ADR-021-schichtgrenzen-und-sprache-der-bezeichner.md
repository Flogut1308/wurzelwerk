## ADR-021 — Schichtgrenzen und Sprache der Bezeichner

**Status:** entschieden · **konkretisiert ADR-009 Punkt 8**

**Entscheidung, Teil 1 — Grenzen:** Fünf Wurzelverzeichnisse mit einer erlaubten
Abhängigkeitsrichtung: `core` → nichts · `shared` → `core` · `main`/`renderer` → `core` +
`shared` · `preload` → nur `shared`. Innerhalb von `main`: nur `befehle/` öffnet Transaktionen,
nur `repositories/` und `abfragen/` schreiben SQL. `src/core/` darf `Math.random`, `Date.now`,
`new Date()` und `process` nicht verwenden. Durchgesetzt von dependency-cruiser und ESLint in
der CI. Kein `utils/`, kein `services/`, kein globaler Datenspeicher im Renderer — jeder dieser
Ordner ist eine Einladung, die Schichtung zu unterlaufen, und jede Einladung wird angenommen.

**Entscheidung, Teil 2 — Bezeichner:** **Fachbegriffe deutsch, Technik englisch.**
`personAnlegen`, `Elternschaft`, `geburtsdatumSortVon` — aber `Result`, `Tx`, `Repository`,
`Handler`, `Migration`, `Cache`.

**Begründung Teil 2:** Das Datenbankschema ist deutsch (`50_Datenmodell.md`). Eine
Übersetzungsschicht zwischen Schema und Code wäre eine ständige Fehlerquelle — genau die Art
Fehler, die KI beim Umbenennen einstreut (`parent` ↔ `elternteil` ↔ `vater`). Technische
Begriffe bleiben englisch, weil sie aus den Bibliotheken kommen und eine Eindeutschung dort nur
Verwirrung stiftet.
