// AP-1.29 PR-A (55_Architektur.md §5.2). `abfrage:quelle.suche` — read-only SQL gegen `quelle`
// (CLAUDE.md §2: SQL nur in src/main/repositories/, src/main/abfragen/ — hier über
// `beleg-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte Parameter. Muster identisch zu
// `src/main/abfragen/archiv-suche.ts`, hier über `titel` UND `autor` (s. Kopfkommentar
// `src/shared/schemata/quelle-suche.ts`).
import type Database from 'better-sqlite3'
import { QuelleTypEnum } from '../../shared/schemata/quelle'
import type { QuelleSucheAus, QuelleSucheEin } from '../../shared/schemata/quelle-suche'
import * as belegRepo from '../repositories/beleg-repo'

const GRENZE_STANDARD = 20

/** `abfrage:quelle.suche` (55_Architektur.md §5.2). Leerer/whitespace `text` liefert bewusst KEINE
 * Treffer — sonst wäre jeder Tastendruck auf ein leeres Feld eine Blindabfrage über den gesamten
 * Quellenbestand (analog `archiv-suche.ts`/`ort-suche.ts`). */
export function quelleSuche(db: Database.Database, ein: QuelleSucheEin): QuelleSucheAus {
  const text = ein.text.trim()
  if (text === '') return { treffer: [] }

  const grenze = ein.grenze ?? GRENZE_STANDARD
  const quellen = belegRepo.quelleSuchen(db, { text, grenze })

  const treffer = quellen.map((quelle) => ({
    id: quelle.id,
    titel: quelle.titel,
    autor: quelle.autor,
    typ: QuelleTypEnum.parse(quelle.typ),
  }))

  return { treffer }
}
