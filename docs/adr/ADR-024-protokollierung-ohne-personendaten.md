## ADR-024 — Protokollierung ohne Personendaten

**Status:** entschieden

**Entscheidung:** `electron-log`, rotierende Dateien in `app.getPath('logs')`. Protokolliert
werden **IDs, nie Inhalte**: Vorgangs-ID, Kanal, Befehlsname, Dauer, Fehlercode, Zeilenzahlen,
Schemaversion, Transaktions-ID. Nicht protokolliert werden Namen, Notizen, Transkripte,
Ortsnamen, Datumswerte, Diagnosetexte und Pfade innerhalb des Projektordners. Für die Tabellen
`diagnose` und `risikofaktor` gilt die Verschärfung, dass sie im Protokoll **nicht einmal
namentlich** erscheinen; der Logger ersetzt sie durch `<gesperrte_tabelle>`.

**Begründung:** Protokolldateien landen in Fehlerberichten, in Sicherungen und in
Bildschirmfotos. Gesundheitsdaten sind DSGVO-Sonderkategorie (Art. 9, siehe M-08), und aus einer
Protokolldatei sind sie praktisch nicht wieder herauszubekommen. Die Haushaltsausnahme deckt die
eigene Sammlung, nicht ein Protokoll, das man weitergibt.

**Konsequenz:** Ein Test fährt einen vollständigen Ablauf mit Fixture-Daten und prüft danach,
dass kein Name aus der Fixture in der Protokolldatei auftaucht. Fehlersuche wird dadurch
mühsamer — der Ausgleich ist die Vorgangs-ID, mit der man eine Protokollzeile und eine
Fehlermeldung im Fenster verbinden kann.
