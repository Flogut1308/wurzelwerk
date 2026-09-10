import type Database from 'better-sqlite3'
import { hatZyklus, type Elternkante } from '../../core/graph/zyklus'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { protokollInfo } from '../protokoll/logger'
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

/** Typwächter für eine `PRAGMA integrity_check`-Ergebniszeile, ohne `as` auf einen unbekannten Wert (Muster wie `istQuickCheckZeile`). */
function istIntegrityCheckZeile(wert: unknown): wert is { readonly integrity_check: unknown } {
  return typeof wert === 'object' && wert !== null && 'integrity_check' in wert
}

/**
 * Alle `PRAGMA integrity_check`-Zeilen, deren Wert NICHT `'ok'` ist (eine intakte Datenbank liefert
 * genau eine Zeile `'ok'`). Eine Datei, die `PRAGMA` gar nicht erst ausführen lässt (z. B.
 * `SQLITE_NOTADB` bei einer komplett zerschossenen Datei, wie bei `integritaetPruefen()` oben)
 * zählt als EIN Fund mit einem generischen Platzhaltertext (kein Meldungstext aus der Datei, §7).
 */
function integrityCheckFundeErmitteln(db: Database.Database): readonly string[] {
  let ergebnis: unknown
  try {
    ergebnis = db.pragma('integrity_check')
  } catch {
    return ['pragma_fehlgeschlagen']
  }
  const zeilen = Array.isArray(ergebnis) ? ergebnis : []
  const funde: string[] = []
  for (const zeile of zeilen) {
    if (istIntegrityCheckZeile(zeile) && typeof zeile.integrity_check === 'string' && zeile.integrity_check !== 'ok') {
      funde.push(zeile.integrity_check)
    }
  }
  return funde
}

/** Ein Fund aus `PRAGMA foreign_key_check`: eine Zeile in `tabelle` verweist auf eine nicht (mehr) existierende Zeile in `ziel`. */
export interface FremdschluesselFund {
  readonly tabelle: string
  readonly rowid: number | bigint
  readonly ziel: string
}

/** Typwächter für eine `PRAGMA foreign_key_check`-Ergebniszeile (Spalten `table`/`rowid`/`parent`/`fkid`, SQLite-Doku). */
function istForeignKeyCheckZeile(
  wert: unknown,
): wert is { readonly table: unknown; readonly rowid: unknown; readonly parent: unknown } {
  return typeof wert === 'object' && wert !== null && 'table' in wert && 'rowid' in wert && 'parent' in wert
}

/** Alle `PRAGMA foreign_key_check`-Funde (leer bei referenzieller Integrität). */
function fremdschluesselFundeErmitteln(db: Database.Database): readonly FremdschluesselFund[] {
  const ergebnis = db.pragma('foreign_key_check')
  const zeilen = Array.isArray(ergebnis) ? ergebnis : []
  const funde: FremdschluesselFund[] = []
  for (const zeile of zeilen) {
    if (
      istForeignKeyCheckZeile(zeile) &&
      typeof zeile.table === 'string' &&
      typeof zeile.parent === 'string' &&
      (typeof zeile.rowid === 'number' || typeof zeile.rowid === 'bigint')
    ) {
      funde.push({ tabelle: zeile.table, rowid: zeile.rowid, ziel: zeile.parent })
    }
  }
  return funde
}

interface ElternschaftKanteZeile {
  readonly elternteil_id: string
  readonly kind_id: string
}

/** Lädt alle Elternkanten und prüft sie über `src/core/graph/zyklus.ts` (F-01, ADR-009 Punkt 2) auf Zyklusfreiheit. */
function zyklusGefundenErmitteln(db: Database.Database): boolean {
  const zeilen = db.prepare<[], ElternschaftKanteZeile>('SELECT elternteil_id, kind_id FROM elternschaft').all()
  const kanten: readonly Elternkante[] = zeilen.map((zeile) => ({ elternteilId: zeile.elternteil_id, kindId: zeile.kind_id }))
  return hatZyklus(kanten)
}

/** Sammelbericht für den Menüpunkt „Wartung → Datenbestand prüfen“ (AP-0.13). Ein Fund ist kein Fehler — nur ein Bericht, nichts wird verändert oder verhindert. */
export interface DatenbestandBericht {
  readonly integrityCheckFunde: readonly string[]
  readonly fremdschluesselFunde: readonly FremdschluesselFund[]
  readonly ableitungAbweichung: AbleitungAbweichung
  readonly zyklusGefunden: boolean
}

/**
 * Führt `integrity_check`, `foreign_key_check`, den Ableitungsvergleich (`ableitungAbweichung`)
 * und die Zyklusprüfung (`hatZyklus`) aus und fasst sie zu einem Bericht zusammen. Reine
 * Lesefunktion — kein Wurf, kein neuer Fehlercode (ein Fund ist kein Fehler), keine Änderung am
 * Datenbestand.
 */
export function datenbestandBericht(db: Database.Database): DatenbestandBericht {
  return {
    integrityCheckFunde: integrityCheckFundeErmitteln(db),
    fremdschluesselFunde: fremdschluesselFundeErmitteln(db),
    ableitungAbweichung: ableitungAbweichung(db),
    zyklusGefunden: zyklusGefundenErmitteln(db),
  }
}

/**
 * Der volle `PRAGMA integrity_check` (im Unterschied zu `integritaetPruefen()`s `quick_check`) —
 * läuft beim Öffnen zusätzlich, wenn die Sperrdatei-Prüfung einen unsauberen letzten Lauf zeigt
 * (`sperre.status === 'verwaist'`, `src/main/projekt/projekt-dienst.ts`). Wirft NIE: das Ergebnis
 * geht ausschließlich ins Protokoll (§7 — nur Code und Anzahl, KEINE der eigentlichen
 * `integrity_check`-Meldungszeilen, die könnten Fragmente aus der Datei enthalten), ein Fund
 * verhindert das Öffnen nicht.
 */
export function integritaetVollPruefen(db: Database.Database): void {
  let zeilenzahl: number
  try {
    zeilenzahl = integrityCheckFundeErmitteln(db).length
  } catch {
    // Verteidigungslinie zusätzlich zu der in integrityCheckFundeErmitteln() selbst - diese
    // Funktion darf unter keinen Umständen werfen (s. Funktionskommentar).
    zeilenzahl = 1
  }
  protokollInfo({ code: 'integritaet_voll_pruefung', zeilenzahl })
}
