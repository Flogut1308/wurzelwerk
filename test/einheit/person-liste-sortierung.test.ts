// Vorarbeiten AP-1.30, PR 4a: `sortiereZeilen` (Namens-Sortierschlüssel einmal je Zeile) liefert
// dieselbe Ordnung wie die Referenz `vergleicheZeilen` — für alle Sortierungen und Richtungen, gegen
// die 2000er-Fixture (test/hilfsmittel/grossbestand.ts) und gegen gezielte Umlaut-/Leerfälle.
import { describe, expect, it } from 'vitest'
import { grossbestandAufbauen } from '../hilfsmittel/grossbestand'
import { filterBedingungen, sortiereZeilen, vergleicheZeilen, whereSql, zeilenLaden, type RohZeile, type SortierEingabe } from '../../src/main/abfragen/person-liste'
import { namensSortierschluessel, vergleicheNamen, vergleicheNamensschluessel } from '../../src/core/liste/sortierung'

const SORTIERUNGEN: readonly SortierEingabe[] = (['nachname', 'vornamen', 'geburt', 'tod'] as const).flatMap((sortierung) =>
  (['auf', 'ab'] as const).map((richtung) => ({ sortierung, richtung })),
)

describe('sortiereZeilen = Referenzsortierung (Vorarbeiten AP-1.30, PR 4a)', () => {
  it('S1: gleiche Reihenfolge wie [...].sort(vergleicheZeilen) für alle Sortierungen und Richtungen (2000 Personen)', () => {
    const db = grossbestandAufbauen()
    try {
      const { bedingungen, parameter } = filterBedingungen({ platzhalter: 'alle', privat: 'alle', nurWiderspruch: false })
      const zeilen = zeilenLaden(db, whereSql(bedingungen), parameter)
      expect(zeilen.length).toBeGreaterThan(1000)
      for (const ein of SORTIERUNGEN) {
        const referenz = [...zeilen].sort((a, b) => vergleicheZeilen(a, b, ein)).map((z: RohZeile) => z.person_id)
        expect(sortiereZeilen(zeilen, ein).map((z) => z.person_id)).toEqual(referenz)
      }
    } finally {
      db.close()
    }
  })

  it('S2: vorberechneter Schlüssel vergleicht wie vergleicheNamen (Umlaut vor Ausgeschriebenem, leer)', () => {
    const namen = ['Müller', 'Mueller', 'müller', 'Nagel', '', 'Straße', 'Strasse', 'Ärger', 'Aerger', 'Zander']
    for (const a of namen) {
      for (const b of namen) {
        expect(Math.sign(vergleicheNamensschluessel(namensSortierschluessel(a), namensSortierschluessel(b)))).toBe(Math.sign(vergleicheNamen(a, b)))
      }
    }
  })
})
