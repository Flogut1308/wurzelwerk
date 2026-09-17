// AP-1.3b: dünner Kanal-Handler für `abfrage:import.pruefen` (56_Import_Vertrag.md §4). Liest die
// Datei, baut den `BestandsKontext` (Datenbank + Dateisystem) und ruft `pruefeImport()` auf — der
// gesamte Prüfvorgang selbst bleibt in `src/main/import/validierung.ts` frei von `fs`/SQL.
import type Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PruefBericht } from '../../shared/import/imp-codes'
import { vorhandeneKennungen } from '../abfragen/import-bestand'
import { pruefeImport } from './validierung'

/**
 * Führt den vollständigen Prüfvorgang (Stufe 1 + 2) für eine Importdatei unter `pfad` aus
 * (`abfrage:import.pruefen`). Medienpfade sind relativ zur Importdatei (§3.8) — Basisordner ist
 * darum `dirname(pfad)`, NICHT der Projektordner.
 */
export function importPruefen(db: Database.Database, pfad: string): PruefBericht {
  const rohtext = readFileSync(pfad, 'utf8')
  const importOrdner = dirname(pfad)

  return pruefeImport(rohtext, pfad, {
    kennungVorhanden: (dbKennung) => vorhandeneKennungen(db, [dbKennung]).has(dbKennung),
    mediumVorhanden: (relativerPfad) => existsSync(join(importOrdner, relativerPfad)),
  })
}
