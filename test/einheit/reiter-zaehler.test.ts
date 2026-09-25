// AP-1.30 PR 7a („Zähler am Reiter, keine Prozentwerte; ein Punkt heißt: dort liegt ein offener
// Punkt. Gesundheitsreiter trägt einen Zähler wie alle anderen — kein Schloss"): reine Kernfunktion
// `reiterZaehler` — „ein Reiter zählt, was er auflistet". Je Reiter die Zähldefinition und die
// Randfälle (Kind mit zwei Elternkanten = eine Person, Platzhalter zählen mit, Geschwister nicht,
// Punkt je Reiter). Die Belegzahl selbst (verschiedene Zitate, ohne Gesundheitsbelege) liefert das
// Lesemodell — geprüft in `abfrage-person-detail-reiter-zaehler.test.ts`.
import { describe, expect, it } from 'vitest'
import { REITER } from '../../src/core/person/reiter'
import { reiterZaehler, type ReiterZaehlerEingabe } from '../../src/core/person/reiter-zaehler'

const LEER: ReiterZaehlerEingabe = {
  namenAnzahl: 0,
  beziehungen: [],
  zitatAnzahl: 0,
  medienAnzahl: 0,
  diagnosenAnzahl: 0,
  risikofaktorenAnzahl: 0,
  offenePunkteReiter: [],
}

function mit(ueberschreibung: Partial<ReiterZaehlerEingabe>): ReiterZaehlerEingabe {
  return { ...LEER, ...ueberschreibung }
}

describe('reiterZaehler (AP-1.30 PR 7a)', () => {
  it('RZ1 liefert genau die acht Reiter', () => {
    expect(Object.keys(reiterZaehler(LEER)).sort()).toEqual([...REITER].sort())
  })

  it('RZ2 Person, Leben, Notizen, Verwaltung tragen keinen Zähler — auch nicht 0', () => {
    const z = reiterZaehler(mit({ namenAnzahl: 3, zitatAnzahl: 2, diagnosenAnzahl: 1 }))
    for (const reiter of ['person', 'leben', 'notizen', 'verwaltung'] as const) {
      expect(z[reiter].anzahl).toBeUndefined()
      expect('anzahl' in z[reiter]).toBe(false)
    }
  })

  it('RZ3 Namen: Anzahl der Namensformen, 0 ist ein Zähler', () => {
    expect(reiterZaehler(mit({ namenAnzahl: 3 })).namen.anzahl).toBe(3)
    expect(reiterZaehler(LEER).namen.anzahl).toBe(0)
  })

  it('RZ4 Beziehungen: verschiedene Personen über Eltern, Partner und Kinder', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'vater', richtung: 'elternteil' },
          { personId: 'mutter', richtung: 'elternteil' },
          { personId: 'partnerin', richtung: 'partner' },
          { personId: 'kind', richtung: 'kind' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(4)
  })

  it('RZ5 Beziehungen: ein Kind mit zwei Elternkanten (biologisch + adoptiv) ist eine Person', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'kind', richtung: 'kind' },
          { personId: 'kind', richtung: 'kind' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ6 Beziehungen: dieselbe Person in zwei Partnerschaften bzw. als Partner und Elternteil zählt einmal', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'p', richtung: 'partner' },
          { personId: 'p', richtung: 'partner' },
          { personId: 'p', richtung: 'elternteil' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ7 Beziehungen: Platzhalter zählen mit (sie sind Einträge der Liste)', () => {
    const z = reiterZaehler(mit({ beziehungen: [{ personId: 'platzhalter-mutter', richtung: 'elternteil' }] }))
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ8 Beziehungen: Geschwister (abgeleitet) zählen nicht', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'vater', richtung: 'elternteil' },
          { personId: 'bruder', richtung: 'geschwister' },
          { personId: 'schwester', richtung: 'geschwister' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ9 Belege & Medien: Zitate + Medien (Medien = 0 bis AP-1.31)', () => {
    expect(reiterZaehler(mit({ zitatAnzahl: 4 })).belege_medien.anzahl).toBe(4)
    expect(reiterZaehler(mit({ zitatAnzahl: 4, medienAnzahl: 2 })).belege_medien.anzahl).toBe(6)
    expect(reiterZaehler(LEER).belege_medien.anzahl).toBe(0)
  })

  it('RZ10 Gesundheit: Diagnosen + Risikofaktoren, ein Zähler wie alle anderen (kein Schloss)', () => {
    expect(reiterZaehler(mit({ diagnosenAnzahl: 2, risikofaktorenAnzahl: 1 })).gesundheit.anzahl).toBe(3)
    expect(reiterZaehler(LEER).gesundheit.anzahl).toBe(0)
  })

  it('RZ11 Gesundheitsbestand verändert den Belege-Zähler nicht', () => {
    const ohne = reiterZaehler(mit({ zitatAnzahl: 2 }))
    const mitGesundheit = reiterZaehler(mit({ zitatAnzahl: 2, diagnosenAnzahl: 5, risikofaktorenAnzahl: 5 }))
    expect(mitGesundheit.belege_medien.anzahl).toBe(ohne.belege_medien.anzahl)
  })

  it('RZ12 Punkt: genau die Reiter, an denen ein offener Punkt liegt — mehrere Punkte, ein Punkt', () => {
    const z = reiterZaehler(mit({ offenePunkteReiter: ['beziehungen', 'person', 'beziehungen'] }))
    for (const reiter of REITER) {
      expect(z[reiter].offenerPunkt).toBe(reiter === 'person' || reiter === 'beziehungen')
    }
  })

  it('RZ13 Punkt auch an einem Reiter ohne Zähler (Leben)', () => {
    const z = reiterZaehler(mit({ offenePunkteReiter: ['leben'] }))
    expect(z.leben).toEqual({ offenerPunkt: true })
  })

  it('RZ14 ohne offene Punkte trägt kein Reiter einen Punkt', () => {
    const z = reiterZaehler(LEER)
    for (const reiter of REITER) expect(z[reiter].offenerPunkt).toBe(false)
  })

  it('RZ15 verändert die Eingabe nicht und ist deterministisch', () => {
    const beziehungen = [
      { personId: 'a', richtung: 'kind' as const },
      { personId: 'a', richtung: 'kind' as const },
    ]
    const offenePunkteReiter = ['person' as const]
    const eingabe = mit({ beziehungen, offenePunkteReiter })
    const kopie = structuredClone(eingabe)
    expect(reiterZaehler(eingabe)).toEqual(reiterZaehler(eingabe))
    expect(eingabe).toEqual(kopie)
  })
})
