// `pnpm schema:dump` (AP-0.5, 55_Architektur.md §9.4): ein normalisierter Abzug von
// `sqlite_master` ohne Trigger, Zeilen sortiert, Weißraum vereinheitlicht. Zweifacher Aufruf muss
// bitgleich sein — die Sortierung und die Textnormalisierung machen den Abzug unabhängig von der
// Einfüge-/Anwendungsreihenfolge und von Formatierungsdetails der Migrations-SQL.
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrieren, type LaeufenOptionen } from '../src/main/datenbank/migration/laeufer'

interface SchemaZeile {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string | null
}

function weissraumVereinheitlichen(sql: string | null): string {
  return (sql ?? '').replace(/\s+/g, ' ').trim()
}

/** Normalisierter, sortierter Abzug von `sqlite_master` ohne Trigger — Basis für Schemavergleiche. */
export function schemaAbzugErstellen(db: Database.Database): string {
  const zeilen = db
    .prepare<[], SchemaZeile>("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type != 'trigger'")
    .all()

  const normalisierteZeilen = zeilen
    .map((zeile) => `${zeile.type}|${zeile.name}|${zeile.tbl_name}|${weissraumVereinheitlichen(zeile.sql)}`)
    .sort((a, b) => a.localeCompare(b))

  return normalisierteZeilen.join('\n')
}

/** Öffnet eine frische In-Memory-Datenbank, wendet Migrationen an und gibt ihren Abzug zurück. */
export function schemaAbzugFrischerDatenbank(opts?: LaeufenOptionen): string {
  const db = new Database(':memory:')
  try {
    migrieren(db, opts)
    return schemaAbzugErstellen(db)
  } finally {
    db.close()
  }
}

// CLI-Einstieg: nur ausführen, wenn dieses Skript direkt gestartet wurde (`tsx
// skripte/schema-dump.ts`), nicht beim Import aus einem Test. ESM kennt kein `require.main` — der
// Vergleich über `import.meta.url` ist das Äquivalent.
const direktAufgerufen = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direktAufgerufen) {
  console.log(schemaAbzugFrischerDatenbank())
}
