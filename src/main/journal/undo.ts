// AP-0.10, 55_Architektur.md §4.9: der Undo/Redo-Algorithmus. Öffnet bewusst eine EIGENE
// `db.transaction(...)` (CLAUDE.md §2 gehört Transaktionsöffnung eigentlich ausschließlich
// `src/main/befehle/` - `undo()`/`redo()` sind aber selbst keine `befehl:`-Handler, sondern die
// Rücknahme-/Wiederholungs-Operation, analog zu `src/main/datenbank/trigger.ts`
// (`alleAbgeleitetenNeuAufbauen`) und `src/main/datenbank/journal-trigger-anwenden.ts`
// (`generierteTriggerAnwenden`), die aus demselben Grund ebenfalls außerhalb von
// `src/main/befehle/` eine eigene Transaktionsklammer öffnen). `undo()`/`redo()` werden über
// `befehl:journal.undo`/`befehl:journal.redo` erreichbar (`src/main/ipc/registrierung.ts`,
// AP-0.10 PR-A2), nicht über `fuehreAus()`.
//
// AP-1.5-Nachtrag (ADR-019): eine Großimport-Transaktion hat KEINE `aenderung`-Zeilen (Journal
// war beim Schreiben aus, s. `src/main/befehle/import-ausfuehren.ts`) — ihre Rücknahme läuft
// darum NICHT über die zeilenweise Schleife unten, sondern über den Datei-Wiederherstellungsweg
// (`importZuruecknehmen()`, analog zum Muster in `src/main/schnappschuss/wiederherstellen.ts`,
// aber ohne dessen Projekt-/`Kontext`-Kapselung: `undo()` bekommt nur ein offenes `db`-Handle,
// keinen Electron-`Kontext`). `undo()` entscheidet DESHALB VOR dem Öffnen der eigenen Transaktion
// (ein Datei-`close()`/`rename()`/`copyFileSync()` ist innerhalb einer offenen SQLite-Transaktion
// ohnehin nicht sinnvoll), welchen der beiden Wege sie nimmt.
import type Database from 'better-sqlite3'
import { copyFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { UndoErgebnis } from '../../shared/ipc/vertrag'
import { alsBekannteTabelle, rohEinfuegen, rohErsetzen, rohLoeschen, zeileSchema, type ZeileWerte } from '../repositories/basis'
import { standardSchemaBasis } from '../datenbank/migration/laeufer'
import { personKennungenLesen, zaehlerstaendeLesen, zaehlerTabelleVorhanden } from '../repositories/kennung-repo'
import { mitHauptnameConstraintAus } from '../repositories/name-form-repo'
import { aenderungen, betroffene, redoZiel, statusSetzen, undoZiel, type JournalTransaktionZiel } from '../repositories/journal-repo'
import { ERSETZT_PRAEFIX, kolonfreieZeit, SCHNAPPSCHUSS_ENDUNG } from '../schnappschuss/dateiname'
import { wiederhergestellteDateiAngleichen, type AngleichenOptionen, type ErsetzterKennungsstand } from '../schnappschuss/kennung-angleichen'
import { journalAn, journalAus } from './kontext'

// `UndoErgebnis` stand bis AP-0.10 PR-A1 als rein interner Typ hier (kein Renderer-Aufrufer
// existierte) - jetzt aus `src/shared/ipc/vertrag.ts` (dort begründet), re-exportiert für
// bestehende Importe (`test/einheit/undo-*.test.ts`).
export type { UndoErgebnis }

/**
 * Was die Import-Rücknahme für den Migrationslauf der zurückkopierten Datei braucht (AP-1.34 A2c,
 * wie `LaeufenOptionen`). `undo.ts` importiert `electron` bewusst nicht — die Produktiv-Aufrufer
 * (`src/main/ipc/registrierung.ts`, `src/main/menue/menue.ts`) übergeben `schemaBasisverzeichnis()`
 * und `app.getVersion()` ausdrücklich (im gepackten Build liegt `docs/schema` nicht unter `cwd`).
 * Ohne Angabe gilt derselbe Standard wie im Migrationsläufer (Vitest, Skripte).
 */
export interface UndoOptionen {
  readonly schemaBasis?: string
  readonly appVersion?: string
}

/** `JSON.parse(...)` + Zod-Prüfung einer Journalspalte (CLAUDE.md §4: kein `any`, kein unbegründetes `as`). */
function zeileAusJson(json: string | null, aufrufer: 'undo' | 'redo', transaktionId: string): ZeileWerte {
  if (json === null) {
    throw new WurzelFehler(
      'INTERN_UNERWARTET',
      `${aufrufer}(): wert_alt_json/wert_neu_json fehlt unerwartet für Transaktion "${transaktionId}".`,
    )
  }
  const roh: unknown = JSON.parse(json)
  return zeileSchema.parse(roh)
}

/**
 * Wirft, wenn `ziel` eine Import-Transaktion mit eigenem Schnappschuss ist (55_Architektur.md
 * §6.4): deren Rücknahme läuft über `importZuruecknehmen()` (Datei-Wiederherstellung), nicht über
 * das zeilenweise Zurückschreiben hier. Rein defensiv in `redo()` (s. dort) — ein solches Ziel
 * hätte `undo()` bereits VOR dem Öffnen der Transaktion abgefangen (s. `undo()` unten), und nach
 * einer Datei-Wiederherstellung existiert die zurückgenommene Transaktionszeile in der
 * wiederhergestellten Datenbank gar nicht mehr (sie stammt aus der Zeit VOR dem Import) — ein
 * `redo()`-Ziel dieser Art ist darum unerreichbar, dieser Wurf bleibt als Beweis dafür stehen.
 */
function importRuecknahmeSperren(ziel: JournalTransaktionZiel): void {
  if (ziel.art === 'import' && ziel.snapshotPfad !== null) {
    throw new WurzelFehler(
      'INTERN_UNERWARTET',
      'redo(): eine Großimport-Transaktion mit Schnappschuss kann nicht wiederholt werden (55_Architektur.md §6.4, AP-1.5) — sollte unerreichbar sein.',
    )
  }
}

/**
 * Rücknahme einer Großimport-Transaktion (ADR-019, AP-1.5): Journal war beim Schreiben aus, es
 * gibt keine `aenderung`-Zeilen zum Invertieren — statt der Zeilen wird die GESAMTE Datenbankdatei
 * auf den Schnappschuss VOR dem Import zurückgesetzt. Muster aus
 * `src/main/schnappschuss/wiederherstellen.ts` (aktuelle Datei nach `snapshots/ersetzt-<Zeit>
 * .sqlite` verschieben, NIE löschen, §6.2/§6.4 — dann den Schnappschuss zurückkopieren), hier ohne
 * dessen `projektOeffnen()`/`Kontext`-Kapselung nachgebaut: `undo()` hat nur ein offenes
 * `db`-Handle, keinen Electron-`Kontext`, und schließt/öffnet darum die reine SQLite-Verbindung
 * selbst, statt eine ganze Projektöffnung zu orchestrieren. `db` ist NACH diesem Aufruf
 * GESCHLOSSEN — der Aufrufer öffnet bei Bedarf eine neue Verbindung auf denselben Pfad (analog zu
 * `schnappschussWiederherstellen()`, das seinerseits `projektOeffnen()` aufruft).
 *
 * Nur erreichbar über `undo()`, wenn `ziel` eine Import-Transaktion mit `snapshot_pfad != null`
 * ist — und laut ADR-019 nur solange sie die NEUESTE Transaktion ist, was `undoZiel()`s
 * `ORDER BY lfd DESC LIMIT 1` bereits garantiert.
 *
 * AP-1.34 (E12): der Schnappschuss trägt den Zählerstand von VOR dem Import — die im Import
 * vergebenen Kennungen würden sonst neu vergeben. Darum wird `kennung_zaehler` vor dem Schließen
 * gesichert und nach dem Zurückkopieren auf `max(alt, wiederhergestellt)` gezogen („nie neu
 * vergeben" gilt ausnahmslos). Geschrieben wird nur, wo der wiederhergestellte Stand kleiner ist —
 * der „nur vorwärts"-Trigger (`chk_kennung_zaehler_vorwaerts`) bleibt damit unberührt.
 *
 * AP-1.34 (A2c, H6 — wie H6b beim Wiederherstellen): zusätzlich wird die Zuordnung `id → kennung`
 * gesichert, und die zurückkopierte Datei wird VOR jeder Weiterverwendung migriert
 * (`wiederhergestellteDateiAngleichen`). Ein Import-Schnappschuss vor 0007 übernimmt im
 * Migrations-Hook die Kennungen der ersetzten Datei, übrige Personen werden ab dem gesicherten
 * Zählerstand nummeriert (O-2); ein Schnappschuss ≥v7 behält seine Kennungen (O-3). Scheitert das
 * Angleichen, wird die Rücknahme wie beim Kopierfehler zurückgerollt; ein `WurzelFehler` behält
 * dabei seinen Code (`DATENBANK_INTEGRITAET`, `PROJEKT_NEUERE_SCHEMAVERSION`, …), alles andere
 * wird `INTERN_UNERWARTET`.
 */
function importZuruecknehmen(
  db: Database.Database,
  ziel: JournalTransaktionZiel,
  optionen: AngleichenOptionen,
  jetzt: () => number = Date.now,
): UndoErgebnis {
  if (ziel.snapshotPfad === null) {
    // Defensiv (CLAUDE.md §4) — der Aufrufer (undo() unten) prüft dies bereits.
    throw new WurzelFehler('INTERN_UNERWARTET', 'importZuruecknehmen(): snapshotPfad fehlt unerwartet.')
  }
  const dbPfad = db.name
  const snapshotsPfad = join(dirname(dbPfad), 'snapshots')
  const ersetztPfad = join(snapshotsPfad, `${ERSETZT_PRAEFIX}${kolonfreieZeit(jetzt())}${SCHNAPPSCHUSS_ENDUNG}`)

  // Das offene Projekt ist stets auf SCHEMA_VERSION migriert (projektOeffnen); der Wächter bleibt
  // defensiv. `kennung_zaehler` und `person.kennung` kommen beide mit 0007.
  const kennungsstand: ErsetzterKennungsstand = zaehlerTabelleVorhanden(db)
    ? { zaehler: zaehlerstaendeLesen(db), kennungen: personKennungenLesen(db) }
    : { zaehler: [], kennungen: new Map() }
  db.close()

  try {
    renameSync(dbPfad, ersetztPfad) // NIE löschen (55_Architektur.md §6.2/§6.4)
  } catch (u) {
    throw new WurzelFehler('DATEI_KEIN_PLATZ', u instanceof Error ? u.message : String(u))
  }
  try {
    copyFileSync(ziel.snapshotPfad, dbPfad)
  } catch (u) {
    // Rückroll (analog schnappschussWiederherstellen() C2-Auflage) — statt das Projekt ohne
    // `dbPfad` steckenzulassen.
    renameSync(ersetztPfad, dbPfad)
    throw new WurzelFehler('DATEI_KEIN_PLATZ', u instanceof Error ? u.message : String(u))
  }
  try {
    // Schließt seinen Handle auch im Fehlerfall selbst (Windows: vor dem rename unten zu).
    wiederhergestellteDateiAngleichen(dbPfad, kennungsstand, optionen)
  } catch (u) {
    renameSync(ersetztPfad, dbPfad)
    throw u instanceof WurzelFehler ? u : new WurzelFehler('INTERN_UNERWARTET', u instanceof Error ? u.message : String(u))
  }

  return { transaktionId: ziel.id, beschreibung: ziel.beschreibung }
}

/**
 * Nimmt die neueste rücknehmbare Transaktion zurück (55_Architektur.md §4.9). `undoZiel()` läuft
 * bewusst VOR jeder Transaktionsöffnung (ein Datei-`close()`/`rename()` unten geht innerhalb einer
 * offenen SQLite-Transaktion ohnehin nicht) — bei einer Großimport-Transaktion mit Schnappschuss
 * (ADR-019, AP-1.5) übernimmt `importZuruecknehmen()` komplett anstelle der zeilenweisen
 * Rückschreibung; sonst läuft die übliche EIGENE `IMMEDIATE`-Transaktion (s. Kopfkommentar). `db`
 * wird injiziert wie bei `fuehreAusDef` (D-DB-Injektion). `optionen` braucht nur der
 * Schnappschuss-Weg (s. `UndoOptionen`).
 */
export function undo(db: Database.Database, optionen: UndoOptionen = {}): UndoErgebnis {
  const ziel = undoZiel(db)
  if (ziel === undefined) {
    throw new WurzelFehler('JOURNAL_NICHTS_ZURUECKZUNEHMEN')
  }

  if (ziel.art === 'import' && ziel.snapshotPfad !== null) {
    return importZuruecknehmen(db, ziel, {
      schemaBasis: optionen.schemaBasis ?? standardSchemaBasis(),
      appVersion: optionen.appVersion ?? '',
    })
  }

  return db
    .transaction((): UndoErgebnis => {
      // Guard (AP-0.11, 55_Architektur.md §4.6): `journalAufraeumen()` setzt `rueckgaengig_moeglich
      // = 0` für begrenzte Transaktionen und schließt sie damit aus `undoZiel()` aus — dieser Zweig
      // ist trotzdem defensiv, falls ein Undo-Ziel (`rueckgaengig_moeglich = 1`) seine
      // `aenderung`-Zeilen aus einem anderen Grund verloren hat. Ohne diesen Wurf würde die
      // `for`-Schleife unten schlicht nichts tun und `statusSetzen(...'zurueckgenommen')` einen
      // stillen No-op-Undo erzeugen (CLAUDE.md §5: erst der rote Test in
      // `test/einheit/journal-aufraeumen.test.ts`, dann dieser Fix).
      if (betroffene(db, ziel.id) === 0) {
        throw new WurzelFehler('JOURNAL_NICHT_RUECKNEHMBAR')
      }

      db.pragma('defer_foreign_keys = ON') // Stolperstelle 1 (55_Architektur.md §4.9): wechselseitige Fremdschlüssel (z. B. ort.nachfolger_ort_id) innerhalb derselben Transaktion
      journalAus(db, 'undo: Rücknahme über den Undo-Algorithmus (55_Architektur.md §4.9) - das Undo protokolliert sich nicht selbst (Stolperstelle 2)')
      try {
        // Stolperstelle 3 (AP-1.33): das zeilenweise Zurückschreiben durchläuft dieselben ungültigen
        // Zwischenzustände wie der ursprüngliche Befehl (z. B. der Hauptname-Tausch: kurzzeitig zwei
        // oder keine bevorzugte Form). Die „genau ein Hauptname"-Constraint-Trigger werden darum für
        // die Dauer der Rücknahme ausgesetzt — analog `defer_foreign_keys` oben; der END-Zustand ist
        // bitgleich der Vorher-Zustand und damit gültig.
        mitHauptnameConstraintAus(db, () => {
          for (const a of aenderungen(db, ziel.id, 'DESC')) {
            const tabelle = alsBekannteTabelle(a.tabelle)
            if (a.operation === 'insert') {
              rohLoeschen(db, tabelle, a.datensatzId)
            } else if (a.operation === 'delete') {
              rohEinfuegen(db, tabelle, zeileAusJson(a.wertAltJson, 'undo', ziel.id))
            } else {
              rohErsetzen(db, tabelle, zeileAusJson(a.wertAltJson, 'undo', ziel.id))
            }
          }
        })
        statusSetzen(db, ziel.id, 'zurueckgenommen')
      } finally {
        journalAn(db)
      }
      return { transaktionId: ziel.id, beschreibung: ziel.beschreibung }
    })
    .immediate()
}

/**
 * Wiederholt die älteste zurückgenommene Transaktion (55_Architektur.md §4.9) - dieselbe
 * Schleife wie `undo()`, aber `ASC` mit `wert_neu_json` und umgekehrter Operationszuordnung.
 */
export function redo(db: Database.Database): UndoErgebnis {
  return db
    .transaction((): UndoErgebnis => {
      const ziel = redoZiel(db)
      if (ziel === undefined) {
        throw new WurzelFehler('JOURNAL_NICHTS_WIEDERHOLBAR')
      }
      // Guard (AP-0.21, spiegelt undo() oben): ein Redo-Ziel ohne eigene `aenderung`-Zeilen würde
      // sonst still nichts tun und `statusSetzen(...'angewendet')` ohne jede Zurückschreibung
      // erzeugen (CLAUDE.md §5).
      if (betroffene(db, ziel.id) === 0) {
        throw new WurzelFehler('JOURNAL_NICHT_RUECKNEHMBAR')
      }
      importRuecknahmeSperren(ziel)

      db.pragma('defer_foreign_keys = ON') // Stolperstelle 1, s. undo() oben
      journalAus(db, 'redo: Wiederholung über den Undo-Algorithmus (55_Architektur.md §4.9) - protokolliert sich nicht selbst (Stolperstelle 2)')
      try {
        // Stolperstelle 3 (AP-1.33), s. undo() oben: Constraint-Trigger „genau ein Hauptname" für die
        // Dauer der Wiederholung aussetzen (Zwischenzustände des Hauptname-Tauschs).
        mitHauptnameConstraintAus(db, () => {
          for (const a of aenderungen(db, ziel.id, 'ASC')) {
            const tabelle = alsBekannteTabelle(a.tabelle)
            if (a.operation === 'insert') {
              rohEinfuegen(db, tabelle, zeileAusJson(a.wertNeuJson, 'redo', ziel.id))
            } else if (a.operation === 'delete') {
              rohLoeschen(db, tabelle, a.datensatzId)
            } else {
              rohErsetzen(db, tabelle, zeileAusJson(a.wertNeuJson, 'redo', ziel.id))
            }
          }
        })
        statusSetzen(db, ziel.id, 'angewendet')
      } finally {
        journalAn(db)
      }
      return { transaktionId: ziel.id, beschreibung: ziel.beschreibung }
    })
    .immediate()
}
