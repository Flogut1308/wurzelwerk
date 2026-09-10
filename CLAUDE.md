# CLAUDE.md — Wurzelwerk

Regeln für die Arbeit an diesem Repository. **Diese Datei zuerst lesen, vor jeder Änderung.**

Wurzelwerk ist eine lokale Desktop-Anwendung (Windows + macOS) für Ahnenforschung.
Electron + TypeScript + React + SQLite. Kein Server, kein Login, keine Cloud.

Entwickelt wird **vollständig agentisch in Loops** — mit klaren Zielen und Tests/Prüfungen, die durchlaufen werden (E48, ADR-025). Anfängerfreundlichkeit ist kein Kriterium; die Prüfungen sind es.
Daraus folgt die wichtigste Regel dieser Datei: **Code, der nur plausibel aussieht, ist hier
gefährlicher als Code, der fehlt.** Alles unten macht Korrektheit **maschinell prüfbar**, statt auf Code-Review zu hoffen — die Gates sind die Fitnessfunktion der Loop, nicht eine Formalität.

---

## 1. Vor der Arbeit lesen

| Frage | Dokument |
|---|---|
| Warum ist die Technik so gewählt? | `docs/adr/` (ADR-001 bis ADR-025) |
| Wie ist die Architektur geschnitten? | `docs/architektur.md` |
| Wie sieht das Datenmodell aus? | `docs/datenmodell.md` |
| Was soll gebaut werden, mit welcher ID? | `docs/anforderungen.md` |
| Wie sieht der Importvertrag aus? | `docs/import-vertrag.md` |
| Welches Arbeitspaket ist als nächstes fällig? | `docs/arbeitspakete.md` |

**Ein Auftrag ohne Anforderungs-ID wird nicht angefangen.** Wenn kein `A-…`, `B-…`, `C-…`,
`D-…`, `E-…`, `F-…`, `G-…` oder `M-…` genannt ist, ist der Auftrag zu unscharf — dann erst
zuschneiden, dann bauen.

---

## 2. Architekturgrenzen — nicht verhandelbar

```
src/core     reines TypeScript. Kein Node, kein Electron, kein React, kein SQL.
src/shared   IPC-Vertrag, Fehlertypen, Zod-Schemata. Darf src/core.
src/main     Electron-Hauptprozess. Datenbank, Dateien, IPC. Darf core + shared.
src/preload  contextBridge. Darf NUR shared.
src/renderer React. Darf core + shared. NIE main, NIE better-sqlite3, NIE Node.
```

Die vier Sätze, die alles andere ableiten:

1. **Der Renderer sieht keine Datenbank.** Kein SQL, kein `better-sqlite3`, kein `fs`, kein `path`, kein `require`. Nur `abfrage:`- und `befehl:`-Kanäle.
2. **Layout kennt kein Rendering.** `src/core/layout/` bekommt Knotenmaße als **Eingabe** und gibt Koordinaten zurück. Kein `document`, keine Textmessung, kein SVG, keine Pixel.
3. **Nur `src/main/befehle/` öffnet Transaktionen.** Ein `BEGIN` in einem Repository oder in einem IPC-Handler ist ein Fehler.
4. **Nur `src/main/repositories/` schreibt SQL.** `db.prepare` oder `db.exec` außerhalb von `repositories/` und `abfragen/` ist ein Fehler.

Geprüft durch `pnpm grenzen` (dependency-cruiser) und ESLint-Regeln. **Wenn ein Vorschlag eine
Grenze verletzt, ist der Vorschlag falsch — nicht die Grenze.** Eine Grenze wird nur mit einem
neuen ADR geändert.

---

## 3. Befehle

```bash
pnpm install            # nach dem Klonen; baut better-sqlite3 gegen die Electron-ABI
pnpm dev                # Electron im Entwicklungsmodus mit Hot-Reload
pnpm typen              # tsc --noEmit über alle Projekte
pnpm lint               # ESLint
pnpm grenzen            # dependency-cruiser: Schichtregeln aus §2
pnpm test               # Vitest: Einheit + Invarianten + Schema + Migration
pnpm test:e2e           # Playwright gegen die gebaute App
pnpm test:budget        # Leistungsbudgets (lokal Fehler, in der CI Warnung)
pnpm trigger            # erzeugt docs/schema/trigger_generiert.sql neu
pnpm schema:dump        # normalisierter Schema-Abzug für Migrationsvergleiche
pnpm pruefe             # typen + lint + grenzen + test  ← vor jedem Commit
pnpm build              # macOS-Paket
```

**`pnpm pruefe` muss grün sein, bevor ein Commit entsteht.** Ohne Ausnahme.

**Node-Version:** Vor jedem `pnpm`-Befehl `nvm use` (nutzt `.nvmrc` → Node 22). Eine andere Node-Version (z. B. eine neuere Default-Shell) verletzt die Engine `>=22 <23` und lässt `pnpm grenzen` (dependency-cruiser) hart abbrechen. Paketmanager fest: `pnpm@12.3.4`.

Nach jeder Änderung an `package.json`-Abhängigkeiten mit nativem Code: `pnpm install` erneut,
sonst passt `better-sqlite3` nicht zur Electron-Version und die Fehlermeldung
(`NODE_MODULE_VERSION`) ist irreführend.

---

## 4. TypeScript-Regeln

- `strict: true`, zusätzlich `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Kein `any`.** Auch nicht als Zwischenschritt, auch nicht mit Kommentar. Wenn ein Typ unbekannt ist, ist er `unknown` und wird geprüft (Zod).
- **Kein `as`,** außer bei einem Typ, der aus einem geprüften Zod-Ergebnis kommt oder bei einem `as const`. Jedes andere `as` braucht einen Kommentar mit Begründung in derselben Zeile.
- **Kein `!` (Non-Null-Assertion).** Stattdessen prüfen und einen `AppFehler` erzeugen.
- **Kein `@ts-ignore` / `@ts-expect-error`** ohne Kommentar mit Begründung und Verweis auf ein Issue.
- **Keine Standardexporte** außer wo ein Werkzeug sie erzwingt (Vite-Konfigurationen). Benannte Exporte sind suchbar und umbenennbar.
- **`readonly` an allen Vertrags- und Ergebnistypen.** Wenn ein Aufrufer eine Antwort verändern kann, verändert er irgendwann versehentlich den Cache.
- **In `src/core/` verboten:** `Math.random`, `Date.now`, `new Date()`, `process`, `globalThis`. Reine Funktionen bleiben rein, sonst sind Golden-Tests und Property-Tests nicht reproduzierbar (ADR-005, ADR-009).

### Sprache der Bezeichner

**Fachbegriffe deutsch, Technik englisch.**

```ts
// richtig
export function personAnlegen(tx: Tx, ein: PersonAnlegenEin): { id: string }
interface Elternschaft { elternteilId: string; kindId: string; typ: ElternschaftTyp }
const geburtsdatumSortVon: number

// falsch
export function createPerson(tx: Tx, input: CreatePersonInput)
interface Parenthood { parentId: string; childId: string }
```

Begründung: Das Datenbankschema ist deutsch (`50_Datenmodell.md`). Eine Übersetzungsschicht
zwischen Schema und Code wäre eine ständige Fehlerquelle — genau die Art Fehler, die KI beim
Umbenennen einstreut (`parent` ↔ `elternteil` ↔ `vater`). Technische Begriffe bleiben englisch,
weil sie aus den Bibliotheken kommen: `Result`, `Tx`, `Repository`, `Handler`, `Schema`,
`Migration`, `Trigger`, `Cache`.

Sichtbare Texte stehen **nie** im Code, sondern in `src/renderer/i18n/de/` (ADR-011).
Ein Zeichenkettenliteral in JSX ist ein Lint-Fehler.

---

## 5. Testpflicht

### Die eiserne Regel

> **Jeder Bugfix beginnt mit einer Fixture oder einem Test, der den Fehler zeigt.**
> Erst rot, dann Fix, dann grün. Kein Fix ohne Test — nie, auch nicht bei „ist doch offensichtlich".

Das ist ADR-009 Punkt 8 und die einzige Regel, deren Verletzung Arbeit rückgängig macht.

### Welcher Test wofür

| Was | Wo | Werkzeug |
|---|---|---|
| Reine Logik (Datum, Name, Graph, Plausibilität) | `test/einheit/` | Vitest |
| Fachliche Invarianten | `test/invarianten/` | fast-check |
| Layout-Koordinaten | `test/golden/` | JSON-Snapshots |
| Schemazusicherungen | `test/schema/` | Vitest gegen eine frische Datenbank |
| Migrationen | `test/migration/` | eine Fixture-Datenbank je Schemaversion |
| Absturzsicherheit | `test/absturz/` | Kindprozess + SIGKILL |
| Leistungsbudgets | `test/budget/` | Vitest mit Zeitmessung |
| Abläufe | `test/e2e/` | Playwright gegen Electron |

### Die Invarianten, die immer gelten müssen (ADR-009 Punkt 2)

- Niemand ist eigener Vorfahre (Zyklusfreiheit).
- Generation(Kind) > Generation(Elternteil) für jede Elternkante.
- Ehepartner liegen auf derselben Layout-Ebene.
- Keine zwei Layout-Knoten überlappen.
- **`Undo(Aktion)` stellt den Datenbestand bitgleich wieder her.**
- Abgeleitete Tabellen sind identisch mit ihrem vollständigen Neuaufbau.
- Jede Tabelle steht in genau einer der Listen `JOURNALISIERT` / `NICHT_JOURNALISIERT`.
- Jede journalisierte Tabelle hat genau drei Journal-Trigger.
- Ein Trockenlauf-Bericht ist gleich dem Bericht des echten Imports.
- Import → Export → Import ist idempotent *(erst ab D-01 prüfbar, bis dahin `test.todo`)*.

Eine neue Fachregel bekommt eine neue Invariante. Eine Invariante wird nicht abgeschwächt,
damit ein Test grün wird — dann ist der Code falsch oder die Regel muss per ADR geändert werden.

---

## 6. Datenbank

- **Migrationen laufen nur vorwärts.** Keine `down`-Migrationen (Begründung: `docs/architektur.md` §9.2).
- **Eine angewendete Migrationsdatei wird nie geändert.** Auch keine Formatierung, kein Kommentar — die Prüfsumme steht in `registrierung.ts` und ein geänderter Inhalt verhindert das Öffnen echter Projektdateien. Änderungen werden neue Migrationen.
- **Jede neue Migration bringt eine neue Fixture-Datenbank** für die Vorgängerversion mit (`pnpm fixture:db`). Ein Test erzwingt das.
- **`foreign_keys = ON` gilt pro Verbindung.** Nur in `src/main/datenbank/verbindung.ts` setzen, nirgends sonst.
- **Trigger werden nicht handgeschrieben,** sondern mit `pnpm trigger` erzeugt. Eine Handänderung an `trigger_generiert.sql` fällt in der CI auf.
- **Kein `SELECT *`.** Spalten immer aufzählen.
- **Immer benannte Parameter.** Kein zusammengesetztes SQL. (Genealogische Daten sind voller Apostrophe: O'Brien, d'Aboville.)
- **Kein `INTEGER PRIMARY KEY` in journalisierten Tabellen.** UUID v7 als `TEXT`, überall (F-05).
- **Neue Tabelle?** In `JOURNALISIERT` oder `NICHT_JOURNALISIERT` eintragen und `pnpm trigger` laufen lassen, sonst schlägt `test/schema/` fehl. Das ist beabsichtigt: eine Tabelle soll nicht unbemerkt unjournalisiert bleiben.

---

## 7. Fehler und Protokoll

- **Über IPC fliegen keine Ausnahmen.** Jeder Kanal gibt `Ergebnis<T>` zurück. Die Wandlung passiert einmal in `src/main/ipc/huelle.ts`.
- **Fehlercodes sind eine geschlossene Union** in `src/shared/fehler/codes.ts`. Kein `code: string`.
- **Jeder Fehlercode braucht einen i18n-Schlüssel `.titel` und `.was_tun`.** Eine Meldung ohne Handlungsanweisung ist unfertig.
- **Im Protokoll stehen IDs, nie Inhalte.** Keine Namen, keine Notizen, keine Transkripte, keine Ortsnamen, keine Datumswerte, keine Diagnosetexte. Die Tabellen `diagnose` und `risikofaktor` werden nicht einmal namentlich protokolliert (DSGVO Art. 9, M-08). Ein Test prüft, dass nach einem vollständigen Ablauf mit Fixture-Daten kein Fixture-Name in der Protokolldatei steht.

---

## 8. Datenschutz — harte Regeln

- **`diagnose` und `risikofaktor` sind aus jedem Export ausgeschlossen** (M-08). Auch aus GEDCOM, auch aus dem Lesemodus für Verwandte. Für lebende Personen ist ein Einschluss gar nicht möglich. Das ist keine Einstellung, sondern eine Vorbedingung im Exportcode.
- **`person.privat` und `feld_definition.ist_sensibel`** werden bei jedem Export ausgewertet.
- **Platzhalterpersonen** sind aus Statistiken und Exporten ausgeschlossen (A-17).
- Wenn eine neue Exportstrecke entsteht, ist der erste Test der, der prüft, dass Gesundheitsdaten **nicht** darin sind.

---

## 9. Arbeitsweise mit Commits

- **Ein Arbeitspaket = ein Branch + ein Pull Request.** Branch `ap/<id>-<kurzname>`, PR gegen `main`. `main` ist geschützt und **immer grün**: gemerged wird nur bei grüner CI auf macOS **und** Windows. **Direkt auf `main` wird nicht committet** (Ausnahme: AP-0.1, vor Einführung dieser Regel).
- **`main`-Schutz auf GitHub Free (privates Repo):** Serverseitige Branch-Protection/Rulesets sind hier nicht verfügbar. Ersatz: ein lokaler `.git/hooks/pre-push` blockt Direkt-Push auf `main` (nur bewusst mit `--no-verify` umgehbar; liegt lokal im Klon, ist nicht eingecheckt). Das Verhindern eines **Rot-Merges** bleibt manuell: vor „Merge pull request“ prüfen, dass `pruefen (macos-latest)`, `pruefen (windows-latest)` und `langsame Gates (test:e2e, test:budget)` grün sind.
- **Der PR ist das Gate für den geschützten Prüfpfad (ADR-025):** Änderungen an `test/invarianten/`, `test/golden/`, `test/schema/` oder den Migrations-Prüfsummen werden im Review gesondert begründet und abgesegnet, nicht mit dem Produktivcode durchgewinkt.
- **Kleine Commits im Branch, jeder mit grünem `pnpm pruefe`.** Ein Commit, der zwei Dinge tut, ist zwei Commits.
- Commit-Betreff: `<bereich>: <was>`, deutsch, Imperativ. Bereiche: `core`, `main`, `renderer`, `shared`, `schema`, `test`, `ci`, `docs`.
  ```
  schema: Journal-Trigger für name-Tabelle ergänzen
  core: Datumsparser für "zwischen 1750 und 1760"
  test: Fixture für Cousinenheirat (Ahnenimplex)
  ```
- Betrifft der Commit ein Arbeitspaket oder eine Anforderung: ID in den Rumpf (`Betrifft: A-03, AP-1.1`).
- **Nie mit rotem `pnpm pruefe` pushen** — auch nicht „ich fixe das im nächsten Commit". Ein PR geht erst in den Merge, wenn alle Gates grün sind.
- Die CI baut zusätzlich unter `windows-latest` und legt Screenshots der Hauptansichten als Artefakt ab (ADR-012). **Diese Screenshots werden angesehen, nicht nur erzeugt** — sie sind bis zur Windows-Testrunde (Ende Phase 2) die einzige Windows-Rückmeldung.

---

## 10. Was nicht gebaut wird

Damit kein Aufwand in Dinge fließt, die bewusst draußen sind (`40_Anforderungen.md` §H):

- keine Cloud-Synchronisation, kein Mehrbenutzerbetrieb, keine Echtzeit-Zusammenarbeit
- keine DNA-Funktionen jeder Art
- keine eigene Quellendatenbank, kein Rechercheportal
- keine Online-Veröffentlichung des Baums
- **kein automatisches Zusammenführen ohne Nutzerbestätigung** — der dokumentierte Hauptfehler bestehender Software
- keine mobile App

Und aus der Phasenlogik: **nicht vorgreifen.** Kein Layout-Code vor Phase 2 (nur der Vertrag in
`src/core/layout/vertrag.ts`), kein GEDCOM vor Phase 4, keine Karte vor Phase 3. Der Reflex,
eine Phase „erst noch vollständig" zu machen, ist laut Konzept das Hauptrisiko dieses Projekts
(`10_Vision_Scope.md` §5).

---

## 11. Plattformregeln (ADR-012)

- **Keine plattformspezifischen Pfade.** Immer `path.join`, nie `'/'` verketten. Umlaute und Leerzeichen in Pfaden müssen funktionieren.
- **Tastenkürzel nur über `src/main/menue/tastenkuerzel.ts`.** Dort steht `Cmd` bzw. `Ctrl` genau einmal. Kein `metaKey` im Renderer.
- **Keine Annahmen über Schriftmetriken.** Layoutmaße kommen aus einer Messung zur Laufzeit, nicht aus einer Konstante.
- Entwickelt wird auf macOS. Windows ist gleichrangiges Zielsystem (E23), wird aber bis Ende Phase 2 nur über die CI geprüft. **Ehrlich benannt:** bis dahin ist die App macOS-Software, die unter Windows baut.

---

## 12. Wenn etwas unklar ist

In dieser Reihenfolge:

1. Steht die Antwort in `docs/adr/` oder `docs/architektur.md`? Dann gilt sie.
2. Widerspricht die Aufgabe einem ADR? **Sagen, nicht stillschweigend anders machen.** Ein ADR wird durch einen neuen ADR ersetzt, nicht durch Code umgangen.
3. Fehlt eine Entscheidung? Nicht raten. Die Frage nach `docs/offene-fragen.md` und im Chat stellen. Eine geratene Datenmodellentscheidung kostet später eine Migration.
4. Ist die Aufgabe zu groß (mehr als ~10 Dateien, kein einzelnes grünes Testkriterium)? Zuschnitt vorschlagen, nicht anfangen.

---

## 13. Agentische Loop — Guardrails (ADR-025)

Entwickelt wird in Loops: klares Ziel, Umsetzung, Gates laufen, wiederholen. Damit die Loop nicht die Prüfung statt die Software „grün macht":

- **Geschützter Prüfpfad.** `test/invarianten/`, `test/golden/`, `test/schema/` und die Migrations-Prüfsummen sind der Maßstab, nicht das Werkstück. Änderungen dort laufen über ein separates Gate (zweiter, adversarialer Lauf oder Mensch), **nie in derselben Iteration** wie der geprüfte Produktivcode. Ein Bugfix-Loop, der eine Invariante ändert, ist abzulehnen.
- **Additive Tests.** Bugfix = erst ein neuer, roter Test (die eiserne Regel §5), dann der Fix. Tests werden ergänzt, nie abgeschwächt. Mutation-Testing als periodisches Gate, damit kein leerer Test durchrutscht.
- **Gestufte Gates.** Schnell, jede Iteration: `pnpm typen lint grenzen test`. Langsam, als Torwächter vor dem Merge: `pnpm test:e2e`, `pnpm test:budget`, der Windows-CI-Lauf. Windows-Screenshots sind ein Gate mit Baseline-Diff (§9), kein bloßes Artefakt.
- **Determinismus ist Pflicht** (§4, ADR-005/023): eine nichtdeterministisch rote Prüfung wird von der Loop „wegoptimiert". Kein `Math.random`/`Date.now` in `core`.
- **Doku ist die Wahrheit.** Die Loop arbeitet aus `docs/` (Kopien der Konzeptdokumente). Ein Widerspruch zwischen Code und Doku bricht das Gate; die Doku wird per ADR geändert, nicht der Code am Gate vorbei (§12).

## 14. Design umsetzen — Lücken und Fehler (nicht stumpf, nicht ignorieren)

Grundlage ist das **eingefrorene** Design-Bündel im Repo (Tokens/Schriften aus `74` §12 plus die Bildschirm-Referenzen) zusammen mit `docs/` (`71`/`72`). Der Claude-Design-Link ist die *editierbare Quelle* für spätere Designänderungen; **gebaut wird gegen die versionierte Kopie, nicht gegen den Live-Link.**

**Zwei Wahrheiten:** Das **Design** bestimmt, *wie* es aussieht/sich verhält. Der **Scope** (`40`/`57`/`72`) bestimmt, *was* existieren und funktionieren muss. Bei Lücke oder Konflikt gewinnt für die *Existenz einer Funktion* der Scope, für die *Gestaltung* das Design.

In zwei Fällen wird **nicht stumpf** umgesetzt — in beiden wird **weitergebaut, nicht ignoriert**, auf dem Niveau eines sehr erfahrenen Entwicklers, Product Managers und UI/UX-Designers:

1. **Geplante Funktion fehlt im Design.** Eine Anforderung aus `40`/`57` hat keinen Bildschirm/Baustein. → Aus **vorhandenen** Design-Bausteinen (Tokens, Komponenten, Muster aus `71`/`72` und dem Bündel) konsistent zusammenbauen, sodass es aussieht, als gehörte es dazu. Keine neue visuelle Sprache erfinden. Passt kein Baustein, die konsistenteste Lösung wählen und zum Design-Review markieren.
2. **Das Design bildet etwas ab, das nicht trägt** (technisch nicht umsetzbar, widerspricht Datenmodell/Invariante/Token-Vertrag oder ist in sich inkonsistent). → **Nicht blind** umsetzen. Innerhalb der Design-Sprache auf das anpassen, was trägt (z. B. gleiche Kartenhöhe nach `70` §4, Token statt Festwert), und den Grund festhalten.

Regeln:
- **Nie stilles Weglassen, nie stille Abweichung.** Beide Fälle → ein Satz im PR **und** eine Zeile in `docs/offene-fragen.md` (bzw. Nachtrag zur Screenliste), damit Mensch/Review es sieht.
- **Weiterbauen statt anhalten** — anders als bei Datenmodell-/Architekturentscheidungen, die anhalten (§12). Eine Design-Lücke/-Fehler stoppt die Loop nicht; sie wird bestmöglich konsistent gefüllt und vermerkt. **Nur** wenn dahinter eine echte Produkt-/Scope-Entscheidung steckt (nicht bloß visuelle Füllung), wird sie als offener Punkt eskaliert.
- **Maßstab:** konsistent mit Token-/Komponentenvertrag, treu zum Produktprinzip (eine Frage pro Ansicht, Unsicherheits-Sprache, kein Speichern-Knopf, gleiche Kartenhöhe), technisch sauber, barrierefrei (WCAG AA), beide Themen.
- Der `hueter`/Review prüft solche Abweichungen gezielt.
