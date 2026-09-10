import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { ABGELEITETE_TABELLEN, abgeleiteterAbzug, type AbgeleiteterAbzug } from './abgeleitet-abzug'
import { abgeleiteteNeuAufbauenInner } from './trigger'

/** Typwächter für eine `PRAGMA quick_check`-Ergebniszeile, ohne `as` auf einen unbekannten Wert. */
function istQuickCheckZeile(wert: unknown): wert is { readonly quick_check: unknown } {
  return typeof wert === 'object' && wert !== null && 'quick_check' in wert
}

/**
 * `PRAGMA quick_check` (55_Architektur.md §9.3) — der erste Schritt beim Öffnen, vor jeder
 * Migration. Eine beschädigte Datei soll auffallen, bevor irgendetwas versucht, sie zu lesen oder
 * zu migrieren. `quick_check` liefert bei einer intakten Datenbank genau eine Zeile mit dem Wert
 * `'ok'`; jede Abweichung (Fehlermeldungszeilen oder mehrere Zeilen) ist ein Integritätsfehler.
 */
export function integritaetPruefen(db: Database.Database): void {
  let ergebnis: unknown
  try {
    // Eine Datei, die gar kein SQLite-Format hat (z. B. Bytes einer anderen Art in eine .sqlite
    // geschrieben), lässt `PRAGMA quick_check` nicht mit einem Ergebnis zurückkehren, sondern
    // wirft selbst (`SQLITE_NOTADB`) — das ist ebenfalls ein Integritätsfehler.
    ergebnis = db.pragma('quick_check')
  } catch {
    throw new WurzelFehler('DATENBANK_INTEGRITAET')
  }
  const zeilen = Array.isArray(ergebnis) ? ergebnis : []
  const ersteZeile: unknown = zeilen.length === 1 ? zeilen[0] : undefined
  const istOk = istQuickCheckZeile(ersteZeile) && ersteZeile.quick_check === 'ok'

  if (!istOk) {
    throw new WurzelFehler('DATENBANK_INTEGRITAET')
  }
}

/** Ergebnis von `ableitungAbweichung()` — welche abgeleiteten Tabellen (falls überhaupt) vom Neuaufbau abweichen. */
export interface AbleitungAbweichung {
  readonly betroffeneTabellen: readonly string[]
}

/**
 * Name der temporären `fts5vocab`-Hilfstabelle für `ableitungAbweichung()` — bewusst kein
 * generischer Name wie `vocab` (Kollisionsgefahr mit anderen `temp.`-Objekten derselben
 * Verbindung, AP-0.13-Auftrag "eindeutiger Temp-Name").
 */
const ABLEITUNG_VOCAB_TABELLE = 'temp.wurzelwerk_integritaet_ableitung_vocab'

/**
 * Vergleicht den inkrementell (durch die `abl_*`-Trigger) gepflegten Zustand der abgeleiteten
 * Tabellen (`person_flach`, `name_phonetik`, `suche_fts_quelle`, `suche_fts`) mit dem Ergebnis
 * eines vollständigen Neuaufbaus (`abgeleiteteNeuAufbauenInner`, dieselbe kanonische Projektion wie
 * `alleAbgeleitetenNeuAufbauen`, 55_Architektur.md §5.2/§5.3) — ohne den Neuaufbau zu übernehmen:
 * der probeweise Neuaufbau läuft in einer eigenen Transaktion, die am Ende IMMER per `ROLLBACK`
 * verworfen wird, ein reiner Lesevorgang aus Sicht des Aufrufers (belegt in
 * `test/einheit/integritaet.test.ts`: Abzug vor dem Aufruf == Abzug danach).
 *
 * CLAUDE.md §2-Ausnahme (wie `src/main/datenbank/trigger.ts`/`migration/laeufer.ts`): diese
 * Funktion ist selbst die Wartungs-/Prüfoperation, kein Repository — sie öffnet die Transaktion
 * bewusst hier.
 *
 * Menüpunkt „Wartung → Datenbestand prüfen“ (AP-0.13): ein gefundener Unterschied verhindert und
 * verändert nichts, er nennt nur den Weg (Neuaufbau über `wartungAbgeleiteteNeuAufbauen`).
 */
export function ableitungAbweichung(db: Database.Database): AbleitungAbweichung {
  // Drei-Argument-Form (schemaname, tablename, vocabtype): die Hilfstabelle selbst lebt im
  // `temp`-Schema, die Zwei-Argument-Form würde `suche_fts` fälschlich dort statt in `main` suchen
  // ("no such fts5 table: temp.suche_fts" - SQLite-fts5vocab-Doku).
  db.exec(`CREATE VIRTUAL TABLE ${ABLEITUNG_VOCAB_TABELLE} USING fts5vocab('main', 'suche_fts', 'instance')`)
  try {
    const vorher = abgeleiteterAbzug(db, ABLEITUNG_VOCAB_TABELLE)

    db.exec('BEGIN')
    let nachher: AbgeleiteterAbzug
    try {
      abgeleiteteNeuAufbauenInner(db)
      nachher = abgeleiteterAbzug(db, ABLEITUNG_VOCAB_TABELLE)
    } finally {
      db.exec('ROLLBACK')
    }

    const betroffeneTabellen = ABGELEITETE_TABELLEN.filter((tabelle) => vorher[tabelle] !== nachher[tabelle])
    return { betroffeneTabellen }
  } finally {
    db.exec(`DROP TABLE ${ABLEITUNG_VOCAB_TABELLE}`)
  }
}
