// `pnpm fixture:db <version>` (AP-0.5, 55_Architektur.md §9.4): baut
// `fixtures/datenbanken/schema-v<version>.sqlite` — eine Datenbank auf genau dieser Schemaversion
// mit minimalen Beispieldaten, damit `test/migration/historisch.test.ts` eine echte Fixture zum
// Öffnen und Migrieren hat. "Für die laufende Version geschieht das beim Einführen der nächsten"
// (§9.4) — AP-0.5 baut das Werkzeug, erzeugt aber noch keine Fixture-Datei (SCHEMA_VERSION = 1 hat
// noch keine Vorgängerversion).
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v7 as uuidv7 } from 'uuid'
import { oeffnen } from '../src/main/datenbank/verbindung'
import { migrieren } from '../src/main/datenbank/migration/laeufer'
import { MIGRATIONEN } from '../src/main/datenbank/migration/registrierung'

/**
 * Legt unter `zielPfad` eine frische Datenbank an, migriert sie bis genau `version` (nicht
 * weiter — eine Fixture für Version *v* soll den Stand *v* zeigen, nicht die aktuelle Spitze) und
 * schreibt minimale Beispieldaten: eine `transaktion`-Zeile und eine dazugehörige
 * `aenderung`-Zeile mit UUID-v7-IDs, damit eine "Datenerhalt"-Prüfung nach einer künftigen
 * Migration etwas Konkretes hat.
 */
export function fixtureDatenbankBauen(version: number, zielPfad: string): void {
  if (existsSync(zielPfad)) {
    rmSync(zielPfad)
  }
  mkdirSync(dirname(zielPfad), { recursive: true })

  const migrationenBisVersion = MIGRATIONEN.filter((eintrag) => eintrag.version <= version)
  const db = oeffnen(zielPfad)
  try {
    migrieren(db, { migrationen: migrationenBisVersion, appVersion: 'fixture-bauer' })

    const transaktionId = uuidv7()
    const aenderungId = uuidv7()
    db.prepare(
      'INSERT INTO transaktion (id, zeitpunkt, art, lfd) VALUES (@id, @zeitpunkt, @art, @lfd)',
    ).run({ id: transaktionId, zeitpunkt: Date.now(), art: 'migration', lfd: 1 })
    db.prepare(
      'INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, operation) ' +
        'VALUES (@id, @transaktionId, @reihenfolge, @tabelle, @datensatzId, @operation)',
    ).run({
      id: aenderungId,
      transaktionId,
      reihenfolge: 1,
      tabelle: 'transaktion',
      datensatzId: transaktionId,
      operation: 'insert',
    })
  } finally {
    db.close()
  }
}

// CLI-Einstieg, analog zu `skripte/schema-dump.ts`.
const direktAufgerufen = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direktAufgerufen) {
  const versionArg = process.argv[2]
  const version = versionArg === undefined ? Number.NaN : Number(versionArg)
  if (!Number.isInteger(version) || version < 1) {
    console.error('Nutzung: pnpm fixture:db <version>  (z. B. pnpm fixture:db 1)')
    process.exit(1)
  }
  const zielPfad = join(process.cwd(), 'fixtures', 'datenbanken', `schema-v${String(version)}.sqlite`)
  fixtureDatenbankBauen(version, zielPfad)
  console.log(`Fixture geschrieben: ${zielPfad}`)
}
