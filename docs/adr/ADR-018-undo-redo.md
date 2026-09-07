## ADR-018 — Undo/Redo: linear, aus dem Journal abgeleitet

**Status:** entschieden

**Entscheidung:** `transaktion` bekommt `status` (`angewendet` · `zurueckgenommen` ·
`verworfen`), `lfd`, `rueckgaengig_moeglich`, `snapshot_pfad`, `koaleszenz_schluessel`.
Undo-Ziel und Redo-Ziel sind **Abfragen**, kein Stapel im Arbeitsspeicher. Ein neuer Befehl
verwirft den Redo-Stapel (lineare Historie). Innerhalb der Undo-Transaktion gilt
`PRAGMA defer_foreign_keys = ON`, und das Journal ist abgeschaltet. Aufeinanderfolgende
Änderungen am gleichen Feld werden bei gleichem `koaleszenz_schluessel` innerhalb von 2.000 ms
zu einem Undo-Schritt verdichtet.

**Begründung:**
- Weil der Stapel eine Abfrage ist, ist F-03 („Undo über den Programmneustart hinweg") ohne eine Zeile Serialisierungscode erfüllt.
- **`defer_foreign_keys` ist die wichtigste Zeile des Mechanismus.** Legt eine Transaktion zwei sich gegenseitig referenzierende Datensätze an, gibt es keine schrittweise gültige Rückwärtsreihenfolge. Ohne das Pragma funktioniert Undo in etwa 95 % der Fälle — und genau das macht den Fehler teuer.
- Lineare Historie statt Historienbaum: Ein Baum müsste auch bedienbar sein, und niemand bedient ihn.
- Abgeleitete Tabellen werden nie journalisiert, aber immer per Trigger gepflegt. Damit pflegt das rohe Zurückschreiben sie automatisch mit — das ist nicht Ästhetik, sondern Voraussetzung dafür, dass Undo überhaupt korrekt sein kann.

**Konsequenz:** Ein Undo mutiert den Journalstatus statt eine Gegenbuchung anzulegen. Das
Journal ist damit nicht anhangsfrei-unveränderlich. Bewusst: Es ist ein Undo-Stapel und eine
lesbare Historie, kein Beweismittel.
