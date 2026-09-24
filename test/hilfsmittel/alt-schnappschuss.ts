// AP-1.34 (A2b/A2c): Test-Helfer, die aus einer eingefrorenen Fixture-Datenbank vor Migration 0007
// einen Schnappschuss mit vorgegebenen Personen bauen. Genutzt von der Wiederherstellung
// (`test/einheit/wiederherstellen.test.ts`) und der Import-Rücknahme
// (`test/einheit/import-schreiben-kennungen.test.ts`).
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

export const FIXTURE_V6_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v6.sqlite')

/**
 * Baut aus der eingefrorenen v6-Fixture (0 Personen) einen Schnappschuss `snapshots/<id>.sqlite`
 * mit genau `personIds` (nur v6-Spalten, keine `kennung`). Das Journal wird im Test abgeschaltet —
 * der `journalAus`-Scanner (`test/invarianten/_journal-aufrufer.ts`) sieht nur `src/`.
 */
export function v6SchnappschussBauen(bauordner: string, snapshotsPfad: string, id: string, personIds: readonly string[]): void {
  altSchnappschussBauen(FIXTURE_V6_PFAD, 6, bauordner, snapshotsPfad, id, personIds)
}

/**
 * Wie `v6SchnappschussBauen`, aber aus einer beliebigen eingefrorenen Fixture vor 0007 (hueter-H1:
 * v5 → Migration 6 und 7). Kopiert wird nur die Hauptdatei — die eingecheckten `-wal/-shm` der
 * Fixtures bleiben liegen; `user_version` belegt, dass die Hauptdatei allein den Stand trägt.
 */
export function altSchnappschussBauen(
  fixturePfad: string,
  erwarteteVersion: number,
  bauordner: string,
  snapshotsPfad: string,
  id: string,
  personIds: readonly string[],
): void {
  const bauPfad = join(bauordner, `${id}-bau.sqlite`)
  copyFileSync(fixturePfad, bauPfad)
  const db = oeffnen(bauPfad)
  try {
    expect(db.pragma('user_version', { simple: true })).toBe(erwarteteVersion)
    journalAus(db, 'Testvorbereitung (AP-1.34, A2b): Schnappschuss vor 0007 ohne armierte Transaktion befüllen.')
    const einfuegen = db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)')
    for (const personId of personIds) {
      einfuegen.run({ id: personId })
    }
    journalAn(db)
  } finally {
    db.close() // letzter Handle: WAL wird eingecheckt, die Hauptdatei ist vollständig
  }
  mkdirSync(snapshotsPfad, { recursive: true })
  copyFileSync(bauPfad, join(snapshotsPfad, `${id}.sqlite`))
}
