// AP-1.4a, 56_Import_Vertrag.md §6.2 Gestaltungsentscheidung 7: "Die Prüfsumme wird gegen frühere
// Importe geprüft." Erster Trockenlauf zeigt keinen Treffer; nach einer manuell angelegten
// `import_lauf`-Zeile mit identischer `pruefsumme` warnt ein zweiter Trockenlauf derselben Datei.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import { frischeDatenbankMitJournal } from './_hilfen-trockenlauf'

const BEISPIEL_1 = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))
const PRUEFSUMME = 'sha256-3b1f0c6a9d2e4f5081a7b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708' // aus beispiel-1-einfach.json

describe('Prüfsummen-Abgleich (56_Import_Vertrag.md §6.2)', () => {
  it('erster Trockenlauf ohne Treffer, zweiter nach geseedetem import_lauf mit Treffer', () => {
    const db = frischeDatenbankMitJournal()
    try {
      const ersterBericht = importTrockenlaufDurchfuehren(db, BEISPIEL_1)
      expect(ersterBericht.zusammenfassung.pruefsummeQuelltext).toBe(PRUEFSUMME)
      expect(ersterBericht.zusammenfassung.bereitsImportiertAm).toBeNull()

      // Einen abgeschlossenen (fiktiven) früheren Import seeden: eine `transaktion`-Zeile (FK-Ziel)
      // + eine `import_lauf`-Zeile mit identischer Prüfsumme — außerhalb jeder Testtransaktion,
      // deshalb von Hand armiert/entwaffnet (kein Befehlsbus für dieses Seeding nötig).
      const seedTxId = neueId()
      db.transaction(() => {
        const lfd = naechsteLfd(db)
        transaktionAnlegen(db, { id: seedTxId, zeitpunkt: 1_600_000_000_000, art: 'import', lfd })
        armieren(db, seedTxId)
        db.prepare(
          `INSERT INTO import_lauf (id, datei, pruefsumme, vertragsversion, zeitpunkt, transaktion_id, erstellt_am, geaendert_am)
           VALUES (@id, @datei, @pruefsumme, @vertragsversion, @zeitpunkt, @transaktionId, @erstelltAm, @geaendertAm)`,
        ).run({
          id: neueId(),
          datei: 'interview-alt.json',
          pruefsumme: PRUEFSUMME,
          vertragsversion: 'wurzelwerk-import/v1',
          zeitpunkt: 1_600_000_000_000,
          transaktionId: seedTxId,
          erstelltAm: 1_600_000_000_000,
          geaendertAm: 1_600_000_000_000,
        })
        entwaffnen(db)
      })()

      const zweiterBericht = importTrockenlaufDurchfuehren(db, BEISPIEL_1)
      expect(zweiterBericht.zusammenfassung.bereitsImportiertAm).toBe(new Date(1_600_000_000_000).toISOString())
    } finally {
      db.close()
    }
  })
})
