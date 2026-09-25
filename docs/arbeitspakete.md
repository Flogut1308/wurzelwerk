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
| AP-0.15 | Alle Phase-0-Features gebaut. Nichts sichtbar, alles tragfähig. |
| AP-0.17 | **Die gebaute App funktioniert.** Ein Paket legt ein Projekt an und öffnet es wieder — vorher scheiterte es an der nicht gebündelten Migrations-SQL. |
| AP-0.25 | Phase 0 abgeschlossen. Die Zusagen aus §9.3 und die Restliste aus AP-0.5–0.14 sind eingelöst. |
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
- `test/invarianten/journal-vollstaendig.test.ts`: Ein direkter `INSERT` ohne Armierung **scheitert**. `journalAus()` wird auf drei Kategorien beschränkt (Migration, Undo/Redo, Großimport); aktuell drei Aufrufstellen, mit AP-1.5 vier. Ein Aufruf außerhalb dieser Kategorien macht den Test rot.
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
# Phase 0 — Nachzug aus dem Codereview (11.09.2026)

> Befunde aus dem Review des fertigen Phase-0-Codes. **Kein neues Feature:** jedes Paket hier
> repariert eine Zusage, die `55_Architektur.md` oder ein AP-Abnahmekriterium schon gegeben hat.
> Die Reihenfolge ist wieder eine Abhängigkeitskette, keine Empfehlung.
>
> **Warum vorne ein Gate steht.** Die zwei schwersten Befunde (AP-0.16, AP-0.17) konnten nur
> deshalb so lange unsichtbar bleiben, weil der einzige Test, der die gebaute App startet, in der
> CI nie gelaufen ist. Ein Fix, den dieselbe Lücke wieder verdeckt, ist kein Fix — darum zuerst
> das Gate, dann die Software.
>
> **Was aus dem Review NICHT hier steht:** der fehlende `QueryClientProvider` im Renderer. Den
> bringt AP-1.6 zwangsläufig mit (ohne ihn läuft dort keine Zeile), und er scheitert laut.


### Vorentscheidungen für den Kettenlauf

`CLAUDE.md` §12 verbietet, eine fehlende Entscheidung zu raten — eine Kette, die unbeaufsichtigt
läuft, hält an jeder an. Darum sind die Entscheidungen, die beim Schneiden der Pakete offen
geblieben sind, hier vorab getroffen. Jede ist eine Umsetzungsentscheidung, keine
Datenmodell- oder Architekturentscheidung (die halten weiterhin an, §12.3). Eine Abweichung ist
zu begründen, nicht stillschweigend zu nehmen.

| Paket | Frage | Entscheidung | Warum |
|---|---|---|---|
| 0.16 | Baut der CI-Job, oder baut `test:e2e` selbst? | `test:e2e` baut selbst (`electron-vite build && playwright test`). | Lokal und in der CI derselbe Weg. Ein Build-Schritt nur im Job lässt den lokalen Lauf weiter stillschweigend skippen — genau der Fehler, den das Paket behebt. |
| 0.17 | Wie kommt die Migrations-SQL ins Paket? | `docs/schema/**` in `files:` von `electron-builder.yml`, Auflösung über `app.getAppPath()`. | Einzige Variante, die die Bytes unangetastet lässt (s. Abnahme). |
| 0.18 | `before-quit` oder `will-quit`? | `before-quit`, synchrones Schließen. | §7.4 nennt `before-quit`; das spätere Entwurfs-Handshake dockt dort an, statt einen zweiten Weg zu bauen. |
| 0.20 | Wo leben die `ereignis:`-Zod-Schemata? | `src/shared/schemata/ereignisse.ts` (neu), eine Datei. | Spiegelt `src/shared/ipc/vertrag.ts`; die Nutzlasten sind klein und gehören zusammen. |
| 0.22 | Vergleich im Handler oder im `WHERE`? | Im Handler: vorher lesen, bei Gleichheit **nichts schreiben**. | Dann erzeugt der Handler keine `aenderung`-Zeile, und der Bus verwirft die Transaktion über seinen bestehenden `anzahl === 0`-Pfad — inklusive „kein `redoStapelVerwerfen`". Es braucht keine neue Mechanik, nur den weggelassenen Schreibvorgang. |
| 0.24 | Woran erkennt man Triggerdrift? | `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'` gegen den erzeugten Inhalt von `docs/schema/trigger_generiert.sql`. | Vergleicht, was wirklich in der Datei steht, statt einer danebengeführten Prüfsumme, die selbst driften kann. |

**Was weiterhin anhält:** jede Frage, die das Datenmodell, eine Invariante oder eine
Architekturgrenze berührt. Die Kette bricht dort ab und trägt den Punkt in `80_Offene_Fragen.md`
ein, statt zu raten.

---

## AP-0.16 — Das langsame Gate scharf schalten

**Auftrag** — G-01, ADR-025, `CLAUDE.md` §13. Der CI-Job „langsame Gates" kann strukturell nicht
rot werden: er baut nicht, `out/main/index.js` fehlt darum, `test/e2e/ablauf-00-start.spec.ts`
überspringt sich per `test.skip(!existsSync(...))` selbst, und `--pass-with-no-tests` /
`--passWithNoTests` schlucken den Rest. **Der einzige Test, der die App wirklich startet, ist in
der CI noch nie gelaufen.** Das ist genau der Fall, gegen den ADR-025 geschrieben wurde: die Loop
macht die Prüfung grün statt die Software. Alle folgenden Pakete verändern Pfade, die nur E2E
prüft — ohne dieses Paket belegt keines von ihnen etwas.

**Umfang**
`.github/workflows/ci.yml` (Job `langsame-gates`) · `package.json` (`test:e2e`, `test:budget`) ·
`test/e2e/ablauf-00-start.spec.ts` · `test/budget/gerüst.test.ts` (neu, analog zu
`test/einheit/gerüst.test.ts` aus AP-0.1)

**Abnahme**
- Der Job baut, bevor er E2E startet — `pnpm build` als eigener Schritt **oder** `test:e2e` baut selbst. Eine Entscheidung, nicht beides.
- `--pass-with-no-tests` und `--passWithNoTests` sind entfernt: ein Lauf ohne gefundene Tests ist rot.
- Der `test.skip`-Wächter in `ablauf-00-start.spec.ts` bleibt für den lokalen Lauf, **wirft** aber, wenn `process.env.CI` gesetzt ist. Ein übersprungener E2E-Lauf in der CI ist ein Fehler, keine Nachricht.
- `test/budget/` existiert mit mindestens einem laufenden Test, damit der Jobname nicht lügt, bis AP-1.6/AP-1.8 die echten Budgets bringen.

**Tests**
- **Rot gesehen (Pflicht, AP-0.1-Maßstab):** den Fenstertitel in `hauptfenster.ts` einmal verfälschen, Job rot sehen, zurücknehmen. Eine Regel, deren Rot man nie gesehen hat, ist nicht bewiesen.
- `test/budget/gerüst.test.ts`: ein trivialer Zeitmessungstest, damit Vitest dort belegt läuft.
- **Nachweis im PR:** Link auf den CI-Lauf, in dem `ablauf-00-start.spec.ts` **ausgeführt** und nicht übersprungen ist.

---

## AP-0.17 — Migrations-SQL ins Programmpaket

**Auftrag** — F-06, G-01, `55_Architektur.md` §9.2/§9.3. `migrationsDateiPfad()` löst gegen
`process.cwd()` + `docs/schema/` auf; `electron-builder.yml` bündelt nur `out/**/*` und
`package.json`. In der gepackten App ist `process.cwd()` nicht das Repo-Wurzelverzeichnis und
`docs/` liegt gar nicht im Paket — **die ausgelieferte App kann kein Projekt anlegen und keines
öffnen**, sie scheitert beim ersten `readFileSync` der Migration. Der Code vermerkt das als
„spätere Aufgabe" (TODO in `migration/registrierung.ts`), im Laufplan läuft es seit AP-0.5 als
Restpunkt mit. Was nirgends steht: es macht jedes gebaute Paket unbrauchbar. AP-0.16 muss vorher
stehen, sonst belegt wieder nichts den Fix.

**Umfang**
`src/main/datenbank/migration/registrierung.ts` · `electron-builder.yml` ·
`electron.vite.config.ts` (falls die SQL als Asset mitgezogen wird) ·
`test/e2e/ablauf-00-projekt.spec.ts` (neu) · `test/einheit/migration-registrierung.test.ts`

**Abnahme**
- Die Migrations-SQL liegt im Paket. Der Pfad wird nicht mehr über `process.cwd()` geraten, sondern über `app.getAppPath()` bzw. einen gebündelten Import aufgelöst — mit **einer** Auflösung für Entwicklung, Test und Paket, nicht drei.
- **Byte-Identität ist die harte Nebenbedingung.** Die Prüfsummen in `registrierung.ts` sind sha256 über den rohen Dateiinhalt und stehen in jeder bestehenden `schema_migration`-Zeile. Jede Lösung, die die Bytes verändert — SQL als TS-String-Konstante einbetten, ein Bundler, der Zeilenenden oder Whitespace normalisiert, ein Minifier — lässt **jede vorhandene Projektdatei** mit `PROJEKT_MIGRATION_GEAENDERT` scheitern. Die CRLF-Falle aus AP-0.5 ist derselbe Fehler in klein. Naheliegende Lösung, die die Bytes erhält: `docs/schema/**` in `files:` von `electron-builder.yml` aufnehmen und über `app.getAppPath()` auflösen (`readFileSync` liest transparent aus dem asar). Eine Alternative ist zu begründen, nicht zu raten (`CLAUDE.md` §12).
- Ein `pnpm build`-Paket legt ein Projekt an, schließt es und öffnet es wieder.

**Tests**
- `test/e2e/ablauf-00-projekt.spec.ts` gegen die **gebaute** App: Projekt in einem temporären Ordner anlegen → `abfrage:version` liefert `schema = MANIFEST_SCHEMAVERSION` → schließen → wieder öffnen. Das ist zugleich das Abnahmekriterium „Phase 0 ist fertig, wenn …" aus diesem Dokument, das bisher nur unter `pnpm dev` galt.
- `test/einheit/migration-registrierung.test.ts`: Pfadauflösung ohne `process.cwd()`-Annahme; Prüfsumme der gebündelten Datei gleich der der Quelldatei.

---

## AP-0.18 — Geordnetes Beenden und Einzelinstanz

**Auftrag** — F-01, F-04, G-03, `55_Architektur.md` §9.3. `src/main/index.ts` registriert kein
`before-quit`/`will-quit`; `projektSchliessen()` wird nur vom IPC-Befehl und von der
Schnappschuss-Wiederherstellung gerufen. Beim normalen Beenden bleibt darum `projekt.lock` liegen
und `db.close()` läuft nie. Beim nächsten Start ist die PID tot, die Sperre gilt als `verwaist`,
und **jeder Neustart** löst den vollen `integrity_check` aus und protokolliert einen unsauberen
Lauf. Die Absturzerkennung aus AP-0.13 unterscheidet damit nicht mehr zwischen Absturz und
Beenden — sie ist funktional tot. §9.3 sagt wörtlich „beim geordneten Beenden gelöscht", AP-0.4
hat es als Abnahmekriterium.

**Abgrenzung:** Der Entwurfs-Ablauf aus §7.4 (`ereignis:entwuerfeUebernehmen`, 2.000-ms-Wartezeit)
gehört **nicht** hierher — er kommt mit der Bearbeitungsoberfläche. Hier geht es nur um
Verbindung und Sperre.

**Umfang**
`src/main/index.ts` · `src/main/projekt/projekt-dienst.ts` ·
`test/einheit/projekt-dienst.test.ts` · `test/e2e/ablauf-00-beenden.spec.ts` (neu)

**Abnahme**
- `app.on('before-quit')` schließt ein offenes Projekt geordnet (Verbindung zu, Sperre weg), bevor der Prozess endet.
- `app.requestSingleInstanceLock()`: eine zweite Instanz startet nicht, sondern fokussiert das bestehende Fenster.
- Nach einem geordneten Beenden meldet der nächste Start **keinen** unsauberen Lauf; nach einem `SIGKILL` weiterhin schon.

**Tests**
- `test/e2e/ablauf-00-beenden.spec.ts`: App starten, Projekt anlegen, App beenden → `projekt.lock` existiert nicht mehr; erneut starten und öffnen → keine Protokollzeile `projekt_sperre_verwaist`. **Erst rot sehen.**
- `test/absturz/sigkill.test.ts` bleibt **unverändert** grün: nach `SIGKILL` wird weiterhin als verwaist erkannt. Das ist die Gegenprobe — ein Fix, der die Absturzerkennung gleich mit abschaltet, wäre schlimmer als der Fehler.

---

## AP-0.19 — Sperre atomar setzen, Öffnen ohne Leck

**Auftrag** — G-03, F-06, `55_Architektur.md` §9.3. Zwei Fehler im Öffnungspfad:

1. Zwischen `sperrdateiPruefen()` (in `projektOeffnen`) und `sperrdateiSetzen()` (am **Ende** von `projektUebernehmen`) liegen Integritätsprüfung, Migration, Schnappschuss und Journalaufräumen — ein Fenster von Sekunden, in dem zwei Prozesse beide migrieren können. `writeFileSync` legt die Datei zudem nicht atomar an.
2. Wirft `integritaetPruefen()` oder `migrieren()`, wird die bereits geöffnete Verbindung nie geschlossen — jeder fehlgeschlagene Öffnungsversuch hinterlässt ein offenes Handle samt `-wal`/`-shm`.

**Umfang**
`src/main/projekt/sperrdatei.ts` · `src/main/projekt/projekt-dienst.ts` ·
`test/einheit/{sperrdatei,projekt-dienst}.test.ts`

**Abnahme**
- Die Sperre wird **vor** Integritätsprüfung und Migration gesetzt, atomar (`writeFileSync` mit `flag: 'wx'`); ein `EEXIST` wird zu `PROJEKT_BEREITS_GEOEFFNET`, nicht zu einer durchgereichten Ausnahme.
- Schlägt das Öffnen nach dem Setzen der Sperre fehl, werden Sperre **und** Verbindung wieder abgeräumt: `projektUebernehmen()` hinterlässt entweder ein offenes Projekt oder gar nichts.
- `projektSchliessen()` setzt den Schnappschuss-Auslöser aus `schnappschussBeiTransaktionSetzen()` zurück, damit kein Callback auf ein geschlossenes Projekt zeigt.

**Tests**
- `test/einheit/sperrdatei.test.ts`: ein zweites `sperrdateiSetzen()` auf denselben Ordner wirft, statt zu überschreiben. **Erst rot sehen.**
- `test/einheit/projekt-dienst.test.ts`: ein Öffnen, das an einer beschädigten Datei scheitert, hinterlässt weder Sperre noch offenes Handle. Gegenprobe für das Handle: die Datei lässt sich danach umbenennen (unter Windows schlägt das bei offenem Handle fehl — dieselbe `EBUSY`-Beobachtung wie im bestehenden Test).

---

## AP-0.20 — `ereignis:`-Kanäle als geschlossener Vertrag

**Auftrag** — ADR-016, `55_Architektur.md` §2.4/§2.5. `EREIGNIS_KANAELE` ist `readonly string[]`;
damit ist der Kanal-Parameter von `sendeEreignis()` schlicht `string` und die Nutzlast `T` frei.
Ein Tippfehler im Kanalnamen kompiliert und sendet still ins Nichts (belegt: ein erfundener
Kanalname löst keinen Typfehler aus). Dazu fehlt ein Kanal, den die Vertragstabelle in §2.4 schon
nennt: **`ereignis:projektGeschlossen`**. Ohne ihn erfährt der Renderer nicht, dass die
Schnappschuss-Wiederherstellung das Projekt geschlossen und neu geöffnet hat, und zeigt einen
Zustand, den es nicht mehr gibt. `ereignis:speicherStatus` bleibt ausdrücklich draußen (Fußzeile,
§7.5 — kommt mit der Oberfläche).

**Umfang**
`src/shared/ipc/{vertrag,kanaele}.ts` · `src/shared/schemata/` (Zod je Nutzlast) ·
`src/main/ipc/ereignisse.ts` · `src/main/projekt/projekt-dienst.ts` ·
`src/renderer/ansichten/start/start-ansicht.tsx` · `src/renderer/brücke/befehl-hooks.ts`

**Abnahme**
- `EreignisKanal` ist eine geschlossene Union, `EreignisNutzlast<K>` eine Typkarte — dieselbe Technik wie `Vertrag`/`Ein`/`Aus`. `ALLE_KANAELE` bleibt `readonly string[]` (der Preload prüft dort einen rohen String aus dem Renderer).
- `ereignis:projektGeschlossen` existiert, wird von `projektSchliessen()` gesendet und von der Startansicht abonniert; nach einer Wiederherstellung zeigt der Renderer den tatsächlichen Zustand.
- Jede `ereignis:`-Nutzlast hat ein Zod-Schema in `src/shared/schemata/` und wird im Renderer geprüft — die `useJournalStatusAbo`-Härtung aus AP-0.10 wird damit die Regel statt die Ausnahme.

**Tests**
- `test/einheit/ereignis-vertrag.test.ts`: ein erfundener Kanalname und eine falsch geformte Nutzlast stehen je unter `@ts-expect-error`. Weicht der Typ je wieder auf, meldet `pnpm typen` „Unused '@ts-expect-error' directive" — der Test wird rot, ohne dass ihn jemand pflegen muss. **Heute ist genau diese Direktive ungenutzt: erst rot sehen.**
- `test/einheit/projekt-dienst.test.ts`: `projektSchliessen()` sendet genau ein `ereignis:projektGeschlossen`.

---

## AP-0.21 — Zurückschreiben und Verdichtung härten

**Auftrag** — F-02, F-03, ADR-009. Drei Löcher im Journalkern. Alle drei sind mit dem heutigen
Befehlsvorrat unerreichbar und alle drei werden mit dem nächsten Befehl erreichbar:

1. `verdichteAenderungen()` bricht die Gruppe ab, sobald `verdichtePaar()` `null` liefert: `[insert, delete] + [insert]` ergibt `[]` — die dritte Zeile steht in der Datenbank und nicht im Journal, und der Bus unterdrückt zusätzlich `ereignis:datenGeaendert`. Der Funktionskommentar verspricht ausdrücklich Generizität „für den Fall einer künftigen Mehrfach-Koaleszenz".
2. `rohLoeschen()`/`rohErsetzen()` werten `run().changes` nicht aus: ein Undo, das seine Zeile nicht findet, läuft still durch und setzt trotzdem `status = 'zurueckgenommen'` — genau der stille No-op-Undo, gegen den `undo()` an anderer Stelle bereits mit dem `betroffene(...) === 0`-Guard verteidigt.
3. `redo()` fehlen beide Wächter, die `undo()` hat (`betroffene(...) === 0` und `importRuecknahmeSperren()`).

Dazu der Restpunkt aus AP-0.7: `datensatzExistiert()` würfe für `person_flach`/`suche_fts_quelle`
einen SQL-Fehler statt `false`.

**Umfang**
`src/core/journal/koaleszenz-verdichtung.ts` · `src/main/repositories/basis.ts` ·
`src/main/journal/undo.ts` · `test/einheit/{koaleszenz,undo-redo-linear}.test.ts`

**Abnahme**
- Ergibt ein Paar `null`, startet der Fold mit dem nächsten Eintrag der Gruppe neu, statt den Rest zu verwerfen.
- `rohLoeschen`/`rohErsetzen` werfen `INTERN_UNERWARTET`, wenn `changes !== 1`.
- `redo()` hat dieselben zwei Wächter wie `undo()`.
- `test/invarianten/undo-bitgleich.test.ts` bleibt **unverändert** und grün (ADR-025: die Invariante ist der Maßstab, nicht das Werkstück).

**Tests**
- `test/einheit/koaleszenz.test.ts`: `[insert, delete] + [insert]` ergibt eine `insert`-Zeile, nicht `[]`. **Erst rot sehen** — heute liefert es `[]`.
- `test/einheit/undo-redo-linear.test.ts`: ein von Hand aus der Tabelle entfernter Datensatz lässt das Undo werfen, statt still „erfolgreich" zu sein.

**PR-B (geschützter Prüfpfad, eigener PR, ADR-025)**
`test/invarianten/journal-schluessel.test.ts`: kein Primärschlüsselwert einer journalisierten
Tabelle enthält das Trennzeichen `|`. `aenderung.datensatz_id` verkettet Verbund-Primärschlüssel
damit (D-2 aus AP-0.8); ein `|` in einem Wert zerlegt `datensatzIdZerlegen()` falsch und
`rohLoeschen()` trifft die falsche Zeile. Läuft gegen den Fixture-Korpus aus AP-0.12.
**Nicht im selben PR wie der Produktivcode oben** (Memory `pruefpfad-schnitt-adr025`, Lehre aus
AP-0.9 PR #15).

---

## AP-0.22 — Kein Journaleintrag ohne echte Änderung

**Auftrag** — F-01, F-02, F-03, `70_UX_Konzept.md` §2 (kein Speichern-Knopf). `personFeldSetzen()`
schreibt `geaendert_am = Date.now()` bedingungslos mit. Ein Feld auf seinen bestehenden Wert zu
setzen erzeugt darum eine `transaktion`-Zeile, eine `aenderung`-Zeile und **verwirft den
Redo-Stapel** — die „leere Transaktion verwerfen"-Mechanik des Busses greift für `feldSetzen`
nie (belegt: zweimal derselbe `notiz`-Wert ergibt zwei Transaktionen). Solange nur IPC-Aufrufe
existieren, fällt das nicht auf; mit der Bearbeitungsoberfläche (A-01/A-13, ohne Speichern-Knopf)
schreibt jedes Verlassen eines Feldes.

**Umfang**
`src/main/befehle/person-feld-setzen.ts` · `src/main/repositories/person-repo.ts` ·
`test/einheit/befehl-person.test.ts`

**Abnahme**
- Ein `feldSetzen` mit unverändertem Wert erzeugt **keine** `transaktion`-Zeile und lässt den Redo-Stapel stehen.
- `NULL` gegen `NULL` gilt als unverändert (SQL-Dreiwertlogik: nicht über `=` prüfen).
- Der Vergleich passiert im Handler oder im `WHERE` des Repositories, **nicht** im Renderer. Eine Prüfung in der Ansicht ist keine Grenze.

**Tests**
- `test/einheit/befehl-person.test.ts`: zweimal derselbe `notiz`-Wert → eine Transaktion, nicht zwei; `undo`/`redo` danach unverändert möglich; ein tatsächlich geänderter Wert erzeugt weiterhin genau eine. **Erst rot sehen.**

---

## AP-0.23 — Projektname und Zielpfad prüfen

**Auftrag** — G-03, ADR-012, `72_Screens_und_Flows.md` S-02. `projektOrdnerAnlegen()` setzt den
Projektnamen ungeprüft in einen Pfad: `../../evil` landet außerhalb des gewählten Elternordners
(belegt), ein leerer Name erzeugt den versteckten Ordner `.ahnen`, und `:`/`?`/`*` scheitern erst
auf Windows. S-02 ersetzt im zweiten Teil von Phase 1 das Elternordner-Textfeld durch einen
Systemdialog — der **Name** bleibt dort aber ein Textfeld, und ein Zustand „ungültiger Name" ist
nicht vorgesehen. Die Prüfung gehört ohnehin in den Hauptprozess, nicht in die Ansicht.

**Umfang**
`src/shared/schemata/projekt.ts` (neu) · `src/main/projekt/ordnerformat.ts` ·
`src/shared/fehler/codes.ts` · `src/shared/i18n/de/fehler.json` ·
`src/renderer/ansichten/start/start-ansicht.tsx` · `test/einheit/ordnerformat.test.ts`

**Abnahme**
- Neuer Fehlercode `PROJEKT_NAME_UNGUELTIG` mit `.titel` **und** `.was_tun` (§7: jeder Code braucht eine Handlungsanweisung).
- Abgelehnt: leer, nur Leerzeichen, `.`/`..`, Pfadtrenner beider Plattformen, die unter Windows verbotenen Zeichen, reservierte Windows-Namen (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…), Punkt oder Leerzeichen am Ende.
- Erlaubt und getestet: Umlaute, Leerzeichen, Apostrophe (`O'Brien`, `d'Aboville`), kyrillische und polnische Namen (§11, ADR-014).
- Zusätzlich zur Zeichenprüfung: der **aufgelöste** Ordnerpfad muss unterhalb von `elternordner` liegen. Eine Zeichen-Weißliste allein ist kein Ersatz für diese Prüfung.

**Tests**
- `test/einheit/ordnerformat.test.ts`: je ein gültiger und ein ungültiger Fall pro Regel als Tabelle; `../../evil` erzeugt keinen Ordner außerhalb des Elternordners. **Erst rot sehen.**
- `test/einheit/i18n-vollstaendig.test.ts` bleibt grün (der neue Code hat beide Schlüssel).

---

## AP-0.24 — Triggerdrift und Migrations-Restpunkte

**Auftrag** — F-06, ADR-017. `generierteTriggerAnwenden()` läuft nur, wenn mindestens eine
Migration angewendet wurde. Wird ein Fehler in `skripte/trigger-generieren.ts` korrigiert, ohne
dass eine neue Migration entsteht, bekommen neu angelegte Projekte den reparierten Trigger und
bestehende Dateien behalten den kaputten — und kein Test sieht es, weil
`test/schema/trigger-vorhanden.test.ts` gegen eine frische Datenbank läuft. AP-1.2 (Umschrift,
ADR-014) ändert die abgeleiteten Daten; das ist der erste Anlass.

Dazu der Restpunkt aus AP-0.8: `laeufer.ts` ruft kein `journalAus()` — die erste datenverändernde
Migration auf einer v4-Datenbank bricht an der `NOT NULL`-Bedingung von `aenderung.transaktion_id`.

**Umfang**
`src/main/datenbank/journal-trigger-anwenden.ts` · `src/main/datenbank/migration/laeufer.ts` ·
`src/main/projekt/projekt-dienst.ts` · `test/einheit/journal-trigger.test.ts`

**Abnahme**
- Beim Öffnen wird der Trigger-Bestand der Datei gegen `docs/schema/trigger_generiert.sql` verglichen; bei Abweichung werden die Trigger neu angewendet (idempotent: `DROP TRIGGER IF EXISTS` + `CREATE`), mit Protokollzeile `{code, zeilenzahl}` nach §7 — **keine** Triggernamen, keine Inhalte.
- `migrieren()` klammert datenverändernde Migrationen in `journalAus()`/`journalAn()`, mit der Pflichtbegründung wie an den anderen drei Aufrufstellen.
- Ein `pnpm trigger`-Lauf ohne Schemaänderung erzeugt weiterhin keinen Diff (AP-0.8 bleibt gültig).

**Tests**
- `test/einheit/journal-trigger.test.ts`: eine Datei auf Zielversion mit von Hand entferntem Trigger bekommt ihn beim Öffnen zurück. **Erst rot sehen.**

**PR-B (geschützter Prüfpfad, eigener PR)**
`test/invarianten/journal-vollstaendig.test.ts` um die vierte erlaubte `journalAus()`-Aufrufstelle
erweitern: die `it.todo`-Zählung `== 3` aus AP-0.8 wird zu `== 4` und scharf. Gesondert begründen —
die Zahl ist der Maßstab, nicht das Werkstück.

---

## AP-0.25 — Gate- und Werkzeughygiene *(Sammelpaket, räumt die Restliste aus AP-0.5–0.14)*

**Auftrag** — ADR-021, ADR-025. Lauter kleine Punkte, die seit mehreren Paketen als „Offen aus
AP-0.5–0.13" im Laufplan mitlaufen, plus drei aus dem Review. Einzeln je zu klein für ein Paket,
zusammen ein Nachmittag. Bewusst **zuletzt**: das Paket verschärft Regeln, die die Pakete davor
sonst nachträglich rot machen würden.

**Umfang**
`eslint.config.js` · `.dependency-cruiser.cjs` · `test/grenzen/{fixtures,*.test.ts}` ·
`skripte/pruefpfad-pruefen.ts` · `src/main/id.ts` (neu) + Importe in `bus.ts`/`koaleszenz.ts`/
`aufraeumen.ts`/`menue.ts` · `Wissen/55_Architektur.md` + `docs/architektur.md`

**Abnahme**
- ESLint: die `db.exec`-Regel greift unabhängig vom Namen des Empfängers (heute nur `db`/`tx`) — `geoeffnet.exec(...)` fällt auf.
- dependency-cruiser: `no-circular` gilt auch für `src/main` und `src/renderer`, nicht nur für `src/core`.
- `skripte/pruefpfad-pruefen.ts` deckt zusätzlich ab: `test/migration/`, die Migrations-Registry `src/main/datenbank/migration/registrierung.ts` und die **indirekt** von geschützten Tests importierten Helfer (`test/invarianten/_*.ts`). Alle drei stehen seit AP-0.5/0.8 als Lücke im Laufplan.
- `neueId()` zieht nach `src/main/id.ts`. Heute wohnt die reine UUID-v7-Funktion in `src/main/ipc/huelle.ts` und schleppt damit `electron` in `bus.ts`, `koaleszenz.ts` und `aufraeumen.ts`; das funktioniert nur, weil `import { app } from 'electron'` außerhalb Electrons `undefined` ergibt statt zu werfen, und zwingt jeden Test zu einem `vi.mock('electron')`.
- Sperrdatei-Name: `55_Architektur.md` §9.3 nennt sie `laufend.lock`, der Code `projekt.lock`. Eine Schreibweise, in beiden Dokumenten — hier gewinnt der Code, weil `projekt.lock` bereits in Tests steht (`CLAUDE.md` §13: ein Widerspruch Doku↔Code bricht das Gate).
- Aus der Restliste erledigt und zu streichen: `docs/schema`-Bundling (AP-0.17), `datensatzExistiert`-Verengung (AP-0.21), `laeufer.ts` `journalAus()` (AP-0.24).

**Tests**
- `test/grenzen/eslint-regeln.test.ts` und `test/grenzen/verletzungen.test.ts` bekommen je eine Fixture pro neuer oder verschärfter Regel — **jede Regel einmal rot gesehen** (AP-0.14-Maßstab).
- `test/einheit/pruefpfad-pruefen.test.ts`: ein Diff, der einen geschützten Helfer zusammen mit Produktivcode ändert, wird abgelehnt.

---

## AP-0.26 — Schnappschussränder *(optional, kann nach Phase 1 rutschen)*

**Auftrag** — F-04. Zwei Ränder in einem Pfad, der nur im Ernstfall läuft und dann funktionieren
muss:
(a) Schnappschuss-Dateinamen haben Sekundenauflösung — zwei Schnappschüsse in derselben Sekunde
ergeben denselben Namen, und `VACUUM INTO` bricht auf einer existierenden Datei ab.
(b) `schnappschussWiederherstellen()` verschiebt nur `baum.sqlite`; bleibt nach einem unsauberen
Schließen eine `-wal`/`-shm` liegen, gehört sie danach zur falschen Datei.

**Umfang**
`src/main/schnappschuss/{dateiname,erzeugen,wiederherstellen}.ts` ·
`test/einheit/{schnappschuss,wiederherstellen}.test.ts`

**Abnahme**
- Ein Namenskonflikt führt zu einem eindeutigen Namen, nicht zu einem Abbruch. Das Format bleibt kolonfrei (Windows) und von `zeitAusDateiname()` parsbar.
- Wiederherstellen räumt `-wal`/`-shm` des ersetzten Bestands mit ab (bzw. stellt sicher, dass die Verbindung vorher sauber geschlossen war).

**Tests**
- `test/einheit/schnappschuss.test.ts`: zwei Aufrufe mit demselben injizierten `jetzt()` erzeugen zwei Dateien. **Erst rot sehen.**
- `test/einheit/wiederherstellen.test.ts`: eine vorhandene `-wal`-Datei überlebt die Wiederherstellung nicht.

---


---

**Phase 0 ist fertig, wenn:** `pnpm pruefe` grün ist, alle Invarianten aus `CLAUDE.md` §5
laufen, die CI unter Windows und macOS grün baut, und ein leeres Projekt angelegt, geschlossen
und wieder geöffnet werden kann. Sichtbar ist davon nichts — und das ist richtig so.

> **Nachtrag 11.09.2026 (Codereview).** Der letzte Halbsatz galt nach AP-0.15 nur unter
> `pnpm dev` und war maschinell nirgends geprüft: die gepackte App fand ihre Migrations-SQL nicht
> (AP-0.17), das Beenden schloss das Projekt nie (AP-0.18), und der CI-Job, der das hätte zeigen
> müssen, konnte strukturell nicht rot werden (AP-0.16). **Phase 0 gilt erst als abgeschlossen,
> wenn AP-0.16 bis AP-0.25 durch sind** — AP-0.26 ist optional.

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

### Vorentscheidungen für den Kettenlauf (Phase 1)

Das Pendant zum gleichnamigen Abschnitt der Nachzug-Kette. `CLAUDE.md` §12 verbietet, eine
fehlende Entscheidung zu raten — eine unbeaufsichtigte Kette hält an jeder an. Darum sind die
Fragen, die ein `planer` in AP-1.1 bis AP-1.5 zwangsläufig stellt, hier vorab beantwortet. Jede
ist eine **Umsetzungsentscheidung**; Datenmodell-, Invarianten- und Architekturfragen halten
weiterhin an (§12.3). Eine Abweichung ist zu begründen, nicht stillschweigend zu nehmen.

| Paket | Frage | Entscheidung | Warum |
|---|---|---|---|
| alle | Bringt ein Paket eine Migration mit? | **Nein.** Schema v1 deckt Phase 1 ab — auch `import_lauf` und `import_herkunft` stehen seit `0002_kern.sql` (Z. 648/662). Entsteht doch eine Migration, **hält die Kette an**. | Der teuerste Fehlerfall der Nachzug-Kette (AP-0.17, Byte-Identität der Prüfsummen) tritt in Phase 1 gar nicht auf — solange niemand ihn unbemerkt einführt. |
| alle | Neue sichtbare Texte? | Immer als i18next-Schlüssel, nie als Literal. `react/jsx-no-literals` ist scharf (AP-0.3). | Ein Literal im JSX ist ein Lint-Fehler; das Paket würde ohnehin an den schnellen Gates scheitern. |
| 1.1 | Datentyp der julianischen Tageszahl? | **Ganzzahlige JDN** (Tagesauflösung), `sort_von`/`sort_bis` als INTEGER. Kein Bruchteil, keine Uhrzeit, keine Zeitzone. | Ein Bruchteil brächte Tageshälften und Rundungsfragen in eine Sortierung, die nur Tage unterscheiden muss. `new Date()` ist in `src/core` ohnehin per ESLint gesperrt (AP-0.14). |
| 1.1 | Was tut der Parser bei ungültiger Eingabe? | **Kein `throw`.** Reines Ergebnis-Union (`{ ok: true, wert }` \| `{ ok: false, grund }`), core-lokal definiert. | Der Import braucht pro Zeile eine Meldung, keinen Abbruch. `src/core` darf `src/shared` nicht importieren (§2), der `Ergebnis`-Typ aus `shared` steht also nicht zur Verfügung. |
| 1.1 | Wie erzeugt der Formatierer deutsche Anzeige, wenn `src/core` nichts importieren darf? | Der Formatierer gibt **`{ schluessel, werte }`** zurück; `t()` ruft der Renderer. Die Muster (`um {{jahr}}`, `zwischen {{von}} und {{bis}}`) leben in `src/shared/i18n/de/datum.json`. | `core-darf-nichts` (dependency-cruiser) verbietet i18next in `src/core`. Der Umfangstext in AP-1.1 („über i18next") meint das Ziel, nicht den Importweg — die Grenze gewinnt (§2). |
| 1.1 | Kirchenfeste und anderer nicht auflösbarer Text? | Enthält der Text eine vierstellige Jahreszahl: übernehmen als `originaltext` mit `praezision: 'jahr'`. Sonst Parserfehler. | Deckt `Dom. III post Trinitatis 1750` wie in der Abnahme, ohne stillschweigend alles zu schlucken. Die Auflösung kommt in Phase 6. |
| 1.2 | Welche ISO-9-Fassung, und wo liegen die Tabellen? | **ISO 9:1995**, strenge 1:1-Abbildung. Tabellen als reine Daten in `src/core/name/umschrift-tabellen.ts`, **eine** Tabelle für beide Richtungen. | Zwei getrennte Tabellen wären zwei Wahrheiten — die Umkehrbarkeits-Invariante (ADR-014) prüfte dann sich selbst statt der Abbildung. |
| 1.2 | Rückabbildung auch für DIN 1460? | **Nein**, DIN 1460 nur vorwärts. Die Rückrichtung wird gar nicht angeboten. | DIN 1460 ist nicht umkehrbar (ADR-014). Eine angebotene, unzuverlässige Rückabbildung ist schlechter als keine. |
| 1.3 | JSON-Schema oder Zod — wer ist die Quelle? | **Das veröffentlichte JSON-Schema ist der Vertrag**, Zod ist die Laufzeitprüfung. **Kein Generator.** Gleichwertigkeit wird über den Fixture-Korpus geprüft: jede gültige Datei besteht beide, jede fehlerhafte löst bei beiden **denselben** IMP-Code aus. | Das Schema lesen Menschen und der Skill (D-11) — es ist die Außenfläche. Ein Generator-Umweg macht die Außenfläche zum Nebenprodukt. |
| 1.3a | Braucht das eine neue Abhängigkeit? | **Ja, genau eine: `ajv` als `devDependency`** (nur Test). Sie ist im Abnahmetext von AP-1.3 bereits vorgesehen und die **einzige** neue Abhängigkeit der Phase 1. Jede weitere hält die Kette an (CLAUDE.md §4). | Ein veröffentlichter Vertrag, der nie ausgeführt wird, ist eine Behauptung. Ohne JSON-Schema-Prüfer prüft der Gleichwertigkeitstest nur die Zod-Seite — also sich selbst. |
| 1.3 | Wo lebt der Positionsindex (JSON-Pfad → Zeile)? | Reine Funktion in `src/core/import/positionsindex.ts`, gespeist mit dem Rohtext. | Kein Node, keine Datei — damit in `src/core` erlaubt und ohne Dateisystem testbar. |
| 1.3 | Schnitt des Pakets? | **1.3a** Schema + Zod + Stufe 1 (IMP-101…107) + gültige Fixtures · **1.3b** Stufe 2 (IMP-201…209) + Positionsindex + Kanal `befehl:import.pruefen`. | 16 Fehlerfixtures plus Schema, Zod, Validierung, Index und IPC sprengen die ~10-Dateien-Grenze, an der die Kette nach §12.4 selbst anhält. |
| 1.4 | Zweiter Codeweg für den Trockenlauf? | **Nein** — dieselbe Bahn, `ROLLBACK` am Ende. Kein `journalAus()`, keine Sonderpfade. | Steht so in der Abnahme; der kanonische Abzug vor/nach ist der Beleg, dass der Rollback reicht. Ein zweiter Weg macht die Invariante „Trockenlauf == Import" wertlos. |
| 1.5 | Woher kommen die UUIDs für `tmp:`-Kennungen? | `neueId()` aus `src/main/id.ts` (UUID v7, seit AP-0.25 elektronfrei). | Es gibt genau eine ID-Quelle; eine zweite driftet. |
| 1.5 | Wohin werden Mediendateien kopiert? | `<projektordner>/medien/<uuid7>.<endung>`, der Originalname steht in der Datenbank. Kopie, nie Verschiebung. | Kollisionsfrei ohne Namenslogik; der Nutzer verliert seine Originaldatei nie. |

**Was weiterhin anhält:** jede Frage, die das Datenmodell, eine Invariante oder eine
Architekturgrenze berührt — und jede Migration.

### Schnittentscheidung (16.09.2026, Nutzer bestätigt)

Zwei Pakete werden geteilt, damit die Kette durchläuft und keine Oberfläche zweimal entsteht:

- **AP-1.3 → 1.3a / 1.3b.** 16 Fehlerfixtures plus Schema, Zod, Validierung, Positionsindex und
  IPC sprengen die ~10-Dateien-Grenze, an der die Kette nach §12.4 selbst anhält.
- **AP-1.4 → 1.4a / 1.4b.** AP-1.4 enthielt mit `src/renderer/ansichten/import/` die **erste
  echte Oberfläche** — und zwar **vor** AP-1.6, wo die Komponentenwelle aus `71` §2 entsteht. Die
  Importansichten wären ohne Atome und Moleküle gebaut und später nachgezogen worden. **1.4b
  läuft darum nach AP-1.6**, auf der fertigen Bausteinbibliothek.

Damit trägt die Kette **AP-1.1 → 1.2 → 1.3a → 1.3b → 1.4a → 1.5 (+PR-B)** und hält vor AP-1.6.
`1.4b` und die Ansichtspakete laufen einzeln über `/ap`, weil dort ein Blick entscheidet und
kein Gate.

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
- `test/einheit/datum-kalender.test.ts`: bekannte Umrechnungspaare julianisch/gregorianisch (z. B. 1700-02-18 jul. = 1700-02-28 greg.; 1700 ist julianisches, aber kein gregorianisches Schaltjahr).
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

## AP-1.3a — Import-Vertrag v1: Schema, Zod und Prüfung Stufe 1

**Auftrag** — D-10, ADR-010. Der Vertrag steht, bevor manuell erfasst wird. Umsetzung nach
`56_Import_Vertrag.md` §3 und §4 Stufe 1. Erste Hälfte des geteilten AP-1.3 (s. Schnittentscheidung).

**Umfang**
`docs/import-vertrag/wurzelwerk-import-v1.schema.json` (aus `56_Beispiele/`) ·
`src/shared/schemata/import-v1.ts` (Zod) · `src/main/import/validierung.ts` (Stufe 1) ·
`fixtures/import/v1/gueltig/` + `fixtures/import/v1/fehlerhaft/` (IMP-101…107) ·
`ajv` als `devDependency`

**Abnahme**
- Alle Regeln aus `56_Import_Vertrag.md` §4 **Stufe 1** (IMP-101 bis IMP-107).
- **Fehlermeldungen im Format aus §5**, mit JSON-Pfad, betroffener Kennung und Datei sowie einem „Was tun"-Satz mit allen Auswegen. **Die Zeilennummer kommt in 1.3b** (Positionsindex).
- Alle Texte über i18next (`import.fehler.IMP_xxx.*`).
- Die drei Beispieldateien aus `56_Beispiele/` liegen in `fixtures/import/v1/gueltig/` und werden akzeptiert.
- Für **jeden** IMP-Code der Stufe 1 liegt eine Datei in `fixtures/import/v1/fehlerhaft/`, die genau ihn auslöst.
- Das veröffentlichte JSON-Schema ist der Vertrag, Zod die Laufzeitprüfung (Vorentscheidung). Kein Generator.

**Tests**
- `test/einheit/import-schema-zod-gleich.test.ts`: JSON Schema (Ajv) und Zod geben über den gesamten Fixture-Ordner **dasselbe** Urteil ab. Der Test, der die zwei Fassungen des Vertrags zusammenhält.
- `test/einheit/import-fehlercodes-stufe1.test.ts`: Jede Fehlerdatei der Stufe 1 löst genau den erwarteten Code aus — nicht mehr und nicht weniger. („Nicht mehr" ist der wichtigere Teil: eine Prüfung, die zehn Folgefehler ausspuckt, ist unbenutzbar.)
- `test/einheit/import-zusammenfassung.test.ts`: Eine Datei mit falschen Anzahlen löst IMP-105 aus.

---

## AP-1.3b — Import-Vertrag v1: Prüfung Stufe 2, Positionsindex, Kanal

**Auftrag** — D-10, ADR-010. Umsetzung nach `56_Import_Vertrag.md` §4 Stufe 2 und §5. Zweite
Hälfte des geteilten AP-1.3; setzt 1.3a voraus.

**Umfang**
`src/main/import/validierung.ts` (Stufe 2) · `src/core/import/positionsindex.ts` (rein,
JSON-Pfad → Zeile) · `fixtures/import/v1/fehlerhaft/` (IMP-201…209) ·
Kanal `abfrage:import.pruefen` (korrigiert von `befehl:` gemäß architektur.md §11/ADR-016 — die Prüfung schreibt nicht; Nutzerentscheidung, s. 80 §11 U-AP1.3b-kanal)

**Abnahme**
- Alle Regeln aus `56_Import_Vertrag.md` §4 **Stufe 2** (IMP-201 bis IMP-209).
- Referenzprüfung läuft über die typisierte Struktur, **nicht** über einen regulären Ausdruck auf dem Rohtext (`56_Import_Vertrag.md` §4 Stufe 2, Umsetzungshinweis).
- Jede Fehlermeldung trägt jetzt zusätzlich die **Zeilennummer** aus dem Positionsindex (§5).
- Der Positionsindex ist eine **reine Funktion** in `src/core` — gespeist mit dem Rohtext, ohne Dateisystem (Vorentscheidung).
- Für **jeden** IMP-Code der Stufe 2 liegt eine Datei in `fixtures/import/v1/fehlerhaft/`, die genau ihn auslöst.
- Der Kanal `befehl:import.pruefen` liefert das vollständige Urteil beider Stufen.

**Tests**
- `test/einheit/import-fehlercodes-stufe2.test.ts`: Jede Fehlerdatei der Stufe 2 löst genau den erwarteten Code aus — nicht mehr und nicht weniger.
- `test/einheit/import-zeilennummern.test.ts`: Für einen bekannten Fehler stimmt die gemeldete Zeile.
- `test/einheit/import-positionsindex.test.ts`: JSON-Pfad → Zeile für verschachtelte Felder, Arrays und die letzte Zeile der Datei.

---

## AP-1.3c — Schemalücken des Importvertrags schließen (Migration 0005)

**Auftrag** — D-10, ADR-026. Entstanden aus der Prüfung von U-1.4a-beleg: die dort vermutete Lücke
(Beleg/Konfidenz an der Entität) existiert **nicht** — `aussage` + `aussage_zitat` tragen sie, und
die abgeleitete Schicht liest sie schon so (ADR-026). Es gibt aber **vier andere** Vertragsfelder
ohne Ziel und ein CHECK, das zwei belegpflichtige Objektarten aussperrt. **Das ist ein
Migrations-AP: er läuft NICHT in der Kette** (`/kette`), sondern einzeln, `planer` und `hueter`
beide **opus** — AP-0.17-Klasse: ein Fehler macht bestehende Projektdateien unöffenbar, und keine
CI sieht es, weil sie nur frische Datenbanken kennt.

**Umfang**
`docs/schema/0005_import_luecken.sql` · `src/main/datenbank/migration/registrierung.ts`
(Eintrag v5 + Prüfsumme, `SCHEMA_VERSION` 4→5) · `pnpm trigger` (Neugenerierung `jrn_*`/`abl_*`) ·
`fixtures/datenbanken/schema-v4.sqlite` (eingefroren) · `test/migration/` ·
`docs/adr/ADR-026-*.md` · Doku-Sync `Wissen/` → `docs/` (50 §2.7, 60, 80)

**Die fünf Lücken** (Herleitung: Prüfbericht 17.09.2026)

| # | Änderung | Vertragsfeld | Art |
|---|---|---|---|
| 1 | `zitat.zeitmarke_sekunden REAL` | `$defs/Beleg.zeitmarke_sekunden` (A-16), 8× in `beispiel-3-interview.json` | ADD COLUMN |
| 2 | `person.unsicherheit TEXT` | `$defs/Person.unsicherheit`, Pflicht bei `konfidenz ≤ 2` (IMP-206) | ADD COLUMN |
| 3 | `aussage.unsicherheit TEXT` | `$defs/Aussage.unsicherheit` (≠ `begruendung`, IMP-207) | ADD COLUMN |
| 4 | `aussage.gueltig_von INTEGER` / `gueltig_bis INTEGER` | `$defs/Aussage.gueltig_von/bis` (A-08), benutzt in `beispiel-1-einfach.json:70/213` | ADD COLUMN |
| 5 | `aussage.subjekt_typ`-CHECK um `'diagnose'`, `'risikofaktor'` erweitern | `$defs/Diagnose.belege`, `$defs/Risikofaktor.belege` (§2.3) | **Tabellenneubau** |

**Vorentscheidungen**
- **Alle fünf in einer Migration.** Eine Aufteilung hieße zwei Migrationen für eine Lücke, jede mit eingefrorener Fixture-DB, Triggerlauf, Prüfsumme und Migrationstests. Diagnosen und Risikofaktoren sind in Phase 1 im Schreibpfad: `diagnosen`/`risikofaktoren` sind Felder erster Ebene im Vertrag v1 (`wurzelwerk-import-v1.schema.json:52-53`) und stehen in `beispiel-3-interview.json`, das AP-1.3a akzeptieren muss.
- **Punkt 5 als CHECK-Erweiterung, nicht als `diagnose_zitat`/`risikofaktor_zitat`.** Zwei Belegtabellen für zwei Sonderfälle brächen die Einheitlichkeit, die ADR-026 gerade herstellt; die Konfidenz liegt dort ohnehin schon als Spalte.
- **`diagnose.icd10` bleibt.** Der Vertrag sagt „kein ICD-10" (E24), die Spalte existiert — eine Spalte zu viel, die niemand füllt. Sie zu entfernen wäre ein **zweiter** Tabellenneubau. Als hingenommene Divergenz in `80` notieren, nicht mitrenovieren.

**Abnahme**
- Migration 4→5 läuft in einer Transaktion je Version, `user_version` in derselben TX (AP-0.5-Mechanik, unverändert).
- **Byte-Identität:** die Prüfsumme in `registrierung.ts` gehört zur neuen Datei; bestehende Prüfsummen bleiben unangetastet.
- `pnpm trigger` neu gelaufen: die neuen Spalten stehen im Journal-Abbild (`jrn_*`), bei Punkt 5 zusätzlich `abl_aussage_*` neu erzeugt. **Kein** Eintrag in der JOURNALISIERT-Liste ändert sich — es entsteht keine neue Tabelle.
- Der Tabellenneubau aus Punkt 5 **erhält alle Daten**: Zeilenzahl und kanonischer Abzug vor/nach sind identisch, Trigger und Indizes sind danach wieder vollständig da.
- Eine gepackte App öffnet eine Projektdatei auf Stand 4 und hebt sie auf 5 (AP-0.17-Abnahmemuster).

**Tests**
- `test/migration/historisch.test.ts`: Aufstieg 4→5 gegen die eingefrorene `schema-v4.sqlite`.
- `test/migration/pruefsumme.test.ts`: geänderte Migrationsdatei → `PROJEKT_MIGRATION_GEAENDERT`.
- `test/schema/*`: die fünf neuen Spalten/der neue CHECK sind zugesichert (geschützter Prüfpfad — schema-bedingt zulässig im selben PR, ADR-025-Nachtrag).
- **Datenerhaltung Punkt 5:** Tabelle mit Aussagen aller sechs Alt-Subjekttypen füllen, migrieren, kanonischen Abzug vergleichen; danach eine Aussage mit `subjekt_typ='diagnose'` einfügen (vorher: CHECK-Verletzung).

---

## AP-1.3d — Import-Schreiblogik

**Auftrag** — D-10, ADR-026. Das Vorpaket, das AP-1.4a braucht: der Trockenlauf ist definitionsgemäß
der echte Import mit `ROLLBACK` — es gibt nur **einen** Schreibweg, und er entsteht hier.
Setzt AP-1.3c voraus.

**Umfang**
`src/main/import/schreiben.ts` · Abbildung Vertrag → Zeilen für Person, Ereignis, Beteiligung,
Elternschaft, Partnerschaft, Name, Diagnose, Risikofaktor, Quelle, Zitat · Existenz-Aussagen
nach ADR-026 · `tmp:`→UUID-v7-Auflösung über `neueId()` (`src/main/id.ts`)

**Abnahme**
- Je belegtem Objekt entsteht **eine** Aussage `praedikat='existenz'`, `wert_text='ja'`, mit `konfidenz` aus dem Vertrag, plus `aussage_zitat` je Beleg (ADR-026, `50` §2.7).
- Zu jedem Geburts-/Todesereignis entstehen **zusätzlich** Aussagen `geburtsdatum`/`todesdatum`/`geburtsort` — sonst bleibt `person_flach` datumsleer (es gibt keinen `abl_ereignis_*`-Trigger).
- `elternschaft.konfidenz` wird **nicht** geschrieben (bleibt NULL, ADR-026).
- Belege landen als `zitat`-Zeilen; der `$defs/Beleg` ist spaltenweise die `zitat`-Tabelle (`seite`, `eintragsnummer`, `band`, `jahr`, `transkript`, `uebersetzung`, `digitalisat_url`, `konfidenz`, `zeitmarke_sekunden`).
- `tmp:`-Kennungen werden zu UUID v7; `db:`-Kennungen ergänzen und ersetzen ohne `ueberschreiben: true` nichts.
- **Kein** Transaktionsrahmen in diesem Paket: die Klammer sitzt im Befehlsbus (`CLAUDE.md` §2 Regel 3). Der Schreibweg ist eine Funktion, die in einer offenen Transaktion läuft.

**Tests**
- `test/einheit/import-schreiben-abbildung.test.ts`: `beispiel-1-einfach.json` → erwartete Zeilen je Tabelle, inklusive der Existenz-Aussagen und der abgeleiteten Personen-Aussagen.
- `test/einheit/import-schreiben-belege.test.ts`: jedes Feld aus `$defs/Beleg` landet in der erwarteten `zitat`-Spalte; `zeitmarke_sekunden` aus `beispiel-3-interview.json`.
- `test/einheit/import-schreiben-person-flach.test.ts`: nach dem Schreiben trägt `person_flach` Geburtsjahr, Todesjahr und Geburtsort — der Beleg für den zweiten Abnahmepunkt.
- `test/einheit/import-schreiben-kennungen.test.ts`: `tmp:`→UUID v7, `db:` ohne `ueberschreiben` verändert nichts.

---

## AP-1.4a — Trockenlauf, Bericht, Plausibilität (kopflos)

**Auftrag** — D-10 (Trockenlauf), ADR-010 Punkt 3. Umsetzung nach `56_Import_Vertrag.md` §6.
Erste Hälfte des geteilten AP-1.4 (s. Schnittentscheidung): **keine Oberfläche** — die Ansichten
kommen in 1.4b nach AP-1.6, auf der fertigen Bausteinbibliothek.

**Umfang**
`src/main/import/{trockenlauf,bericht}.ts` · Kanal `befehl:import.trockenlauf` ·
Plausibilitätsregeln Stufe 3 in `src/core/plausibilitaet/regeln.ts` ·
Textfassung des Berichts (Serialisierung in `bericht.ts`, **ohne** Speicherdialog)

**Abnahme**
- **Der Trockenlauf ist der echte Import in einer Transaktion mit `ROLLBACK`** — kein zweiter Codeweg, kein `journalAus()` (Vorentscheidung). Der Bericht entsteht aus den `aenderung`-Zeilen, die geschrieben worden wären.
- Bericht enthält alle sieben Blöcke aus `56_Import_Vertrag.md` §6.2, in dieser Reihenfolge und mit den dort genannten Eigenschaften — insbesondere: die **Art der Rücknahme** steht oben, „wird ergänzt" listet jede einzelne Änderung, unverarbeitetes Material ist ein eigener Block (auch wenn leer), der Gesundheitsblock nennt die Exportsperre.
- Stufe 3 (IMP-301 bis IMP-310) und Stufe 4 (IMP-401 bis IMP-404) laufen und erscheinen als Hinweise.
- Prüfsumme wird gegen `import_lauf` geprüft: bekannte Prüfsumme → deutlicher Warnhinweis „schon importiert am …".
- Der Bericht ist als **Text** erzeugbar (der Rückweg zum Skill); das Schreiben der Datei über einen Dialog ist 1.4b.
- Das Urteil „Importieren gesperrt bei Fehlern > 0" liegt als **Feld des Berichts** vor, damit 1.4b nur noch anzeigen muss.
- Der Trockenlauf verändert die Datenbank nicht — auch nicht `transaktion`, auch nicht die abgeleiteten Tabellen.

**Tests**
- `test/einheit/trockenlauf-ohne-wirkung.test.ts`: kanonischer Abzug vor und nach dem Trockenlauf ist identisch.
- `test/einheit/trockenlauf-bericht.test.ts`: Für `beispiel-2-widersprueche.json` enthält der Bericht die erwarteten Zahlen, die erwartete Dublettenmeldung und die erwarteten Hinweise (darunter IMP-302 für die absichtlich falsche Elternkante).
- `test/einheit/plausibilitaet.test.ts`: jede Regel der Stufe 3 einzeln, mit einem Fall, der auslöst, und einem, der knapp nicht auslöst.
- `test/einheit/import-prüfsumme-doppelt.test.ts`: Zweiter Trockenlauf derselben Datei warnt.

---

## AP-1.4b — Importansichten (nach AP-1.6)

**Auftrag** — D-10, `72_Screens_und_Flows.md` S-10 bis S-13. Zweite Hälfte des geteilten AP-1.4.
**Läuft nach AP-1.6**, nicht in der Kette: die Ansichten entstehen auf den Atomen und Molekülen
aus `71` §2, nicht daneben.

**Umfang**
`src/renderer/ansichten/import/` — Dateiwahl (S-10), Berichtsanzeige (S-11), Fehlerliste (S-12),
Ergebnis (S-13) · Speicherdialog für den Textexport des Berichts

**Abnahme**
- Die vier Bildschirme nach `72` §S-10…S-13, gebaut aus den Bausteinen von AP-1.6 — keine eigene visuelle Sprache (`CLAUDE.md` §14).
- Bei Fehlern > 0 ist „Importieren" **sichtbar gesperrt**, mit dem Grund daneben; das Urteil kommt aus dem Bericht (1.4a), die Ansicht entscheidet nichts selbst.
- Der Bericht ist als Textdatei speicherbar (der Rückweg zum Skill).
- Alle Texte über i18next; kein Literal im JSX.

**Tests**
- `test/e2e/ablauf-import-trockenlauf.spec.ts`: Datei wählen → Bericht sehen → bei Fehlern ist „Importieren" gesperrt.
- Einheitentests je Ansicht nach dem Muster aus AP-1.6.

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

> **Vorentscheidung Umfang (18.09.2026, Nutzer):** Dieses Paket bringt die **erste
> Komponentenwelle** mit, nicht nur `tabelle` und `suchfeld`. Die ~10-Dateien-Grenze aus §12.4
> gilt hier **ausdrücklich nicht** — sie ist für kopflose Pakete gedacht; eine Bausteinbibliothek
> ist naturgemäß breit und flach. Gebaut werden: **alle 17 Atome aus `71` §2.1** (`Text`,
> `Symbol`, `Schaltflaeche`, `SchaltflaecheSymbol`, `Eingabekoerper`, `Abzeichen`,
> `KonfidenzPunkt`, `WiderspruchZeichen`, `Trennlinie`, `Fokusring`, `Ladeschimmer`, `TastenKappe`,
> `Zaehler`, `Umschalter`, `Kontrollkaestchen`, `Optionsfeld`, `Fortschritt`), das Template
> `T-Shell` aus §2.4, und **die Moleküle, die Liste und Suche brauchen** (voraussichtlich
> `Suchfeld`, `Filterchip`, `Tabellenzeile`, `Umschaltergruppe`, `Auswahlfeld`, `Blaetterleiste`,
> `LeerzustandBlock`, `KopfzeileAbschnitt`). Die übrigen Moleküle entstehen mit dem Bildschirm,
> der sie braucht — Atome sind in §2.1 vollständig spezifiziert, Moleküle ohne Verwendung wären
> Spekulation. **Checkpoint nach den Atomen**, bevor die Moleküle beginnen: sie setzen das
> Aussehen von allem, was danach kommt, und ein falscher Zug multipliziert sich.


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

## AP-1.10 — Listen- und Profilvertrag vervollständigen

**Auftrag** — C-16, C-17, A-17, E21, `CLAUDE.md` §14. Aus fünf §14-Vermerken derselben Klasse
(`docs/80` §16 und §19): `72` beschreibt Bildschirme, die die Zod-Verträge aus Phase 1 nicht
tragen. Einzeln „nicht blockierend", zusammen ein **Vertragsrückstand**, den jeder neue
Bildschirm erbt. **Keine Schemaänderung** — die Daten liegen alle, es fehlen Vertrag, Abfrage und
Anzeige.

**Umfang**
`src/shared/schemata/{person-liste,person-detail}.ts` · `src/main/abfragen/{person-liste,suche}.ts` ·
`src/renderer/bausteine/{datentabelle-format,datentabelle-spalten,filterleiste}*` ·
`src/renderer/ansichten/profil/beleg-liste.tsx`

**Abnahme** — je Punkt der `docs/80`-Eintrag, der ihn ausgelöst hat
- **U-1.6-spalten-datenvertrag:** `PersonListeZeile` trägt zusätzlich Beruf, Belegzahl und Kinderzahl; S-05 zeigt sie als wählbare Spalten.
- **U-1.6-lebensdaten-unschaerfe:** Lebensdaten tragen Modifikator und Präzision; die Zeile zeigt „etwa 1890 – 1961" statt „1890 – 1961". Die Datumsanzeige kommt aus dem Formatierer aus AP-1.1 (`{schluessel, werte}`), nicht aus neuer Formatierlogik im Renderer.
- **U-1.6-filterleiste-vier-filter:** Zeitraum, Ort und Strang ergänzen die vier vorhandenen Filter; `PersonListeFilter` und `abfrage:person.liste` tragen sie.
- **U-1.6-suche-ohne-filter-sortierung-seite:** `abfrage:suche` nimmt Filter, Sortierung und Seite entgegen — die Bedienelemente sind während einer Suche wirksam statt deaktiviert.
- **U-1.7-beziehung-platzhalter:** `PersonDetailBeziehung` trägt `ist_platzhalter` der verwandten Person; S-07 setzt Platzhalter farbunabhängig ab (A-17).
- **U-1.7-belegliste-zweistufig:** Belegdetail wird dreistufig (Quelle → Zitat → Transkript) und trägt `unmittelbarkeit` bei mündlichen Quellen (S-08).
- Die Budgets aus `55` §11 halten weiterhin gegen die 2.000er-Fixture — die breiteren Abfragen dürfen sie nicht reißen.

**Tests**
- `test/einheit/person-liste-vertrag.test.ts`: jedes neue Feld ist befüllt, auch wenn die Quelle NULL ist.
- `test/einheit/lebensdaten-anzeige.test.ts`: die Unschärfefälle aus AP-1.1 erscheinen in der Zeile wie im Formatierer.
- `test/einheit/suche-mit-filter.test.ts`: Suche + Filter + Sortierung + Seite zusammen, gegen die 2.000er-Fixture.
- `test/budget/leistung.test.ts`: Budgets nach der Verbreiterung erneut gemessen.
- Die sechs `docs/80`-Einträge werden geschlossen, nicht nur umformuliert.

---

## AP-1.11 — Symbolsatz beschaffen und die fehlenden Atome bauen

**Auftrag** — `71` §6 (Asset „Symbolsatz", als **Phase-0**-Asset geführt und nie beschafft),
`71` §2.1, `docs/80` U-1.6-atome-scope und U-1.6-leerzustand-ohne-symbol. Ohne Symbolsatz fehlen
vier der 17 Atome, `LeerzustandBlock` rendert ohne Symbol, und Spaltenicons sind
Unicode-Platzhalter. Der Rückstand wächst mit jedem Bildschirm; Phase 2 ist ohne Symbole nicht zu
bauen.

**Entscheidung (Nutzer, 18.09.2026): Phosphor Icons** — MIT, ~1.400 Namen in sechs Strichstärken,
`viewBox="0 0 256 256"`, `fill="currentColor"`. Begründung und Abwägung: ADR-027.

**Umfang**
`src/renderer/gestaltung/symbole/` (kuratierte SVG, **nur die benutzten**) ·
`src/renderer/bausteine/symbol.tsx` + `schaltflaeche-symbol.tsx` ·
`docs/lizenzen/MIT-Phosphor.txt` · `skripte/symbole-holen.ts` (einmaliger, nachvollziehbarer Abzug) ·
`71` §6 und §2.1 nachgezogen (beide Bäume)

**Abnahme**
- **Keine neue Abhängigkeit.** Die SVG werden als Dateien in den Baum kopiert (MIT erlaubt das), nicht als npm-Paket eingebunden — die App ist offline, die CSP lässt ohnehin nichts nachladen, und ein Paket mit 8.000 Dateien im Bündel wäre Ballast.
- `Symbol` inlined SVG über eine **typisierte Namensliste**; ein Tippfehler ist ein Typfehler, kein leeres Kästchen. Größe und Farbe kommen aus Tokens (`currentColor` + `--wz-text-*`), nie aus Festwerten.
- Strichstärke **Regular** als Grundgewicht, **Fill** nur für ausgewählte/aktive Zustände. Keine dritte Stärke ohne Begründung.
- Die vier fehlenden Atome sind gebaut: `Symbol`, `SchaltflaecheSymbol`, `Abzeichen`, `Trennlinie` — plus `TastenKappe`, `Zaehler`, `Kontrollkaestchen`, `Optionsfeld`, `Fortschritt`, `Fokusring`, soweit sie ohne Bildschirm sinnvoll prüfbar sind. Damit ist die erste Welle aus `71` §2.1 vollständig.
- `LeerzustandBlock` bekommt sein Symbol (S-19, „Symbol + Satz + Aktion").
- Die Unicode-Platzhalter in `datentabelle*` sind ersetzt.
- **Die fachlichen Symbole sind zugeordnet** (`71` §6, Phase-1-Satz): Geburt, Taufe, Trauung, Tod, Beerdigung, Auswanderung, Beruf, Militär, Quelle, Zitat, Archiv, Platzhalter, Implex, Widerspruch, Interview, Audio. Wo Phosphor nichts hat — **Trauung** und **Beerdigung** —, wird im selben 256er-Raster und derselben Strichstärke gezeichnet und als eigene Datei geführt, erkennbar getrennt von den übernommenen.
- **Kein Emoji** (`71` §4.3), kein Icon-Font, kein Laufzeit-Nachladen.

**Zusätzlich: die Zustandsbibliothek (S-19) als echte Seite**

`72` S-19 beschreibt „ein eigenes Artboard, das **alle** Zustände einmal nebeneinander zeigt";
`71` §10 Prinzip 4 nennt sie „den Beweis, dass Zustände Teil des Designs sind". Sie wird hier
gebaut — als Entwicklerseite in der Anwendung, nicht als Bild. Sie ist die Grundlage dafür, dass
die folgenden Oberflächenpakete als Kette laufen können, ohne dass nach jedem Paket jemand
hinsehen muss.

- `src/renderer/ansichten/zustandsbibliothek/` zeigt jedes Atom und Molekül in **allen** im
  Dokument genannten Varianten und Zuständen, dazu die fünf Leerzustände, die drei Ladeschimmer
  und die vier Fehlerzustände aus S-19.
- **Drei Wege hinein, alle drei gebaut:**
  1. **Im Programm:** ein Menüeintrag „Zustandsbibliothek" in einem Menü **Entwicklung**, das nur
     bei `!app.isPackaged` entsteht (dasselbe Kennzeichen wie in `ipc/huelle.ts` und
     `protokoll/logger.ts`). Das Menü baut `src/main/menue/menue.ts` ohnehin strukturiert auf; der
     Eintrag schaltet die Ansicht im Renderer um, so wie AP-1.6 zwischen Start und Liste umschaltet.
     Im ausgelieferten Paket existiert weder Menü noch Ansicht.
  2. **Als Bilder:** `pnpm bilder` schreibt nach `artefakte/bilder/` und legt daneben eine
     `kontaktabzug.html` — die vier Fassungen (hell/dunkel × beide Dichten) nebeneinander,
     beschriftet, in einer Datei, die man im Browser öffnet. Das ist der Weg, den der Nutzer an den
     Checkpoints geht: ansehen, nicht klicken.
  3. **Aus der CI:** dieselben Bilder als Artefakt am PR, damit ein Blick auch ohne lokalen Lauf möglich ist.
- Sie ist ein Werkzeug, kein Feature: keine Übersetzung der Beispieltexte nötig, kein Eintrag in
  `72`, keine Aufnahme in die Budgets.
- **Bildstrecke:** `test/e2e/zustandsbibliothek.spec.ts` fotografiert sie in **hell und dunkel ×
  beide Dichten** (vier Bilder) und legt sie als CI-Artefakt ab. `package.json` bekommt
  `pnpm bilder` für denselben Lauf lokal.
- **Jedes folgende Oberflächenpaket trägt seine Zustände hier ein.** Das steht ab sofort in der
  Abnahme jedes UI-Pakets; ein Baustein ohne Eintrag gilt als nicht fertig.

**Tests**
- `test/gestaltung/symbole-vollstaendig.test.ts`: jeder Name der typisierten Liste hat eine Datei, jede Datei einen Namen — beides ohne Waise.
- `test/gestaltung/bibliothek-vollstaendig.test.ts`: jeder Baustein aus `src/renderer/bausteine/` kommt in der Zustandsbibliothek vor. Ein neuer Baustein ohne Eintrag ist rot — sonst verwahrlost die Bibliothek genau dann, wenn sie gebraucht wird.
- `test/gestaltung/symbole-sauber.test.ts`: kein `fill`/`stroke` mit Festfarbe in den SVG (nur `currentColor`), kein `<script>`, keine externen Verweise.
- `test/einheit/symbol.test.ts`: rendert, trägt `aria-hidden` bei rein dekorativer Nutzung und einen Namen bei bedeutungstragender.
- Ein Einheitentest je neuem Atom nach dem Muster aus AP-1.6.

---

## AP-1.8 — Plausibilitätsprüfungen im Bestand

**Auftrag** — F-07 (Grundsatz). Stufe 3 der Importprüfung gibt es schon (AP-1.4a); hier laufen
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
gehört hierher, weil er ohne die Prüfung aus AP-1.3a/1.3b/1.4a nicht entwickelt werden kann: Der
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

## AP-1.25 — Bildvergleichs-Gate (Referenzbilder)

**Auftrag** — ADR-012, ADR-025, `CLAUDE.md` §13. **Der Grund, warum die Oberflächenpakete als
Kette laufen dürfen.** Ohne dieses Gate kann ein späteres Paket einen fertigen Bildschirm still
verändern, und niemand sieht es, bis jemand hinschaut. Setzt AP-1.11 voraus (die
Zustandsbibliothek ist das Hauptmotiv).

**Umfang**
`test/golden/bilder/` (Referenzbilder, **geschützter Prüfpfad**) ·
`test/e2e/bildvergleich.spec.ts` · `playwright.config.ts` (Vergleichsschwellen) ·
`package.json` (`bilder:erneuern`)

**Abnahme**
- Playwright `toHaveScreenshot` gegen eingefrorene Referenzbilder für: Zustandsbibliothek (hell/dunkel × beide Dichten), Startansicht, Liste, Profil, Importansichten.
- **Nur macOS** vergleicht pixelgenau; der Windows-Lauf legt seine Bilder weiter als Artefakt ab (ADR-012), vergleicht aber nicht — Schriftrasterung unterscheidet sich, ein Vergleich wäre nichtdeterministisch rot und würde nach `CLAUDE.md` §13 „wegoptimiert".
- Schwelle so eng wie deterministisch möglich; jede Lockerung steht mit Begründung in der Konfiguration.
- **`bilder:erneuern` ist ein bewusster Akt**: Referenzbilder liegen in `test/golden/` und lösen damit das Prüfpfad-Gate aus (ADR-025). Ein Paket, das Bilder erneuert, begründet im PR **welche und warum** — „sieht jetzt anders aus" ist keine Begründung, „Spaltenbreite folgt jetzt dem Inhalt (AP-1.x)" ist eine.
- Ein Paket, das einen bestehenden Bildschirm verändert, **ohne** das Referenzbild bewusst zu erneuern, macht das Gate rot. Das ist der Zweck.

**Tests** — das Gate ist der Test. Rot-Beleg: eine Farbe in einem Baustein um einen Tokenschritt
verändern, Vergleich muss rot werden; zurücknehmen.

---

# Person bearbeiten und Medien — neuer Entwurf (geschnitten 22.09.2026)

> **Grundlagen, beide versioniert (`CLAUDE.md` §14):**
> `docs/design/Wurzelwerk Person bearbeiten.dc.html` (Artboards 1a–1d, 2a–2c, 3a–3c) und
> `docs/design/Entwicklungsvorgaben Person bearbeiten & Medien.md` (Datenmodell, Verhalten,
> Akzeptanzkriterien). Bei Widerspruch zwischen den beiden gilt das Vorgabendokument (so sagt es selbst).
> **Der Transporthinweis ist verbindlich:** die dort als REST formulierten Endpunkte werden **1:1 auf
> Befehle und Abfragen des Busses abgebildet**, Namen und Nutzlasten bleiben — die Konventionen
> dieses Repos haben Vorrang vor der Syntax dort.
>
> **Vier Entscheidungen des Nutzers (22.09.2026), sie gehen allem vor:**
> 1. **Zerlegtes Namensmodell mit Migration** — `name_form` + `name_part` wie im Entwurf.
> 2. **Kein Papierkorb, kein `deleted_at`.** Löschen bleibt eine Transaktion, die Undo zurückholt;
>    das Journal ist die Wahrheit. Der Papierkorb des Entwurfs ist eine §14-Abweichung.
> 3. **Kein Schloss am Gesundheitsreiter.** Er verhält sich wie jeder andere Reiter, mit Zähler;
>    die Trennung ist visuell, dazu die Exportsperre M-08. Kein Rechtesystem (ADR-001: kein Konto).
> 4. **ISO 9 bleibt fest** (ADR-014). `language_profile.default_transliteration_scheme` wird
>    **nicht** gebaut; die Umkehrbarkeits-Invariante aus AP-1.2 gilt unverändert.
>
> **Was das Vorgabendokument „Fundament" nennt (§9 Phase 1), steht größtenteils schon:** FuzzyDate
> = `src/core/datum` (AP-1.1), Confidence = `konfidenz` 1..4 überall im Schema, `change_log` + Undo
> = Journal aus Phase 0, Sprachprofile = `name.sprache`/`.schrift`. **Autosave passt sogar
> überraschend gut:** die geforderten 400 ms Debounce schreiben einzelne Befehle, und die
> Koaleszenz aus AP-0.15 (gleicher Schlüssel, < 2000 ms) fasst sie zu **einem** Undo-Schritt
> zusammen — genau das, was Akzeptanzkriterium 1a verlangt.
>
> **Kettenschnitt (23.09.2026, Review):** Kette 3a = 1.29 → [1.33, 1.34 einzeln] → 1.30 → 1.32,
> Checkpoint 3 · Kette 3b = [1.31a einzeln] → 1.31b → 1.31c → 1.31d → 1.19, Checkpoint 4 ·
> Kette 4 = 1.18 → 1.23 → 1.24 → 1.21 → 1.22. Die drei Migrationen (0006 Namen, 0007 Querschnitt,
> 0009 Medien) laufen einzeln über `/ap`. Maßgeblich ist `.claude/commands/kette-ui.md`.

## AP-1.29 — Fehlende Schreibwege und Bildlücken (Vorpaket)

**Auftrag** — ADR-026, `docs/80` §29, Checkpoint 2. **Läuft vor allem anderen.**

1. **`aussage_zitat.anlegen` / `.loeschen`** — ein Beleg lässt sich an eine Aussage hängen und wieder lösen. Heute bleibt jede neu angelegte Quelle unverknüpft.
2. **`aussage.aendern`** — eine Aussage ist nur anlegbar und löschbar; jede Korrektur wäre Löschen + Neuanlegen mit zerrissener Herkunft.
3. **`abfrage:quelle.suche`** — ohne sie kein Quelle-Picker (`docs/80` §29).
4. **Die zwei fehlenden Referenzbilder** („Person bearbeiten", „Orte") plus geschärfte Kettenregel: **ein Paket mit neuem Bildschirm ohne neues Referenzbild hält die Kette an.**

**Tests** — je Befehl Wirkung/Undo/Redo/Fehlerfall; `undo-bitgleich` erweitert (**PR-B**, geschützter Prüfpfad); Bildvergleich um zwei Motive erweitert.

---

## AP-1.33 — Namensmodell zerlegen (Migration 0006)

**Auftrag** — Entwurf Artboard 2a, Vorgaben §2.3, Nutzerentscheidung 22.09.2026.
**Korrektur meiner ersten Analyse:** Ich hatte behauptet, der Namen-Reiter sei ohne Migration
baubar, weil `name` bereits `sprache`, `schrift`, `praefix`, `titel_vor` und `zusatz_nach` trägt.
Das war falsch. Der Entwurf führt **jeden Namensbestandteil als eigene Zeile** — sortierbar, mit
Vatersname als eigenem Typ und femininer Variante. Das flache Spaltenmodell kann das nicht.
**Muss vor AP-1.30 laufen**, sonst wird der Namen-Reiter zweimal gebaut. **Läuft einzeln über `/ap`, nicht in der Kette** (Migration; Nachtrag 23.09.2026).

**Umfang**
`docs/schema/0006_namensformen.sql` · `src/main/befehle/{namensform,namensteil}-*.ts` ·
`src/core/name/anzeigename.ts` (Rückfallkette) · `src/shared/schemata/name.ts` ·
Datenumzug aller bestehenden Namen

**Migration 0006**
- **`name_form`**: `person_id`, `sprache` (BCP-47), `schrift` (Latn/Cyrl/…), `reihenfolge` (`vorname_zuerst`/`nachname_zuerst`), `rolle` (aus dem bestehenden `name.typ` übernommen: geburtsname, ehename, vulgo, latinisiert, ordensname, aka, sonstiges — plus `rollen_notiz` für „amtlich ab 1946"), `ist_bevorzugt` (**genau eine je Person, DB-Constraint** — Akzeptanzkriterium 2a), `umschrift_von`, `umschrift_norm`, `konfidenz`, `sortier_index`.
- **`name_part`**: `name_form_id`, `art` (`vorname`, `praefix`, `nachname`, `suffix`, `titel`, `vatersname`), `wert`, `ist_rufname` (nur bei `vorname`, höchstens einer je Form), `sortier_index`, `feminine_variante`.
- **Datenumzug**: jede bestehende `name`-Zeile wird zu einer `name_form` mit ihren Bestandteilen als `name_part`-Zeilen. `vornamen` wird an Leerzeichen zerlegt, `rufname_index` wird zu `ist_rufname` an der richtigen Stelle. **Verlustfrei und umkehrbar prüfbar** — das ist die Abnahme.
- ~~`name` bleibt zunächst bestehen und wird erst entfernt, wenn nichts mehr darauf zeigt.~~ → ersetzt durch Entscheidung 2 unten.

**Nutzerentscheidungen 23.09.2026 (Review) — gehen dem Text oben vor**
1. **Verlustfreies Modell, erweitert gegenüber dem Entwurf.** `name_form` bekommt zusätzlich `gueltig_von`/`gueltig_bis` (Datumsgruppe wie heute, „amtlich ab 1946" bleibt **Datum**, nicht Notiz) und `original_text`. Die `rolle`-Liste bekommt zusätzlich **`beruf`**. `name.typ = 'transliteriert'` wird **keine Rolle**, sondern eine Form mit gesetztem `umschrift_von`. `rufname_text` wird ein `name_part` (`art = vorname`, `ist_rufname = 1`), sofern der Rufname nicht schon unter den Vornamen steht. Jeder Wert der alten Zeile hat einen benannten Zielort — die Abnahme „verlustfrei" gilt wörtlich.
2. **Harter Schnitt in diesem Paket, keine Parallelführung.** 1.33 stellt **alle** Schreiber und Leser um: Befehle `name.*` aus AP-1.12, Import-Schreiblogik (`schreibeImport`, der Importvertrag v1 bleibt unverändert, nur der Writer bildet ab), `suche.ts`, `person-liste.ts`, `person-detail.ts`, `abgeleitet-projektion.ts`, FTS/`person_flach` (`0003`), Trigger, `personenwaehler`, Maske aus AP-1.14. `name` wird in 0006 nach dem Datenumzug **entfernt**. Die Invarianten `trockenlauf-gleich-import` und `abgeleitet-gleich` laufen gegen das neue Modell. Wird das Paket dafür zu groß (`CLAUDE.md` §12.4), schneidet der `planer` in PR-A (Migration + Schreiber) / PR-C (Leser) — `name` darf aber in keinem gemergten Zwischenstand **beschrieben** werden.
3. **IDs bleiben erhalten.** `name_form.id` übernimmt die alte `name.id`. Sonst verwaisen `aussage` (`subjekt_typ = 'name'`), `medium_zuordnung` (`subjekt_typ = 'name'`) und `umschrift_von` — beide Subjektverweise sind polymorph, kein FK fängt es.
4. **„Genau ein Hauptname"** = partieller UNIQUE-Index (höchstens einer) **plus** Trigger (mindestens einer, sobald die Person eine Form hat). Der Wechsel des Hauptnamens ist **ein** Befehl, der beide Zeilen in einer Transaktion umstellt; Platzhalter ohne Namen sind erlaubt.

**Abnahme**
- **Genau ein Hauptname je Person**, erzwungen von der Datenbank, nicht von der Oberfläche.
- Leere Bestandteile werden **nicht persistiert** (Vorgaben §2.3).
- **Anzeigename-Auflösung** als reine Funktion in `src/core`: Sprache → Umschrift → Hauptname, Rückgabe `{text, quelle, formId}`. **Einmal implementiert**, von Liste, Karte, Suche und Export benutzt — nicht zweimal.
- `sortier_name` („Gutnoff, Karl Friedrich Wilhelm", Präfix zählt nicht mit).
- Umschrift bleibt **ISO 9** (ADR-014); `umschrift_norm = manuell` wird nie überschrieben.
- Die Suche findet eine Person über **jede** ihrer Formen und Umschriften (Akzeptanzkriterium 2a: „Гуытнаты" findet Karl Gutnoff).
- **Fixture-Datenbank auf Stand 5 eingefroren**, `pnpm trigger` neu gelaufen, `person_flach` und FTS nachgezogen.

**Tests** — Datenumzug verlustfrei (kanonischer Abzug vor/nach, **jede alte Spalte jeder alten Zeile** an ihrem Zielort wiederfindbar, IDs gleich; ein Fixture je alter `typ`-Ausprägung); Constraint „genau ein Hauptname" mit Gegenprobe; Rückfallkette einzeln; Suche über Formen; `undo-bitgleich` über die neuen Befehle (**PR-B**).

---

## AP-1.34 — Querschnitt des Editors: Kennung, Textanker, offene Punkte, Plausibilität am Feld

**Auftrag** — Vorgaben §2.1 (Citation), §2.2 (`display_id`), §5.5, §5.6. Vier kleine Dinge, die
**jeder** Reiter braucht und die sonst dreimal halb gebaut werden.

- **Menschenlesbare Kennung** (`P-0142`): laufende Nummer je Projekt, stabil, unabhängig von der UUID. Ein Wert, der im Kopf steht und in Verweisen zitiert wird — darum vergeben und nie neu vergeben, auch nach Löschen nicht. **Nutzerentscheidung 23.09.2026:** der Zähler liegt in einer Tabelle unter `NICHT_JOURNALISIERT` und läuft nur vorwärts; `person.kennung` selbst ist journalisiert. Ein Undo von `person.anlegen` entfernt die Person, die Nummer bleibt verbraucht. `undo-bitgleich` nimmt **genau diese eine Zählertabelle** aus dem Vergleich — per ADR-Nachtrag, im **PR-B** (geschützter Prüfpfad), mit Gegenprobe, dass jede andere Tabelle weiter bitgleich verglichen wird.
- **Beleg an der einzelnen Angabe**: `aussage_zitat` um `feld` und `textanker` erweitern (Offset/Bereich in `zitat.transkript`). Damit trägt „Belegte Angaben · zur Stelle springen" aus Artboard 2c. **Kein neues Belegmodell** — ADR-026 gilt: der Beleg hängt an der Aussage, der Anker sagt nur, *wo im Transkript*.
- **Offene Punkte** als Regelwerk (`id, reiter, feld, meldungsschluessel`): Sterbeort fehlt, Elternteil nicht zugeordnet, kein Porträt, Kind ohne Partnerschaft, Widerspruch vorhanden. Speist rechte Spalte, Reiterpunkt und schmale Fußleiste. Erweiterbar, nicht hart verdrahtet.
- **Plausibilität am Feld**: die Regeln aus AP-1.8 liefern zusätzlich feldbezogene Warnungen in jeder Personenantwort. **Gespeichert wird trotzdem** — eine Warnung blockiert nie (Vorgaben §1).
- **Vollständigkeitsgrad**: die Definition von „Kernangabe" wird hier **einmal** festgelegt und dokumentiert, statt in der Oberfläche zu entstehen.

**Migration 0007** (Nachtrag 23.09.2026, Review): Zwei der vier Punkte sind Schemaänderungen —
`aussage_zitat` um `feld` und `textanker`, `person` um die stabile Kennung (Spalte plus
Vergabestelle). Das Paket läuft deshalb **einzeln über `/ap`, nicht in der Kette** (`kette.md`:
„Eine Migration entsteht" ist Abbruchgrund). Fixture-Datenbank auf Stand 6 eingefroren,
`pnpm trigger` neu gelaufen. Kennung und `undo-bitgleich`: **entschieden** (Nutzer 23.09.2026),
siehe Punkt „Menschenlesbare Kennung" oben — Zähler nicht journalisiert, Ausnahme per ADR-Nachtrag
im PR-B.

---

## AP-1.30 — Person bearbeiten: Gerüst und Reiter

**Auftrag** — Artboards 1a/1b/1d, Vorgaben §1 und §8. Ersetzt die Maske aus AP-1.14.
Setzt AP-1.29, AP-1.33 und AP-1.34 voraus. **Ohne** Medien (AP-1.31) und ohne Gesundheitsinhalte
(AP-1.19) — der Reiter existiert, sein Inhalt kommt dort.

**Abnahme — die Regeln des Entwurfs sind Abnahmekriterien, nicht Stilfragen**
- **Höchstens acht Reiter.** Beim Öffnen steht immer „Person" oben, die Reiterwahl wird **nicht** gemerkt. Reiterwechsel speichert. Kein Reiter außer dem ersten hat Pflichtangaben.
- **Zähler am Reiter, keine Prozentwerte**; ein Punkt heißt: dort liegt ein offener Punkt. **Der Gesundheitsreiter trägt einen Zähler wie alle anderen — kein Schloss** (Nutzerentscheidung).
- **Kein Speichern-Knopf**: Blur oder 400 ms Debounce schreibt, Kopf zeigt „Gespeichert · gerade eben" / „Speichert …" / „Nicht gespeichert — erneut versuchen". Die Koaleszenz aus AP-0.15 macht daraus **einen** Undo-Schritt — **aber nur, wenn der Befehl einen `koaleszenzSchluessel` trägt.** Heute hat ihn einzig `person.feldSetzen` für `notiz` (Stand 23.09.2026). Jeder Befehl, den der Autosave schreibt, bekommt einen Schlüssel (Befehl + Subjekt + Feld); ohne ihn ist Akzeptanzkriterium 1a nicht erfüllt.
- **Abgeleitete Werte** sind sichtbar, gesperrt und beschriftet („aus Beziehung abgeleitet"), nie editierbar.
- **Feldbreite folgt dem Inhalt**; Wiederholbares wird Liste, nie „Feld 2, Feld 3". **Sicherheit steht neben dem Wert.**
- **Reiter Person:** Hauptname, Rufname, Kurzbeschreibung, Geschlecht, Lebensstatus, Geburt und Tod je mit Datum, Genauigkeit, Ort, Sicherheit, Beleg. Tod-Gruppe erscheint nur bei „verstorben" — **Werte bleiben gespeichert**, wenn wieder auf „lebend" gestellt wird (Akzeptanzkriterium 1a).
- **Reiter Namen:** Liste + Modal auf dem Modell aus AP-1.33, mit Vorschau-Umschalter und Rückfallkette.
- **Reiter Leben:** Stationen mit Zeitspur; die Zeitspur ist **reine Anzeige**, berechnet aus Anfang/Ende relativ zur Lebenszeit.
- **Reiter Beziehungen:** Eltern, Partnerschaften mit den Kindern darunter, **Geschwister abgeleitet und nicht editierbar**; Halb- und Vollgeschwister unterscheidbar; ein Kind ohne Partnerschaftszuordnung erzeugt einen offenen Punkt. Löschen einer Beziehung lässt beide Personen bestehen.
- **Reiter Notizen** (Freitext) und **Verwaltung** (Kennung, Herkunft des Datensatzes, Verlauf, Löschen). **Kein Papierkorb** (Nutzerentscheidung); „Zusammenführen" steht als deaktivierter Eintrag mit Hinweis „Phase 4", nicht als stiller Leerlauf.
- **Rechte Spalte:** Vollständigkeit, offene Punkte, die letzten drei Verlaufseinträge — über **die** Verlaufsabfrage, die AP-1.23 später für S-16 wiederverwendet (nach Subjekt gefiltert, siehe dort). **Ohne Benutzername** — es gibt nur einen Nutzer (ADR-001).
- **Schmales Fenster:** bei 1099 px greift das Layout aus Artboard 1d vollständig.
- **Tastatur:** `1…8` wählt Reiter (nicht in Textfeldern), `⌘Z`/`⌘⇧Z` global.

**Tests** — e2e je Reiter; „Feldänderung ist in ≤ 1 s gespeichert und `⌘Z` stellt sie zurück"; Reiterzähler stimmen mit den Daten; Bildvergleich für alle acht Reiter in hell und dunkel, plus 1099 px; **je Reiter ein Test „zehn Tastenanschläge in < 2 s = ein Undo-Schritt"** (fängt einen fehlenden Koaleszenzschlüssel).

---

## AP-1.32 — Person anlegen: Schnellanlage mit Dublettenprüfung

**Auftrag** — Artboard 1c, Vorgaben §5.4. Setzt AP-1.33 voraus (die Prüfung läuft über **alle**
Namensformen und Umschriften).

**Abnahme** — Dialog über abgedunkeltem Hintergrund, vier Angaben. **Dublettenprüfung während der
Eingabe**: Score aus Namensähnlichkeit über alle Formen und Umschriften (Kölner Phonetik aus
AP-0.7), Geschlecht, Geburtsjahr ± 5, Ort, bestehende Beziehung zur Bezugsperson; höchstens drei
Treffer, jeder mit sichtbarer Begründung; Schwelle konfigurierbar. „Das ist sie" legt **keine**
neue Person an. „Anlegen & weitere" behält Nachname und Beziehungsart. Vorbelegung aus der
Beziehung, aus der man kommt. „Später benennen" legt einen Platzhalter an (A-17).
`⌘⏎` / `⌘⇧⏎` / `Esc` (mit Nachfrage). **Zwei der drei Einstiege gehen** (aus der Suche, aus einer
Beziehung); **„aus dem Baum" ist Phase 2**, „aus Gespräch" kommt mit AP-1.21.

---

## AP-1.31a — Medien: Kern und Ablage (Migration 0009)

> Nachtrag 25.09.2026 (Vorarbeiten AP-1.30, PR 6): Migration 0008 ist die Index-Migration (`0008_indizes.sql`); die Medienmigration dieses Pakets wird **0009**.

**Auftrag** — Artboards 2c/3a–3c, Vorgaben §2.7 und §5.8. **Ersetzt den Zuschnitt von AP-1.20.**
Der Entwurf verlangt deutlich mehr als „Medien zuordnen" — hier entsteht nur das Fundament.

**Migration 0009 — fünf neue Tabellen, Spaltenerweiterungen und eine CHECK-Erweiterung**
| Was | Warum |
|---|---|
| **`herkunft`** (`bezeichnung`, `art`: privat/archiv/gespraech/sonstiges, `standort_original`, `rechte`: familie/archiv/gemeinfrei, `archiv_signatur`, Farbton) | „Genau eine je Medium, trägt Eigentümer, Rechte und Standort — die erbt jedes Medium darin." Deckt sich **nicht** mit `quelle`: eine Quelle ist ein Werk, ein Konvolut ist ein Fundzusammenhang. |
| **`medium_text`** (`art`: transkription/uebersetzung, `sprache`, `inhalt`, volltextindiziert) | Transkription am Medium, nicht nur am Zitat |
| ~~`medium_bereich`~~ → **bestehende `medium_region`** (`0002_kern.sql`, x/y/w/h relativ 0–1, `person_id`) | Personen im Bild markieren; erzeugt automatisch eine Zuordnung. **Keine neue Tabelle** — `medium_region` steht seit Schema v1 (Nachtrag 23.09.2026). Damit **fünf** neue Tabellen. |
| **`schlagwort`** + **`medium_schlagwort`** (normalisiert, ohne Diakritika) | vierte Ordnungsebene |
| **`gesicherte_ansicht`** (`filter` als JSON, `sortierung`, `modus`, `ist_system`) | „Ansicht sichern"; Systemansichten nicht löschbar |
| `medium` um `herkunft_id` (Pflicht), `art`, `breite`, `hoehe`, `dauer_s`, `sprache`, `schrift`, `hat_rueckseite` | |
| `medium_zuordnung` um `portraet_ausschnitt`; **`subjekt_typ`-CHECK um `'aussage'`** | „Jedes Medium kann an mehreren Personen **und an einzelnen Angaben** hängen" — der CHECK (`0002_kern.sql:419`) lässt `aussage` nicht zu. **Tabellenneubau**, wie AP-1.3c Punkt 5. |

**Nicht gebaut:** `deleted_at`/Papierkorb (Nutzerentscheidung), `show_for_living_guest` (setzt den
Gastzugang aus Phase 4 voraus — als §14-Abweichung vermerkt), `media.folder_id` (die Vorgaben
sagen selbst: bis zur Entscheidung nicht bauen, nur nicht verbauen).

**Nutzerentscheidung 23.09.2026 — Ablage umstellen, mit Umzug:** Dateiname = SHA-256 + Endung (ersetzt die Vorentscheidung `medien/<uuid7>.<endung>` aus Phase 1). 0009 benennt bestehende Dateien im Projektordner **einmalig** um und schreibt `medium.pfad` nach; die Medienkopie des Imports (`src/main/import/medienkopie.ts`) wird im selben Paket umgestellt — danach gibt es genau ein Ablageschema. Der Umzug ist **absturzsicher** (erst kopieren/umbenennen, dann DB, Wiederanlauf erkennt halbfertige Umzüge) und mit Schnappschuss davor. Zwei Medien mit gleichem Hash sind eine Datei.

**Abnahme** — Datei **inhaltsadressiert** über SHA-256 im Projektordner, Original unverändert, nie
verschoben, nie von außen verlinkt; Vorschauen asynchron; große Dateien nie ganz in den Speicher;
PDF seitenweise. `ist_titelbild` höchstens einmal je Person (Constraint), nur bei Bildern.
Fixture-Datenbank auf Stand 7 eingefroren. **Läuft einzeln über `/ap`, nicht in der Kette** (Migration; Nachtrag 23.09.2026).

---

## AP-1.31b — Reiter „Belege & Medien", Dokumentansicht, Porträt

**Abnahme** — **Kein eigenes Profilbild-Feld**: alle Bilder in einer Sammlung, genau eines als
Porträt markiert. Porträt festlegen über **Bildmitte** (Rahmen), Original bleibt unbeschnitten,
Vorschau in Karte/Baum/Liste/Zeile. Dokumentansicht mit Vorschau, Transkription, Übersetzung und
**belegten Angaben mit „zur Stelle springen"** (Textanker aus AP-1.34). Personen im Bild markieren
erzeugt die Zuordnung automatisch. Ein Porträtwechsel verändert **keine Datei**
(Akzeptanzkriterium 2c).

**Übernommen aus AP-1.20 (A-10, A-16; Nachtrag 23.09.2026):** Die Dokumentansicht spielt auch
**Audio** ab. Zeitmarken zeigen auf einen Beleg (`zitat.zeitmarke_sekunden` aus AP-1.3c), ein
Klick springt in die Aufnahme. Keine Wiedergabe über das Netz, kein Nachladen von Codecs.

---

## AP-1.31c — Medienbestand mit Filtern und gesicherten Ansichten

**Abnahme** — Flacher Bestand, **keine Ordner**; vier Ordnungsebenen (Herkunft, Verknüpfung, Art,
Zeit/Schlagwort). Filter als JSON-Spezifikation, serverseitig in SQL übersetzt — **eine** Stelle,
nicht je Ansicht neu. Systemansichten „Ohne Zuordnung", „Ohne Datierung", „Zu transkribieren",
„Zuletzt hinzugefügt" (ohne „Papierkorb" — es gibt keinen). Stapelaktionen auf eine Auswahl sind
**ein** Undo-Schritt, auch bei hundert Medien (Akzeptanzkriterium 3a). Ein Medium erscheint
gleichzeitig in Herkunft, Personenreiter und passender Ansicht — **ohne Duplikat**.

---

## AP-1.31d — Stapel-Import

**Abnahme** — Eine Herkunft für den ganzen Stapel, dann Tastaturdurchlauf (`⏎ → ← P D X`).
Dublettenerkennung über den Hash: **dieselbe Datei unter anderem Namen wird erkannt**
(Akzeptanzkriterium 3c). Bericht „96 Dateien · 84 übernommen · 9 Dubletten · 3 nicht lesbar".
Hintergrundverarbeitung, Aufräum-Stapel für Zurückgestelltes. **Ohne Texterkennung** — die
Vorgaben lassen sie offen (§10.3); ohne OCR fallen Vorschläge auf Dateiname und vorherige Eingabe
zurück, und genau so wird es gebaut.

---

### §14-Abweichungen vom Entwurf — was bewusst nicht kommt

| Was der Entwurf zeigt | Entscheidung |
|---|---|
| **Papierkorb / `deleted_at`** | Nicht gebaut (Nutzer, 22.09.2026). Löschen bleibt ein Undo-Schritt; zwei Wahrheiten über „gelöscht" wären schlimmer als ein fehlender Papierkorb. |
| **Schloss am Gesundheitsreiter, „getrennt rechtebar"** | Schloss gestrichen (Nutzer). Zähler wie überall, Trennung visuell, Exportsperre M-08 bleibt. Kein Rechtesystem — es gibt keinen zweiten Nutzer. |
| **`created_by` / Benutzername im Verlauf** | Entfällt. Ein Nutzer, kein Konto (ADR-001). |
| **Umschrift je Sprache konfigurierbar** | ISO 9 fest (ADR-014, Nutzer). Als offener Punkt vermerkt. |
| **`show_for_living_guest`** | Setzt den Gastzugang/Lesemodus aus Phase 4 voraus. |
| **„Aus dem Baum" anlegen** | Phase 2. |
| **„Zusammenführen"** | Phase 4 — als deaktivierter Eintrag mit Hinweis sichtbar. |
| **Texterkennung im Stapel-Import** | Offen laut Vorgaben §10.3; ohne OCR Rückfall auf Dateiname. |
| **Einstufige Ordnerebene für Medien** | Laut Vorgaben §10.2 bewusst noch nicht bauen — nur nicht verbauen. |

---

# Phase 1 — zweiter Teil: Erfassen von Hand (geschnitten 18.09.2026)

> Bis hierher ist die **einzige** Schreibstrecke der Importvertrag. Dieser Teil macht die App zum
> Werkzeug statt zum Betrachter. Die Reihenfolge folgt der Abhängigkeit, nicht dem Reiz:
> **Befehle vor Feldern, Felder vor Masken, Masken vor Komfort.**
>
> **Zwei Regeln, die für jedes Paket dieses Teils gelten** (`70_UX_Konzept.md` §4, ADR-003):
> 1. **Kein Speichern-Knopf.** Jede Änderung ist ein Befehl über den Bus, sofort wirksam, durch
>    Undo zurückholbar. Wer einen Speichern-Knopf vorschlägt, hat den Entwurf nicht gelesen.
> 2. **Jede Eingabe ist eine Aussage** (ADR-026): mit Konfidenz und Beleg, nicht als nacktes Feld.
>    Die fünf tragenden Eingabefelder aus `71` §3 sind deshalb ein eigenes Paket und kommen früh.
> 3. **Pfade wählt man nie durch Tippen** (`70_UX_Konzept.md`, Regel vom 19.09.2026): Wo ein Ordner
>    oder eine Datei gewählt, geöffnet oder angelegt wird, öffnet sich der **Systemdialog** —
>    Finder bzw. Explorer. Ein Textfeld für einen Pfad ist kein Ersatz und kommt nicht vor.
>    Die Mechanik steht in `src/main/import/dialog.ts` (AP-1.4b) und wird nicht zweimal geschrieben.

---

## AP-1.28 — Bausteinkorrekturen aus Checkpoint 1

**Auftrag** — `71` §2.1, `71` §5, `CLAUDE.md` §14. **Die Sammelstelle für das, was der Nutzer an
Checkpoint 1 gesehen hat.** Läuft **zuerst** in Kette 2: die Bausteine tragen alles Folgende, und
eine Korrektur hier kostet ein Paket, nach Kette 2 kostet sie sechs.

**Befund 1 — Trefferfläche und sichtbare Größe sind vermischt (belegt 19.09.2026).**
Vier Bausteine setzen `min-width`/`min-height: var(--wz-trefferflaeche-min)` (32 px) auf das
**sichtbare** Element statt auf die Klickfläche. Die entworfenen Maße aus
`Wurzelwerk Komponenten.dc.html` werden dadurch überschrieben:

| Baustein | Entwurf | Ist | Wirkung |
|---|---|---|---|
| `Umschalter` | Spur 38 × 22, Radius voll, Knopf 16 × 16 | ≥ 32 × 32 | wirkt fast kreisrund statt als Pille — **vom Nutzer gemeldet** |
| `Kontrollkaestchen` | 18 × 18, Radius 4 px | ≥ 32 × 32 | zu groß, Radius wirkt verloren |
| `Optionsfeld` | 18 × 18, Punkt 9 × 9 | ≥ 32 × 32 | zu groß |
| `Schaltflaeche` | — | ≥ 32 × 32 | **korrekt**, nicht anfassen |

**Abnahme**
- Die drei kleinen Bedienelemente haben ihre **entworfene sichtbare Größe** zurück; die Maße stehen als Tokens oder als begründete Festwerte im Baustein, nicht als Zufall.
- Die **Trefferfläche bleibt ≥ 32 × 32 px in beiden Dichten** (`71` §5) — erreicht über Polster oder ein unsichtbares `::before`, das die Nachbarn **nicht** verschiebt. Das ist der Kern: sichtbare Größe ≠ Klickfläche.
- `Schaltflaeche` bleibt unverändert.
- Die Zustandsbibliothek zeigt alle vier in allen Zuständen; im Kontaktabzug ist die Pille als Pille erkennbar.
- **Referenzbilder bewusst erneuert**, im PR begründet: „Umschalter/Kontrollkästchen/Optionsfeld auf die entworfenen Maße zurückgeführt (AP-1.28)". Der alte Stand war eingefroren, aber falsch — ein Lehrstück für die Grenze des Bildvergleichs, das in den PR-Rumpf gehört.

**Befund 2 ff. — weitere Funde aus Checkpoint 1**
Dieses Paket ist bewusst offen: Was der Nutzer beim Durchsehen der Zustandsbibliothek und der
Anwendung sonst noch findet, wird hier gesammelt, bevor Kette 2 startet. Jeder Fund kommt mit
Beleg (Bild oder Datei- und Zeilenverweis) und mit dem Entwurfsmaß, gegen das er verstößt. **Ist
kein Entwurfsmaß auffindbar, ist es kein Fund für dieses Paket**, sondern ein §14-Vermerk.

**Tests**
- `test/einheit/trefferflaeche.test.ts`: für jeden der vier Bausteine ist die **Klickfläche** ≥ 32 × 32 px in beiden Dichten und die **sichtbare Box** so groß wie entworfen. Der Test, der genau diese Verwechslung künftig rot macht.
- Bildvergleich grün gegen die erneuerten Referenzbilder.

---

## AP-1.26 — Startansicht gestalten und Pfadfelder durch Systemdialoge ersetzen (S-01, S-04)

**Auftrag** — `72` S-01/S-04, `70_UX_Konzept.md` (Regel „Pfade wählt man nie durch Tippen"),
`CLAUDE.md` §14. **Der erste Bildschirm, den man jedes Mal sieht, ist der einzige, den nie jemand
gestaltet hat.** `start-ansicht.tsx` stammt unverändert aus Phase 0: kein einziges `className`,
kein Baustein, keine CSS-Datei; AP-1.6 hat sie nur verdrahtet. Liste, Profil und Import sind
gestaltet, der Eingang nicht. Steht **am Anfang von Kette 2**.

**Umfang**
`src/renderer/ansichten/start/` (Gestaltung, `T-Shell`, vorhandene Bausteine) ·
`src/main/dialoge.ts` (aus `src/main/import/dialog.ts` herausgezogen und verallgemeinert) ·
IPC-Kanäle für Ordnerwahl · `test/golden/bilder/startansicht-*` (bewusst erneuert)

**Abnahme**
- S-01 und S-04 nach dem Design-Export (`Wurzelwerk Bildschirme.dc.html`), **aus vorhandenen Bausteinen** — keine neue visuelle Sprache (§14).
- **Kein Pfadtextfeld mehr.** „Neues Projekt" wählt den übergeordneten Ordner über den Systemdialog; „Projekt öffnen" öffnet einen Ordnerdialog; im Dialog kann man wie gewohnt navigieren und Ordner anlegen. Das Textfeld für den Projektnamen bleibt — ein Name ist kein Pfad.
- **`dialog.ts` wird verallgemeinert, nicht kopiert:** die Kapselung aus AP-1.4b zieht nach `src/main/dialoge.ts` und bedient Import **und** Projektwahl. Der Importweg bleibt dabei unverändert grün.
- „Zuletzt geöffnet" zeigt Projektname und Ort lesbar, nicht als nackten Pfad; ein verschwundenes Projekt ist als solches erkennbar.
- Die Fehlermeldung `PROJEKT_KEIN_WURZELWERK_ORDNER` bleibt erhalten (der Dialog macht sie seltener, nicht unnötig — ein Ordner kann trotzdem der falsche sein).
- Zustandsbibliothek um die Startzustände ergänzt (leer, mit Liste, Sync-Warnung, Fehler).
- **Referenzbilder bewusst erneuert** (`startansicht-hell/dunkel`), im PR begründet: „Startansicht erstmals gestaltet (AP-1.26)" — genau der Fall, für den die Regel aus AP-1.25 gedacht ist.

**Tests**
- `test/e2e/ablauf-04-start.spec.ts`: Projekt über den Dialog anlegen, schließen, über den Dialog wieder öffnen. Der Dialog wird im Test gestellt (`showOpenDialog` ist in `dialoge.ts` gekapselt und damit ersetzbar — dasselbe Muster wie AP-1.4b).
- `test/einheit/dialoge.test.ts`: Abbruch im Dialog führt zu keiner Aktion und keinem Fehler.
- Bildvergleich grün gegen die erneuerten Referenzbilder.

---

## AP-1.27 — Importbeispiele aufräumen

**Auftrag** — D-10, `56_Import_Vertrag.md`, `docs/80` U-1.6-e2e-fixture. `fixtures/import/v1/gueltig/`
verspricht „gültig", enthält aber mit `beispiel-3-interview.json` eine Datei, die **über die
Oberfläche nie importierbar ist**: drei `db:`-Verweise auf eine Person, die in keinem frischen
Projekt existiert, plus ein Medienverweis auf eine Audiodatei, die im Repository fehlt. Auch nach
`beispiel-1` gelingt es nicht — dessen `tmp:`-Kennungen werden zu frischen UUIDs, die feste
`db:`-Kennung entsteht nie. „Gültig" heißt dort in Wahrheit „besteht Stufe 1 und 2 **gegen eine
Datenbank, die diese Person enthält**". Belegter Fall: der erste Importversuch des Nutzers
(19.09.2026) endete mit vier Fehlern und einer Sackgasse.

**Umfang**
`fixtures/import/v1/` (Ordnerstruktur) · `fixtures/import/v1/LIESMICH.md` ·
`test/e2e/fixtures/` (Verweis statt Kopie) · `docs/import-vertrag/` bzw. `56` §-Nachtrag

**Abnahme**
- Der Ordner trennt sichtbar: **`gueltig/eigenstaendig/`** (in ein frisches Projekt importierbar) und **`gueltig/braucht-bestand/`** (setzt vorhandene Daten voraus, ist Vertragsbeispiel, kein Importmaterial). `beispiel-1` und `beispiel-2` liegen im ersten, `beispiel-3` im zweiten.
- **Eine `LIESMICH.md` sagt in drei Sätzen**, was der Unterschied ist und welche Datei man nimmt, wenn man die App einfach ausprobieren will.
- Die selbsttragende Interview-Fassung aus AP-1.6 (`test/e2e/fixtures/import-erna-und-walter-wruck.json`, inklusive vorhandener `.m4a`) wird **zur ersten Wahl für „reich und eigenständig"** — entweder dorthin verschoben oder von dort verlinkt, **nicht** ein drittes Mal kopiert.
- Entweder liegt die fehlende Audiodatei zu `beispiel-3` bei, oder der Medienverweis verschwindet daraus. Eine Datei, die auf nichts zeigt, ist kein gültiges Beispiel.
- Alle bestehenden Tests, die auf die alten Pfade zeigen, sind nachgezogen; `import-schema-zod-gleich` und die IMP-Code-Tests bleiben grün.
- `U-1.6-e2e-fixture` in `docs/80` wird geschlossen.

**Tests**
- `test/einheit/fixture-eigenstaendig.test.ts`: **jede** Datei unter `gueltig/eigenstaendig/` läuft gegen ein frisch angelegtes Projekt fehlerfrei durch Stufe 1 und 2. Das ist die Zusage, die der Ordnername gibt — hier wird sie geprüft, nicht behauptet.
- `test/einheit/fixture-medien-vorhanden.test.ts`: jeder `relativer_pfad` in jeder Beispieldatei zeigt auf eine existierende Datei.

---

## AP-1.12 — Schreibbefehle für Person, Namen, Kanten, Ereignisse

**Auftrag** — A-01, A-05, F-03, ADR-003. Kopflos. Der Bus kennt bisher `person.anlegen`,
`person.feldSetzen`, `person.loeschen` (AP-0.9) und den Import (AP-1.5). Alles Weitere fehlt.

**Umfang**
`src/main/befehle/{name,elternschaft,partnerschaft,ereignis,aussage}-*.ts` ·
`src/main/befehle/registrierung.ts` · `src/shared/schemata/befehle.ts` · IPC-Kanäle

**Abnahme**
- Je Entität anlegen, ändern, löschen — jeder Befehl **eine** Transaktion über `fuehreAus`, keine eigene Klammer (`CLAUDE.md` §2 Regel 3).
- Jede Änderung, die einen Wert trägt, schreibt eine `aussage` mit Konfidenz und optionalem Beleg (ADR-026), nicht nur die Kernzeile.
- Kein Befehl schreibt ohne echte Änderung (AP-0.22-Muster: vorher lesen, bei Gleichheit nichts tun).
- Zyklusschutz bei Kanten über `src/core/graph/zyklus.ts` (AP-0.9), nicht neu erfunden.
- Undo stellt jeden Befehl bitgleich zurück — `undo-bitgleich` läuft über die neuen Befehle.

**Tests**
- `test/einheit/befehl-*.test.ts` je Befehl: Wirkung, Undo, Redo, Fehlerfall.
- `test/invarianten/undo-bitgleich.test.ts`: Befehlsfolgengenerator um die neuen Befehle erweitert (**geschützter Prüfpfad → eigener PR-B**, ADR-025).

---

## AP-1.13 — Die fünf tragenden Eingabefelder

**Auftrag** — `71` §3, A-03, A-04, E21. Ohne sie ist jede Maske ein Formular mit nackten Feldern —
und damit das Gegenteil dessen, was dieses Produkt behauptet.

**Umfang**
`src/renderer/bausteine/{formularfeld,textfeld,langtextfeld,zahlfeld,auswahlfeld,datumsfeld,ortsfeld,personenwaehler,konfidenzwaehler,vorschlagskarte}.tsx`

**Abnahme**
- **Datumsfeld:** nimmt die Eingaben aus AP-1.1 entgegen (`14.3.1901`, `um 1890`, `zwischen 1750 und 1760`, `Dom. III post Trinitatis 1750`), zeigt sofort, wie es verstanden wurde, und was nicht auflösbar war. Der Parser ist der aus `src/core/datum` — kein zweiter.
- **Ortsfeld:** sucht bestehende Orte, legt neue an, zeigt den zum Datum gültigen Namen (AP-1.2 `ort/zeitbezug`).
- **Personenwähler:** sucht über dieselbe Strecke wie die Liste (Original, Umschrift, Phonetik), zeigt Lebensdaten zur Unterscheidung, kann einen Platzhalter anlegen (A-17).
- **Konfidenzwähler:** vier Stufen, Reihenfolge lesbar, nie allein über Farbe (§1.2 Regel 4).
- **Vorschlagskarte:** drei Zustände (Vorschlag / bestätigt / verworfen), Bestätigen mit einer Taste — die Grundlage für AP-1.21.
- Alle über Tokens, beide Themen, beide Dichten, Tastatur vollständig, Trefferfläche ≥ 32 × 32 px.

**Tests** — ein Einheitentest je Feld (rendert, Tastatur, gesperrt, kein Farbliteral) plus
`test/einheit/datumsfeld-parser.test.ts`: dieselbe Tabelle wie AP-1.1, durch das Feld gereicht.

---

## AP-1.14 — Person bearbeiten (S-20)

**Auftrag** — A-01, A-02, A-13, `72` S-20. **Das Paket, nach dem die App ein Werkzeug ist.**

**Umfang** `src/renderer/ansichten/person-bearbeiten/` · Anbindung an AP-1.12 und AP-1.13

**Abnahme**
- Namen (mehrfach, typisiert, Rufname, Präfix, Zusatz), Lebensdaten, Geschlecht, Notiz, Platzhalter-Kennzeichen.
- **Kein Speichern-Knopf** — jede Änderung sofort über den Bus; der Änderungsverlauf zeigt sie, Undo nimmt sie zurück.
- Jede Änderung fragt Konfidenz und Beleg **an der Stelle**, an der sie entsteht (E21), nicht in einem zweiten Arbeitsgang.
- Die Profilseite aus AP-1.7 bleibt der Leseweg; Bearbeiten ist ein Zustand, keine zweite Seite mit eigener Wahrheit.

**Tests** — `test/e2e/ablauf-03-person-bearbeiten.spec.ts`: anlegen → Namen ergänzen → Undo → Zustand vorher; Einheitentests je Abschnitt.

---

## AP-1.15 — Ereignisse mit Rollenbeteiligung

**Auftrag** — A-05, `50` §2.5. Ereignisse sind bisher nur importierbar.

**Abnahme** — Ereignis anlegen mit Typ, Datum, Ort; Beteiligte mit Rolle (Hauptperson, Zeuge,
Pate, Trauzeuge, Informant); ein Ereignis kann mehrere Personen tragen und erscheint bei jeder;
Löschen einer Beteiligung löscht nicht das Ereignis. Zeitstrahl aus AP-1.7 zeigt die neuen
Ereignisse ohne Änderung.

---

## AP-1.16 — Orte anlegen und pflegen

**Auftrag** — A-04, ADR-013, `50` §2.6. Zeitabhängige Hierarchie: politisch und kirchlich
**getrennt**, jede Zugehörigkeit mit Gültigkeitszeitraum.

**Abnahme** — Ort anlegen, Namen über die Zeit (Marienwerder 1900 / Kwidzyn 1950), Zugehörigkeit
in beiden Ketten, externe Kennungen (GOV später, Feld jetzt). Jede Ortsanzeige in der App nutzt
`ort/zeitbezug` aus AP-1.2 — kein zweiter Auflösungsweg.

---

## AP-1.17 — Quellen, Zitate, Archive, Negativbefunde (S-23)

**Auftrag** — B-01, B-06, B-07, `50` §2.7. Der Import legt Quellen an; von Hand geht es bisher nicht.

**Abnahme** — Quelle mit Typ, Art (original/derivat/verfasst) und Informationsart; Zitat mit
Seite, Eintragsnummer, Transkript, Digitalisat, Konfidenz; Archiv mit Ort und Signatur;
**Negativbefund** („gesucht, nicht gefunden") als eigene Form — der Befund, den alle anderen
Programme verlieren. Belegdetail aus AP-1.7/AP-1.10 zeigt die von Hand erfassten Belege
unverändert.

---

## AP-1.18 — Feld-Definitionssystem (S-21)

**Auftrag** — A-09, A-18, E11, `50` §2.13. Benutzerdefinierte Felder statt hartverdrahteter.

**Abnahme** — Feld anlegen mit Name, Datentyp (`50` §2.13-Aufzählung), Geltungsbereich und
Hilfetext; Werte am Profil erfassen; Felder als **Listenspalte und Filter** verfügbar (A-18, baut
auf AP-1.10).

**Ort im Editor (Nachtrag 23.09.2026):** Werte benutzerdefinierter Felder erscheinen im Editor
aus AP-1.30 **im Reiter des Geltungsbereichs** (ein Feld für Personen → Reiter „Person" als
eigene Gruppe „Eigene Felder" unter den festen Angaben). **Kein neunter Reiter** — die Grenze
„höchstens acht Reiter" aus AP-1.30 gilt. Autosave und Koaleszenzschlüssel wie dort. Setzt AP-1.30
voraus. Ein gelöschtes Feld nimmt seine Werte nicht mit ins Nichts, sondern wird als
stillgelegt geführt.

---

## AP-1.19 — Gesundheitsmodul in der Oberfläche (S-22)

**Auftrag** — M-01 bis M-04, M-08, E10, `50` §2.12. Diagnosen und Risikofaktoren gibt es seit
Schema v1 und im Import; die Oberfläche fehlt.

**Abnahme** — Diagnose mit Kategorie (**aus dem Schema-CHECK abgeleitet**, nicht abgetippt —
siehe AP-1.3c und ADR-026), Erstdiagnose-Datum, Status, Konfidenz, Beleg; Risikofaktoren;
**M-08: der Hinweis „wird nie exportiert" steht an jeder Stelle**, an der Gesundheitsdaten
entstehen, nicht nur einmal. Erst hier werden die Diagnosefarben aus `tokens.css` benutzt — die
Korrektur aus B1 (ADR-026-Umfeld) muss vorher auf `main` sein.

**Neuer Zuschnitt (Nachtrag 23.09.2026):** Seit AP-1.30 ist S-22 **kein eigener Bildschirm**
mehr, sondern der **Inhalt des Gesundheitsreiters** im Editor. Das Gerüst des Reiters (Zähler,
kein Schloss, visuelle Trennung) steht dann schon. Dieses Paket füllt ihn mit Diagnosen und
Risikofaktoren nach der Abnahme oben. Setzt AP-1.30 voraus und läuft am Ende von Kette 3b.
Der M-08-Hinweis steht im Reiter selbst und an jeder weiteren Stelle, an der Gesundheitsdaten
entstehen.

---

## AP-1.20 — Medien und Audio-Zeitmarken — ⛔ ERSETZT

> **Ersetzt am 22.09.2026 durch AP-1.31a–d** (Nachtrag 23.09.2026). Das Paket wird **nicht**
> gebaut und steht in keiner Kette mehr. Medien zuordnen und die Kopie in den Projektordner (A-10)
> tragen AP-1.31a/b, Audio mit Zeitmarken (A-16) trägt AP-1.31b. Der alte Text bleibt als Nachweis.

**Auftrag (historisch)** — A-10, A-16, `50` §2.11. Der Import kopiert Medien schon (AP-1.5); von Hand und mit
Wiedergabe fehlt.

**Abnahme** — Bild, PDF und Audio zuordnen; Kopie in den Projektordner, nie Verweis nach außen;
Audio mit **Zeitmarken**, die auf einen Beleg zeigen (`zitat.zeitmarke_sekunden` aus AP-1.3c) —
Klick springt in die Aufnahme. Keine Wiedergabe über das Netz, kein Codec-Nachladen.

---

## AP-1.21 — Interview-Modus (S-14)

**Auftrag** — A-15, D-10, ADR-010. **Die Falle steht im Auftrag:** Der Interview-Modus ist eine
**Ansicht über dem Importvertrag** — er wirft Notizen ein und erzeugt daraus Importmaterial nach
demselben Vertrag. Er ist **kein zweiter Schreibweg** in die Datenbank. Sonst entstehen die zwei
Wahrheiten, die ADR-010 verhindert.

**Abnahme** — Gespräch als Sitzung mit Informant, Datum, Audio; unstrukturierten Text einwerfen;
die App erzeugt **Vorschlagskarten** (AP-1.13) für Personen, Ereignisse, Orte; Bestätigen mit
einer Taste erzeugt Importmaterial, das durch **denselben Trockenlauf** läuft wie eine Datei.
Quellenart „Zeitzeugenaussage" mit Informant und Gesprächsdatum. Zustandsbibliothek S-19 als
Prüfbild für die Zustände.

---

## AP-1.22 — Befehlspalette und Schnelleingabe (S-06)

**Auftrag** — A-13, `70` §7. Kommt spät, weil sie nur aufrufen kann, was es gibt.

**Abnahme** — Eine Taste öffnet die Palette; sie findet Aktionen **und** Personen; Tastenkürzel
stehen daneben und sind nach `70` §7 „nach Einführung unantastbar". Schnelleingabe: eine Person
mit Name und Lebensdaten in einer Zeile anlegen.

**Kein zweiter Anlegeweg (Nachtrag 23.09.2026):** Die Schnelleingabe legt **über denselben Weg an
wie AP-1.32**. Die Dublettenprüfung läuft mit, und ein Treffer öffnet dieselbe Auswahl „Das ist
sie / trotzdem anlegen". Eine Zeile, die an der Prüfung vorbei eine Person anlegt, gilt als nicht
fertig. Setzt AP-1.32 voraus.

---

## AP-1.23 — Änderungsverlauf, Wartung, Einstellungen (S-16, S-17, S-18)

**Auftrag** — F-02, F-08, G-02, `72` S-16/S-17/S-18. **Das billigste Paket dieses Teils:** die
Datenwege stehen alle seit Phase 0 (`journal-verlauf.ts`, `integritaet.ts`, `schnappschuss/*`,
`wartung/datenbestand-pruefen.ts`) — es fehlt ausschließlich die Oberfläche.

**Abnahme**
- **Eine Verlaufsabfrage für beide Stellen (Nachtrag 23.09.2026):** AP-1.30 zeigt den Verlauf schon (rechte Spalte: letzte drei Einträge; Reiter Verwaltung: Verlauf der Person). AP-1.30 legt dafür **die** Abfrage an (`abfrage:verlauf` über `journal-verlauf.ts`, optional gefiltert nach Subjekt); S-16 nutzt dieselbe, ohne Filter. Keine zweite Verlaufsabfrage.
- **S-16:** Transaktionen neu→alt mit Zeitpunkt, Art und Anzahl; Aufklappen zeigt Feldänderungen alt/neu aus den ganzen Zeilen (ADR-017); zurückgenommene sind markiert, nicht gelöscht.
- **S-17:** Schnappschüsse mit Wiederherstellen, „Datenbestand prüfen" mit Bericht, „Abgeleitete Daten neu aufbauen", Journalgröße und Aufräumen. Jede Aktion sagt in einem Satz, was sie tut **und was sie riskiert**.
- **S-18:** Erscheinungsbild (hell/dunkel/Systemvorgabe) und Dichte — **der Themenumschalter fehlt bis heute**, `tokens.css` trägt seit AP-1.6 beide Fassungen, niemand kann sie umschalten. Dazu Sprache, Konfidenz-Vorgaben je Quellenart, Schnappschuss-Häufigkeit, Import-Schwellwert, Tastenkürzel als Übersicht (in Phase 1 nicht änderbar).

---

## AP-1.24 — Mehrere Projekte, zuletzt geöffnet

**Auftrag** — G-04. Der Rest aus AP-0.4: Liste zuletzt geöffneter Projekte pflegen, Wechsel ohne
Neustart, Sperre und Schnappschuss-Auslöser beim Wechsel sauber zurücksetzen (AP-0.19-Muster).

---

## Themenherkunft des zweiten Teils (Nachweis, nicht Auftrag)

**Geschnitten am 18.09.2026** in AP-1.12 bis AP-1.24 (oben). Diese Tabelle bleibt als Nachweis
stehen, dass jedes Thema der ursprünglichen Liste ein Paket bekommen hat — und welches.

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

**Zuordnung:** Bearbeitung → AP-1.12/1.13/1.14 · Ereignisse → AP-1.15 · Orte → AP-1.16 · Quellen → AP-1.17 · Feld-Definitionen → AP-1.18 · Gesundheit → AP-1.19 · Medien/Audio → AP-1.20 · Interview → AP-1.21 · Schnelleingabe/Palette → AP-1.22 · Mehrere Projekte → AP-1.24. **Zusätzlich aus dem Designbestand gehoben:** S-16/S-17/S-18 (Änderungsverlauf, Wartung, Einstellungen) hatten entworfene Bildschirme, aber kein Paket → AP-1.23.

Der Interview-Modus ist der Punkt, an dem man aufpassen muss: A-15 und D-10/D-11 überschneiden
sich. Er wird als Oberfläche gebaut, die Notizen einwirft und daraus **Importmaterial nach
demselben Vertrag** erzeugt — nicht als eigener Schreibweg in die Datenbank. Sonst entstehen
genau die zwei Wahrheiten, die ADR-010 verhindern soll.
