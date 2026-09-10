// AP-0.10, 55_Architektur.md §4.9: der Undo/Redo-Algorithmus. Öffnet bewusst eine EIGENE
// `db.transaction(...)` (CLAUDE.md §2 gehört Transaktionsöffnung eigentlich ausschließlich
// `src/main/befehle/` - `undo()`/`redo()` sind aber selbst keine `befehl:`-Handler, sondern die
// Rücknahme-/Wiederholungs-Operation, analog zu `src/main/datenbank/trigger.ts`
// (`alleAbgeleitetenNeuAufbauen`) und `src/main/datenbank/journal-trigger-anwenden.ts`
// (`generierteTriggerAnwenden`), die aus demselben Grund ebenfalls außerhalb von
// `src/main/befehle/` eine eigene Transaktionsklammer öffnen). `undo()`/`redo()` werden über
// `befehl:journal.undo`/`befehl:journal.redo` erreichbar (`src/main/ipc/registrierung.ts`,
// AP-0.10 PR-A2), nicht über `fuehreAus()`.
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { UndoErgebnis } from '../../shared/ipc/vertrag'
import { alsBekannteTabelle, rohEinfuegen, rohErsetzen, rohLoeschen, zeileSchema, type ZeileWerte } from '../repositories/basis'
import { aenderungen, betroffene, redoZiel, statusSetzen, undoZiel, type JournalTransaktionZiel } from '../repositories/journal-repo'
import { journalAn, journalAus } from './kontext'

// `UndoErgebnis` stand bis AP-0.10 PR-A1 als rein interner Typ hier (kein Renderer-Aufrufer
// existierte) - jetzt aus `src/shared/ipc/vertrag.ts` (dort begründet), re-exportiert für
// bestehende Importe (`test/einheit/undo-*.test.ts`).
export type { UndoErgebnis }

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
