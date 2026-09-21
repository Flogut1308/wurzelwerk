// AP-1.17 PR-A1 (B-07, 55_Architektur.md §5.2). `abfrage:archiv.suche` — read-only SQL gegen
// `archiv` (CLAUDE.md §2: SQL nur in src/main/repositories/, src/main/abfragen/ — hier über
// `archiv-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
import type Database from 'better-sqlite3'
import type { ArchivSucheAus, ArchivSucheEin } from '../../shared/schemata/archiv-suche'
import * as archivRepo from '../repositories/archiv-repo'

const GRENZE_STANDARD = 20

/** `abfrage:archiv.suche` (55_Architektur.md §5.2). Leerer `text` liefert bewusst KEINE Treffer —
 * sonst wäre jeder Tastendruck auf ein leeres Feld eine Blindabfrage über den gesamten
 * Archivbestand (analog `ort-suche.ts::ortSuche`). */
export function archivSuche(db: Database.Database, ein: ArchivSucheEin): ArchivSucheAus {
  const text = ein.text.trim()
  if (text === '') return { treffer: [] }

  const grenze = ein.grenze ?? GRENZE_STANDARD
  const archive = archivRepo.suchen(db, { text, grenze })

  const treffer = archive.flatMap((archiv) => {
    if (archiv.name === null) return []
    return [
      {
        id: archiv.id,
        name: archiv.name,
        ...(archiv.ort_id === null ? {} : { ortId: archiv.ort_id }),
      },
    ]
  })

  return { treffer }
}
