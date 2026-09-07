## ADR-019 — Import: Rücknahme über Schnappschuss oder Journal, nach Schwellwert

**Status:** entschieden · **löst den Widerspruch zwischen ADR-003 und ADR-010 Punkt 4**

**Kontext:** ADR-003 sagt „bei Massenimporten Journal aus, Snapshot vorher". ADR-010 Punkt 4
sagt „ein Import ist als Ganzes rückgängig machbar". Ohne `aenderung`-Zeilen gibt es nichts zu
invertieren — beides gleichzeitig geht nicht.

**Entscheidung:** Schwellwert bei **500 geänderten Zeilen** (Vorgabe, siehe V5).
- Darunter: Journal an, `art = 'import'`, ein ganz normaler Undo-Schritt. Das ist der Regelfall in Phase 1 — ein Interviewprotokoll bringt selten mehr als ein paar Dutzend Personen.
- Darüber: Schnappschuss → Journal aus → eine Transaktion → Journal an → `snapshot_pfad` in der `transaktion`-Zeile. Rücknahme = Schnappschuss zurückspielen, nur solange der Import die neueste Transaktion ist, mit Bestätigungsdialog, der ausdrücklich sagt, dass der Redo-Stapel danach leer ist.
- Scheitert der Schnappschuss, wird nicht importiert.

**Begründung:** Der Nutzer erfährt die Art der Rücknahme **im Trockenlauf, vor dem Import** —
das ist die Information, die er für seine Entscheidung braucht. Die unbequeme Variante
(Schnappschuss) ehrlich zu benennen ist besser als eine bequeme Zusage, die nicht hält.

**Konsequenz:** `transaktion.snapshot_pfad` als neue Spalte. Der Herkunftsvermerk läuft über
`import_lauf` plus die `aenderung`-Zeilen der Transaktion; vor dem Aufräumen des Journals wird
die Zuordnung in `import_herkunft` festgeschrieben.
