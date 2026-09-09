// AP-0.10, 55_Architektur.md §4.9: der Undo/Redo-Algorithmus. Öffnet bewusst eine EIGENE
// `db.transaction(...)` (CLAUDE.md §2 gehört Transaktionsöffnung eigentlich ausschließlich
// `src/main/befehle/` - `undo()`/`redo()` sind aber selbst keine `befehl:`-Handler, sondern die
// Rücknahme-/Wiederholungs-Operation, analog zu `src/main/datenbank/trigger.ts`
// (`alleAbgeleitetenNeuAufbauen`) und `src/main/datenbank/journal-trigger-anwenden.ts`
// (`generierteTriggerAnwenden`), die aus demselben Grund ebenfalls außerhalb von
// `src/main/befehle/` eine eigene Transaktionsklammer öffnen). `undo()`/`redo()` werden später
// (AP-0.10 PR-A2/AP-1.x) über einen eigenen IPC-Kanal erreichbar, nicht über `fuehreAus()`.
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { alsBekannteTabelle, rohEinfuegen, rohErsetzen, rohLoeschen, zeileSchema, type ZeileWerte } from '../repositories/basis'
import { aenderungen, redoZiel, statusSetzen, undoZiel, type JournalTransaktionZiel } from '../repositories/journal-repo'
import { journalAn, journalAus } from './kontext'

/**
 * Minimales, internes Rückgabeergebnis (AP-0.10 PR-A1) - der gemeinsame `UndoErgebnis`-Vertrag in
 * `src/shared/` folgt erst mit dem IPC-Kanal (AP-0.10 PR-A2), sobald ein Renderer-Aufrufer
 * existiert. Absichtlich minimal (nur das, was `55_Architektur.md §4.9` selbst zurückgibt).
 */
export interface UndoErgebnis {
  readonly transaktionId: string
  readonly beschreibung: string | null
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
 * §6.4): deren Rücknahme läuft über einen Datei-Wiederherstellungspfad, nicht über das
 * zeilenweise Zurückschreiben hier.
 */
function importRuecknahmeSperren(ziel: JournalTransaktionZiel): void {
  if (ziel.art === 'import' && ziel.snapshotPfad !== null) {
    // SEAM AP-1.5 importZuruecknehmen
    throw new WurzelFehler(
      'INTERN_UNERWARTET',
      'Rücknahme einer Import-Transaktion mit Schnappschuss ist erst mit AP-1.5 (Großimport) umgesetzt.',
    )
  }
}

/**
 * Nimmt die neueste rücknehmbare Transaktion zurück (55_Architektur.md §4.9). Eigene
 * `IMMEDIATE`-Transaktion (s. Kopfkommentar); `db` wird injiziert wie bei `fuehreAusDef` (D-DB-
 * Injektion).
 */
export function undo(db: Database.Database): UndoErgebnis {
  return db
    .transaction((): UndoErgebnis => {
      const ziel = undoZiel(db)
      if (ziel === undefined) {
        throw new WurzelFehler('JOURNAL_NICHTS_ZURUECKZUNEHMEN')
      }
      importRuecknahmeSperren(ziel)

      db.pragma('defer_foreign_keys = ON') // Stolperstelle 1 (55_Architektur.md §4.9): wechselseitige Fremdschlüssel (z. B. ort.nachfolger_ort_id) innerhalb derselben Transaktion
      journalAus(db, 'undo: Rücknahme über den Undo-Algorithmus (55_Architektur.md §4.9) - das Undo protokolliert sich nicht selbst (Stolperstelle 2)')
      try {
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

      db.pragma('defer_foreign_keys = ON') // Stolperstelle 1, s. undo() oben
      journalAus(db, 'redo: Wiederholung über den Undo-Algorithmus (55_Architektur.md §4.9) - protokolliert sich nicht selbst (Stolperstelle 2)')
      try {
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
        statusSetzen(db, ziel.id, 'angewendet')
      } finally {
        journalAn(db)
      }
      return { transaktionId: ziel.id, beschreibung: ziel.beschreibung }
    })
    .immediate()
}
