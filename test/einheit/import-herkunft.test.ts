// AP-1.5, 56_Import_Vertrag.md §6 Abnahme "Herkunft ist abfragbar: 'Woher stammt diese Person?'":
// `import_lauf`/`import_herkunft` bleiben auffindbar, auch nachdem das Journal aufgeräumt wurde
// (dessen `aenderung`-Zeilen sind dann weg — `import_herkunft` selbst ist eine eigene, dauerhafte
// Tabelle, keine Journalzeile).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { herkunftFuerDatensatz } from '../../src/main/repositories/import-herkunft-repo'
import { aenderungenLoeschen, rueckgaengigMoeglichAberkennen } from '../../src/main/repositories/journal-repo'

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))

interface PersonIdZeile {
  readonly id: string
}

describe('import_herkunft — Herkunft bleibt nach dem Aufräumen des Journals auffindbar (AP-1.5)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-herkunft-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('herkunftFuerDatensatz() findet den Importlauf einer Person, auch nach simuliertem Journal-Aufräumen', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const bericht = importAusfuehren(db, { pfad: FIXTURE_PFAD })
      expect(bericht.importGesperrt).toBe(false)

      const personen = db.prepare<[], PersonIdZeile>('SELECT id FROM person').all()
      expect(personen.length).toBeGreaterThan(0)
      const personId = personen[0]?.id
      expect(personId).toBeDefined()
      if (personId === undefined) return

      const herkunftVorAufraeumen = herkunftFuerDatensatz(db, personId, 'person')
      expect(herkunftVorAufraeumen).toHaveLength(1)
      expect(herkunftVorAufraeumen[0]?.datei).toBe(FIXTURE_PFAD)

      // Journal aufräumen simulieren (55_Architektur.md §4.6): die `aenderung`-Zeilen der
      // Import-Transaktion verschwinden — `import_lauf`/`import_herkunft` bleiben unangetastet.
      const transaktionId = db.prepare<[], { readonly id: string }>('SELECT id FROM transaktion ORDER BY lfd DESC LIMIT 1').get()?.id
      expect(transaktionId).toBeDefined()
      if (transaktionId === undefined) return
      aenderungenLoeschen(db, [transaktionId])
      rueckgaengigMoeglichAberkennen(db, [transaktionId])

      const anzahlAenderungNachAufraeumen = db
        .prepare<{ readonly id: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM aenderung WHERE transaktion_id = @id')
        .get({ id: transaktionId })
      expect(anzahlAenderungNachAufraeumen?.anzahl).toBe(0)

      const herkunftNachAufraeumen = herkunftFuerDatensatz(db, personId, 'person')
      expect(herkunftNachAufraeumen).toHaveLength(1)
      expect(herkunftNachAufraeumen[0]?.datei).toBe(FIXTURE_PFAD)
      expect(herkunftNachAufraeumen[0]?.pruefsumme).not.toBeNull()
    } finally {
      db.close()
    }
  })
})
