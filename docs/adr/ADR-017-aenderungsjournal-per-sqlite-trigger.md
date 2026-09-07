## ADR-017 — Änderungsjournal per SQLite-Trigger, ganze Zeilen als JSON

**Status:** entschieden · **ergänzt ADR-003**

**Entscheidung:** Das Journal wird von SQLite-Triggern geschrieben, nicht von Anwendungscode.
Je journalisierte Tabelle drei Trigger (AFTER INSERT/UPDATE/DELETE), erzeugt von
`skripte/trigger-generieren.ts`. Gespeichert wird die **ganze Zeile** als JSON in
`wert_alt_json` / `wert_neu_json`; Feld-Diffs werden für die Anzeige berechnet. Die Zuordnung
zur laufenden Transaktion läuft über eine Tabelle `journal_kontext`; `aenderung.transaktion_id`
ist `NOT NULL` mit Fremdschlüssel.

**Begründung:**
1. **Ein Trigger kann nicht vergessen werden.** Er hängt an der Tabelle, nicht am Aufrufpfad. Anwendungscode, der das Journal mitschreibt, ist in einem KI-gestützten Projekt garantiert irgendwann lückenhaft — und ein vergessener Eintrag führt nicht zu einem Fehler, sondern zu einem Undo, das *fast* funktioniert. Das ist die schlimmste Fehlerklasse: still, spät, datenzerstörend.
2. **`NOT NULL` + Fremdschlüssel machen einen Schreibvorgang ohne armierte Transaktion unmöglich**, nicht bloß verboten. Das ist die stärkste Absicherung der ganzen Architektur und kostet eine Spaltendefinition.
3. **Ganze Zeilen machen die Umkehrung trivial korrekt.** Die Invariante „Undo stellt bitgleich wieder her" (ADR-009 Punkt 2) ist damit strukturell erfüllt und nicht nur hoffentlich. Bei Feld-Diffs fällt ein vergessenes Feld niemandem auf.
4. **Ein generischer Trigger je Tabelle statt einer Verzweigung je Spalte.** Feld-Diffs im Trigger bedeuten bei `name` mit 18 Spalten 18 `CASE`-Zweige erzeugten Code, den niemand prüft.

**Konsequenzen:** Das Journal wird größer (etwa Faktor 10 gegenüber Feld-Diffs; bei 50.000
Änderungen ~40 MB statt ~4 MB — bei einer Datei mit Fotos kein Argument, und die Begrenzung
deckelt es). Trigger sind im Debugger unsichtbar. `50_Datenmodell.md` §2.10 wird angepasst.
`journal_kontext.aktiv = 0` gibt es an genau drei Stellen: Migration, Undo/Redo, Großimport —
namentlich aufgeführt in einem Test, der bei einer vierten Stelle rot wird.
