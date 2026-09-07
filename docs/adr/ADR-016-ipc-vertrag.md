## ADR-016 — IPC-Vertrag: Ergebnisobjekte statt Ausnahmen

**Status:** entschieden

**Entscheidung:** Drei Kanalpräfixe (`abfrage:` lesend, `befehl:` schreibend und immer
journalisiert, `ereignis:` Push vom Hauptprozess). Jeder Aufruf gibt
`{ ok: true, daten } | { ok: false, fehler: AppFehler }` zurück und **wirft nie** über die
Prozessgrenze. `AppFehler` trägt einen Code aus einer geschlossenen Union, einen i18n-Schlüssel
(nicht den fertigen Satz), einen JSON-Pfad und eine Vorgangs-ID, die auch im Protokoll steht.
Jede Nutzlast wird auf der Hauptprozessseite mit Zod geprüft, obwohl sie typisiert ist.
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; der Preload prüft den
Kanalnamen gegen eine Weißliste.

**Begründung:** (1) Electron serialisiert `Error` nicht sinnvoll — beim Renderer kommt
`"Error invoking remote method …"` an, mit dem Dateipfad des Entwicklungsrechners im Stack.
(2) ADR-011 verlangt, dass der Renderer übersetzt; ein fertiger deutscher Satz aus dem
Hauptprozess umgeht die Übersetzungsschicht. (3) `Ergebnis<T>` zwingt jede Aufrufstelle, den
Fehlerfall anzufassen — TypeScript lässt `ergebnis.daten` ohne `ok`-Prüfung nicht zu. Das ist
bei KI-geschriebenem Renderer-Code der wirksamste Zwang, den es gibt.

**Verworfen:** Ausnahmen über IPC mit einem Wandler im Renderer (verliert den Code, verleitet
zu `catch {}`); tRPC oder ähnliche Schichten (eine Abstraktion mehr, die der Entwickler
zusätzlich lernen müsste).
