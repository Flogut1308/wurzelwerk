# Wurzelwerk — Softwarearchitektur Phase 0 und Phase 1

**Stand:** 23.08.2026 · **Status:** Architekturplanung abgeschlossen, kein Produktionscode
**Grundlage:** `40_Anforderungen.md`, `50_Datenmodell.md`, `60_Technik_ADR.md` (ADR-001 bis ADR-024)
**Geltungsbereich:** Phase 0 vollständig, Phase 1 vollständig geplant, Phase 2 nur als Andockstelle.

> Dieses Dokument erklärt **warum** die Architektur so aussieht, nicht nur **wie**. Wo eine
> Entscheidung Alternativen hatte, stehen sie dabei. Wer eine Entscheidung verteidigen muss,
> soll hier die Begründung finden und nicht raten.

---

## 0. Die sieben Sätze, auf denen alles steht

Wenn du dieses Dokument in einem Jahr vergessen hast, reichen diese sieben Sätze, um jede
Detailfrage in die richtige Richtung zu beantworten:

1. **Der Renderer sieht keine Datenbank.** Er kennt nur typisierte IPC-Kanäle, die entweder ein Ergebnis oder einen Fehler zurückgeben — und niemals eine Ausnahme werfen.
2. **Jeder Schreibvorgang ist genau eine Transaktion und genau ein Undo-Schritt.** Es gibt keinen zweiten Weg, Daten zu ändern.
3. **Das Änderungsjournal wird von der Datenbank selbst geschrieben, nicht von Anwendungscode.** SQLite-Trigger können nicht vergessen werden; Anwendungscode schon — besonders KI-geschriebener.
4. **Abgeleitete Daten sind immer neu berechenbar und werden nie journalisiert.** Wenn eine Tabelle aus anderen Tabellen entsteht, darf sie keine Wahrheit tragen.
5. **Es gibt keinen Speichern-Knopf, weil es keinen ungespeicherten Zustand gibt.** Auto-Speicherung ist kein Zeitgeber, sondern eine Eigenschaft der Architektur.
6. **Layout misst keinen Text.** Knotenmaße sind Eingabe, nicht Ergebnis. Das ist die Grenze, die ADR-009 fordert, und sie hält nur, wenn sie in der Signatur steht.
7. **Migrationen laufen nur vorwärts, und vor jeder Migration liegt ein Schnappschuss.** Rückwärtsmigrationen sind ungetestete Sicherheit und darum gefährlicher als keine.

---

## 1. Schichten und Modulschnitt

### 1.1 Die fünf Wurzelverzeichnisse und ihre Abhängigkeitsrichtung

```
                 ┌──────────────┐
                 │  src/core    │  reines TypeScript. Kennt nichts.
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │ src/shared   │  IPC-Vertrag, Fehlertypen, Zod-Schemata
                 └──┬────┬───┬──┘
        ┌───────────┘    │   └───────────┐
   ┌────▼─────┐   ┌──────▼──────┐  ┌─────▼──────┐
   │ src/main │   │ src/preload │  │src/renderer│
   └──────────┘   └─────────────┘  └────────────┘
        SQLite         Brücke           React
```

Die Pfeile sind **die einzigen erlaubten Richtungen**. Alles andere ist ein Fehler, den
`dependency-cruiser` in der CI abbricht (AP-0.14).

| Verzeichnis | Darf importieren | Darf **nicht** | Warum diese Grenze |
|---|---|---|---|
| `src/core` | nur `src/core` | Node-Module (`fs`, `path`), Electron, React, SQL, `better-sqlite3` | Reine Logik ist die einzige Schicht, die man mit Property-Tests in Millisekunden tausendfach durchrechnen kann. Sobald `fs` drin ist, ist das vorbei. |
| `src/shared` | `src/core` | Electron, React, SQL | Der IPC-Vertrag wird von drei Seiten importiert. Wenn er Electron kennt, zieht er Electron in den Renderer-Bundle. |
| `src/main` | `src/core`, `src/shared`, Node, Electron-Main | React, `src/renderer` | Der Hauptprozess ist der einzige Ort mit Dateisystem- und Datenbankzugriff. |
| `src/preload` | `src/shared` | `src/core`, `src/main`, Node über `ipcRenderer` hinaus | Der Preload läuft im Renderer-Prozess mit erhöhten Rechten. Je kleiner, desto weniger Angriffsfläche und weniger zu verstehen. |
| `src/renderer` | `src/core`, `src/shared`, React | `src/main`, `better-sqlite3`, Node | Das ist die Grenze aus ADR-001 und ADR-009. |

**Warum `core` und `shared` getrennt sind.** Man könnte beides in `shared` legen. Der
Unterschied ist der Zweck: `core` ist **Fachlogik** (was ist ein Datum, wie sortiert man Namen,
wie berechnet man einen Verwandtschaftsgrad), `shared` ist **Vertrag** (welche Kanäle gibt es,
welche Nutzlast, welche Fehlercodes). Fachlogik wird in Phase 2 vom Layout gebraucht und in
Phase 4 vom Export. Der Vertrag ändert sich mit jeder neuen Ansicht. Zwei Verzeichnisse, weil
sie zwei unterschiedliche Änderungsgeschwindigkeiten haben.

### 1.2 Die Schichten innerhalb von `src/main`

Innerhalb des Hauptprozesses gilt eine zweite, feinere Ordnung. Sie ist der Grund, warum das
Änderungsjournal nicht vergessen werden kann:

```
  ipc/            Kanalregistrierung. Validiert Nutzlast, ruft genau eine Ebene tiefer,
                  wandelt jede Ausnahme in ein Result. Enthält keine Fachlogik.
        │
  ┌─────┴─────────────────────┐
  │                           │
abfragen/                 befehle/
  reine Lesevorgänge        jeder Befehl = 1 Transaktion = 1 Undo-Schritt
  kein Journal              armiert das Journal, ruft Repositories
        │                           │
        └─────────┬─────────────────┘
                  │
             repositories/    einzelne SQL-Anweisungen, nehmen ein Tx-Handle,
                              kennen keine Transaktionsgrenze, kein Journal
                  │
               datenbank/     Verbindung, Pragmas, Migration, Trigger-Erzeugung
```

Die Regel, die das trägt: **nur `befehle/` öffnet Transaktionen, nur `repositories/` schreibt
SQL.** Ein Repository, das `BEGIN` sagt, ist ein Fehler. Ein Befehl, der SQL enthält, ist ein
Fehler. Beides ist per Lint-Regel prüfbar (`no-restricted-syntax` gegen `db.exec`/`db.prepare`
außerhalb von `repositories/`) — und das ist wichtiger, als es klingt: Die typische
KI-Verirrung ist "ich schreibe die Abfrage schnell direkt in den Handler".

### 1.3 Ordnerstruktur des Repositories, konkret bis auf Dateiebene

Das Repository liegt als **eigener Ordner neben dem Konzeptordner** (`~/Claude/Projects/wurzelwerk`),
nicht darin. Begründung: Der Konzeptordner enthält private Notizen und hat einen anderen
Lebenszyklus als der Code; und ein Repository, das versehentlich Konzeptdateien mitcommittet,
ist schwer zu entwirren.

Was am Ende von **Phase 0** existiert (Dateien mit `†` entstehen erst in Phase 1):

```
wurzelwerk/
├── CLAUDE.md                          Verhaltensregeln für Claude Code (siehe eigenes Dokument)
├── README.md
├── package.json                       pnpm, Node 22 LTS
├── pnpm-lock.yaml
├── tsconfig.json                      strict, noUncheckedIndexedAccess, Projektreferenzen
├── tsconfig.core.json                 lib: ["ES2023"] — kein "DOM", kein @types/node
├── electron.vite.config.ts
├── electron-builder.yml
├── vitest.config.ts
├── playwright.config.ts
├── .dependency-cruiser.cjs            die Grenzen aus §1.1 als ausführbare Regel
├── eslint.config.js
├── .github/
│   └── workflows/
│       └── ci.yml                     macos-latest + windows-latest, Lint→Typen→Test→Build
├── docs/
│   ├── adr/                           Kopie der ADRs aus 60_Technik_ADR.md, eine Datei je ADR
│   │   ├── ADR-001-anwendungsgeruest.md
│   │   └── …
│   ├── architektur.md                 Kopie dieses Dokuments
│   ├── import-vertrag.md              Kopie von 56_Import_Vertrag.md
│   └── schema/
│       ├── 0001_grundgeruest.sql      Journal, Transaktion, Migrationstabelle
│       ├── 0002_kern.sql              alle Tabellen aus 50_Datenmodell.md
│       ├── 0003_abgeleitet.sql        materialisierte Ansicht + FTS5
│       ├── trigger_generiert.sql      erzeugt, nicht handgeschrieben — siehe §4.4
│       └── kanonisches_schema.sql     Soll-Schema, Vergleichsziel der Migrationstests
├── fixtures/                          Testkorpus nach ADR-009 §1
│   ├── minimal/                       2 Personen, 1 Geburt
│   ├── mehrfachehe/
│   ├── adoption/
│   ├── cousinenheirat/                Ahnenimplex
│   ├── fehlende-daten/
│   ├── kaputte-kodierung/
│   ├── unscharfe-datumsangaben/
│   ├── kyrillisch-polnisch/           für ADR-014
│   ├── generiert/
│   │   └── generator.ts               fester Seed, 200 / 2.000 / 20.000 Personen
│   ├── import/                        Beispieldateien aus 56_Import_Vertrag.md †
│   └── datenbanken/
│       ├── schema-v1.sqlite           Migrationsfixture, eine je Schemaversion
│       └── …
├── skripte/
│   ├── trigger-generieren.ts          liest das Schema, schreibt trigger_generiert.sql
│   ├── schema-dump.ts                 normalisierter Schema-Abzug für den Vergleich
│   └── fixture-datenbank-bauen.ts
├── src/
│   ├── core/
│   │   ├── datum/
│   │   │   ├── typen.ts               Datumswert nach 50_Datenmodell §2.3
│   │   │   ├── parser.ts              deutsche Eingaben → Datumswert †
│   │   │   ├── kalender.ts            julianisch/gregorianisch, Doppeldatierung †
│   │   │   ├── sortierschluessel.ts   julianische Tageszahl, von/bis †
│   │   │   └── formatierer.ts         Datumswert → Anzeigetext †
│   │   ├── name/
│   │   │   ├── typen.ts
│   │   │   ├── umschrift.ts           ISO 9 / DIN 1460, ADR-014 †
│   │   │   ├── suchnormalform.ts      diakritikafrei, kleingeschrieben †
│   │   │   └── koelner-phonetik.ts    †
│   │   ├── ort/
│   │   │   └── zeitbezug.ts           gültiger Ortsname zu einem Datum †
│   │   ├── graph/
│   │   │   ├── zyklus.ts              niemand ist eigener Vorfahre
│   │   │   └── generation.ts          Ebenenzuweisung aus Kanten + Datumsschätzung †
│   │   ├── plausibilitaet/
│   │   │   └── regeln.ts              F-07 als reine Funktionen †
│   │   ├── layout/
│   │   │   └── vertrag.ts             NUR Typen. Implementierung in Phase 2. Siehe §8
│   │   ├── zufall/
│   │   │   └── seed-prng.ts           deterministischer Zufall für Generatoren
│   │   └── index.ts
│   ├── shared/
│   │   ├── ipc/
│   │   │   ├── kanaele.ts             Kanalnamen als Konstanten
│   │   │   ├── vertrag.ts             die Typkarte Kanal → Eingabe/Ausgabe
│   │   │   └── ergebnis.ts            Result-Typ
│   │   ├── fehler/
│   │   │   ├── codes.ts               geschlossene Union aller Fehlercodes
│   │   │   └── app-fehler.ts
│   │   ├── schemata/
│   │   │   ├── person.ts              Zod-Schemata je Entität
│   │   │   ├── befehle.ts             Zod-Schema je Befehlsnutzlast
│   │   │   └── import-v1.ts           wurzelwerk-import/v1 als Zod †
│   │   └── konstanten.ts              Schemaversion, Vertragsversion, Budgets
│   ├── preload/
│   │   └── index.ts                   contextBridge, ~40 Zeilen, mehr nicht
│   ├── main/
│   │   ├── index.ts                   app-Lebenszyklus, Fenster, Menü
│   │   ├── fenster/
│   │   │   ├── hauptfenster.ts
│   │   │   └── geometrie-speicher.ts  electron-store, App-Ebene
│   │   ├── menue/
│   │   │   ├── menue.ts
│   │   │   └── tastenkuerzel.ts       zentrale Tabelle, Cmd/Ctrl-Abstraktion (ADR-012)
│   │   ├── projekt/
│   │   │   ├── projekt-dienst.ts      anlegen, öffnen, schließen
│   │   │   ├── ordnerformat.ts        .ahnen-Aufbau, manifest.json
│   │   │   ├── sperrdatei.ts          laufend.lock — doppeltes Öffnen, Absturzerkennung
│   │   │   └── sync-ordner-warnung.ts ADR-002 Konsequenz
│   │   ├── datenbank/
│   │   │   ├── verbindung.ts          Pragmas an genau einer Stelle
│   │   │   ├── migration/
│   │   │   │   ├── laeufer.ts
│   │   │   │   └── registrierung.ts   Version → Datei + Prüfsumme
│   │   │   ├── trigger.ts             Journal- und Ableitungstrigger anwenden
│   │   │   └── integritaet.ts         quick_check / integrity_check
│   │   ├── journal/
│   │   │   ├── kontext.ts             Armierung: journal_kontext setzen/löschen
│   │   │   ├── transaktion.ts         Transaktionsklammer
│   │   │   ├── undo.ts                Rücknahme und Wiederholung
│   │   │   ├── koaleszenz.ts          Zusammenfassen aufeinanderfolgender Änderungen
│   │   │   └── aufraeumen.ts          Journalbegrenzung (ADR-003 Konsequenz)
│   │   ├── schnappschuss/
│   │   │   ├── erzeugen.ts            VACUUM INTO
│   │   │   ├── aufbewahrung.ts        Haltefristen
│   │   │   └── wiederherstellen.ts
│   │   ├── repositories/
│   │   │   ├── basis.ts               gemeinsame Hilfsmittel, Zeilen↔Objekt
│   │   │   ├── person-repo.ts
│   │   │   ├── name-repo.ts
│   │   │   ├── ort-repo.ts            †
│   │   │   ├── ereignis-repo.ts       †
│   │   │   ├── beziehung-repo.ts      †
│   │   │   ├── quelle-repo.ts         †
│   │   │   ├── aussage-repo.ts        †
│   │   │   └── journal-repo.ts
│   │   ├── befehle/
│   │   │   ├── registrierung.ts       Name → Handler + Zod-Schema
│   │   │   ├── bus.ts                 die Transaktionsklammer, siehe §4.2
│   │   │   ├── person-anlegen.ts
│   │   │   ├── person-loeschen.ts
│   │   │   ├── name-setzen.ts         †
│   │   │   └── …                      †
│   │   ├── abfragen/
│   │   │   ├── person-liste.ts        †
│   │   │   ├── person-detail.ts       †
│   │   │   ├── suche.ts               FTS5 + Phonetik †
│   │   │   └── journal-verlauf.ts
│   │   ├── import/                    † alles Phase 1
│   │   │   ├── validierung.ts
│   │   │   ├── trockenlauf.ts
│   │   │   ├── ausfuehrung.ts
│   │   │   └── bericht.ts
│   │   ├── ipc/
│   │   │   ├── registrierung.ts       bindet Kanäle an Handler
│   │   │   ├── huelle.ts              try/catch → Result, Protokollierung, Zod
│   │   │   └── ereignisse.ts          main → renderer Push
│   │   └── protokoll/
│   │       └── logger.ts              electron-log, Regeln aus §10.2
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── app.tsx
│       ├── i18n/
│       │   ├── einrichten.ts
│       │   └── de/                    JSON-Sprachdateien
│       ├── brücke/
│       │   ├── aufrufen.ts            typisierter Wrapper um window.wurzelwerk
│       │   ├── abfrage-hooks.ts       TanStack Query
│       │   └── befehl-hooks.ts        Mutation + Invalidierung
│       ├── zustand/
│       │   ├── auswahl.ts             Zustand-Slice: Auswahl, Ansicht, Filter
│       │   └── entwurf.ts             Entwurfszustand beim Tippen, §7.2
│       ├── bausteine/                 Knöpfe, Felder, Tabelle, Dialog
│       ├── ansichten/
│       │   ├── start/                 Projekt öffnen/anlegen, zuletzt geöffnet
│       │   ├── liste/                 †
│       │   ├── profil/                †
│       │   └── import/                † Trockenlauf-Bericht
│       ├── gestaltung/
│       │   ├── tokens.css             hell und dunkel (E15, U3)
│       │   └── basis.css
│       └── fehler/
│           └── fehlergrenze.tsx       React Error Boundary je Ansicht
└── test/
    ├── einheit/                       neben dem Code gespiegelt
    ├── invarianten/                   fast-check, ADR-009 §2
    │   ├── undo-bitgleich.test.ts
    │   ├── journal-vollstaendig.test.ts
    │   ├── abgeleitet-gleich.test.ts
    │   └── zyklusfreiheit.test.ts
    ├── migration/
    │   └── historisch.test.ts
    ├── absturz/
    │   └── sigkill.test.ts
    ├── schema/
    │   ├── trigger-vorhanden.test.ts  jede journalisierte Tabelle hat 3 Trigger
    │   └── schluessel-typen.test.ts   kein INTEGER PRIMARY KEY in journalisierten Tabellen
    ├── budget/
    │   └── leistung.test.ts           ADR-009 §4
    └── e2e/
        └── ablauf-01-projekt-anlegen.spec.ts
```

**Was hier absichtlich fehlt.** Kein `src/renderer/store/` mit einem globalen Datenspeicher.
Kein `src/main/services/` als Sammelbecken. Kein `utils/`. Jeder dieser drei Ordner ist eine
Einladung, die Schichtung zu unterlaufen — und in einem Repository, in dem KI Dateien anlegt,
wird jede Einladung angenommen.

### 1.4 Werkzeugkette (neu entschieden, ADR-015)

| Aufgabe | Wahl | Warum, und was verworfen wurde |
|---|---|---|
| Paketverwaltung | **pnpm** | Strikte Auflösung: ein Paket, das nicht in `package.json` steht, ist nicht importierbar. Genau der Fehler, den KI-Code laufend macht. npm erlaubt es stillschweigend. |
| Bau | **electron-vite** | Drei Bauziele (main/preload/renderer) vorkonfiguriert, TypeScript und Hot-Reload ohne eigene Konfiguration. Verworfen: Electron Forge + Webpack (mehr Konfiguration, langsamer), reines Vite (Preload-Bau muss man selbst bauen). |
| Paketierung | **electron-builder** | Wird für `electron-updater` (ADR-008) ohnehin gebraucht, kann Windows-Ziel auf macOS bauen bzw. in der CI unter `windows-latest`. |
| SQLite | **better-sqlite3** | Synchron, sehr gute Trainingsdatenlage, transaktionsfest. Verworfen: `node:sqlite` (zu jung, Electrons Node-Version hinkt nach), `sql.js`/WASM (kein echter Dateizugriff), Prisma/Drizzle (ORM verdeckt genau das SQL, das hier durchdacht sein muss, und beide kämpfen mit generierten Triggern). |
| Laufzeitprüfung | **Zod** | Eine Definition, aus der Typ **und** Prüfung entsteht. Der IPC-Rand und der Importvertrag brauchen beides. |
| Zustand Renderer | **Zustand** (UI) + **TanStack Query** (Daten) | Siehe §7. Verworfen: Redux (viel Zeremonie für ein Ein-Personen-Projekt), Kontext-alleine (jede Änderung rendert den Baum neu). |
| Übersetzung | **i18next + react-i18next** | ADR-011. |
| Test | **Vitest** + **fast-check** + **Playwright** | ADR-009 §2/§7. |
| Grenzen | **dependency-cruiser** | Macht §1.1 zu einer CI-Regel und zeichnet den Graphen. |
| Protokoll | **electron-log** | Rotierende Dateien in `app.getPath('logs')`, Regeln in §10.2. |

Versionsangaben stehen bewusst **nicht** in diesem Dokument, sondern nur in `package.json`
`[inferred]` — sonst veraltet die Architektur, weil eine Nebenversion gestiegen ist.

---

## 2. Der IPC-Vertrag

### 2.1 Sicherheitsgrundlage

```ts
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // Renderer und Preload haben getrennte JS-Kontexte
    nodeIntegration: false,   // kein require() im Renderer
    sandbox: true,            // Renderer-Prozess im OS-Sandkasten
    preload: /* … */
  }
})
```

Alle drei sind heute Electron-Standard, aber sie werden in älterem Beispielcode oft
abgeschaltet — und KI zitiert älteren Beispielcode. Darum stehen sie hier: **wenn in einem
Vorschlag `nodeIntegration: true` auftaucht, ist der Vorschlag falsch.**

Der Preload legt genau ein gefrorenes Objekt offen:

```ts
// src/preload/index.ts — vollständig, mehr gehört hier nicht hinein
import { contextBridge, ipcRenderer } from 'electron'
import { ALLE_KANAELE, EREIGNIS_KANAELE } from '../shared/ipc/kanaele'

contextBridge.exposeInMainWorld('wurzelwerk', Object.freeze({
  aufrufen: (kanal: string, nutzlast: unknown) => {
    if (!ALLE_KANAELE.includes(kanal)) {
      return Promise.resolve({ ok: false, fehler: { code: 'IPC_UNBEKANNTER_KANAL' } })
    }
    return ipcRenderer.invoke(kanal, nutzlast)
  },
  abonnieren: (kanal: string, hoerer: (nutzlast: unknown) => void) => {
    if (!EREIGNIS_KANAELE.includes(kanal)) return () => {}
    const umhuellt = (_e: unknown, n: unknown) => hoerer(n)
    ipcRenderer.on(kanal, umhuellt)
    return () => ipcRenderer.off(kanal, umhuellt)
  }
}))
```

**Warum die Kanalliste im Preload geprüft wird**, obwohl der Renderer eigener Code ist: Der
Renderer lädt später HTML-Inhalte, die aus Nutzerdaten entstehen (Notizen, Transkripte). Eine
Weißliste kostet vier Zeilen und schließt die Klasse "Renderer ruft einen Kanal, den es nicht
geben sollte" für immer.

### 2.2 Der Ergebnis-Typ: niemals Ausnahmen über die Grenze

```ts
// src/shared/ipc/ergebnis.ts
export type Ergebnis<T> =
  | { readonly ok: true;  readonly daten: T }
  | { readonly ok: false; readonly fehler: AppFehler }

// src/shared/fehler/app-fehler.ts
export interface AppFehler {
  readonly code: FehlerCode          // geschlossene Union, siehe §10.1
  readonly textSchluessel: string    // i18n-Schlüssel, NICHT der fertige Satz
  readonly parameter?: Readonly<Record<string, string | number>>
  readonly feld?: string             // JSON-Pfad bei Validierungsfehlern
  readonly vorgangsId: string        // dieselbe ID steht im Protokoll
  readonly details?: string          // nur in der Entwicklungsfassung gefüllt
}
```

Drei Gründe, warum das kein Luxus ist:

1. **Electron serialisiert `Error` nicht sinnvoll.** Über `ipcRenderer.invoke` kommt bei einer geworfenen Ausnahme ein Objekt an, dessen `message` mit `"Error invoking remote method …"` beginnt und dessen `stack` den Dateipfad des Entwicklungsrechners enthält. Beides ist im Renderer unbrauchbar und im Auslieferungsfall ein Informationsleck.
2. **Der Renderer muss übersetzen (ADR-011).** Ein fertiger deutscher Satz aus dem Hauptprozess umgeht die Übersetzungsschicht. Darum reist ein Schlüssel, nicht ein Satz.
3. **Fehlerbehandlung wird prüfbar.** `Ergebnis<T>` zwingt jede Aufrufstelle, den Fehlerfall anzufassen — TypeScript lässt `ergebnis.daten` ohne vorherige `ok`-Prüfung nicht zu. Das ist bei KI-geschriebenem Renderer-Code der wirksamste Zwang, den es gibt.

### 2.3 Kanalnamensraum

Drei Präfixe, mehr nicht:

| Präfix | Richtung | Journal | Beispiele |
|---|---|---|---|
| `abfrage:` | Renderer → Main, mit Antwort | nein | `abfrage:person.liste`, `abfrage:person.detail`, `abfrage:suche`, `abfrage:journal.verlauf` |
| `befehl:` | Renderer → Main, mit Antwort | **ja, immer** | `befehl:person.anlegen`, `befehl:name.setzen`, `befehl:journal.undo`, `befehl:import.ausfuehren` |
| `ereignis:` | Main → Renderer, ohne Antwort | — | `ereignis:datenGeaendert`, `ereignis:speicherStatus`, `ereignis:journalStatus`, `ereignis:projektGeschlossen` |

`abfrage:` und `befehl:` sind der Unterschied, an dem die ganze Architektur hängt: **Wenn ein
Kanal Daten ändert, heißt er `befehl:`, und dann läuft er zwangsläufig durch den Bus aus §4.2,
und dann ist er journalisiert und rücknehmbar.** Es gibt keinen dritten Weg. Ein `abfrage:`, das
schreibt, ist der schlimmste denkbare Fehler in diesem Projekt, und darum gibt es dafür einen
Test: In der Testumgebung wird während jeder `abfrage:`-Ausführung ein Trigger scharf gestellt,
der jeden Schreibvorgang mit `RAISE(ABORT)` beendet.

Die Typkarte, aus der Renderer und Main ihre Typen ziehen:

```ts
// src/shared/ipc/vertrag.ts
export interface Vertrag {
  'abfrage:person.liste':   { ein: PersonListeFilter;  aus: PersonZeile[] }
  'abfrage:person.detail':  { ein: { id: string };     aus: PersonDetail }
  'abfrage:suche':          { ein: SucheAnfrage;       aus: SucheTreffer[] }
  'abfrage:journal.verlauf':{ ein: { grenze: number }; aus: TransaktionZeile[] }

  'befehl:person.anlegen':  { ein: PersonAnlegenEin;   aus: { id: string } }
  'befehl:person.loeschen': { ein: { id: string };     aus: null }
  'befehl:journal.undo':    { ein: null;               aus: UndoErgebnis }
  'befehl:journal.redo':    { ein: null;               aus: UndoErgebnis }
  'befehl:projekt.oeffnen': { ein: { pfad: string };   aus: ProjektInfo }
  // … Phase 1 ergänzt hier
}

export type Kanal = keyof Vertrag
export type Ein<K extends Kanal> = Vertrag[K]['ein']
export type Aus<K extends Kanal> = Vertrag[K]['aus']
```

Der Renderer bekommt daraus einen Aufruf, bei dem ein Tippfehler im Kanalnamen ein Typfehler ist:

```ts
// src/renderer/brücke/aufrufen.ts
export async function aufrufen<K extends Kanal>(kanal: K, ein: Ein<K>): Promise<Ergebnis<Aus<K>>> {
  return window.wurzelwerk.aufrufen(kanal, ein) as Promise<Ergebnis<Aus<K>>>
}
```

### 2.4 Die Hülle im Hauptprozess

Jeder Kanal wird über **eine** Funktion registriert. Das ist der Ort, an dem Validierung,
Protokollierung und Fehlerwandlung genau einmal existieren:

```ts
// src/main/ipc/huelle.ts
export function registriere<K extends Kanal>(
  kanal: K,
  eingabeSchema: z.ZodType<Ein<K>>,
  handler: (ein: Ein<K>, ktx: Kontext) => Promise<Aus<K>> | Aus<K>
): void {
  ipcMain.handle(kanal, async (_e, roh: unknown): Promise<Ergebnis<Aus<K>>> => {
    const vorgangsId = neueId()
    const geprueft = eingabeSchema.safeParse(roh)
    if (!geprueft.success) {
      return fehlerErgebnis('IPC_UNGUELTIGE_NUTZLAST', vorgangsId, geprueft.error)
    }
    try {
      const daten = await handler(geprueft.data, { vorgangsId })
      return { ok: true, daten }
    } catch (u) {
      const fehler = zuAppFehler(u, vorgangsId)      // wandelt auch SQLite-Fehlercodes
      logger.error({ vorgangsId, kanal, code: fehler.code })  // KEINE Nutzlast, siehe §10.2
      return { ok: false, fehler }
    }
  })
}
```

**Warum die Nutzlast auf der Hauptprozessseite noch einmal validiert wird**, obwohl TypeScript
sie schon typisiert hat: TypeScript ist zur Laufzeit weg. Der Renderer ist ein anderer Prozess,
in dem ein Bündel läuft, das aus vielen Quellen zusammengebaut wurde. Wenn dort ein `undefined`
entsteht, wo eine ID stehen sollte, dann ist die Frage nur, ob es an der Grenze auffällt oder
als `NULL` in der Datenbank landet. Zod an der Grenze kostet Mikrosekunden und ist der Unterschied
zwischen einem lesbaren Fehler und einem stillen Datenfehler.

### 2.5 Ereignisse vom Hauptprozess zum Renderer

```ts
// nach jedem erfolgreichen Befehl
{
  kanal: 'ereignis:datenGeaendert',
  nutzlast: {
    transaktionId: 'tx-01J…',
    betroffen: [ { tabelle: 'person', id: '01J…' }, { tabelle: 'name', id: '01J…' } ],
    ursache: 'befehl:name.setzen'
  }
}
```

Der Renderer macht daraus Ungültigkeitserklärungen für TanStack Query (§7.3). Er bekommt
**keine** Nutzdaten mitgeschickt — nur, was sich geändert hat. Sonst existieren zwei Wege, an
Daten zu kommen, und sie driften auseinander.

`ereignis:journalStatus` liefert `{ undoMoeglich, redoMoeglich, undoBeschreibung, redoBeschreibung }`
und speist Menü und Tastenkürzel. `ereignis:speicherStatus` liefert
`{ zustand: 'gespeichert' | 'schreibt' | 'fehler', seit: number }` für die Fußzeile (UX §2).

---

## 3. Datenzugriffsschicht

### 3.1 Verbindung und Pragmas — an genau einer Stelle

```ts
// src/main/datenbank/verbindung.ts
export function oeffnen(pfad: string): Database {
  const db = new Database(pfad)
  db.pragma('journal_mode = WAL')       // 50_Datenmodell §3
  db.pragma('synchronous = NORMAL')     // siehe Warnung unten
  db.pragma('foreign_keys = ON')        // MUSS je Verbindung gesetzt werden, ist nicht persistent
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.function('uuid7', () => neueId())  // damit Trigger IDs erzeugen können
  return db
}
```

`foreign_keys = ON` ist die Zeile, die man vergisst. SQLite hat sie aus
Rückwärtskompatibilität standardmäßig aus, und sie gilt **pro Verbindung**, nicht pro Datei. Ohne
sie ist das halbe Datenmodell nur Dokumentation. Deshalb gibt es dafür einen Test, der eine
Fremdschlüsselverletzung provoziert und erwartet, dass sie scheitert.

`synchronous = NORMAL` heißt konkret: Ein Prozessabsturz (Programmfehler, `SIGKILL`, Beenden
über den Aktivitätsmonitor) kostet **keine** committete Transaktion. Ein Stromausfall oder
Kernel-Absturz kann die letzten committeten Transaktionen kosten, korrumpiert die Datei aber
nicht. `FULL` würde auch das abdecken, kostet aber je Transaktion einen `fsync` — bei
Auto-Speicherung mit einer Transaktion pro Feldänderung ist das spürbar. Die Entscheidung folgt
`50_Datenmodell.md` §3 und ist bewusst; sie steht als offener Punkt V7 in `80_Offene_Fragen.md`,
falls du sie anders willst.

### 3.2 Wie eine Abfrage aussieht

Abfragen sind **flache Funktionen**, keine Klassen, keine Query-Builder. Sie bekommen die
Verbindung, geben ein fertiges Ergebnisobjekt zurück und enthalten das SQL im Klartext:

```ts
// src/main/abfragen/person-liste.ts
const SQL = `
  SELECT p.id, p.geschlecht, p.lebend_status, p.ist_platzhalter,
         a.anzeigename, a.geburt_jahr, a.tod_jahr, a.geburt_ort_name
  FROM   person p
  JOIN   person_flach a ON a.person_id = p.id      -- abgeleitet, §5
  WHERE  (:nurPlatzhalter IS NULL OR p.ist_platzhalter = :nurPlatzhalter)
  ORDER  BY a.sortier_nachname, a.sortier_vornamen, a.geburt_sort_von
  LIMIT  :grenze OFFSET :versatz
`
export function personListe(db: Database, f: PersonListeFilter): PersonZeile[] {
  return db.prepare(SQL).all(f) as PersonZeile[]
}
```

Drei Regeln dazu:

- **Immer benannte Parameter, niemals Zeichenkettenverkettung.** Bei einer lokalen Ein-Personen-App ist SQL-Injektion kein Angriffsszenario, aber ein Apostroph in „O'Brien" oder „d'Aboville" ist eines. Genealogie ist voller Apostrophe.
- **`SELECT *` ist verboten.** Eine Migration, die eine Spalte hinzufügt, ändert sonst still die Form eines Ergebnisses.
- **Abfragen lesen nur.** Der Zugriff auf `person_flach` (die materialisierte Ansicht aus `50_Datenmodell.md` §2.1) ist ausdrücklich erlaubt und der Normalfall: Listen und Sortierungen laufen nie über die Aussagentabelle, sonst wird jede Liste zu einem Join-Ungeheuer.

### 3.3 Repositories und das Transaktions-Handle

Ein Repository nimmt ein `Tx`-Handle. `Tx` ist nichts als die Verbindung mit einem
Typmarker — aber der Marker macht es unmöglich, ein Repository außerhalb einer Transaktion
aufzurufen, ohne das absichtlich hinzuschreiben:

```ts
// src/main/repositories/basis.ts
export type Tx = Database & { readonly __transaktion: unique symbol }

// src/main/repositories/person-repo.ts
export const personRepo = {
  einfuegen(tx: Tx, p: PersonZeileNeu): void {
    tx.prepare(`INSERT INTO person (id, geschlecht, lebend_status, privat, notiz,
                                    ist_platzhalter, platzhalter_grund, erstellt_am, geaendert_am)
                VALUES (@id, @geschlecht, @lebendStatus, @privat, @notiz,
                        @istPlatzhalter, @platzhalterGrund, @jetzt, @jetzt)`).run(p)
  },
  loeschen(tx: Tx, id: string): void { /* … */ },
  lesen(tx: Tx, id: string): PersonZeile | undefined { /* … */ }
}
```

Repositories enthalten **kein** `BEGIN`, **kein** `COMMIT`, **kein** Journalcode und **keine**
Fachregel. Sie sind absichtlich langweilig. Alles Interessante passiert eine Ebene höher.

### 3.4 Wo Transaktionen beginnen und enden

Genau eine Stelle: der Befehlsbus (§4.2). Nirgends sonst. Die Klammer ist:

```
BEGIN IMMEDIATE
  ├─ transaktion-Zeile anlegen  (id, zeitpunkt, art, beschreibung)
  ├─ journal_kontext armieren   (transaktion_id = …, aktiv = 1)
  ├─ Handler läuft: Repository-Aufrufe
  │    └─ SQLite-Trigger schreiben nebenher aenderung-Zeilen
  ├─ journal_kontext entwaffnen (transaktion_id = NULL, aktiv = 1)
  └─ leere Transaktion? → Zeile wieder löschen
COMMIT
```

`BEGIN IMMEDIATE` statt `BEGIN`: Es holt die Schreibsperre sofort, statt beim ersten
Schreibversuch. Damit scheitert ein Schreibkonflikt am Anfang statt in der Mitte — was bei einem
Hintergrundprozess (Import, Schnappschuss) den Unterschied zwischen „bitte kurz warten" und
„Transaktion mitten drin abgebrochen" ausmacht.

**Ein Befehl darf nicht in einem anderen Befehl laufen.** Verschachtelte Transaktionen wären in
SQLite nur mit SAVEPOINT möglich, und dann wäre ein Undo-Schritt nicht mehr eindeutig. Der Bus
prüft das und wirft `BEFEHL_VERSCHACHTELT`. Wer aus zwei Befehlen einen machen will, schreibt
einen dritten Befehl, der beide Handlerfunktionen aufruft — der Handler ist eine normale
Funktion, das ist billig.

---

## 4. Änderungsjournal und Befehlsbus

### 4.1 Die tragende Entscheidung: Trigger statt Anwendungscode (ADR-017)

ADR-003 legt Command Pattern mit Änderungsjournal fest, sagt aber nicht, **wer** das Journal
schreibt. Es gibt zwei Möglichkeiten:

**(a) Anwendungscode schreibt mit.** Jeder Befehl fügt neben seinem `INSERT` auch eine
`aenderung`-Zeile ein. Einfach zu verstehen, in jedem Beispielcode so zu finden — und in einem
Projekt, in dem KI die Befehle schreibt, garantiert lückenhaft. Der erste vergessene Eintrag
führt nicht zu einem Fehler, sondern zu einem Undo, das *fast* funktioniert. Das ist die
schlimmste Fehlerklasse, die es gibt: still, spät, datenzerstörend.

**(b) SQLite-Trigger schreiben mit.** Für jede journalisierte Tabelle drei Trigger (AFTER
INSERT / UPDATE / DELETE), die den Datensatz nach `aenderung` schreiben. **Ein Trigger kann
nicht vergessen werden**, weil er an der Tabelle hängt und nicht am Aufrufpfad. Ob der Befehl
sauber geschrieben ist, ist irrelevant.

**Entschieden: (b).** Die Kosten sind Erzeugungsaufwand (ein Skript, §4.4) und dass Trigger im
Debugger unsichtbar sind. Der Nutzen ist, dass die zentrale Datenschutzzusage des Produkts
(„nichts geht verloren") nicht von der Disziplin des Codes abhängt.

### 4.2 Zeilen statt Felder (ADR-017, Abweichung von 50_Datenmodell §2.10)

`50_Datenmodell.md` §2.10 beschreibt `aenderung` mit einer Spalte `feld` und Feld-Diffs. Ich
weiche davon ab und speichere **ganze Zeilen als JSON**:

```sql
aenderung(
  id             TEXT PRIMARY KEY,
  transaktion_id TEXT NOT NULL REFERENCES transaktion(id),
  reihenfolge    INTEGER NOT NULL,
  tabelle        TEXT NOT NULL,
  datensatz_id   TEXT NOT NULL,
  feld           TEXT,          -- bleibt für Sonderfälle, NULL = ganze Zeile
  wert_alt_json  TEXT,          -- ganze Zeile vor der Änderung, NULL bei insert
  wert_neu_json  TEXT,          -- ganze Zeile nach der Änderung, NULL bei delete
  operation      TEXT NOT NULL CHECK (operation IN ('insert','update','delete'))
)
```

Begründung, in dieser Reihenfolge:

1. **Die Umkehrung wird trivial korrekt.** `update` rückwärts heißt: schreibe `wert_alt_json` komplett zurück. Bei Feld-Diffs muss man wissen, welche Felder betroffen waren, und ein vergessenes Feld fällt niemandem auf. Bei ganzen Zeilen ist die Invariante aus ADR-009 („Undo stellt den Datenbestand bitgleich wieder her") *strukturell* erfüllt und nicht nur hoffentlich.
2. **Ein generischer Trigger je Tabelle statt einer pro Spalte.** Feld-Diffs im Trigger bedeuten pro Tabelle so viele `CASE`-Zweige, wie sie Spalten hat. Bei `name` mit 18 Spalten ist das erzeugter Code, den niemand prüft.
3. **Feld-Diffs gehen nicht verloren, sie werden berechnet.** Für die Anzeige im Änderungsverlauf werden alt und neu als JSON verglichen; das Ergebnis ist genau die Feldliste, die (a) gespeichert hätte. Der Nutzer sieht dasselbe.

Kosten: Das Journal wird größer. Bei 2.000 Personen und einer Zeile von ~400 Byte kostet eine
Änderung ~800 Byte statt ~80. Bei 50.000 Änderungen sind das 40 MB statt 4 MB. Das ist bei einer
Datei, die Fotos enthält, kein Argument — und die Begrenzung aus §4.6 deckelt es ohnehin.

### 4.3 Armierung: wie der Trigger weiß, zu welcher Transaktion er gehört

Trigger können keine Anwendungsvariablen lesen. Der Standardweg ist eine Kontexttabelle:

```sql
CREATE TABLE journal_kontext (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  transaktion_id TEXT,
  aktiv          INTEGER NOT NULL DEFAULT 1
);
INSERT INTO journal_kontext (id, transaktion_id, aktiv) VALUES (1, NULL, 1);
```

Und ein Trigger sieht so aus (Vorlage, für jede Tabelle erzeugt):

```sql
CREATE TRIGGER jrn_person_update AFTER UPDATE ON person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id,
                         wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(),
          (SELECT transaktion_id FROM journal_kontext WHERE id = 1),
          (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung
             WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)),
          'person', OLD.id,
          json_object('id', OLD.id, 'geschlecht', OLD.geschlecht, /* … alle Spalten … */),
          json_object('id', NEW.id, 'geschlecht', NEW.geschlecht, /* … alle Spalten … */),
          'update');
END;
```

Der schöne Nebeneffekt: `aenderung.transaktion_id` ist `NOT NULL` mit Fremdschlüssel. Wer eine
journalisierte Tabelle **ohne armierte Transaktion** beschreibt (`transaktion_id IS NULL`),
verletzt die NOT-NULL-Bedingung, und die ganze Transaktion bricht ab. Das heißt: **ein
Schreibvorgang außerhalb des Befehlsbusses ist nicht möglich — nicht verboten, sondern
unmöglich.** Das ist die stärkste Absicherung in dieser Architektur, und sie kostet eine
Spaltendefinition.

`aktiv = 0` ist der einzige Ausweg. Er wird an genau drei Stellen benutzt: Migration, Undo/Redo
selbst (sonst würde die Rücknahme protokolliert und die Wiederholung zerfällt) und Großimport
(§6.4). Jede dieser drei Stellen setzt ihn über eine Funktion, die einen Kommentar mit
Begründung verlangt, und alle drei sind in `test/invarianten/journal-vollstaendig.test.ts`
namentlich aufgeführt — kommt eine vierte hinzu, schlägt der Test fehl.

### 4.4 Trigger werden erzeugt, nicht geschrieben

`skripte/trigger-generieren.ts` liest das Schema aus einer frisch angelegten Datenbank
(`PRAGMA table_info`), nimmt die Liste der journalisierten Tabellen aus einer expliziten
Konstante und schreibt `docs/schema/trigger_generiert.sql`. Das Skript läuft:

- als npm-Skript beim Entwickeln,
- als letzter Schritt **jeder** Migration (Trigger werden gelöscht und neu erzeugt),
- in der CI mit anschließendem `git diff --exit-code`, damit eine handgeschriebene Änderung an der erzeugten Datei auffällt.

Die Tabellenliste ist eine **Weißliste mit Gegenprobe**:

```ts
export const JOURNALISIERT = ['person','name','ort','ortsname', /* … */] as const
export const NICHT_JOURNALISIERT = [
  'transaktion','aenderung','journal_kontext','schema_migration',   // Journal selbst
  'person_flach','suche_fts','suche_fts_data', /* … */              // abgeleitet, §5
] as const
```

Und der Test in `test/schema/trigger-vorhanden.test.ts`: *Jede* Tabelle der Datenbank steht in
genau einer der beiden Listen, und jede journalisierte Tabelle hat genau drei Trigger. Damit
kann eine neue Tabelle nicht stillschweigend unjournalisiert bleiben — der Test scheitert, bis
jemand eine Entscheidung trifft und sie aufschreibt.

### 4.5 Der Befehlsbus

```ts
// src/main/befehle/bus.ts (verkürzt, aber vollständig in der Struktur)
export function fuehreAus<N extends BefehlName>(
  name: N, ein: BefehlEin<N>, ktx: Kontext
): BefehlAus<N> {
  if (istInTransaktion()) throw appFehler('BEFEHL_VERSCHACHTELT')
  const def = REGISTRIERUNG[name]
  const nutzlast = def.schema.parse(ein)                     // zweite Prüfung, fachlich
  const txId = neueId()

  const ergebnis = db.transaction(() => {                    // BEGIN IMMEDIATE … COMMIT
    journalRepo.transaktionAnlegen(tx, {
      id: txId, zeitpunkt: Date.now(), bearbeiter: 'lokal',
      art: def.art ?? 'nutzer',                              // nutzer|import|merge|migration|wartung
      beschreibung: def.beschreibung(nutzlast),              // i18n-Schlüssel + Parameter
      koaleszenzSchluessel: def.koaleszenzSchluessel?.(nutzlast) ?? null
    })
    kontext.armieren(tx, txId)
    try {
      return def.handler(tx, nutzlast)
    } finally {
      kontext.entwaffnen(tx)
    }
  }).immediate()

  const geaendert = journalRepo.betroffene(txId)
  if (geaendert.length === 0) journalRepo.transaktionVerwerfen(txId)   // kein Undo für Nichts
  else {
    journalRepo.redoStapelVerwerfen()                        // §4.7, lineare Historie
    koaleszenz.versucheZusammenfassen(txId)                  // §4.8
    ereignisse.senden('ereignis:datenGeaendert', { transaktionId: txId, betroffen: geaendert })
    ereignisse.senden('ereignis:journalStatus', journalRepo.status())
  }
  return ergebnis
}
```

Der Teil, der leicht übersehen wird und teuer ist: **eine Transaktion, die nichts geändert hat,
darf kein Undo-Schritt sein.** Sonst drückt der Nutzer viermal Cmd+Z und nichts passiert, weil
er vorher viermal ein Feld angeklickt und unverändert verlassen hat. Der Bus prüft das
nachträglich über die Zahl der `aenderung`-Zeilen — nicht über eine Vermutung im Handler.

### 4.6 Journalbegrenzung

ADR-003 verlangt eine Begrenzung, sagt aber nicht, was sie mit der Undo-Tiefe macht. Entscheidung:

- Aufgeräumt wird beim Projekt-Öffnen, nicht während der Arbeit.
- Behalten werden: **alle** Transaktionen der letzten **30 Tage** und **mindestens die letzten 200**, was auch immer mehr ist.
- Aufgeräumt wird **nur die `aenderung`-Zeilen**, die `transaktion`-Zeile bleibt für immer. Damit bleibt der Verlauf lesbar („am 12.09.2026 wurde Karl Müller angelegt"), nur die Rücknahme endet. `transaktion.rueckgaengig_moeglich` wird auf 0 gesetzt, damit die Oberfläche das anzeigen kann.
- Das Aufräumen ist selbst eine Transaktion mit `art = 'wartung'` und nicht rücknehmbar.

Beide Zahlen sind Vorgaben, keine Wahrheiten — sie stehen als V6 in `80_Offene_Fragen.md`.

### 4.7 Redo und lineare Historie

`transaktion` bekommt eine Spalte `status TEXT NOT NULL DEFAULT 'angewendet'` mit den Werten
`angewendet` · `zurueckgenommen` · `verworfen`.

- **Undo-Ziel** = neueste Transaktion mit `status = 'angewendet'` und `rueckgaengig_moeglich = 1`.
- **Redo-Ziel** = älteste Transaktion mit `status = 'zurueckgenommen'`.
- Sobald ein **neuer** Befehl läuft, werden alle `zurueckgenommen`-Transaktionen auf `verworfen` gesetzt. Der Redo-Stapel ist weg. Das ist das klassische lineare Undo-Modell und es ist das richtige: alles andere braucht einen Historienbaum, den man auch bedienen muss.

**Der große Gewinn dieses Entwurfs:** Der Undo-Stapel liegt nirgends im Arbeitsspeicher. Er ist
eine Abfrage. Damit ist F-03 („Undo/Redo über beliebig viele Schritte, auch über
Programmneustart hinweg") ohne eine einzige Zeile Serialisierungscode erfüllt — man schließt das
Programm, öffnet es wieder, drückt Cmd+Z, und es funktioniert, weil die Wahrheit in der Datei
steht.

### 4.8 Koaleszenz: warum ein Wort nicht zwanzig Undo-Schritte sein darf

Wenn jede Feldänderung eine Transaktion ist, dann erzeugt das Tippen in einem Notizfeld pro
Entprellung einen Undo-Schritt. Nach zwei Sätzen ist der Stapel unbrauchbar.

Lösung im Bus, nicht in der Datenbank: Jeder Befehl kann einen `koaleszenzSchluessel` liefern,
etwa `person:01J…:notiz`. Der Bus fasst die neue Transaktion in die vorhergehende zusammen, wenn
*alle vier* Bedingungen gelten: gleicher Schlüssel, weniger als 2.000 ms Abstand, keine andere
Transaktion dazwischen, beide `art = 'nutzer'`.

Zusammenfassen heißt: `aenderung`-Zeilen der neuen Transaktion an die alte hängen und dann pro
`(tabelle, datensatz_id)` zu **einer** Zeile verdichten:

| erste Operation | zweite Operation | Ergebnis |
|---|---|---|
| insert | update | `insert`, `wert_neu_json` = das neuere |
| insert | delete | beide Zeilen entfallen (die Zeile hat nie existiert) |
| update | update | `update`, ältestes `wert_alt_json`, neuestes `wert_neu_json` |
| update | delete | `delete`, ältestes `wert_alt_json` |
| delete | insert | `update`, altes `wert_alt_json`, neues `wert_neu_json` |

Diese Tabelle ist der ganze Algorithmus, und sie ist mit fünf Einheitentests abgedeckt. Sie ist
außerdem der Grund, warum ganze Zeilen (§4.2) einfacher sind als Feld-Diffs: bei Feld-Diffs
müsste dieselbe Tabelle pro Feld gelten, und die Verdichtung müsste Feldmengen vereinigen.

### 4.9 Der Undo-Algorithmus, und die fünf Stellen, an denen so etwas normalerweise scheitert

```ts
export function undo(): UndoErgebnis {
  return db.transaction(() => {
    const tx = journalRepo.undoZiel()
    if (!tx) throw appFehler('JOURNAL_NICHTS_ZURUECKZUNEHMEN')
    if (tx.art === 'import' && tx.snapshotPfad) return importZuruecknehmen(tx)   // §6.4

    db.pragma('defer_foreign_keys = ON')        // ← Stolperstelle 1
    kontext.journalAus()                         // ← Stolperstelle 2
    try {
      for (const a of journalRepo.aenderungen(tx.id, 'DESC')) {
        if (a.operation === 'insert')      rohLoeschen(a.tabelle, a.datensatzId)
        else if (a.operation === 'delete') rohEinfuegen(a.tabelle, JSON.parse(a.wertAltJson!))
        else                               rohErsetzen(a.tabelle, JSON.parse(a.wertAltJson!))
      }
      journalRepo.statusSetzen(tx.id, 'zurueckgenommen')
    } finally {
      kontext.journalAn()
    }
    return { transaktionId: tx.id, beschreibung: tx.beschreibung }
  }).immediate()
}
```

Redo ist dieselbe Schleife in `ASC` mit `wert_neu_json` und umgekehrter Operationszuordnung.

Und nun die Stellen, an denen selbstgebaute Undo-Mechaniken typischerweise auseinanderfallen —
das ist der Teil, den ich in diesem Dokument für den wichtigsten halte:

**1. Fremdschlüssel in der falschen Reihenfolge.** Eine Transaktion legt eine Person an *und*
einen Namen dazu. Rückwärts in umgekehrter `reihenfolge` wird zuerst der Name gelöscht, dann die
Person — das geht gut. Aber sobald eine Transaktion zwei Datensätze anlegt, die sich
gegenseitig referenzieren (etwa `ort.nachfolger_ort_id`), gibt es **keine** Reihenfolge, die
Schritt für Schritt gültig bleibt. `PRAGMA defer_foreign_keys = ON` verschiebt die Prüfung auf
den COMMIT: zwischendrin darf die Datenbank inkonsistent sein, am Ende nicht. Das Pragma gilt
nur für die laufende Transaktion und setzt sich beim COMMIT selbst zurück. **Ohne diese Zeile
funktioniert Undo in etwa 95 % der Fälle** — und genau das macht den Fehler so teuer, weil er
erst bei einem seltenen Datenmuster auffällt.

**2. Das Undo protokolliert sich selbst.** Ohne `kontext.journalAus()` erzeugt die Rücknahme
neue `aenderung`-Zeilen. Der Redo-Stapel zeigt dann auf Zeilen, die die Rücknahme der Rücknahme
beschreiben, und nach zwei Runden ist die Historie Unsinn. Deshalb ist Undo einer der drei
namentlich erlaubten Fälle aus §4.3.

**3. Abgeleitete Daten laufen aus dem Tritt.** Wenn `person_flach` oder der FTS5-Index von
Anwendungscode gepflegt würde, müsste Undo ihn mitpflegen — und würde es vergessen. Weil sie von
eigenen Triggern auf den Basistabellen gepflegt werden (§5), pflegt das rohe Zurückschreiben sie
automatisch mit. Genau darum ist die Regel „abgeleitete Daten werden nie journalisiert, aber
immer per Trigger gepflegt" nicht Ästhetik, sondern eine Voraussetzung dafür, dass Undo
überhaupt korrekt sein kann.

**4. Schlüssel, die nach dem Wiedereinfügen andere sind.** Wenn eine Tabelle `INTEGER PRIMARY
KEY` benutzt, bekommt eine wiedereingefügte Zeile möglicherweise eine andere `rowid` — und alles,
was auf sie zeigte, zeigt ins Leere. Weil `50_Datenmodell.md` §0 UUIDs für alles vorschreibt
(F-05), tritt das nicht auf. Damit es auch in Zukunft nicht auftritt, prüft
`test/schema/schluessel-typen.test.ts`, dass keine journalisierte Tabelle einen
INTEGER-Primärschlüssel hat.

**5. „Bitgleich" wird nie geprüft.** ADR-009 §2 verlangt „Undo(Aktion) stellt den Datenbestand
bitgleich wieder her". Das ist nur dann eine Zusicherung, wenn ein Test es tatsächlich
vergleicht. Der Test (`test/invarianten/undo-bitgleich.test.ts`) sieht so aus:

```ts
// fast-check erzeugt Befehlsfolgen aus der Registrierung
fc.assert(fc.property(befehlsfolgeGenerator(), (folge) => {
  const db = fixtureLaden('mehrfachehe')
  const vorher = kanonischerAbzug(db)          // alle Tabellen außer Journal + abgeleitet
  for (const b of folge) fuehreAus(b.name, b.ein)
  for (const _ of folge) undo()
  expect(kanonischerAbzug(db)).toBe(vorher)    // Zeichen für Zeichen
}), { numRuns: 300 })
```

`kanonischerAbzug` sortiert jede Tabelle nach `id` und serialisiert jede Zeile als JSON mit
sortierten Schlüsseln. Wichtig: `geaendert_am` wird **nicht** ausgenommen. Es wird von der
Rücknahme mit zurückgesetzt, weil ganze Zeilen zurückgeschrieben werden — und wenn das mal nicht
mehr stimmt, soll der Test es sagen. Ausgenommen sind nur `transaktion`, `aenderung`,
`journal_kontext` (dort *soll* sich etwas geändert haben) und die abgeleiteten Tabellen (die
werden separat geprüft, §5.3).

---

## 5. Abgeleitete Daten

### 5.1 Warum es sie überhaupt gibt

`50_Datenmodell.md` §2.1 verzichtet bewusst auf Spalten wie `vorname` oder `geburtsdatum` an
`person` — jeder Fakt ist eine Aussage mit Herkunft. Fachlich richtig, für eine sortierte Liste
über 2.000 Personen aber untragbar: Der bevorzugte Vorname steckt hinter einem Join über
`aussage`, gefiltert auf `ist_bevorzugt`, und die Sortierung müsste über eine
diakritikafreie Normalform laufen, die es in SQL nicht gibt.

Darum eine **materialisierte Ansicht** als echte Tabelle:

```sql
CREATE TABLE person_flach (
  person_id         TEXT PRIMARY KEY REFERENCES person(id) ON DELETE CASCADE,
  anzeigename       TEXT NOT NULL,     -- aus dem bevorzugten Namenseintrag
  sortier_nachname  TEXT NOT NULL,     -- Suchnormalform, für ORDER BY
  sortier_vornamen  TEXT NOT NULL,
  geburt_jahr       INTEGER, geburt_sort_von INTEGER, geburt_ort_name TEXT,
  tod_jahr          INTEGER, tod_sort_von    INTEGER,
  konfidenz_min     INTEGER,           -- für die Belegqualitäts-Ebene, Phase 5
  hat_widerspruch   INTEGER NOT NULL DEFAULT 0    -- abgeleiteter Zustand aus E21
) STRICT;
```

`hat_widerspruch` ist bemerkenswert: `50_Datenmodell.md` §2.16 nennt „widersprüchlich"
ausdrücklich einen **abgeleiteten Zustand** und keine Konfidenzstufe. Genau hier wird er
abgeleitet — nicht in der Oberfläche, wo er pro Ansicht neu erfunden würde.

### 5.2 Die harte Regel

> **Abgeleitete Tabellen tragen keine Wahrheit. Sie sind jederzeit vollständig aus den
> Basistabellen neu berechenbar, sie werden nie journalisiert, und kein Befehl schreibt
> jemals direkt in sie.**

Gepflegt werden sie von einer zweiten Trigger-Familie (`abl_*`) auf den Basistabellen, die
`trigger-generieren.ts` mit erzeugt. Für FTS5 ist das der ohnehin übliche Weg (externe
Content-Tabelle plus Trigger); `person_flach` folgt demselben Muster.

Der FTS5-Index umfasst nach ADR-014 **drei Ebenen gleichzeitig**: Originalschreibweise,
Umschrift und Suchnormalform. Das ist keine Nachrüstung, sondern die Definition der
Indexspalten:

```sql
CREATE VIRTUAL TABLE suche_fts USING fts5(
  original, umschrift, normalform, notiz, transkript,
  content='', tokenize='unicode61 remove_diacritics 2'
);
```

`remove_diacritics 2` behandelt kombinierende Zeichen mit; die polnischen Diakritika sind damit
im Index erledigt, das kyrillische Material über die Umschriftspalte. Kölner Phonetik ist keine
FTS-Angelegenheit, sondern eine eigene Tabelle `name_phonetik` (bereits im Datenmodell) mit
einem Index — sie wird bei der Suche als zweite, schwächer gewichtete Trefferquelle abgefragt.

### 5.3 Der Test, der die Regel durchsetzt

```ts
// test/invarianten/abgeleitet-gleich.test.ts
const inkrementell = abzugAbgeleitet(db)     // Zustand nach vielen Einzelbefehlen
alleAbgeleitetenNeuAufbauen(db)              // TRUNCATE + vollständige Neuberechnung
expect(abzugAbgeleitet(db)).toBe(inkrementell)
```

Läuft über den ganzen Fixture-Korpus und nach jeder erzeugten Befehlsfolge. Dieser eine Test
fängt die gesamte Klasse „Trigger vergisst einen Fall" — und er gibt gleichzeitig die
Reparaturfunktion für den Notfall: `alleAbgeleitetenNeuAufbauen` ist auch ein Menüpunkt unter
Wartung.

---

## 6. Auto-Speicherung, Schnappschüsse, Import

### 6.1 Auto-Speicherung ist keine Funktion, sondern eine Abwesenheit

F-01 verlangt „Auto-Speicherung, jede Bearbeitung als Transaktion, immer konsistenter Zustand
auf der Platte". Der Entwurf erfüllt das, indem es **keinen ungespeicherten Zustand gibt**: Ein
Befehl kehrt erst zurück, wenn seine Transaktion committet ist. Es gibt keinen Zwischenpuffer,
keinen Zeitgeber, keinen „Speichern"-Knopf und folglich auch keinen Dialog „Änderungen
verwerfen?".

Der einzige flüchtige Zustand ist der **Entwurf im Eingabefeld** zwischen Tastendruck und
Übernahme (§7.2). Der ist bewusst flüchtig: Ein halb getippter Nachname ist kein Datenstand.
Beim Schließen des Fensters wird er noch übernommen (§7.4).

### 6.2 Schnappschüsse (F-04)

`VACUUM INTO 'snapshots/<ISO-Zeit>.sqlite'` erzeugt eine konsistente Kopie **im laufenden
Betrieb** ohne Sperre — der Grund, warum SQLite hier die richtige Wahl war (ADR-002). „ISO-Zeit“
ist hier **kolonfrei** gemeint (`YYYY-MM-DDTHH-MM-SSZ`, ebenso bei `ersetzt-<Zeit>.sqlite`): `:`
ist in Windows-Dateinamen verboten (§11), ein `:` in `<ISO-Zeit>` wäre also auf diesem
gleichrangigen Zielsystem ein sofortiger Fehlschlag.

Ausgelöst wird ein Schnappschuss:

| Anlass | Begründung |
|---|---|
| beim Öffnen, wenn der letzte älter als 24 h ist | ein Stand pro Arbeitstag, ohne Zutun |
| vor jeder Migration | die Fehlerklasse, die Nutzerdaten zerstört (ADR-009 §5) |
| vor jedem Großimport | Grundlage der Import-Rücknahme, §6.4 |
| alle 200 Transaktionen | Auffangnetz zwischen den Tagesständen |
| auf Menübefehl | mit eigener Beschreibung |

Aufbewahrung: die letzten 10, zusätzlich einer pro Tag der letzten 7 Tage, zusätzlich einer pro
Woche der letzten 4 Wochen. Ältere werden beim Öffnen gelöscht. Wiederherstellen ist bewusst
grob und unbequem: Projekt schließen, Datei ersetzen (die alte wird nach
`snapshots/ersetzt-<Zeit>.sqlite` verschoben, nie gelöscht), neu öffnen. Ein Zurückspielen im
laufenden Betrieb würde bedeuten, dass Fenster und Abfragecache auf einen Datenbestand zeigen,
den es nicht mehr gibt.

### 6.3 Der Widerspruch zwischen ADR-003 und ADR-010 — und seine Auflösung (ADR-019)

ADR-003 sagt: „Bei Massenimporten Journal aus, Snapshot vorher."
ADR-010 Punkt 4 sagt: „ein Import ist als Ganzes rückgängig machbar."

Beides gleichzeitig geht nicht über das Journal: Ohne `aenderung`-Zeilen gibt es nichts zu
invertieren. Auflösung über einen Schwellwert:

- **Kleiner Import** (bis 500 geänderte Zeilen, Vorgabe): Journal **an**. Der Import ist eine ganz normale Transaktion mit `art = 'import'` und ein ganz normaler Undo-Schritt. Das ist der Regelfall in Phase 1 — ein Interviewprotokoll bringt selten mehr als ein paar Dutzend Personen.
- **Großer Import** (darüber): Schnappschuss, Journal **aus**, Import in einer Transaktion, Journal **an**, `transaktion`-Zeile mit `art = 'import'` und `snapshot_pfad`. Rücknahme = Schnappschuss zurückspielen (§6.4).

Die Zahl ist eine Vorgabe und steht als V5 in `80_Offene_Fragen.md`. Vor der Ausführung wird sie
aus dem Trockenlauf bekannt — der Nutzer erfährt also **vorher**, welche der beiden
Rücknahmearten er bekommt. Das gehört in den Trockenlauf-Bericht (`56_Import_Vertrag.md`).

### 6.4 Rücknahme eines Großimports

Nur möglich, solange der Import die **neueste** Transaktion ist. Ablauf: Bestätigungsdialog, der
ausdrücklich sagt, dass der Stand von vor dem Import wiederhergestellt wird → Projekt schließen
→ aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` → Schnappschuss zurückkopieren → öffnen.
Der Redo-Stapel ist danach leer, und das steht auch im Dialog.

Ist der Import nicht die neueste Transaktion, ist er nicht rücknehmbar; die Oberfläche zeigt
statt „Rückgängig" den Weg „Schnappschuss wiederherstellen" mit der Warnung, was dabei verloren
geht. Das ist unbequem und ehrlich — die bequeme Variante wäre eine Lüge.

### 6.5 Herkunftsvermerk (ADR-010 Punkt 4)

Jeder importierte Datensatz muss wissen, woher er kommt. Umsetzung ohne neue Spalte an jeder
Tabelle: Der Import legt einen `import_lauf`-Datensatz an (Datei, Prüfsumme, Vertragsversion,
Zeitpunkt, Transaktions-ID, Quelle/Interview-Bezug) und jeder erzeugte Datensatz ist über die
`aenderung`-Zeilen dieser Transaktion auffindbar. Für die Anzeige („woher stammt diese Person?")
reicht eine Abfrage über `aenderung` — kein zusätzliches Feld, keine Redundanz, und es
funktioniert für jede Tabelle gleich, auch für die, die es noch nicht gibt.

Wenn `aenderung` später aufgeräumt wird (§4.6), bleibt die Zuordnung dennoch: Vor dem Aufräumen
schreibt die Wartung die Zuordnung `import_lauf ↔ datensatz` in eine kleine
`import_herkunft`-Tabelle fest. Das ist der einzige Fall, in dem etwas aus dem Journal
verdichtet und dauerhaft festgehalten wird.

---

## 7. Zustandsverwaltung im Frontend (ADR-022)

### 7.1 Vier Arten von Zustand, streng getrennt

| Art | Wo | Beispiel | Überlebt |
|---|---|---|---|
| **Datenbestand** | SQLite, gelesen über TanStack Query | Personen, Namen, Aussagen | alles |
| **Projektzustand** | SQLite, Tabelle `ansicht_zustand` | gespeicherte Ansichten, Zentrumsperson, letzte Filter (Phase 2+) | Projektwechsel |
| **Sitzungszustand** | Zustand (Bibliothek), nur Speicher | Auswahl, offenes Panel, Sortierrichtung, Zeitregler | nichts |
| **Entwurf** | React-Komponentenzustand | halb getippter Text im Feld | den Fokuswechsel nicht |

Der häufigste Architekturfehler in Electron-Apps ist, Datenbestand in den globalen
Frontend-Speicher zu kopieren und dort zu pflegen. Dann gibt es zwei Wahrheiten, und die im
Speicher gewinnt gelegentlich. **Regel: TanStack Query ist ein Cache, kein Speicher.** Wenn eine
Frage über Daten gestellt wird, wird sie an den Hauptprozess gestellt.

### 7.2 Entwurf und Übernahme

```
Tastendruck ──► Entwurf im Feld (React-State), Feld gilt als "in Arbeit"
                       │
      Übernahme bei:   ├─ Verlassen des Feldes (blur)
                       ├─ Enter (einzeilig)
                       ├─ 800 ms ohne Tastendruck (mehrzeilig)
                       ├─ Ansichtswechsel / Dialogschließung
                       └─ Fenster schließt (§7.4)
                       ▼
                befehl:… ──► Transaktion ──► Journal ──► ereignis:datenGeaendert
                       ▼
             Query wird ungültig, Feld übernimmt den Wert aus der Antwort
```

Escape verwirft den Entwurf und stellt den Wert aus dem Cache wieder her. Das ist die einzige
„Verwerfen"-Funktion in der ganzen Anwendung — alles Übrige läuft über Undo.

Die 800 ms und die Koaleszenzspanne von 2.000 ms (§4.8) hängen zusammen: Der Entprellwert muss
kleiner sein als das Koaleszenzfenster, sonst entstehen aus einem Satz mehrere Undo-Schritte.

### 7.3 Ungültigkeitserklärung

Abfrageschlüssel spiegeln die Kanalstruktur: `['person', 'liste', filter]`,
`['person', 'detail', id]`, `['suche', anfrage]`. Auf `ereignis:datenGeaendert` läuft eine
Zuordnung von betroffenen Tabellen auf Schlüsselpräfixe:

```ts
const ZUORDNUNG: Record<string, string[][]> = {
  person: [['person'], ['suche']],
  name:   [['person'], ['suche']],
  aussage:[['person']],
  ort:    [['ort'], ['person'], ['suche']],
  // …
}
```

Grobkörnig und absichtlich so: Bei lokalen Abfragen unter 5 ms ist eine zu großzügige
Ungültigkeitserklärung billiger als eine zu feine, die einen Fall vergisst und veraltete Daten
zeigt.

**Keine optimistischen Aktualisierungen in Phase 0 und 1.** Der Rundlauf ist lokal und
unmessbar; optimistische Aktualisierungen bringen Rücknahmelogik im Renderer, also eine zweite,
schlechtere Undo-Mechanik neben der aus §4.9. Wenn Phase 2 zeigt, dass eine bestimmte Interaktion
spürbar hakt, wird sie dort gezielt optimistisch gemacht — nicht vorher und nicht überall.

### 7.4 Fenster schließen

`before-quit` im Hauptprozess sendet `ereignis:entwuerfeUebernehmen`, wartet höchstens 2.000 ms
auf eine Bestätigung des Renderers, schließt dann. Läuft ein Import oder Schnappschuss, wird das
Schließen verzögert und ein Hinweis angezeigt; nach 30 s wird trotzdem geschlossen (die
Transaktion bricht dann ab und WAL sorgt dafür, dass nichts halb Geschriebenes bleibt).

### 7.5 Speicherstatus in der Fußzeile

Drei Zustände aus §2.5: `gespeichert` (Vorgabe), `schreibt` (nur anzeigen, wenn länger als
150 ms — sonst flackert es bei jedem Tastendruck), `fehler` (bleibt stehen, bis der Nutzer sie
liest, mit Verweis auf das Protokoll). Der dritte ist der wichtigste und wird am häufigsten
vergessen: **eine Auto-Speicherung, die stillschweigend scheitert, ist schlimmer als ein
Speichern-Knopf.**

---

## 8. Schnittstelle der Layout-Engine (Andockstelle für Phase 2)

In Phase 0 entsteht **nur** `src/core/layout/vertrag.ts` — Typen, keine Implementierung. Damit
kann Phase 2 anfangen, ohne dass Phase 1 die Engine kennt oder importiert.

```ts
// src/core/layout/vertrag.ts — vollständig

/** Eingabe: reiner Graph. Keine Datenbank-, keine React-, keine SVG-Typen. */
export interface LayoutEingabe {
  readonly personen: readonly LayoutPerson[]
  readonly paare:    readonly LayoutPaar[]
  readonly kanten:   readonly LayoutKante[]
}
export interface LayoutPerson {
  readonly id: string
  readonly ebenenHinweis?: number      // Generation, wenn bekannt (ADR-005 Punkt 1)
  readonly geburtSortVon?: number      // julianische Tageszahl, für die Schätzung
  readonly geschlecht?: 'M' | 'F' | 'U' | 'X'
  readonly istPlatzhalter?: boolean
  /** Knotenmaß. Wird vom Renderer gemessen und hier hereingegeben — siehe Regel unten. */
  readonly breite: number
  readonly hoehe: number
}
export interface LayoutPaar {
  readonly id: string
  readonly partnerIds: readonly string[]           // 1..n, Mehrfachehen erlaubt
  readonly beginnSortVon?: number                  // für die Reihenfolge mehrerer Ehen
}
export interface LayoutKante {
  readonly id: string
  readonly vonId: string                            // Personen- oder Paar-ID
  readonly zuId: string
  readonly art: 'elternschaft' | 'partnerschaft'
  readonly elternschaftTyp?: ElternschaftTyp        // für die Kantenform, UX §5
  readonly gesichert: boolean
}

export interface LayoutOptionen {
  readonly diagrammtyp: 'ahnentafel' | 'nachkommen' | 'sanduhr' | 'verwandte'
  readonly wurzelId: string
  readonly generationenAufwaerts: number
  readonly generationenAbwaerts: number
  readonly ebenenAbstand: number
  readonly geschwisterAbstand: number
  readonly paarAbstand: number
  readonly implexAlsGhost: boolean                  // ADR-005 Punkt 4
}

export interface LayoutErgebnis {
  readonly knoten: readonly LayoutKnoten[]
  readonly kantenPfade: readonly LayoutKantenPfad[]
  readonly grenzen: { readonly minX: number; readonly minY: number
                      readonly maxX: number; readonly maxY: number }
  readonly kennzahlen: { readonly kreuzungen: number; readonly dauerMs: number
                         readonly knotenAnzahl: number; readonly ghostAnzahl: number }
}
export interface LayoutKnoten {
  readonly id: string
  readonly personId: string
  readonly x: number; readonly y: number            // linke obere Ecke, Layout-Einheiten
  readonly breite: number; readonly hoehe: number
  readonly ebene: number
  readonly istGhost: boolean
  readonly ghostOriginalKnotenId?: string
}
export interface LayoutKantenPfad {
  readonly id: string
  readonly punkte: readonly { readonly x: number; readonly y: number }[]
  readonly art: LayoutKante['art']
  readonly elternschaftTyp?: ElternschaftTyp
}

/** Reine Funktion. Wirft nie. Deterministisch. Implementierung: Phase 2. */
export type BerechneLayout = (e: LayoutEingabe, o: LayoutOptionen) => LayoutErgebnis
```

Vier Regeln, die diese Signatur erzwingt — und jede davon ist ADR-009 Punkt 8 in Handarbeit:

1. **Layout misst keinen Text.** `breite` und `hoehe` sind **Eingabe**. Der Renderer misst eine Personenkarte einmal (sie ist über den ganzen Baum gleich groß, UX §4) und gibt das Maß hinein. Wäre es anders, bräuchte die Engine ein `document`, und die Grenze aus ADR-009 wäre schon in der Signatur gebrochen.
2. **Ausgabe sind Layout-Einheiten, keine Pixel.** Zoom, Bildschirmauflösung und Druckskalierung sind Sache des Renderers. Deshalb ist ein Golden-Test über Koordinaten (ADR-009 Punkt 3) auf jedem Rechner identisch.
3. **Determinismus ist in der Signatur nicht sichtbar, in der Lint-Regel schon.** `src/core/**` darf `Math.random`, `Date.now` und `new Date()` nicht verwenden (`no-restricted-globals`). Ohne diese Regel wandert irgendwann eine „Zufalls-Jitter"-Zeile ins Layout und die Golden-Tests flackern.
4. **Kein Zugriff auf die Datenbank.** Wer den Graphen liefert, ist eine Abfrage in `src/main/abfragen/`, die Phase 2 baut. Die Engine sieht nur, was in `LayoutEingabe` steht.

Was Phase 0 dazu tatsächlich baut: die Datei, plus einen Test, der prüft, dass sie außer Typen
nichts exportiert (`typeof importiert.berechneLayout === 'undefined'`) — damit niemand hier
versehentlich anfängt.

---

## 9. Migrationsmechanik

### 9.1 Wie eine Schemaversion aussieht

Eine Version ist **eine SQL-Datei** in `docs/schema/`, vierstellig numeriert, nur vorwärts:

```
docs/schema/0001_grundgeruest.sql     transaktion, aenderung, journal_kontext, schema_migration
docs/schema/0002_kern.sql             alle Tabellen aus 50_Datenmodell.md §2
docs/schema/0003_abgeleitet.sql       person_flach, suche_fts, name_phonetik-Index
```

Registriert in `src/main/datenbank/migration/registrierung.ts`:

```ts
export const MIGRATIONEN = [
  { version: 1, datei: '0001_grundgeruest.sql', pruefsumme: 'sha256-…' },
  { version: 2, datei: '0002_kern.sql',         pruefsumme: 'sha256-…' },
  { version: 3, datei: '0003_abgeleitet.sql',   pruefsumme: 'sha256-…' }
] as const
export const SCHEMA_VERSION = 3
```

Der Versionszähler ist `PRAGMA user_version` — ein Integer im Dateikopf, der **innerhalb**
derselben Transaktion gesetzt wird wie die Migration selbst. Damit gibt es keinen Zustand
„Migration halb gelaufen": entweder Schema und Versionsnummer sind neu, oder beides ist alt.

Zusätzlich eine Tabelle für die Nachvollziehbarkeit:

```sql
CREATE TABLE schema_migration (
  version      INTEGER PRIMARY KEY,
  datei        TEXT NOT NULL,
  pruefsumme   TEXT NOT NULL,
  angewendet_am INTEGER NOT NULL,
  app_version  TEXT NOT NULL
) STRICT;
```

### 9.2 Warum keine Rückwärtsmigrationen

Verlockend, aber eine Falle: Eine `down`-Migration wird geschrieben, nie ausgeführt, nie
getestet, und im Notfall — wenn man sie braucht — stellt sich heraus, dass sie Daten verwirft,
die es beim Schreiben noch nicht gab. Das Sicherheitsnetz hier ist der Schnappschuss **vor**
jeder Migration (§6.2). Der ist bitgenau, braucht keinen Code und funktioniert auch für
Migrationen, an die niemand gedacht hat.

### 9.3 Der Ablauf beim Öffnen

```
Datei öffnen (WAL, Pragmas)
   ├─ PRAGMA quick_check                          → Fehler? abbrechen, Meldung, Snapshots anbieten
   ├─ user_version lesen
   ├─ user_version > SCHEMA_VERSION               → abbrechen: "mit neuerer Programmversion erstellt"
   ├─ Prüfsummen der bereits angewendeten Dateien vergleichen
   │     Abweichung → abbrechen: "Migrationsdatei wurde nachträglich geändert"
   ├─ user_version < SCHEMA_VERSION
   │     ├─ Schnappschuss
   │     └─ für jede fehlende Version: BEGIN → SQL → schema_migration → user_version → COMMIT
   ├─ Trigger löschen und neu erzeugen            (§4.4 — immer, nicht nur bei Änderung)
   ├─ Journal aufräumen                           (§4.6)
   └─ bereit
```

Der Prüfsummenvergleich ist die Zeile, die KI-gestützte Entwicklung braucht. Der typische
Vorfall: Migration 0002 ist schon in echten Projektdateien angewendet, jemand (oder ein Modell)
„korrigiert" sie nachträglich, und ab dann haben neue und alte Projekte unterschiedliche
Schemata bei identischer Versionsnummer. Das ist praktisch nicht mehr zu entwirren. Mit
Prüfsumme fällt es beim nächsten Öffnen sofort auf, mit einer Meldung, die sagt, was passiert
ist. **Eine angewendete Migration wird nie geändert — es wird eine neue geschrieben.**

### 9.4 Wie eine Migration getestet wird

Vier Tests je Version, in `test/migration/historisch.test.ts`:

1. **Öffnen und migrieren.** Für jede Version *v* liegt `fixtures/datenbanken/schema-v<v>.sqlite` im Repository (mit echten Beispieldaten, nicht leer). Der Test öffnet sie, migriert auf die aktuelle Version und erwartet, dass es fehlerfrei läuft.
2. **Schemagleichheit.** Das Schema der migrierten Datei muss dem Schema einer **frisch angelegten** Datei entsprechen. Verglichen wird ein normalisierter Abzug (`skripte/schema-dump.ts`: `sqlite_master` ohne Trigger, Zeilen sortiert, Weißraum vereinheitlicht). Dieser Test ist der wertvollste von allen: Er fängt genau die Sorte Fehler, bei der die Migration eine Spalte anders hinzufügt als die Neuanlage — mit dem Ergebnis, dass alte und neue Projekte auseinanderlaufen und niemand es merkt.
3. **Datenerhalt.** Bekannte Zeilen aus der Fixture sind nach der Migration noch da und haben die erwarteten Werte. Für jede Migration werden die Fälle aufgeschrieben, die sie betrifft.
4. **Fixture-Vollständigkeit.** Ein Test prüft, dass für jede Version 1…SCHEMA_VERSION eine Fixture existiert. Damit kann eine neue Migration nicht ohne ihre Testdatenbank hinzukommen.

Fixtures entstehen mit `skripte/fixture-datenbank-bauen.ts`: Es checkt den Git-Stand zur
Version aus, legt eine Datenbank an, füllt sie aus dem Fixture-Korpus und legt sie ab. Für die
laufende Version geschieht das **beim Einführen der nächsten** — der letzte Schritt jeder
Migration ist, die Fixture der Vorgängerversion zu erzeugen.

---

## 10. Fehlerbehandlung, Protokollierung, Absturz

### 10.1 Fehlertaxonomie

Eine geschlossene Union, gruppiert nach Präfix. Geschlossen heißt: ein neuer Fehler erfordert
eine Codeänderung an einer sichtbaren Stelle — kein `code: string`, in dem
Rechtschreibvarianten desselben Fehlers koexistieren.

```ts
export type FehlerCode =
  | 'IPC_UNBEKANNTER_KANAL' | 'IPC_UNGUELTIGE_NUTZLAST'
  | 'VALIDIERUNG_PFLICHTFELD' | 'VALIDIERUNG_WERTEBEREICH' | 'VALIDIERUNG_DATUM_UNLESBAR'
  | 'NICHT_GEFUNDEN_PERSON' | 'NICHT_GEFUNDEN_ORT' | 'NICHT_GEFUNDEN_TRANSAKTION'
  | 'KONFLIKT_ZYKLUS' | 'KONFLIKT_BEREITS_VORHANDEN' | 'BEFEHL_VERSCHACHTELT'
  | 'JOURNAL_NICHTS_ZURUECKZUNEHMEN' | 'JOURNAL_NICHTS_WIEDERHOLBAR'
  | 'JOURNAL_NICHT_RUECKNEHMBAR'
  | 'DATENBANK_GESPERRT' | 'DATENBANK_FREMDSCHLUESSEL' | 'DATENBANK_INTEGRITAET'
  | 'PROJEKT_BEREITS_GEOEFFNET' | 'PROJEKT_KEIN_WURZELWERK_ORDNER'
  | 'PROJEKT_NEUERE_SCHEMAVERSION' | 'PROJEKT_MIGRATION_GEAENDERT'
  | 'DATEI_NICHT_LESBAR' | 'DATEI_KEIN_PLATZ'
  | 'IMPORT_VERTRAG_UNBEKANNT' | 'IMPORT_SCHEMA_FEHLER' | 'IMPORT_REFERENZ_FEHLT'
  | 'INTERN_UNERWARTET'
```

`zuAppFehler()` bildet SQLite-Fehler gezielt ab: `SQLITE_CONSTRAINT_FOREIGNKEY` →
`DATENBANK_FREMDSCHLUESSEL`, `SQLITE_BUSY` → `DATENBANK_GESPERRT`, `SQLITE_CORRUPT` →
`DATENBANK_INTEGRITAET`. Alles Unbekannte wird `INTERN_UNERWARTET` mit voller Ausnahme im
Protokoll — nie im Renderer.

Jeder Code hat einen i18n-Schlüssel `fehler.<code>.titel` und `fehler.<code>.was_tun`. Der
zweite ist verpflichtend: Eine Fehlermeldung ohne Handlungsanweisung ist bei einer App, die man
allein benutzt, nur Frust.

### 10.2 Protokollierung — und was nie hineingehört

`electron-log`, Datei in `app.getPath('logs')`, 5 Dateien à 2 MB rotierend. In der
Auslieferung `info`, in der Entwicklung `debug`.

**Was protokolliert wird:** Vorgangs-ID, Kanal, Befehlsname, Dauer, Fehlercode, Zeilenzahlen,
Schemaversion, Transaktions-ID, Migrationsschritte, Absturzspuren.

**Was nie protokolliert wird:** Namen, Notizen, Transkripte, Ortsnamen, Datumswerte,
Diagnosetexte, Dateipfade innerhalb des Projektordners. Also: **IDs ja, Inhalte nein.**

Begründung, und die ist doppelt: Protokolldateien landen in Fehlerberichten, in Backups und in
Screenshots. Und Diagnosen aus dem Gesundheitsmodul sind DSGVO-Sonderkategorie (Art. 9, siehe
M-08) — die aus einer Protokolldatei wieder herauszubekommen ist praktisch unmöglich. Für
Gesundheitsdaten gilt darum die Verschärfung: **die Tabellen `diagnose` und `risikofaktor`
werden im Protokoll nicht einmal namentlich erwähnt**; der Logger ersetzt sie durch
`<gesperrte_tabelle>`. Eine Lint-Regel verbietet Zeichenkettenliterale mit Feldinhalten in
`logger.*`-Aufrufen; abgesichert wird es zusätzlich durch einen Test, der einen kompletten
Ablauf mit Fixture-Daten fährt und danach prüft, dass kein Name aus der Fixture in der
Protokolldatei auftaucht.

### 10.3 Fehler im Renderer

- Eine `<Fehlergrenze>` je Ansicht, nicht eine für die ganze App. Ein Absturz in der Liste soll die Kopfzeile und die Navigation nicht mitnehmen.
- `window.onerror` und `unhandledrejection` senden an den Hauptprozess (`ereignis` in Gegenrichtung über einen `befehl:protokoll.melden`), damit alles in einer Datei landet.
- Eine fehlgeschlagene Abfrage zeigt im betroffenen Bereich einen Hinweis mit „Nochmal versuchen", kein Dialog. Ein fehlgeschlagener **Befehl** zeigt eine Meldung, die stehen bleibt — hier hat der Nutzer etwas gewollt, was nicht passiert ist.

### 10.4 Was bei einem Absturz passiert

Die Zusicherung, in Klartext: **Jede Änderung, die die Oberfläche als übernommen anzeigt, ist
committet und übersteht einen Programmabsturz.** Es gibt keinen Puffer, der verloren gehen
könnte, weil es keinen Puffer gibt (§6.1). Ein Stromausfall kann die letzten committeten
Transaktionen kosten (`synchronous = NORMAL`, §3.1), die Datei aber nicht beschädigen.

Erkennung und Aufräumen:

- Beim Öffnen wird `laufend.lock` mit Prozess-ID und Zeitstempel geschrieben, beim geordneten Beenden gelöscht. Existiert sie beim Öffnen noch und läuft der Prozess nicht mehr, war der letzte Lauf unsauber → `PRAGMA integrity_check` (vollständig, nicht nur `quick_check`) und ein Hinweis im Protokoll.
- Existiert sie und der Prozess **läuft**: `PROJEKT_BEREITS_GEOEFFNET`. Zwei Fenster auf derselben Datei sind bei WAL technisch möglich, aber der Abfragecache im zweiten Fenster wüsste nichts von den Änderungen des ersten. Verhindern ist ehrlicher als halb unterstützen.
- WAL-Wiederherstellung macht SQLite beim Öffnen selbst; halb geschriebene Transaktionen sind danach weg — das ist die Zusage, nicht ein Nebeneffekt.
- Menüpunkt *Wartung → Datenbestand prüfen* führt `integrity_check`, `foreign_key_check`, die Ableitungs-Gleichheitsprüfung aus §5.3 und die Zyklusprüfung aus `core/graph/zyklus.ts` aus und zeigt einen Bericht (Vorarbeit für F-08).

Automatisierter Nachweis (ADR-009 Punkt 6), `test/absturz/sigkill.test.ts`: Ein Kindprozess
schreibt in einer Schleife Befehle; der Test tötet ihn mit `SIGKILL` zu einem zufällig gewählten
Zeitpunkt (mit festem Seed, damit der Fehlerfall reproduzierbar ist), öffnet die Datei erneut und
prüft: `integrity_check` ist `ok`, `foreign_key_check` ist leer, die letzte vollständige
Transaktion ist vorhanden, eine angefangene ist vollständig verschwunden, und die abgeleiteten
Tabellen stimmen mit dem Neuaufbau überein.

---

## 11. Leistungsbudgets als Testzusicherung

ADR-009 Punkt 4 verlangt harte Budgets. Für Phase 0 und 1 sind das diese, gemessen auf der
Entwicklungsmaschine mit der 2.000-Personen-Fixture, gemessen als Median aus 20 Läufen:

| Vorgang | Budget | Warum diese Zahl |
|---|---|---|
| Projekt öffnen (inkl. quick_check, ohne Migration) | < 400 ms | darunter fühlt sich Öffnen wie ein Dateiaufruf an |
| `abfrage:person.liste`, 100 Zeilen | < 20 ms | 60 FPS beim Scrollen erfordert Nachladen unter einem Bildaufbau |
| `abfrage:suche`, ein Wort | < 50 ms | Tippen mit Trefferanzeige darf nicht warten |
| einfacher Befehl (Feld setzen) | < 15 ms | sonst ist die Auto-Speicherung spürbar |
| Undo eines einfachen Befehls | < 25 ms | Cmd+Z muss sofort wirken |
| Trockenlauf, 200 Personen | < 2 s | noch ein Wartemoment, keine Kaffeepause |
| Import, 200 Personen | < 5 s | |
| Schnappschuss (VACUUM INTO, 2.000 Personen) | < 1,5 s | läuft im Hintergrund, darf aber nicht blockieren |

Der Test scheitert bei Überschreitung, wird in der CI aber nur als Warnung geführt (CI-Läufer
schwanken zu stark) und lokal als Fehler. Layout-Budgets (ADR-004: 2.000 Knoten < 300 ms,
Panning > 50 FPS) kommen in Phase 2 dazu.

**Die Ausstiegsbedingung, die man jetzt festlegen muss:** Alles läuft in Phase 0/1 synchron im
Hauptprozess. Sobald ein Vorgang sein Budget um mehr als das Dreifache überschreitet **oder**
länger als 200 ms dauert, wandert er in einen `utilityProcess` mit eigener
Datenbankverbindung, und der Hauptprozess weist während dieser Zeit Schreibbefehle mit
`DATENBANK_GESPERRT` ab. Zu erwartende Kandidaten: Großimport, GEDCOM-Export (Phase 4),
Layoutberechnung (Phase 2, dort ohnehin Web Worker nach ADR-005). Vorher ist es verfrühte
Optimierung — mit dieser Regel aber eine bewusste Verschiebung und kein Vergessen.

---

## 12. Was ich beim Lesen der Konzeptdokumente gefunden habe

### 12.1 Echte Widersprüche

| # | Widerspruch | Fundstellen | Empfehlung |
|---|---|---|---|
| W1 | **Konfidenz: 4 oder 5 Stufen?** E21 und `50_Datenmodell.md` §2.16 legen **vier** Stufen fest (gesichert / wahrscheinlich / unsicher / Vermutung). B-03 in `40_Anforderungen.md` sagt „5 Stufen"; die Schemakommentare in §2.7, §2.12 sagen `1..5`. | 40_Anf. B-03 · 50_DM §2.7, §2.12, §2.16 · 00_INDEX E21 | **Vier.** E21 ist die jüngere Entscheidung (3. Durchgang) und ausführlich begründet. B-03 und die `1..5`-Kommentare sind Reste. Muss vor AP-0.6 korrigiert werden, weil es als `CHECK (konfidenz BETWEEN 1 AND 4)` ins Schema geht. → V2 |
| W2 | **Persona-Phase.** §2.8 überschreibt die Tabelle mit „(Phase 3)", D2 sagt „ab Phase 0 angelegt, bleibt bis **Phase 4** leer", B-05 nennt Phase 3. | 50_DM §2.8 · 80_OF D2 · 40_Anf. B-05 | Tabelle ab Phase 0 (unstrittig), Befüllung **Phase 3** nach B-05. Die „Phase 4" in D2 ist ein Tippfehler. → V3 |
| W3 | **Netzwerkansicht Phase 4 oder 5?** `70_UX_Konzept.md` §2 schreibt „Netzwerk — Paten/Zeugen (Phase 4)", C-20, E17 und `10_Vision` §5 sagen Phase 5. | 70_UX §2 · 40_Anf. C-20 | Phase 5. `70_UX` §2 nachziehen. Ohne Folgen für Phase 0/1. → V4 |
| W4 | **Journal aus vs. Import rücknehmbar.** ADR-003 („bei Massenimporten Journal aus") und ADR-010 Punkt 4 („Import als Ganzes rückgängig") schließen sich aus. | ADR-003 · ADR-010 | Gelöst über den Schwellwert in §6.3, festgehalten als **ADR-019**. → V5 |

### 12.2 Abweichungen, die ich bewusst vorschlage

Diese drei ändern `50_Datenmodell.md` §2.10 und sind als ADR-017 bis ADR-019 dokumentiert:

1. **`aenderung` speichert ganze Zeilen als JSON** statt Feld-Diffs (§4.2). `feld` bleibt als Spalte, ist aber im Regelfall `NULL`.
2. **`transaktion` bekommt vier Spalten:** `lfd INTEGER` (monoton, Reihenfolge unabhängig von der Zeitauflösung), `status` (`angewendet`/`zurueckgenommen`/`verworfen`), `rueckgaengig_moeglich INTEGER`, `snapshot_pfad TEXT`, `koaleszenz_schluessel TEXT`.
3. **Neue Tabellen:** `journal_kontext` (§4.3), `schema_migration` (§9.1), `person_flach` und `suche_fts` (§5.1), `import_lauf` und `import_herkunft` (§6.5), `ansicht_zustand` (§7.1, ab Phase 2 gefüllt).

### 12.3 Kleinigkeiten und Beobachtungen

- `50_Datenmodell.md` §2.2 endet mit einem leeren, doppelten Code-Zaun (Zeilen 85–86) — reiner Formatierungsrest, sollte weg.
- **Kein Widerspruch, aber eine Doppelung im Umfang:** A-15 (Interview-Modus) und D-10/D-11 (Import-Vertrag) überschneiden sich stark. Der Import-Vertrag ist die Datenstrecke, der Interview-Modus die Oberfläche darauf. Empfehlung: A-15 wird als *Ansicht über dem Importvertrag* gebaut, nicht als zweite Erfassungsstrecke — sonst gibt es genau die zwei Wahrheiten, die ADR-010 verhindern will. Das ist in `57_Phase0_Arbeitspakete.md` so geschnitten.
- ADR-009 Punkt 2 nennt die Invariante „Import → Export → Import ist idempotent". In Phase 0/1 gibt es keinen Export; die Invariante ist erst mit D-01 (Phase 3) prüfbar. Sie ist in `test/invarianten/` als `test.todo` mit Verweis auf D-01 angelegt, damit sie nicht stillschweigend verschwindet.
- `40_Anforderungen.md` listet A-16 und A-19 vor A-17/A-18 — nur die Sortierung, kein Inhaltsproblem.

---

## 13. Ausblick: was Phase 2 an dieser Architektur findet

Damit sichtbar ist, dass Phase 1 nichts verbaut:

| Phase-2-Bedarf | Andockstelle, die schon existiert |
|---|---|
| Layout-Engine | `src/core/layout/vertrag.ts` (§8) |
| Graph für das Layout | neue Abfrage in `src/main/abfragen/`, keine Schemaänderung |
| Renderer-Austausch SVG → Canvas (ADR-004) | Layout gibt Koordinaten, kein DOM |
| Zentrumsperson, gespeicherte Ansichten | `ansicht_zustand` (§7.1) |
| Belegqualitäts-Einfärbung (C-18) | `person_flach.konfidenz_min`, `hat_widerspruch` (§5.1) |
| Implex-Erkennung | `core/graph/` |
| Windows-Testrunde (E23, Ende Phase 2) | CI baut ab AP-0.1 unter `windows-latest` mit Screenshots |
