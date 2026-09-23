// AP-1.6 PR1, C-16/C-17/A-19: rote Tests für `abfrage:person.liste`
// (src/main/abfragen/person-liste.ts) — VOR der Implementierung geschrieben (CLAUDE.md §5, eiserne
// Regel). Direktes INSERT statt Befehlsbus (der Bus ist für Lesevorgänge ohnehin nicht zuständig,
// analog test/einheit/suche-schriftsysteme.test.ts). Deckt Entscheidung A (eigene Kollation:
// Umlautform vor ausgeschriebener Form bei sonst gleichem Schlüssel), Entscheidung B
// (Platzhalter-Tristate, Default zeigt sie an) sowie Filterkombinationen und Seitenweise ab.
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { flacheNameEinfuegen } from '../hilfsmittel/name-schreiben'
import { personListe } from '../../src/main/abfragen/person-liste'
import type { PersonListeEin, PersonListeFilter } from '../../src/shared/schemata/person-liste'

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function personAnlegen(
  db: Database.Database,
  optionen: { readonly nachname?: string; readonly vornamen?: string; readonly istPlatzhalter?: 0 | 1; readonly privat?: 0 | 1 },
): string {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, @privat, @istPlatzhalter)').run({
    id: personId,
    privat: optionen.privat ?? 0,
    istPlatzhalter: optionen.istPlatzhalter ?? 0,
  })
  if (optionen.nachname !== undefined || optionen.vornamen !== undefined) {
    flacheNameEinfuegen(db, { personId, nachname: optionen.nachname ?? null, vornamen: optionen.vornamen ?? null })
  }
  return personId
}

function aussageAnlegen(
  db: Database.Database,
  personId: string,
  optionen: { readonly praedikat: string; readonly wertText?: string; readonly konfidenz?: number },
): void {
  db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz)
     VALUES (@id, 'person', @personId, @praedikat, @wertText, @konfidenz)`,
  ).run({ id: uuidv7(), personId, praedikat: optionen.praedikat, wertText: optionen.wertText ?? null, konfidenz: optionen.konfidenz ?? null })
}

function grundeingabe(ueberschreibung: Partial<PersonListeEin> = {}): PersonListeEin {
  return {
    sortierung: 'nachname',
    richtung: 'auf',
    seite: 1,
    proSeite: 100,
    filter: FILTER_ALLE,
    ...ueberschreibung,
  }
}

describe('abfrage:person.liste (AP-1.6 PR1)', () => {
  it('sortiert Müller vor Mueller vor Nagel (Entscheidung A: eigene Kollation, Umlaut vor ASCII bei gleichem Schlüssel)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Nagel' })
      personAnlegen(db, { nachname: 'Mueller' })
      personAnlegen(db, { nachname: 'Müller' })

      const ergebnis = personListe(db, grundeingabe())

      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Müller', 'Mueller', 'Nagel'])
      expect(ergebnis.gesamt).toBe(3)
    } finally {
      db.close()
    }
  })

  it('kehrt die Reihenfolge bei richtung "ab" um', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Nagel' })
      personAnlegen(db, { nachname: 'Mueller' })
      personAnlegen(db, { nachname: 'Müller' })

      const ergebnis = personListe(db, grundeingabe({ richtung: 'ab' }))

      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Nagel', 'Mueller', 'Müller'])
    } finally {
      db.close()
    }
  })

  it('Entscheidung B: Default-Filter (platzhalter: "alle") zeigt Platzhalterpersonen mit ist_platzhalter=true an', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Bekannt' })
      personAnlegen(db, { nachname: 'Unbekannt', istPlatzhalter: 1 })

      const ergebnis = personListe(db, grundeingabe())

      expect(ergebnis.gesamt).toBe(2)
      const platzhalterZeile = ergebnis.zeilen.find((zeile) => zeile.anzeigename === 'Unbekannt')
      expect(platzhalterZeile?.ist_platzhalter).toBe(true)
      const normaleZeile = ergebnis.zeilen.find((zeile) => zeile.anzeigename === 'Bekannt')
      expect(normaleZeile?.ist_platzhalter).toBe(false)
    } finally {
      db.close()
    }
  })

  it('Filter platzhalter="nur" liefert ausschließlich Platzhalterpersonen', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Bekannt' })
      personAnlegen(db, { nachname: 'Unbekannt', istPlatzhalter: 1 })

      const ergebnis = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, platzhalter: 'nur' } }))

      expect(ergebnis.gesamt).toBe(1)
      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Unbekannt'])
    } finally {
      db.close()
    }
  })

  it('Filter platzhalter="ohne" schließt Platzhalterpersonen aus', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Bekannt' })
      personAnlegen(db, { nachname: 'Unbekannt', istPlatzhalter: 1 })

      const ergebnis = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, platzhalter: 'ohne' } }))

      expect(ergebnis.gesamt).toBe(1)
      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Bekannt'])
    } finally {
      db.close()
    }
  })

  it('Filter privat: Tristate "nur"/"ohne" verhält sich analog zu platzhalter', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personAnlegen(db, { nachname: 'Oeffentlich' })
      personAnlegen(db, { nachname: 'Privat', privat: 1 })

      const nur = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, privat: 'nur' } }))
      expect(nur.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Privat'])

      const ohne = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, privat: 'ohne' } }))
      expect(ohne.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Oeffentlich'])
    } finally {
      db.close()
    }
  })

  it('Filter konfidenzMin liefert nur Personen mit konfidenz_min >= Schwelle', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const schwacheId = personAnlegen(db, { nachname: 'Schwach' })
      aussageAnlegen(db, schwacheId, { praedikat: 'beruf', wertText: 'Bauer', konfidenz: 1 })
      const starkeId = personAnlegen(db, { nachname: 'Stark' })
      aussageAnlegen(db, starkeId, { praedikat: 'beruf', wertText: 'Schmied', konfidenz: 3 })
      personAnlegen(db, { nachname: 'OhneAussage' })

      const ergebnis = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, konfidenzMin: 2 } }))

      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Stark'])
    } finally {
      db.close()
    }
  })

  it('Filter nurWiderspruch liefert nur Personen mit widersprüchlichen (nicht bevorzugten) Aussagen', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const widerspruchId = personAnlegen(db, { nachname: 'Widerspruch' })
      aussageAnlegen(db, widerspruchId, { praedikat: 'beruf', wertText: 'Bauer' })
      aussageAnlegen(db, widerspruchId, { praedikat: 'beruf', wertText: 'Schmied' })
      personAnlegen(db, { nachname: 'Eindeutig' })

      const ergebnis = personListe(db, grundeingabe({ filter: { ...FILTER_ALLE, nurWiderspruch: true } }))

      expect(ergebnis.zeilen.map((zeile) => zeile.anzeigename)).toEqual(['Widerspruch'])
      expect(ergebnis.zeilen[0]?.hat_widerspruch).toBe(true)
    } finally {
      db.close()
    }
  })

  it('Seitenweise: proSeite/seite schneiden korrekt, gesamt zählt über alle Seiten', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      for (let i = 1; i <= 25; i += 1) {
        personAnlegen(db, { nachname: `Person${String(i).padStart(2, '0')}` })
      }

      const ersteSeite = personListe(db, grundeingabe({ proSeite: 10, seite: 1 }))
      expect(ersteSeite.gesamt).toBe(25)
      expect(ersteSeite.zeilen).toHaveLength(10)
      expect(ersteSeite.zeilen[0]?.anzeigename).toBe('Person01')
      expect(ersteSeite.zeilen[9]?.anzeigename).toBe('Person10')

      const dritteSeite = personListe(db, grundeingabe({ proSeite: 10, seite: 3 }))
      expect(dritteSeite.gesamt).toBe(25)
      expect(dritteSeite.zeilen).toHaveLength(5)
      expect(dritteSeite.zeilen[0]?.anzeigename).toBe('Person21')
      expect(dritteSeite.zeilen[4]?.anzeigename).toBe('Person25')
    } finally {
      db.close()
    }
  })
})
