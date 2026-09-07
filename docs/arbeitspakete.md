# Wurzelwerk — Arbeitspakete Phase 0 und Phase 1 (erster Teil)

**Stand:** 23.08.2026 · **Zuschnitt nach:** `90_Arbeitsweise_KI.md` §3
**Voraussetzung:** `55_Architektur.md` und `56_Import_Vertrag.md` gelesen.

Ein Paket ist so geschnitten, dass es
- **in ein Kontextfenster passt** (berührt unter 10 Dateien),
- **mit einem grünen Test endet**, der vorher rot war,
- **eine Anforderungs-ID** als Auftrag hat,
- **keine offene Frage** aus `80_Offene_Fragen.md` blockiert.

Jedes Paket hat die gleichen vier Abschnitte: **Auftrag** (was und warum), **Umfang** (welche
Dateien), **Abnahme** (woran man erkennt, dass es fertig ist), **Tests** (was grün werden muss).

---

## Wie diese Liste zu benutzen ist

**Von oben nach unten.** Die Reihenfolge ist keine Empfehlung, sondern eine
Abhängigkeitskette: AP-0.8 (Journal-Trigger) braucht AP-0.6 (Schema), das braucht AP-0.5
(Migrationsmechanik), das braucht AP-0.4 (Projektordner). Wer springt, baut auf Sand.

**Ein Paket, ein Chat.** Am Anfang: dieses Dokument plus die im Paket genannten Referenzen
lesen. Am Ende: `pnpm pruefe` grün, Commit, Chat beenden. Der nächste Chat fängt beim nächsten
Paket an.

**Ein guter Auftrag für einen Chat sieht so aus:**

> Setze AP-0.8 um: Journal-Trigger und Armierung nach `55_Architektur.md` §4.3 und §4.4.
> Anforderung F-02. Erzeuge die Trigger mit `skripte/trigger-generieren.ts`, schreibe die
> Tests aus `test/schema/trigger-vorhanden.test.ts`. **Nicht** den Befehlsbus — der ist AP-0.9.

Und ein schlechter: „Baue das Änderungsjournal."

### Die Meilensteine dazwischen

| Nach | Zustand |
|---|---|
| AP-0.4 | Die App startet, legt ein `.ahnen`-Projekt an und öffnet es wieder. Noch keine Daten. |
| AP-0.7 | Das Schema steht vollständig. Ab hier ist das Datenmodell keine Theorie mehr. |
| AP-0.11 | **Fundament fertig.** Journal, Undo/Redo, Schnappschüsse, Migration — alles, was man nachträglich nicht reparieren kann. |
| AP-0.15 | Phase 0 abgeschlossen. Nichts sichtbar, alles tragfähig. |
| AP-1.5 | **Erstes echtes Familienwissen ist in der Datenbank.** Über eine Importdatei. |
| AP-1.7 | Man kann es ansehen: Liste, Suche, Profilseite. Ab hier ist die App benutzbar. |
| AP-1.9 | Erster Teil von Phase 1 abgeschlossen. Der Bestand kann wachsen. |

---

# Phase 0 — Fundament

> Kein sichtbares Feature. Der Zweck ist: Schema, IDs, Journal und Übersetzungsschicht sind die
> vier Dinge, die man nachträglich nicht reparieren kann (`10_Vision_Scope.md` §5).

---

## AP-0.1 — Repository, Werkzeugkette, CI

**Auftrag** — G-01, ADR-001, ADR-012, ADR-015. Das Repository entsteht mit dem ersten Commit als
privates GitHub-Repository, und die CI baut von Anfang an unter macOS **und** Windows. Nicht
später: Ein Windows-Build, der erst nach 50 Commits eingeführt wird, ist ein Nachmittag
Fehlersuche in fremdem Code.

**Umfang**
`package.json` · `pnpm-lock.yaml` · `tsconfig.json` + `tsconfig.core.json` ·
`electron.vite.config.ts` · `electron-builder.yml` · `eslint.config.js` · `vitest.config.ts` ·
`.dependency-cruiser.cjs` · `.github/workflows/ci.yml` · `.gitignore` · `README.md` ·
`CLAUDE.md` (aus dem Entwurf) · `docs/` mit den Kopien der Konzeptdokumente · ein leeres
Fenster, das „Wurzelwerk" anzeigt

**Abnahme**
- `pnpm dev` öffnet ein Fenster auf macOS.
- `pnpm pruefe` läuft durch (mit noch fast leeren Testsuiten).
- Ein Push löst die CI aus; sie läuft auf `macos-latest` **und** `windows-latest` grün und legt für beide ein Paket als Artefakt ab.
- `tsconfig.core.json` enthält **kein** `"DOM"` in `lib` und keine `@types/node` — ein `import fs from 'fs'` in `src/core/` ist damit schon ein Typfehler.
- Repository ist privat, `main` ist der Standardzweig.

**Tests**
- `test/einheit/gerüst.test.ts`: ein trivialer Test, damit Vitest belegt läuft.
- `pnpm grenzen`: dependency-cruiser gibt bei leerem `src/` grün.
- CI-Job „grenzen" scheitert absichtlich einmal (probehalber eine verbotene Importzeile einfügen, Rot sehen, entfernen). **Eine Regel, deren Rot man nie gesehen hat, ist nicht bewiesen.**

---

## AP-0.2 — Anwendungsgerüst, IPC-Hülle, Fehlertypen, Protokoll

**Auftrag** — ADR-001, ADR-016, ADR-024. Die Grenze Hauptprozess/Renderer wird einmal richtig
gebaut und danach nie wieder angefasst. Dazu gehören der `Ergebnis`-Typ, die Fehlertaxonomie und
der Logger — alle drei, weil sie sich gegenseitig brauchen und ein nachträglich eingeführter
`Ergebnis`-Typ ein Umbau jedes Handlers wäre.

**Umfang**
`src/main/index.ts` · `src/main/fenster/hauptfenster.ts` + `geometrie-speicher.ts` ·
`src/main/menue/menue.ts` + `tastenkuerzel.ts` · `src/main/ipc/huelle.ts` + `registrierung.ts` +
`ereignisse.ts` · `src/main/protokoll/logger.ts` · `src/preload/index.ts` ·
`src/shared/ipc/{kanaele,vertrag,ergebnis}.ts` · `src/shared/fehler/{codes,app-fehler}.ts` ·
`src/renderer/{main.tsx,app.tsx}` · `src/renderer/brücke/aufrufen.ts` ·
`src/renderer/fehler/fehlergrenze.tsx`

Referenz: `55_Architektur.md` §2 und §10.1–10.3.

**Abnahme**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Ein Testkanal `abfrage:version` liefert `{ ok: true, daten: { app, schema, electron } }`.
- Ein absichtlich fehlerhafter Handler liefert `{ ok: false, fehler: { code, textSchluessel, vorgangsId } }` — und **wirft nicht**.
- Der Renderer kann `window.wurzelwerk.aufrufen('erfunden:kanal', …)` aufrufen und bekommt `IPC_UNBEKANNTER_KANAL` statt einer Ausnahme.
- Tastenkürzel-Tabelle enthält `Cmd`/`Ctrl` an genau einer Stelle.
- Protokolldatei entsteht in `app.getPath('logs')` und rotiert.

**Tests**
- `test/einheit/ipc-huelle.test.ts`: gültige Nutzlast → ok; ungültige → `IPC_UNGUELTIGE_NUTZLAST`; werfender Handler → `ok: false` mit `vorgangsId`; SQLite-Fehlercodes werden korrekt abgebildet.
- `test/einheit/protokoll.test.ts`: Ein Aufruf mit einem Namen in der Nutzlast erzeugt eine Protokollzeile, die den Namen **nicht** enthält.
- `test/e2e/ablauf-00-start.spec.ts`: App startet, Fenster erscheint, `abfrage:version` antwortet.

---

## AP-0.3 — Übersetzungsschicht

**Auftrag** — G-08, ADR-011. Jetzt, nicht in Phase 6. Texte nachträglich aus JSX zu ziehen ist
stumpfe Fleißarbeit über hunderte Dateien — genau die Aufgabe, bei der KI-gestützte
Massenumbauten Fehler einstreuen.

**Umfang**
`src/renderer/i18n/einrichten.ts` · `src/renderer/i18n/de/{allgemein,fehler,menue}.json` ·
ESLint-Regel gegen Zeichenkettenliterale in JSX · alle bisherigen Texte umgestellt

**Abnahme**
- Kein sichtbarer Text mehr im Code — auch nicht im Menü, auch nicht in Fehlermeldungen.
- Jeder Fehlercode aus AP-0.2 hat `fehler.<CODE>.titel` und `fehler.<CODE>.was_tun`.
- Datums- und Zahlenformate laufen über die Schicht (`Intl`, Locale `de-DE`).
- Ein Zeichenkettenliteral in JSX erzeugt einen Lint-Fehler.

**Tests**
- `test/einheit/i18n-vollstaendig.test.ts`: Für **jeden** Wert der `FehlerCode`-Union existieren beide Schlüssel. Dieser Test ist der Grund, warum später kein Fehler ohne Text ausgeliefert wird.
- Lint läuft gegen eine absichtlich eingefügte Literalzeile rot (einmal gesehen, dann entfernt).

---

## AP-0.4 — Projektordner-Format, Öffnen, Anlegen, Sperre

**Auftrag** — G-03, E14, ADR-002. Das `.ahnen`-Format entsteht, bevor es Daten gibt. Dazu die
Sperrdatei, weil sie gleich zwei Aufgaben erfüllt: doppeltes Öffnen verhindern und einen
unsauberen letzten Lauf erkennen.

**Umfang**
`src/main/projekt/{projekt-dienst,ordnerformat,sperrdatei,sync-ordner-warnung}.ts` ·
`src/main/datenbank/verbindung.ts` · Kanäle `befehl:projekt.anlegen`, `befehl:projekt.oeffnen`,
`befehl:projekt.schliessen`, `abfrage:projekt.zuletzt` ·
`src/renderer/ansichten/start/` · `electron-store` für die Liste der zuletzt geöffneten Projekte

**Abnahme**
- „Neues Projekt" erzeugt `Name.ahnen/` mit `baum.sqlite`, `medien/`, `snapshots/`, `export/`, `manifest.json`.
- `manifest.json` enthält Schemaversion, App-Version, Projektname, Erstelldatum.
- Öffnen setzt alle Pragmas aus `55_Architektur.md` §3.1, **inklusive `foreign_keys = ON`**.
- Öffnen eines Ordners ohne `manifest.json` → `PROJEKT_KEIN_WURZELWERK_ORDNER`.
- Zweites Fenster auf dasselbe Projekt → `PROJEKT_BEREITS_GEOEFFNET`.
- Liegt der Pfad unter Dropbox / iCloud Drive / OneDrive: Warnung mit „trotzdem öffnen" (ADR-002).
- Liste der zuletzt geöffneten Projekte überlebt den Neustart (G-04 vorgezogen, weil es zwei Zeilen sind).

**Tests**
- `test/einheit/ordnerformat.test.ts`: Anlegen erzeugt die Struktur; Öffnen eines fremden Ordners scheitert mit dem richtigen Code.
- `test/einheit/pragmas.test.ts`: Ein `INSERT` mit ungültigem Fremdschlüssel **scheitert**. (Der Test, der beweist, dass `foreign_keys = ON` wirklich wirkt.)
- `test/einheit/sperrdatei.test.ts`: Sperre wird gesetzt, beim geordneten Schließen entfernt; verwaiste Sperre eines nicht mehr laufenden Prozesses wird als unsauberer Lauf erkannt.
- `test/einheit/sync-erkennung.test.ts`: Erkennung für die drei Anbieter, plattformübergreifend mit `path.join`.

---

## AP-0.5 — Migrationsmechanik

**Auftrag** — F-06, ADR-020. Erst die Mechanik, dann das Schema. Wenn die erste Tabelle über die
Migrationsmechanik entsteht, ist bewiesen, dass sie funktioniert — sonst wird sie nachträglich
um ein bereits bestehendes Schema herumgebaut.

**Umfang**
`src/main/datenbank/migration/{laeufer,registrierung}.ts` · `docs/schema/0001_grundgeruest.sql`
(nur `transaktion`, `aenderung`, `journal_kontext`, `schema_migration`) ·
`skripte/schema-dump.ts` · `skripte/fixture-datenbank-bauen.ts` ·
`src/main/datenbank/integritaet.ts`

Referenz: `55_Architektur.md` §9.

**Abnahme**
- Öffnen einer leeren Datei führt Migration 1 aus und setzt `PRAGMA user_version = 1`.
- Migration und Versionssetzung liegen in **einer** Transaktion — ein Abbruch mitten drin lässt eine unmigrierte, aber intakte Datei zurück.
- `user_version` größer als `SCHEMA_VERSION` → `PROJEKT_NEUERE_SCHEMAVERSION`, Abbruch.
- Geänderte Prüfsumme einer bereits angewendeten Datei → `PROJEKT_MIGRATION_GEAENDERT`, Abbruch.
- Vor jeder Migration entsteht ein Schnappschuss (Aufruf vorbereitet, Umsetzung in AP-0.11 — bis dahin `VACUUM INTO` direkt).
- `pnpm schema:dump` liefert einen stabilen, sortierten Abzug.

**Tests**
- `test/migration/historisch.test.ts` mit den vier Prüfungen aus `55_Architektur.md` §9.4: Öffnen+Migrieren · Schemagleichheit gegen eine frische Datenbank · Datenerhalt · Fixture-Vollständigkeit für jede Version.
- `test/migration/abbruch.test.ts`: Eine absichtlich fehlerhafte Migration lässt `user_version` unverändert und die Datei intakt.
- `test/migration/pruefsumme.test.ts`: Eine manipulierte Migrationsdatei verhindert das Öffnen.

---

## AP-0.6 — Schema v1: der Kern

**Auftrag** — F-05, D2, alle Entitäten aus `50_Datenmodell.md` §2. In **einer** Migration, weil
das Schema als Ganzes gedacht ist und ein halbes Schema keinen sinnvollen Zwischenstand hat.
Auch die Tabellen, die bis Phase 3 leer bleiben (`persona`, `negativbefund`, `merge_protokoll`,
`id_alias`) — genau das ist Entscheidung D2: keine Kernmigration später.

**Blockierend: W1 aus `55_Architektur.md` §12.1 muss vorher entschieden sein.** Die
Konfidenzskala geht als `CHECK` ins Schema, und eine Änderung von 5 auf 4 Stufen wäre später
eine Datenmigration. Empfehlung: **vier** Stufen (E21).

**Umfang**
`docs/schema/0002_kern.sql` mit: `person` · `name` · `name_phonetik` · `ort` · `ortsname` ·
`ortszugehoerigkeit` · `ort_externe_id` · `ereignis` · `beteiligung` · `elternschaft` ·
`partnerschaft` · `partnerschaft_person` · `assoziation` · `aussage` · `aussage_zitat` ·
`zitat` · `quelle` · `archiv` · `negativbefund` · `persona` · `medium` · `medium_zuordnung` ·
`medium_region` · `merge_protokoll` · `id_alias` · `aufgabe` · `diagnose` · `risikofaktor` ·
`feld_definition` · `feld_auswahloption` · `feld_wert` · `interview_sitzung` · `import_lauf` ·
`import_herkunft` · `ansicht_zustand`
Dazu `src/shared/schemata/*.ts` (Zod je Entität) und `src/main/repositories/basis.ts`.

**Abnahme**
- Alle Tabellen aus `50_Datenmodell.md` §2 existieren, mit den dort genannten Spalten und den Ergänzungen aus `55_Architektur.md` §12.2.
- Jede Tabelle ist `STRICT` (SQLite-Typprüfung; sonst landet die Zeichenkette `"unbekannt"` in einer `INTEGER`-Spalte).
- Jeder Primärschlüssel ist `TEXT` (UUID v7).
- Jeder Fremdschlüssel ist deklariert, mit bewusst gewähltem `ON DELETE`.
- Datumsspaltengruppen sind überall gleich benannt (`{feld}_kalender`, `_modifikator`, `_praezision`, `_wert1`, `_wert2`, `_originaltext`, `_sort_von`, `_sort_bis`, `_zweitkalender`, `_zweitwert`, `_doppeljahr`).
- Alle Aufzählungen als `CHECK (spalte IN (…))` — nicht als Kommentar.
- `konfidenz`-Spalten mit `CHECK (konfidenz BETWEEN 1 AND 4)`.
- Indizes auf allen Fremdschlüsseln und auf `person_flach`-Sortierspalten (folgt in AP-0.7).

**Tests**
- `test/schema/vollstaendigkeit.test.ts`: Eine erwartete Tabellen- und Spaltenliste (aus `50_Datenmodell.md` abgeleitet) wird gegen die frische Datenbank geprüft. Fehlt eine Spalte, sagt der Test welche.
- `test/schema/schluessel-typen.test.ts`: kein `INTEGER PRIMARY KEY`, jede Tabelle `STRICT`.
- `test/schema/fremdschluessel.test.ts`: Jede `*_id`-Spalte hat einen deklarierten Fremdschlüssel. (Fängt die vergessene Deklaration, die sonst erst auffällt, wenn Daten verwaisen.)
- `test/schema/aufzaehlungen.test.ts`: Für jede Zod-Aufzählung stimmt die Werteliste mit dem `CHECK` in der Tabelle überein. **Der Test, der Schema und Code zusammenhält.**
- `test/migration/`: Schemagleichheit aus AP-0.5 läuft jetzt gegen ein großes Schema.

---

## AP-0.7 — Abgeleitete Daten: `person_flach`, FTS5, Phonetik-Index

**Auftrag** — C-16, C-17, ADR-014, E21. Die materialisierte Ansicht aus `50_Datenmodell.md` §2.1
und der Suchindex. Vor dem Journal, weil die Regel „abgeleitete Tabellen werden nie
journalisiert" nur prüfbar ist, wenn es beide Sorten gibt.

**Umfang**
`docs/schema/0003_abgeleitet.sql` (`person_flach`, `suche_fts`, Indizes) ·
`skripte/trigger-generieren.ts` (Teil für die `abl_*`-Trigger) ·
`src/main/datenbank/trigger.ts` · `src/core/name/suchnormalform.ts` ·
`src/core/name/koelner-phonetik.ts` · `alleAbgeleitetenNeuAufbauen()`

Referenz: `55_Architektur.md` §5.

**Abnahme**
- `person_flach` enthält Anzeigename, Sortiernamen (Suchnormalform), Geburts- und Todesjahr, Geburtsortsnamen, `konfidenz_min`, `hat_widerspruch`.
- `hat_widerspruch` wird **abgeleitet** (mehrere Aussagen zum gleichen Prädikat mit verschiedenen Werten und keine bevorzugt), nicht gesetzt — E21.
- `suche_fts` hat die Spalten `original`, `umschrift`, `normalform`, `notiz`, `transkript` (ADR-014: Suche findet kyrillische Treffer über lateinische Eingabe und umgekehrt).
- Kein Befehl schreibt direkt in eine abgeleitete Tabelle; die Trigger tun es.
- `alleAbgeleitetenNeuAufbauen()` existiert und ist auch als Menüpunkt unter Wartung erreichbar.
- `NICHT_JOURNALISIERT` enthält alle abgeleiteten Tabellen.

**Tests**
- `test/invarianten/abgeleitet-gleich.test.ts`: inkrementeller Zustand == vollständiger Neuaufbau, über den ganzen Fixture-Korpus. **Der wichtigste Test dieses Pakets.**
- `test/einheit/suchnormalform.test.ts`: `Wróbel → wrobel`, `Щербаков → scerbakov`, `Müller → muller`, `d'Aboville → daboville`.
- `test/einheit/koelner-phonetik.test.ts`: bekannte Paare (`Meyer`/`Maier`, `Schmidt`/`Schmitt`) liefern denselben Code.
- `test/einheit/suche-schriftsysteme.test.ts`: Eingabe `Scerbakov` findet den Datensatz mit kyrillischem Original.

---

## AP-0.8 — Journal-Trigger und Armierung

**Auftrag** — F-02, ADR-003, ADR-017. Der Kern der Datenintegrität. Das Journal wird von der
Datenbank geschrieben, nicht von Anwendungscode — Begründung in `55_Architektur.md` §4.1.

**Umfang**
`skripte/trigger-generieren.ts` (Teil `jrn_*`) · `docs/schema/trigger_generiert.sql` ·
`src/main/journal/kontext.ts` · `src/main/repositories/journal-repo.ts` ·
Listen `JOURNALISIERT` / `NICHT_JOURNALISIERT`

Referenz: `55_Architektur.md` §4.2 bis §4.4.

**Abnahme**
- Jede journalisierte Tabelle hat genau drei Trigger (INSERT / UPDATE / DELETE), erzeugt, nicht handgeschrieben.
- Ein Trigger schreibt die **ganze Zeile** als JSON in `wert_alt_json` / `wert_neu_json`.
- `aenderung.transaktion_id` ist `NOT NULL` mit Fremdschlüssel → **ein Schreibvorgang ohne armierte Transaktion scheitert**, statt still unprotokolliert durchzulaufen.
- `journal_kontext.aktiv = 0` schaltet das Journal ab; es gibt genau drei erlaubte Aufrufer (Migration, Undo/Redo, Großimport).
- `pnpm trigger` ist reproduzierbar: zweimal laufen lassen ergibt keinen Git-Unterschied.
- Jede Migration erzeugt die Trigger am Ende neu.

**Tests**
- `test/schema/trigger-vorhanden.test.ts`: Jede Tabelle steht in genau einer der beiden Listen; jede journalisierte hat drei Trigger. Eine neue Tabelle ohne Eintrag macht den Test rot.
- `test/invarianten/journal-vollstaendig.test.ts`: Ein direkter `INSERT` ohne Armierung **scheitert**. Genau drei Stellen im Code rufen `journalAus()`; eine vierte macht den Test rot.
- `test/einheit/journal-trigger.test.ts`: Für jede Operation entsteht eine Zeile mit korrekter `operation`, aufsteigender `reihenfolge` und vollständigem JSON.
- `test/einheit/trigger-generator.test.ts`: Der Generator erzeugt für eine Beispieltabelle die erwartete SQL-Zeichenkette.

---

## AP-0.9 — Befehlsbus und der erste echte Befehl

**Auftrag** — F-01, ADR-003. Die einzige Transaktionsklammer der Anwendung. Ab hier gibt es
genau einen Weg, Daten zu ändern.

**Umfang**
`src/main/befehle/{bus,registrierung}.ts` · `src/main/befehle/person-anlegen.ts` +
`person-loeschen.ts` + `person-feld-setzen.ts` · `src/main/repositories/person-repo.ts` ·
`src/main/ipc/ereignisse.ts` (Ausbau) · `src/renderer/brücke/befehl-hooks.ts`

Referenz: `55_Architektur.md` §4.5 und §3.4.

**Abnahme**
- `BEGIN IMMEDIATE` → `transaktion`-Zeile → Armierung → Handler → Entwaffnung → `COMMIT`.
- Ein Befehl innerhalb eines Befehls → `BEFEHL_VERSCHACHTELT`.
- Eine Transaktion ohne `aenderung`-Zeilen wird verworfen und ist **kein** Undo-Schritt.
- Nach jedem erfolgreichen Befehl gehen `ereignis:datenGeaendert` und `ereignis:journalStatus` an den Renderer.
- Ein Fehler im Handler rollt alles zurück, inklusive der `transaktion`-Zeile.
- Kein `db.prepare` außerhalb von `repositories/` und `abfragen/` (Lint-Regel greift).

**Tests**
- `test/einheit/befehl-bus.test.ts`: Erfolg schreibt eine Transaktion mit Änderungen · Fehler lässt nichts zurück · leerer Befehl erzeugt keinen Undo-Schritt · Verschachtelung wird abgewiesen.
- `test/einheit/befehl-person.test.ts`: Anlegen, Feld setzen, Löschen — je mit den erwarteten Journalzeilen und der aktualisierten `person_flach`.
- `test/invarianten/zyklusfreiheit.test.ts`: Vorbereitung — der Befehl, der eine Elternkante setzt, gibt es noch nicht; der Test prüft die reine Funktion in `core/graph/zyklus.ts`.

---

## AP-0.10 — Undo und Redo

**Auftrag** — F-03. Das Paket, an dem so etwas üblicherweise scheitert. Die fünf typischen
Fehlerquellen und ihre Gegenmaßnahmen stehen in `55_Architektur.md` §4.9 — **dieser Abschnitt
ist vor dem Anfangen zu lesen.**

**Umfang**
`src/main/journal/undo.ts` · `src/main/repositories/journal-repo.ts` (Ausbau: `undoZiel`,
`redoZiel`, `statusSetzen`, `redoStapelVerwerfen`, `status`) · Kanäle `befehl:journal.undo`,
`befehl:journal.redo`, `abfrage:journal.verlauf` · Menü und Tastenkürzel (Cmd/Ctrl+Z,
Shift+Cmd/Ctrl+Z)

**Abnahme**
- Undo wendet die `aenderung`-Zeilen in umgekehrter `reihenfolge` invers an, Redo aufsteigend.
- **`PRAGMA defer_foreign_keys = ON` ist innerhalb der Undo-Transaktion gesetzt.** Ohne diese Zeile funktioniert Undo in den meisten Fällen und scheitert in den seltenen — der teuerste Fehler dieses Pakets.
- Undo und Redo laufen mit abgeschaltetem Journal (sonst zerfällt der Redo-Stapel).
- Ein neuer Befehl verwirft den Redo-Stapel (`status = 'verworfen'`), löscht aber keine Historie.
- **Undo funktioniert nach einem Programmneustart** — weil der Stapel eine Abfrage ist und nicht im Speicher liegt.
- Menü zeigt „Rückgängig: Person angelegt" mit übersetzter Beschreibung; ohne Ziel ist der Eintrag ausgegraut.
- Ein aufgeräumtes Journal (`rueckgaengig_moeglich = 0`) wird als nicht rücknehmbar angezeigt, statt zu scheitern.

**Tests**
- `test/invarianten/undo-bitgleich.test.ts` (fast-check, ≥300 Läufe): erzeugte Befehlsfolge → alles zurücknehmen → kanonischer Abzug ist zeichenweise identisch zum Ausgangszustand. `geaendert_am` wird **nicht** ausgenommen.
- `test/einheit/undo-fremdschluessel.test.ts`: Ein Befehl, der zwei sich gegenseitig referenzierende Datensätze anlegt, ist rücknehmbar. **Ohne `defer_foreign_keys` ist dieser Test rot** — er ist der Beweis, dass die Zeile wirkt.
- `test/einheit/undo-redo-linear.test.ts`: undo, undo, redo, neuer Befehl → Redo-Stapel leer, Historie vollständig.
- `test/einheit/undo-nach-neustart.test.ts`: Verbindung schließen, neu öffnen, Undo funktioniert.
- `test/einheit/undo-abgeleitet.test.ts`: Nach Undo stimmt `person_flach` mit dem Neuaufbau überein.

---

## AP-0.11 — Schnappschüsse, Aufbewahrung, Wiederherstellung, Journalbegrenzung

**Auftrag** — F-04, ADR-003. Das Auffangnetz unter allem, was die Migration (AP-0.5) und der
Import (AP-1.5) tun.

**Umfang**
`src/main/schnappschuss/{erzeugen,aufbewahrung,wiederherstellen}.ts` ·
`src/main/journal/aufraeumen.ts` · Kanäle `befehl:schnappschuss.erzeugen`,
`abfrage:schnappschuss.liste`, `befehl:schnappschuss.wiederherstellen` · Menü „Wartung"

**Abnahme**
- `VACUUM INTO` erzeugt eine konsistente Kopie im laufenden Betrieb, ohne die Arbeit zu blockieren.
- Auslöser: beim Öffnen (wenn letzter älter als 24 h), vor jeder Migration, vor jedem Großimport, alle 200 Transaktionen, auf Menübefehl.
- Aufbewahrung: letzte 10 + einer pro Tag (7 Tage) + einer pro Woche (4 Wochen); ältere werden beim Öffnen gelöscht.
- Wiederherstellen: Projekt schließen → aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` (**nie löschen**) → Schnappschuss zurück → öffnen.
- Journalbegrenzung: alles der letzten 30 Tage und mindestens die letzten 200 Transaktionen bleiben rücknehmbar; älter wird nur die `aenderung`-Zeilen aufgeräumt, die `transaktion`-Zeile bleibt für die Historie.

**Tests**
- `test/einheit/schnappschuss.test.ts`: Kopie ist öffenbar, `integrity_check` ist `ok`, Inhalt stimmt; Erzeugung während einer offenen Lesetransaktion blockiert nicht.
- `test/einheit/aufbewahrung.test.ts`: Bei 40 erzeugten Schnappschüssen über 60 simulierte Tage bleibt genau die erwartete Menge übrig. (Zeit wird injiziert, nicht `Date.now()` — sonst ist der Test nicht reproduzierbar.)
- `test/einheit/journal-aufraeumen.test.ts`: Nach dem Aufräumen bleibt der Verlauf lesbar, `rueckgaengig_moeglich` ist 0, und Undo scheitert mit `JOURNAL_NICHT_RUECKNEHMBAR` statt mit einem Absturz.
- `test/einheit/wiederherstellen.test.ts`: Die ersetzte Datei liegt in `snapshots/ersetzt-…` und ist intakt.

---

## AP-0.12 — Fixture-Korpus und Generator

**Auftrag** — ADR-009 Punkt 1. Ohne Testbäume sind alle Invariantentests theoretisch. Der
Korpus ist die Grundlage jedes weiteren Pakets.

**Umfang**
`fixtures/{minimal,mehrfachehe,adoption,cousinenheirat,fehlende-daten,kaputte-kodierung,unscharfe-datumsangaben,kyrillisch-polnisch}/` ·
`fixtures/generiert/generator.ts` · `src/core/zufall/seed-prng.ts` ·
`test/hilfsmittel/fixture-laden.ts`

**Abnahme**
- Acht handgebaute Bäume, jeder mit einer `beschreibung.md`, die sagt, welchen Fall er abdeckt und welchen Test er tragen soll.
- `cousinenheirat` erzeugt echten Ahnenimplex (mehrere Pfade zum selben Vorfahren) — der Fall, bei dem der Baum kein Baum ist.
- `kaputte-kodierung` enthält Mojibake und gemischte Schriftsysteme.
- Generator liefert 200 / 2.000 / 20.000 Personen, **mit festem Seed reproduzierbar**: zwei Läufe erzeugen bitgleiche Datenbanken.
- Der Generator benutzt `seed-prng.ts`, nicht `Math.random` (in `src/core/` per Lint verboten).
- `fixtureLaden('name')` gibt eine geöffnete Datenbank im Speicher zurück.

**Tests**
- `test/einheit/generator-deterministisch.test.ts`: zwei Läufe mit gleichem Seed → identischer kanonischer Abzug.
- `test/invarianten/fixture-gesund.test.ts`: Jede Fixture besteht `integrity_check`, `foreign_key_check`, die Zyklusprüfung und den Ableitungsvergleich. Eine kaputte Fixture würde sonst als Testfehler an anderer Stelle auftauchen und stundenlang Verwirrung stiften.

---

## AP-0.13 — Absturzsicherheit und Integritätsprüfung

**Auftrag** — ADR-009 Punkt 6, F-08 (Vorarbeit). Die Zusage aus `55_Architektur.md` §10.4 wird
maschinell bewiesen, nicht behauptet.

**Umfang**
`src/main/datenbank/integritaet.ts` (Ausbau) · Menü „Wartung → Datenbestand prüfen" ·
`test/absturz/sigkill.test.ts` · Erkennung unsauberer Läufe über die Sperrdatei

**Abnahme**
- Beim Öffnen läuft `quick_check`; nach einem unsauberen Lauf zusätzlich der vollständige `integrity_check`.
- Menüpunkt führt `integrity_check`, `foreign_key_check`, Ableitungsvergleich und Zyklusprüfung aus und zeigt einen Bericht mit Anzahl und Art der Funde.
- Ein Fund verhindert nichts, sondern nennt den Weg (Schnappschuss oder Neuaufbau der abgeleiteten Tabellen).

**Tests**
- `test/absturz/sigkill.test.ts`: Kindprozess schreibt Befehle in einer Schleife, wird zu einem mit festem Seed gewählten Zeitpunkt mit `SIGKILL` beendet. Danach: `integrity_check` ist `ok` · `foreign_key_check` leer · letzte vollständige Transaktion vorhanden · angefangene vollständig verschwunden · abgeleitete Tabellen stimmen mit dem Neuaufbau überein. Mindestens 20 Wiederholungen mit verschiedenen Zeitpunkten.
- `test/einheit/integritaet.test.ts`: Eine künstlich verletzte abgeleitete Tabelle wird gefunden und ist durch Neuaufbau reparierbar.

---

## AP-0.14 — Grenzen durchsetzen und der Layout-Vertrag

**Auftrag** — ADR-009 Punkt 8, ADR-021, ADR-023. Die Grenzen aus `55_Architektur.md` §1.1
werden zur CI-Regel, und Phase 2 bekommt ihre Andockstelle.

**Umfang**
`.dependency-cruiser.cjs` (vollständige Regelmenge) · ESLint-Regeln (`no-restricted-imports`,
`no-restricted-globals` für `src/core/`, `no-restricted-syntax` für `db.prepare` außerhalb
erlaubter Ordner) · `src/core/layout/vertrag.ts` · `CLAUDE.md` final

**Abnahme**
- Ein Import von `src/main` in `src/renderer` scheitert in der CI, nicht erst zur Laufzeit.
- `Math.random`, `Date.now`, `new Date()`, `process` sind in `src/core/` Lint-Fehler.
- `src/core/layout/vertrag.ts` enthält den vollständigen Typsatz aus `55_Architektur.md` §8 und **keine** Implementierung.
- `pnpm grenzen` erzeugt zusätzlich einen Abhängigkeitsgraphen als SVG-Artefakt der CI.
- **Jede Regel wurde einmal absichtlich verletzt und rot gesehen.** Ungeprüfte Regeln sind Dekoration.

**Tests**
- `test/schema/layout-vertrag.test.ts`: Das Modul exportiert zur Laufzeit nichts (nur Typen), damit hier niemand versehentlich in Phase 1 anfängt.
- `test/grenzen/verletzungen.test.ts`: Für jede Regel liegt eine Beispieldatei in `test/grenzen/fixtures/` vor, die sie verletzt; der Test ruft dependency-cruiser darauf und erwartet genau diesen Verstoß.

---

## AP-0.15 — Koaleszenz von Änderungen *(optional, kann nach Phase 1 rutschen)*

**Auftrag** — F-03, Feinschliff. Ohne dieses Paket erzeugt jede entprellte Texteingabe einen
eigenen Undo-Schritt. Solange es nur Auswahlfelder gibt, fällt das nicht auf; ab dem ersten
Notizfeld (AP-1.6) fällt es sofort auf.

**Umfang**
`src/main/journal/koaleszenz.ts` · Spalte `transaktion.koaleszenz_schluessel` (**ist schon in
AP-0.6 im Schema**, damit hier keine Migration nötig wird) · `koaleszenzSchluessel` in der
Befehlsregistrierung

Referenz: `55_Architektur.md` §4.8 mit der Verdichtungstabelle.

**Abnahme**
- Zusammengefasst wird nur bei: gleichem Schlüssel, unter 2.000 ms Abstand, keine Transaktion dazwischen, beide `art = 'nutzer'`.
- Verdichtung pro `(tabelle, datensatz_id)` genau nach der Tabelle aus §4.8 — inklusive des Falls, in dem beide Zeilen entfallen (`insert` + `delete`).
- Undo eines zusammengefassten Schritts stellt den Zustand **vor** der ersten Änderung her.

**Tests**
- `test/einheit/koaleszenz.test.ts`: alle fünf Zeilen der Verdichtungstabelle, je ein Test.
- `test/einheit/koaleszenz-grenzen.test.ts`: 2.001 ms Abstand fasst nicht zusammen; eine fremde Transaktion dazwischen fasst nicht zusammen.
- `test/invarianten/undo-bitgleich.test.ts` läuft mit aktivierter Koaleszenz erneut grün.

---

**Phase 0 ist fertig, wenn:** `pnpm pruefe` grün ist, alle Invarianten aus `CLAUDE.md` §5
laufen, die CI unter Windows und macOS grün baut, und ein leeres Projekt angelegt, geschlossen
und wieder geöffnet werden kann. Sichtbar ist davon nichts — und das ist richtig so.

---

# Phase 1 — Erfassen und Belegen (erster Teil)

> Entscheidung: Phase 1 bleibt im Umfang wie in `40_Anforderungen.md` dokumentiert. Die
> **Reihenfolge** ist aber so gewählt, dass nach AP-1.7 echtes Familienwissen in der Datenbank
> ist und angesehen werden kann. Alles, was danach kommt, verbessert eine benutzbare App statt
> eine unbenutzbare zu vervollständigen. Das ist die Antwort auf das in `10_Vision_Scope.md` §5
> benannte Hauptrisiko, ohne den Umfang zu kürzen.
>
> Reihenfolge nach der Entscheidung „Schema und Trockenlauf zuerst" (ADR-010): Der Importvertrag
> kommt vor jeder Bearbeitungsmaske, damit nicht zwei Wahrheiten entstehen.

---

## AP-1.1 — Datumsmodul im Kern

**Auftrag** — A-03. Das erste Paket der Phase 1, weil Import, Suche, Sortierung, Plausibilität
und später jede Ansicht darauf aufbauen. Reines `src/core/`, keine Datenbank, keine Oberfläche.

**Umfang**
`src/core/datum/{typen,parser,kalender,sortierschluessel,formatierer}.ts` ·
`src/shared/schemata/datum.ts`

**Abnahme**
- Parser versteht deutsche Eingaben: `14.3.1901` · `März 1901` · `1901` · `um 1890` · `vor 1750` · `nach 1812` · `zwischen 1750 und 1760` · `1750/51` · `Dom. III post Trinitatis 1750` (als `originaltext` mit `praezision: jahr`, **nicht** aufgelöst — die Auflösung von Kirchenfesten kommt in Phase 6 mit dem Kirchenbuchmodus).
- Julianisch/gregorianisch wird **nicht umgerechnet gespeichert**, sondern berechnet (`50_Datenmodell.md` §2.3). `wert1` ist immer das Originaldatum im Originalkalender.
- `sort_von` / `sort_bis` als julianische Tageszahlen; bei `praezision: jahrzehnt` spannt das Intervall zehn Jahre.
- Doppeldatierung (`1731/32`, Kongresspolen) wird über `zweitkalender`/`zweitwert`/`doppeljahr` abgebildet.
- Formatierer erzeugt deutsche Anzeige (`um 1890`, `zwischen 1750 und 1760`, `März 1901`) über i18next.
- Keine Verwendung von `new Date()` — reine Arithmetik auf julianischen Tageszahlen.

**Tests**
- `test/einheit/datum-parser.test.ts`: eine Tabelle mit ~50 Eingaben und erwarteten Ergebnissen, plus die Fälle, die **nicht** geparst werden dürfen (`31.02.1900`, `1901-13-01`).
- `test/invarianten/datum-rundlauf.test.ts` (fast-check): `formatiere(parse(x))` ist stabil; `parse` ist idempotent; `sort_von ≤ sort_bis` für jeden erzeugten Wert.
- `test/einheit/datum-kalender.test.ts`: bekannte Umrechnungspaare julianisch/gregorianisch (z. B. 1700-02-18 jul. = 1700-03-01 greg.).
- `test/einheit/datum-sortierung.test.ts`: Eine gemischte Liste unscharfer Daten sortiert in der erwarteten Ordnung.

---

## AP-1.2 — Namen, Umschrift, Ortszeitbezug im Kern

**Auftrag** — A-02, A-19, A-04, E20, ADR-014. Wieder reines `src/core/`. Die Suchnormalform und
die Kölner Phonetik gibt es schon aus AP-0.7; hier kommt die Umschrift dazu.

**Umfang**
`src/core/name/{typen,umschrift}.ts` · `src/core/ort/zeitbezug.ts` ·
`src/shared/schemata/{name,ort}.ts`

**Abnahme**
- ISO 9 als Standard, **umkehrbar**: `umschrift(iso9)` und die Rückabbildung ergeben das kyrillische Original zeichengenau. Das ist der Grund, warum ISO 9 und nicht DIN 1460 der Standard ist (ADR-014).
- DIN 1460 wählbar, als nicht umkehrbar dokumentiert.
- Eine erzeugte Umschrift ist ein **zusätzlicher** Namenseintrag mit `typ: transliteriert`, `umschrift_von`, `umschrift_norm` und ist nie `ist_bevorzugt`.
- Eine manuell korrigierte Umschrift hat `umschrift_norm: manuell` und wird beim Neuerzeugen nicht überschrieben.
- `ort/zeitbezug.ts`: gültiger Ortsname zu einem Datum; ohne Datum der bevorzugte Name; gültige Zugehörigkeitskette (politisch und kirchlich getrennt) zu einem Datum.

**Tests**
- `test/invarianten/umschrift-umkehrbar.test.ts` (fast-check): Für jede erzeugte kyrillische Zeichenkette gilt `zurueck(iso9(s)) === s`. **Der Test, der die Begründung von ADR-014 beweist.**
- `test/einheit/umschrift-din.test.ts`: bekannte Beispiele nach DIN 1460.
- `test/einheit/ort-zeitbezug.test.ts`: Marienwerder für 1900, Kwidzyn für 1950, bevorzugter Name ohne Datum; Zugehörigkeitskette über die Grenzänderung von 1945.
- `test/einheit/name-anzeige.test.ts`: Rufname-Markierung, Präfix (`von`, `van`, `zu`), Zusatz (`der Ältere`), Titel.

---

## AP-1.3 — Import-Vertrag v1: Schema und Prüfung Stufe 1 und 2

**Auftrag** — D-10, ADR-010. Der Vertrag steht, bevor manuell erfasst wird. Umsetzung nach
`56_Import_Vertrag.md` §3 und §4.

**Umfang**
`docs/import-vertrag/wurzelwerk-import-v1.schema.json` (aus `56_Beispiele/`) ·
`src/shared/schemata/import-v1.ts` (Zod) · `src/main/import/validierung.ts` ·
Positionsindex JSON-Pfad → Zeile · `fixtures/import/v1/` ·
Kanal `befehl:import.pruefen`

**Abnahme**
- Alle Regeln aus `56_Import_Vertrag.md` §4 Stufe 1 (IMP-101 bis IMP-107) und Stufe 2 (IMP-201 bis IMP-209).
- **Fehlermeldungen im Format aus §5**, mit JSON-Pfad, betroffener Kennung, Datei und **Zeilennummer**, und einem „Was tun"-Satz mit allen Auswegen.
- Referenzprüfung läuft über die typisierte Struktur, **nicht** über einen regulären Ausdruck auf dem Rohtext (`56_Import_Vertrag.md` §4 Stufe 2, Umsetzungshinweis).
- Alle Texte über i18next (`import.fehler.IMP_xxx.*`).
- Die drei Beispieldateien aus `56_Beispiele/` liegen in `fixtures/import/v1/gueltig/` und werden akzeptiert.
- Für **jeden** IMP-Code der Stufen 1 und 2 liegt eine Datei in `fixtures/import/v1/fehlerhaft/`, die genau ihn auslöst.

**Tests**
- `test/einheit/import-schema-zod-gleich.test.ts`: JSON Schema (Ajv) und Zod geben über den gesamten Fixture-Ordner **dasselbe** Urteil ab. Der Test, der die zwei Fassungen des Vertrags zusammenhält.
- `test/einheit/import-fehlercodes.test.ts`: Jede Fehlerdatei löst genau den erwarteten Code aus — nicht mehr und nicht weniger. („Nicht mehr" ist der wichtigere Teil: eine Prüfung, die zehn Folgefehler ausspuckt, ist unbenutzbar.)
- `test/einheit/import-zeilennummern.test.ts`: Für einen bekannten Fehler stimmt die gemeldete Zeile.
- `test/einheit/import-zusammenfassung.test.ts`: Eine Datei mit falschen Anzahlen löst IMP-105 aus.

---

## AP-1.4 — Trockenlauf und Bericht

**Auftrag** — D-10 (Trockenlauf), ADR-010 Punkt 3. Umsetzung nach `56_Import_Vertrag.md` §6.

**Umfang**
`src/main/import/{trockenlauf,bericht}.ts` · Kanal `befehl:import.trockenlauf` ·
`src/renderer/ansichten/import/` (Dateiwahl, Berichtsanzeige, Textexport) ·
Plausibilitätsregeln Stufe 3 in `src/core/plausibilitaet/regeln.ts`

**Abnahme**
- **Der Trockenlauf ist der echte Import in einer Transaktion mit `ROLLBACK`** — kein zweiter Codeweg. Der Bericht entsteht aus den `aenderung`-Zeilen, die geschrieben worden wären.
- Bericht enthält alle sieben Blöcke aus `56_Import_Vertrag.md` §6.2, in dieser Reihenfolge und mit den dort genannten Eigenschaften — insbesondere: die **Art der Rücknahme** steht oben, „wird ergänzt" listet jede einzelne Änderung, unverarbeitetes Material ist ein eigener Block (auch wenn leer), der Gesundheitsblock nennt die Exportsperre.
- Stufe 3 (IMP-301 bis IMP-310) und Stufe 4 (IMP-401 bis IMP-404) laufen und erscheinen als Hinweise.
- Prüfsumme wird gegen `import_lauf` geprüft: bekannte Prüfsumme → deutlicher Warnhinweis „schon importiert am …".
- Bei Fehlern > 0 ist „Importieren" gesperrt; der Bericht ist als Textdatei exportierbar (der Rückweg zum Skill).
- Der Trockenlauf verändert die Datenbank nicht — auch nicht `transaktion`, auch nicht die abgeleiteten Tabellen.

**Tests**
- `test/einheit/trockenlauf-ohne-wirkung.test.ts`: kanonischer Abzug vor und nach dem Trockenlauf ist identisch.
- `test/einheit/trockenlauf-bericht.test.ts`: Für `beispiel-2-widersprueche.json` enthält der Bericht die erwarteten Zahlen, die erwartete Dublettenmeldung und die erwarteten Hinweise (darunter IMP-302 für die absichtlich falsche Elternkante).
- `test/einheit/plausibilitaet.test.ts`: jede Regel der Stufe 3 einzeln, mit einem Fall, der auslöst, und einem, der knapp nicht auslöst.
- `test/einheit/import-prüfsumme-doppelt.test.ts`: Zweiter Trockenlauf derselben Datei warnt.

---

## AP-1.5 — Import ausführen, Herkunft, Rücknahme

**Auftrag** — D-10, ADR-010 Punkt 4, ADR-019. **Nach diesem Paket ist echtes Familienwissen in
der Datenbank.**

**Umfang**
`src/main/import/ausfuehrung.ts` · `import_lauf` und `import_herkunft` füllen ·
Kanal `befehl:import.ausfuehren` · Schwellwertlogik und Schnappschuss ·
`src/main/journal/undo.ts` (Zweig `importZuruecknehmen`) · Medienkopie in den Projektordner

**Abnahme**
- Kleiner Import (bis 500 geänderte Zeilen): Journal an, `art = 'import'`, **ein normaler Undo-Schritt**.
- Großer Import: Schnappschuss → Journal aus → eine Transaktion → Journal an → `snapshot_pfad` in der `transaktion`-Zeile. Rücknahme über Schnappschuss, nur solange der Import die neueste Transaktion ist, mit Bestätigungsdialog, der sagt, dass der Redo-Stapel danach leer ist.
- Scheitert der Schnappschuss, wird **nicht** importiert (IMP-503).
- `tmp:`-Kennungen werden zu UUID v7; `db:`-Kennungen ergänzen und ersetzen ohne `ueberschreiben: true` **nichts**.
- Konkurrierende Werte entstehen als zweite Aussage, nicht als Ersetzung — der Widerspruch bleibt sichtbar (B-04, E21).
- Mediendateien werden **kopiert**, nicht verschoben.
- Der Bericht des tatsächlichen Imports ist identisch mit dem Trockenlauf-Bericht.
- Herkunft ist abfragbar: „Woher stammt diese Person?" → Importdatei, Prüfsumme, Quelle, Gespräch.

**Tests**
- `test/invarianten/trockenlauf-gleich-import.test.ts`: Für **jede** gültige Fixture-Importdatei ist der Trockenlauf-Bericht gleich dem Bericht des echten Imports. Ist er es nicht, ist der Trockenlauf eine Lüge.
- `test/einheit/import-undo-klein.test.ts`: Import von `beispiel-1-einfach.json`, dann Undo → kanonischer Abzug ist bitgleich dem Zustand vorher.
- `test/einheit/import-undo-gross.test.ts`: Import von 800 generierten Personen, Rücknahme über Schnappschuss, Zustand vorher wiederhergestellt.
- `test/einheit/import-db-kennung.test.ts`: Ohne `ueberschreiben` bleibt der bestehende bevorzugte Wert bevorzugt und der neue steht als konkurrierende Aussage daneben; mit `ueberschreiben` wechselt die Bevorzugung und die Ersetzung steht im Journal.
- `test/einheit/import-herkunft.test.ts`: Nach dem Aufräumen des Journals ist die Herkunft über `import_herkunft` noch auffindbar.

---

## AP-1.6 — Listenansicht und Suche

**Auftrag** — C-16, C-17, A-19. **Nach diesem Paket kann man sehen, was man importiert hat.**
Ohne diesen Schritt ist AP-1.5 nicht überprüfbar — man hätte Daten, die man nicht ansehen kann.

**Umfang**
`src/main/abfragen/{person-liste,suche}.ts` · Kanäle `abfrage:person.liste`, `abfrage:suche` ·
`src/renderer/ansichten/liste/` · `src/renderer/brücke/abfrage-hooks.ts` ·
`src/renderer/bausteine/{tabelle,suchfeld}.tsx`

**Abnahme**
- Tabelle aller Personen mit Spaltenwahl, Sortierung, virtualisiertem Scrollen; hält die Budgets aus `55_Architektur.md` §11 mit der 2.000-Personen-Fixture.
- Suche läuft **gleichzeitig** über Original, Umschrift und Suchnormalform (ADR-014): Eingabe in lateinischer Schrift findet kyrillische Treffer und umgekehrt.
- Kölner Phonetik als zweite, schwächer gewichtete Trefferquelle (`Meyer` findet `Maier`).
- Filter: Platzhalter ein/aus, `privat` ein/aus, Konfidenz, „hat Widerspruch".
- Platzhalter sind visuell klar abgesetzt (A-17).
- Keine optimistischen Aktualisierungen; Invalidierung über `ereignis:datenGeaendert`.

**Tests**
- `test/einheit/abfrage-person-liste.test.ts`: Sortierung nach Suchnormalform (`Müller` vor `Mueller` vor `Nagel`), Filterkombinationen, Seitenweise.
- `test/einheit/suche-mehrschriftig.test.ts`: die drei Ebenen einzeln und zusammen.
- `test/budget/leistung.test.ts`: `abfrage:person.liste` unter 20 ms, `abfrage:suche` unter 50 ms bei 2.000 Personen.
- `test/e2e/ablauf-01-import-und-liste.spec.ts`: Projekt anlegen → `beispiel-3-interview.json` importieren → in der Liste erscheinen die erwarteten Personen → nach „Wruck" suchen → Treffer.

---

## AP-1.7 — Profilseite (lesend)

**Auftrag** — C-04, B-01 bis B-04 (Anzeige), A-17. Zeigt den Belegapparat, wie ihn
`70_UX_Konzept.md` §1 beschreibt: Standardansicht zeigt die Schlussfolgerung, ein Klick den
Beleg, ein weiterer die Widersprüche.

**Umfang**
`src/main/abfragen/person-detail.ts` · Kanal `abfrage:person.detail` ·
`src/renderer/ansichten/profil/` · `src/renderer/bausteine/{konfidenz-anzeige,beleg-liste}.tsx`

**Abnahme**
- Profilseite als überlagerte Vollseite; Schließen bringt exakt an die Ausgangsstelle zurück (`70_UX_Konzept.md` §2).
- Adaptiver Umfang: leere Abschnitte erscheinen nicht.
- Je Feld ein Konfidenz-Indikator mit Belegzahl; **zusätzliches Zeichen für „es gibt konkurrierende Angaben"** — beides zusammen, nach E21.
- Widerspruchsansicht zeigt alle konkurrierenden Aussagen mit Konfidenz, Beleg und Begründung, die bevorzugte hervorgehoben.
- Ereignis-Zeitstrahl chronologisch; Beziehungen mit Kantentyp (biologisch / adoptiv / Stief); Platzhalter als solche erkennbar.
- Gesundheitsdaten in einem eigenen Abschnitt mit dem Vermerk, dass sie nie exportiert werden (M-08).
- Nur lesend. Bearbeiten kommt im zweiten Teil der Phase 1.

**Tests**
- `test/einheit/abfrage-person-detail.test.ts`: Für die `beispiel-2`-Fixture erscheinen beide Todesdaten, das bevorzugte markiert, mit Begründung.
- `test/einheit/widerspruch-ableitung.test.ts`: `hat_widerspruch` wird gesetzt, sobald die zweite abweichende Aussage entsteht, und fällt weg, sobald eine als bevorzugt markiert wird.
- `test/e2e/ablauf-02-profil.spec.ts`: aus der Liste in das Profil, Beleg öffnen, Widerspruch aufklappen, schließen und an der Ausgangsstelle landen.

---

## AP-1.8 — Plausibilitätsprüfungen im Bestand

**Auftrag** — F-07 (Grundsatz). Stufe 3 der Importprüfung gibt es schon (AP-1.4); hier laufen
dieselben Regeln über den **gesamten** Bestand, weil sich Widersprüche erst ergeben, wenn zwei
Importe zusammentreffen.

**Umfang**
`src/main/abfragen/pruefhinweise.ts` · Kanal `abfrage:pruefhinweise` ·
Anzeige in der Fußzeile (`70_UX_Konzept.md` §2) und als Liste ·
`src/core/plausibilitaet/regeln.ts` (Ausbau)

**Abnahme**
- Regeln: Tod vor Geburt · Bestattung vor Tod · Mutter unter 12 oder über 55 · Vater unter 12 oder über 80 · Kind vor Eheschließung (nur Hinweis, nicht Fehler) · Alter über 110 · Zyklus im Graphen · Ereignis außerhalb der Ortsexistenz.
- **Platzhalter werden von allen Prüfungen ignoriert** (A-17, `50_Datenmodell.md` §2.14).
- Fußzeile zeigt die Anzahl; Klick öffnet die Liste mit Sprung zur betroffenen Person.
- Ein Hinweis ist abhakbar („geprüft, ist korrekt so") und kommt dann nicht wieder — sonst ist die Liste nach dem dritten Import nur Rauschen.
- Die Prüfung läuft als Abfrage, nicht als Befehl: sie schreibt nichts (außer dem Abhaken, das ein Befehl ist).

**Tests**
- `test/einheit/plausibilitaet-bestand.test.ts`: jede Regel mit einem auslösenden und einem knapp nicht auslösenden Fall.
- `test/einheit/plausibilitaet-platzhalter.test.ts`: Ein Platzhalter mit unmöglichen Daten löst nichts aus.
- `test/invarianten/zyklusfreiheit.test.ts`: läuft jetzt über den echten Bestand, nicht nur über die reine Funktion.
- `test/budget/leistung.test.ts`: vollständige Prüfung über 2.000 Personen unter 1 s.

---

## AP-1.9 — Der Skill `wurzelwerk-import-vertrag`

**Auftrag** — D-11, ADR-010 Punkt 5. Kein Code im Repository, sondern ein Claude-Skill. Er
gehört hierher, weil er ohne die Prüfung aus AP-1.3/1.4 nicht entwickelt werden kann: Der
Trockenlauf ist seine Rückmeldeschleife.

**Umfang**
Skill-Definition · `56_Import_Vertrag.md` §7.2 als harte Regelmenge im Skill ·
das Schema als Referenz · die drei Beispieldateien als Muster ·
ein Ablauf, der den Trockenlauf-Bericht als Eingabe zur Korrektur annimmt

**Abnahme**
- Der Skill nimmt Gesprächsnotizen, Transkripte und abfotografierte Papiere und erzeugt eine Datei nach `wurzelwerk-import/v1`.
- Die zehn Regeln aus `56_Import_Vertrag.md` §7.2 stehen wörtlich im Skill, als Verbote formuliert.
- Der Skill prüft seine Ausgabe selbst gegen das JSON Schema, bevor er sie ausgibt.
- Der Skill füllt `zusammenfassung` **durch Zählen**, nicht durch Schätzen.
- Der Skill nimmt einen Trockenlauf-Bericht an und korrigiert seine Datei daraufhin.
- **Ehrlich dokumentiert:** Der Skill kann eine Quelle mit erfundenem Transkript nicht ausschließen. Die Gegenmaßnahmen sind Audio mit Zeitmarken, `pruefsumme_quelltext` und Stichproben (`56_Import_Vertrag.md` §7.4).

**Tests** (nicht automatisiert, aber protokolliert)
- Drei echte Gespräche oder Papiere durch den Skill, jeweils Trockenlauf, jeweils drei Belege stichprobenartig gegen das Original geprüft. Ergebnis in `80_Offene_Fragen.md` festhalten, falls sich Regeln als unzureichend erweisen.
- Ein Gegentest: Material mit einer klaren Lücke („mein Großvater, den Namen weiß ich nicht mehr") — der Skill **muss** einen Platzhalter oder eine unverarbeitete Notiz erzeugen und darf keinen Namen erfinden.

---

**Erster Teil von Phase 1 ist fertig, wenn:** Ein echtes Gespräch über den Skill zu einer
Importdatei geworden ist, der Trockenlauf sie ohne Fehler durchgelassen hat, der Import gelaufen
ist, die Personen in der Liste stehen, ihre Profile die Belege zeigen und die Plausibilitätsliste
leer oder abgehakt ist. **Ab dann wächst der Bestand.**

---

## Was danach kommt (zweiter Teil Phase 1, noch nicht geschnitten)

Zur Orientierung, nicht als Auftrag. Reihenfolge folgt der Reibung, die die Arbeit mit echten
Daten zeigt — deshalb wird sie erst nach AP-1.9 festgelegt.

| Thema | IDs |
|---|---|
| Manuelle Bearbeitung: Person, Namen, Daten, Beziehungen; Schnelleingabe, Befehlspalette | A-01, A-13 |
| Ereignisse mit Rollenbeteiligung in der Oberfläche | A-05 |
| Orte anlegen und pflegen, zeitabhängige Hierarchie | A-04 |
| Quellen, Zitate, Archive, Negativbefunde | B-01, B-06, B-07 |
| Feld-Definitionssystem inklusive Filter und Listenspalten | A-09, A-18 |
| Gesundheitsmodul in der Oberfläche | M-01 bis M-04, M-08 |
| Interview-Modus als **Ansicht über dem Importvertrag**, nicht als zweite Erfassungsstrecke | A-15 |
| Medien einbinden, Audio mit Zeitmarken | A-10, A-16 |
| Mehrere Projekte, zuletzt geöffnete Liste (Rest) | G-04 |

Der Interview-Modus ist der Punkt, an dem man aufpassen muss: A-15 und D-10/D-11 überschneiden
sich. Er wird als Oberfläche gebaut, die Notizen einwirft und daraus **Importmaterial nach
demselben Vertrag** erzeugt — nicht als eigener Schreibweg in die Datenbank. Sonst entstehen
genau die zwei Wahrheiten, die ADR-010 verhindern soll.
