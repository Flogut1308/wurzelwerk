## ADR-002 — Datenhaltung: SQLite als Primärspeicher im Projektordner

**Status:** entschieden

**Entscheidung:** Eine SQLite-Datei im WAL-Modus als Arbeitsformat, in einem Projektordner
mit Medien, Snapshots und einem deterministischen Klartext-Export. Details: `50_Datenmodell.md` §3.

**Begründung:** Transaktionale Sicherheit über viele verknüpfte Entitäten, FTS5 für
Volltextsuche, `VACUUM INTO` für konsistente Sicherungen im laufenden Betrieb, ein Dateiobjekt,
das der Nutzer kopieren kann.

**Verworfene Alternative:** eine Datei pro Person (JSON/YAML, git-freundlich). Verlockend für
Diffs, aber ohne Volltextindex, ohne transaktionales Schreiben über mehrere Dateien, mit
katastrophaler Ladezeit bei vielen Dateien. Der Git-Vorteil wird billiger erreicht: ein
deterministisch sortierter GEDCOM-7- oder JSONL-Export wird mitgeschrieben und ist
versionierbar.

**Konsequenzen:** Projektordner darf nicht in Dropbox/iCloud/OneDrive liegen (Korruptionsrisiko,
WAL auf Netzlaufwerken unzuverlässig) — die App warnt beim Öffnen eines Projekts in einem
erkannten Sync-Ordner.
