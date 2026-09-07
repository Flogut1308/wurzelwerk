## ADR-003 — Änderungsverfolgung: Command Pattern mit Änderungsjournal

**Status:** entschieden

**Entscheidung:** Jede Nutzeraktion ist eine Transaktion, deren Feldänderungen mit alt/neu in
einer `aenderung`-Tabelle protokolliert werden. Undo wendet sie invers an.

**Begründung:** Liefert Undo, Redo, Audit-Trail und die Grundlage für umkehrbares
Zusammenführen aus einem Mechanismus. Volles Event Sourcing (Zustand nur aus Events
rekonstruierbar) wurde verworfen: es macht Abfragen und Layoutberechnung unnötig teuer.

**Konsequenzen:** Journalgröße muss begrenzt werden (Alter oder Anzahl). Bei Massenimporten
Journal aus, Snapshot vorher.
