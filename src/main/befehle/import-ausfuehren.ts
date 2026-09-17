// AP-1.5, 56_Import_Vertrag.md §6.3 (ADR-019, ADR-010 Punkt 4). Öffnet/committet die Transaktion(en)
// des ECHTEN Imports (CLAUDE.md §2 Regel 3 — analog zu `src/main/befehle/bus.ts` und
// `src/main/befehle/import-trockenlauf.ts`).
//
// Leitentscheidung (bindend, s. AP-1.5-Auftrag): zwei Phasen.
//   (1) Sondierung — `importTrockenlaufDurchfuehren()` (der bestehende AP-1.4a-Weg: eine eigene,
//       IMMER zurückgerollte Transaktion) liefert den `Trockenlaufbericht` mit `importGesperrt`,
//       `ruecknahmeArt` (Schwelle `RUECKNAHME_SCHWELLE_ZEILEN`, ADR-019) und
//       `geaenderteZeilenAnzahl`. Bei `importGesperrt` wird NICHT geschrieben.
//   (2) Echtschreibung — je nach `ruecknahmeArt`:
//       klein  → ein normaler, armierter Undo-Schritt (Journal an, `art = 'import'`).
//       groß   → `schnappschussErzeugen()` ZUERST (scheitert er: IMP-503, NICHT importieren) →
//                eine Transaktion OHNE Armierung, `journalAus()` (die vierte erlaubte
//                Aufrufstelle, `55_Architektur.md` §4.3/AP-1.5) → schreiben →
//                `snapshotPfadSetzen()` → `journalAn()`.
// ZURÜCKGEGEBEN wird IMMER derselbe Sondierungsbericht — KEIN zweiter `baueBericht()`-Aufruf im
// Echtpfad. Das macht „Bericht identisch mit dem Trockenlauf" konstruktiv wahr (PR-B prüft es als
// Invariante über den gesamten Fixture-Korpus, `test/invarianten/trockenlauf-gleich-import.test.ts`).
import type Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Trockenlaufbericht } from '../../shared/import/trockenlauf-bericht'
import type { ImportDatei } from '../../shared/schemata/import-v1'
import { vorhandeneKennungen } from '../abfragen/import-bestand'
import { neueId } from '../id'
import { schreibeImportLauf } from '../import/ausfuehrung'
import { pruefeStufe1, pruefeStufe2 } from '../import/validierung'
import { armieren, entwaffnen, journalAn, journalAus } from '../journal/kontext'
import { naechsteLfd, redoStapelVerwerfen, snapshotPfadSetzen, transaktionAnlegen } from '../repositories/journal-repo'
import { schnappschussErzeugen } from '../schnappschuss/erzeugen'
import { importTrockenlaufDurchfuehren } from './import-trockenlauf'

export interface ImportAusfuehrenEin {
  readonly pfad: string
}

/**
 * Liest+prüft die Datei ERNEUT über Stufe 1+2 (`src/main/import/validierung.ts`) — deterministisch
 * dasselbe Ergebnis wie die soeben erfolgreich durchlaufene Sondierung (dieselbe Datei, derselbe
 * Bestand: deren Transaktion wurde vollständig zurückgerollt, s. Kopfkommentar). Das liefert die
 * TYPISIERTE `ImportDatei`, die `Trockenlaufbericht` selbst nicht trägt — kein zweiter Schreibweg
 * (weiterhin derselbe `schreibeImport()`), nur eine zweite, günstige Parse-Runde derselben Prüfung.
 * Wirft `INTERN_UNERWARTET`, falls das je auseinanderläuft — das wäre ein Programmfehler, kein
 * erwarteter Ausgang, und wird darum nicht stillschweigend hingenommen (CLAUDE.md §4/§12).
 */
function leseGeprueftDatei(db: Database.Database, pfad: string): ImportDatei {
  let rohtext: string
  try {
    rohtext = readFileSync(pfad, 'utf8')
  } catch (u) {
    throw new WurzelFehler('DATEI_NICHT_LESBAR', u instanceof Error ? u.message : String(u))
  }
  const importOrdner = dirname(pfad)
  const kontext = {
    kennungVorhanden: (dbKennung: string) => vorhandeneKennungen(db, [dbKennung]).has(dbKennung),
    mediumVorhanden: (relativerPfad: string) => existsSync(join(importOrdner, relativerPfad)),
  }

  const stufe1 = pruefeStufe1(rohtext, pfad)
  if (!stufe1.akzeptiert || stufe1.daten === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `importAusfuehren(): "${pfad}" bestand die Sondierung, aber nicht die erneute Stufe-1-Prüfung.`)
  }
  const stufe2Befunde = pruefeStufe2(stufe1.daten, kontext)
  if (stufe2Befunde.length > 0) {
    throw new WurzelFehler('INTERN_UNERWARTET', `importAusfuehren(): "${pfad}" bestand die Sondierung, aber nicht die erneute Stufe-2-Prüfung.`)
  }
  return stufe1.daten
}

/** Führt den echten Import aus (56_Import_Vertrag.md §6.3, ADR-019, AP-1.5) — s. Kopfkommentar. */
export function importAusfuehren(db: Database.Database, ein: ImportAusfuehrenEin): Trockenlaufbericht {
  if (db.inTransaction) {
    throw new WurzelFehler('BEFEHL_VERSCHACHTELT')
  }

  const bericht = importTrockenlaufDurchfuehren(db, ein.pfad)
  if (bericht.importGesperrt) {
    return bericht
  }

  const ordnerPfad = dirname(db.name)
  const medienPfad = join(ordnerPfad, 'medien')
  const snapshotsPfad = join(ordnerPfad, 'snapshots')
  const datei = leseGeprueftDatei(db, ein.pfad)

  if (bericht.zusammenfassung.ruecknahmeArt === 'undo') {
    // Klein (≤ RUECKNAHME_SCHWELLE_ZEILEN, ADR-019): Journal an, EIN normaler Undo-Schritt.
    db.transaction((): void => {
      const lfd = naechsteLfd(db)
      const txId = neueId()
      const zeitpunkt = Date.now()
      transaktionAnlegen(db, { id: txId, zeitpunkt, art: 'import', beschreibung: `Import ${ein.pfad}`, lfd })
      armieren(db, txId)
      try {
        schreibeImportLauf(db, datei, { pfad: ein.pfad, erstelltAm: zeitpunkt, transaktionId: txId, medienPfad })
      } finally {
        entwaffnen(db)
      }
      redoStapelVerwerfen(db)
    }).immediate()
  } else {
    // Groß (> RUECKNAHME_SCHWELLE_ZEILEN): Schnappschuss ZUERST — scheitert er, wird NICHT
    // importiert (IMP-503, 56_Import_Vertrag.md §4 Stufe 5).
    let schnappschussPfad: string
    try {
      schnappschussPfad = schnappschussErzeugen(db, { snapshotsPfad }).pfad
    } catch (u) {
      throw new WurzelFehler('IMPORT_SCHNAPPSCHUSS_FEHLGESCHLAGEN', u instanceof Error ? u.message : String(u))
    }

    db.transaction((): void => {
      const lfd = naechsteLfd(db)
      const txId = neueId()
      const zeitpunkt = Date.now()
      transaktionAnlegen(db, { id: txId, zeitpunkt, art: 'import', beschreibung: `Großimport ${ein.pfad}`, lfd })
      // KEIN armieren() — der Großimport läuft ohne Journal (55_Architektur.md §4.3, ADR-019).
      journalAus(db, 'grossimport: Großimport ohne Journal, Rücknahme über Schnappschuss (ADR-019, AP-1.5).')
      try {
        schreibeImportLauf(db, datei, { pfad: ein.pfad, erstelltAm: zeitpunkt, transaktionId: txId, medienPfad })
      } finally {
        snapshotPfadSetzen(db, txId, schnappschussPfad)
        journalAn(db)
      }
      redoStapelVerwerfen(db)
    }).immediate()
  }

  return bericht
}
