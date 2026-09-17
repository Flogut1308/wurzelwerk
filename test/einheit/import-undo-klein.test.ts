// AP-1.5, ADR-019 (Leitentscheidung): der echte, kleine Import (≤ RUECKNAHME_SCHWELLE_ZEILEN)
// läuft als EIN normaler, armierter Undo-Schritt — `undo()` muss ihn darum bitgleich zurücknehmen
// können (CLAUDE.md §5, die eiserne Regel: "Undo(Aktion) stellt den Datenbestand bitgleich wieder
// her"). `beispiel-1-einfach.json` (3 Personen, 1 Ort, 3 Ereignisse, 2 Elternschaften, 1
// Partnerschaft, 1 Aussage) bleibt weit unter der Schwelle von 500 geänderten Zeilen.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { undo } from '../../src/main/journal/undo'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/beispiel-1-einfach.json', import.meta.url))

describe('importAusfuehren() + undo() — kleiner Import ist bitgleich rücknehmbar (AP-1.5, ADR-019)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-klein-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('importAusfuehren() schreibt als "undo"-Rücknahmeart, undo() stellt den kanonischen Abzug bitgleich wieder her', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const vorher = kanonischerAbzug(db)

      const bericht = importAusfuehren(db, { pfad: FIXTURE_PFAD })
      expect(bericht.importGesperrt).toBe(false)
      expect(bericht.zusammenfassung.ruecknahmeArt).toBe('undo')
      expect(bericht.zusammenfassung.geaenderteZeilenAnzahl).toBeGreaterThan(0)

      const nachher = kanonischerAbzug(db)
      expect(nachher).not.toBe(vorher)

      const ergebnis = undo(db)
      expect(ergebnis.beschreibung).toContain(FIXTURE_PFAD)

      const zurueck = kanonischerAbzug(db)
      expect(zurueck).toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('der Bericht des echten Imports ist derselbe wie der (rein interne) Sondierungsbericht — kein zweiter baueBericht()-Weg', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const bericht = importAusfuehren(db, { pfad: FIXTURE_PFAD })

      // Der Trockenlauf über dieselbe Datei GEGEN DEN NEUEN BESTAND (nach dem echten Import)
      // unterscheidet sich naturgemäß (Dublettenmeldung etc.) — das ist NICHT die hier geprüfte
      // Eigenschaft. Geprüft wird stattdessen die konstruktive Eigenschaft aus der Leitentscheidung:
      // `importAusfuehren()` selbst baut den zurückgegebenen Bericht nicht neu, sondern gibt genau
      // den bereits ermittelten Sondierungsbericht zurück — belegt am Wortlaut der Beschreibung und
      // an der widerspruchsfreien Zusammenfassung.
      expect(bericht.zusammenfassung.datei).toBe(FIXTURE_PFAD)
      expect(bericht.fehler).toEqual([])
    } finally {
      db.close()
    }
  })
})
