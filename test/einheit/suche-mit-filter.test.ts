// AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite) — rot zuerst (CLAUDE.md §5): vor der
// Implementierung geschrieben. `abfrage:suche` nimmt jetzt Filter, Sortierung und Seite entgegen
// (wiederverwenden: `vergleicheZeilen`/`filterBedingungen` aus src/main/abfragen/person-liste.ts) —
// geprüft gegen die 2.000er-Fixture (test/hilfsmittel/grossbestand.ts).
import { describe, expect, it } from 'vitest'
import { grossbestandAufbauen } from '../hilfsmittel/grossbestand'
import { suche } from '../../src/main/abfragen/suche'
import type { PersonListeFilter, SucheEin } from '../../src/shared/schemata/person-liste'

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function sucheEingabe(ueberschreibung: Partial<SucheEin> & Pick<SucheEin, 'text'>): SucheEin {
  return {
    grenze: 500,
    filter: FILTER_ALLE,
    sortierung: 'nachname',
    richtung: 'auf',
    seite: 1,
    proSeite: 100,
    ...ueberschreibung,
  }
}

describe('abfrage:suche — Filter/Sortierung/Seite gegen die 2.000er-Fixture (AP-1.10 PR-A)', () => {
  it('Filter wirkt: platzhalter="ohne" schließt Platzhaltertreffer aus einer sonst platzhalterhaltigen Trefferliste aus', () => {
    const db = grossbestandAufbauen()
    try {
      const ungefiltert = suche(db, sucheEingabe({ text: 'Müller' }))
      // Fixture-Konstruktion (grossbestand.ts): Nachname "Müller" bei i % 20 === 0, Platzhalter bei
      // i % 50 === 0 — beide Bedingungen treffen sich bei i % 100 === 0, es gibt also mindestens
      // einen Platzhalter-Treffer in der ungefilterten Liste.
      expect(ungefiltert.treffer.some((treffer) => treffer.ist_platzhalter)).toBe(true)

      const gefiltert = suche(db, sucheEingabe({ text: 'Müller', filter: { ...FILTER_ALLE, platzhalter: 'ohne' } }))

      expect(gefiltert.treffer.every((treffer) => !treffer.ist_platzhalter)).toBe(true)
      expect(gefiltert.gesamt).toBeLessThan(ungefiltert.gesamt)
    } finally {
      db.close()
    }
  })

  it('konfidenzMin-Filter lässt nur Treffer mit ausreichender Mindestkonfidenz durch', () => {
    const db = grossbestandAufbauen()
    try {
      const ergebnis = suche(db, sucheEingabe({ text: 'Schmidt', filter: { ...FILTER_ALLE, konfidenzMin: 4 } }))

      expect(ergebnis.treffer.length).toBeGreaterThan(0)
      for (const treffer of ergebnis.treffer) {
        expect(treffer.konfidenz_min).not.toBeNull()
        expect(treffer.konfidenz_min as number).toBeGreaterThanOrEqual(4)
      }
    } finally {
      db.close()
    }
  })

  it('Sortierung "geburt"/"auf" liefert eine nicht-fallende Folge von geburt_datum.sortVon', () => {
    const db = grossbestandAufbauen()
    try {
      const ergebnis = suche(db, sucheEingabe({ text: 'Schmidt', sortierung: 'geburt', richtung: 'auf', proSeite: 500 }))

      const sortWerte = ergebnis.treffer.map((treffer) => treffer.geburt_datum?.sortVon)
      for (let i = 1; i < sortWerte.length; i += 1) {
        const vorheriger = sortWerte[i - 1]
        const aktueller = sortWerte[i]
        expect(vorheriger).toBeDefined()
        expect(aktueller).toBeDefined()
        expect((aktueller as number) >= (vorheriger as number)).toBe(true)
      }
    } finally {
      db.close()
    }
  })

  it('Sortierung "geburt"/"ab" liefert eine nicht-steigende Folge von geburt_datum.sortVon', () => {
    const db = grossbestandAufbauen()
    try {
      const ergebnis = suche(db, sucheEingabe({ text: 'Schmidt', sortierung: 'geburt', richtung: 'ab', proSeite: 500 }))

      const sortWerte = ergebnis.treffer.map((treffer) => treffer.geburt_datum?.sortVon)
      for (let i = 1; i < sortWerte.length; i += 1) {
        const vorheriger = sortWerte[i - 1]
        const aktueller = sortWerte[i]
        expect(vorheriger).toBeDefined()
        expect(aktueller).toBeDefined()
        expect((aktueller as number) <= (vorheriger as number)).toBe(true)
      }
    } finally {
      db.close()
    }
  })

  it('"auf" und "ab" liefern dieselbe Personenmenge, nur anders angeordnet', () => {
    const db = grossbestandAufbauen()
    try {
      const auf = suche(db, sucheEingabe({ text: 'Schmidt', sortierung: 'geburt', richtung: 'auf', proSeite: 500 }))
      const ab = suche(db, sucheEingabe({ text: 'Schmidt', sortierung: 'geburt', richtung: 'ab', proSeite: 500 }))

      expect(new Set(ab.treffer.map((treffer) => treffer.person_id))).toEqual(new Set(auf.treffer.map((treffer) => treffer.person_id)))
      expect(ab.treffer.length).toBe(auf.treffer.length)
    } finally {
      db.close()
    }
  })

  it('Seite schneidet korrekt: proSeite=5 Seite 1 + Seite 2 = proSeite=10 Seite 1, gesamt bleibt gleich', () => {
    const db = grossbestandAufbauen()
    try {
      const seite1 = suche(db, sucheEingabe({ text: 'Schmidt', proSeite: 5, seite: 1 }))
      const seite2 = suche(db, sucheEingabe({ text: 'Schmidt', proSeite: 5, seite: 2 }))
      const zehn = suche(db, sucheEingabe({ text: 'Schmidt', proSeite: 10, seite: 1 }))

      expect(seite1.gesamt).toBe(seite2.gesamt)
      expect(seite1.gesamt).toBe(zehn.gesamt)
      expect([...seite1.treffer, ...seite2.treffer].map((treffer) => treffer.person_id)).toEqual(zehn.treffer.map((treffer) => treffer.person_id))
    } finally {
      db.close()
    }
  })

  it('Filter, Sortierung und Seite wirken gemeinsam, ohne sich zu widersprechen', () => {
    const db = grossbestandAufbauen()
    try {
      const ergebnis = suche(
        db,
        sucheEingabe({
          text: 'Schmidt',
          filter: { ...FILTER_ALLE, platzhalter: 'ohne', konfidenzMin: 2 },
          sortierung: 'nachname',
          richtung: 'auf',
          proSeite: 3,
          seite: 2,
        }),
      )

      expect(ergebnis.treffer.length).toBeLessThanOrEqual(3)
      expect(ergebnis.treffer.every((treffer) => !treffer.ist_platzhalter)).toBe(true)
      expect(ergebnis.treffer.every((treffer) => (treffer.konfidenz_min ?? 0) >= 2)).toBe(true)
    } finally {
      db.close()
    }
  })
})
