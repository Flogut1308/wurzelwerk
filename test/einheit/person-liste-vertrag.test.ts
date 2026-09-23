// AP-1.10 PR-A (Listen-Vertrag) — rot zuerst (CLAUDE.md §5): vor der Implementierung geschrieben.
// Deckt U-1.6-spalten-datenvertrag (Beruf/Belegzahl/Kinderzahl) und U-1.6-lebensdaten-unschaerfe
// (volle Datums-Spaltengruppe) ab: jedes neue Feld von `PersonListeZeile` ist befüllt, AUCH wenn
// die Quelle NULL ist (docs/80_Offene_Fragen.md §16).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { flacheNameEinfuegen } from '../hilfsmittel/name-schreiben'
import { personListe } from '../../src/main/abfragen/person-liste'
import type { PersonListeEin, PersonListeFilter } from '../../src/shared/schemata/person-liste'

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function grundeingabe(ueberschreibung: Partial<PersonListeEin> = {}): PersonListeEin {
  return { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE, ...ueberschreibung }
}

function personAnlegen(db: Database.Database, nachname: string): string {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
  flacheNameEinfuegen(db, { personId, nachname })
  return personId
}

interface AussageOptionen {
  readonly praedikat: string
  readonly wertText?: string
  readonly istBevorzugt?: 0 | 1
  readonly datumKalender?: string
  readonly datumModifikator?: string
  readonly datumPraezision?: string
  readonly datumWert1?: string
  readonly datumWert2?: string
  readonly datumOriginaltext?: string
  readonly datumSortVon?: number
  readonly datumSortBis?: number
}

function aussageAnlegen(db: Database.Database, personId: string, optionen: AussageOptionen): string {
  const aussageId = uuidv7()
  db.prepare(
    `INSERT INTO aussage (
       id, subjekt_typ, subjekt_id, praedikat, wert_text, ist_bevorzugt,
       datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
       datum_sort_von, datum_sort_bis
     ) VALUES (
       @id, 'person', @personId, @praedikat, @wertText, @istBevorzugt,
       @datumKalender, @datumModifikator, @datumPraezision, @datumWert1, @datumWert2, @datumOriginaltext,
       @datumSortVon, @datumSortBis
     )`,
  ).run({
    id: aussageId,
    personId,
    praedikat: optionen.praedikat,
    wertText: optionen.wertText ?? null,
    istBevorzugt: optionen.istBevorzugt ?? null,
    datumKalender: optionen.datumKalender ?? null,
    datumModifikator: optionen.datumModifikator ?? null,
    datumPraezision: optionen.datumPraezision ?? null,
    datumWert1: optionen.datumWert1 ?? null,
    datumWert2: optionen.datumWert2 ?? null,
    datumOriginaltext: optionen.datumOriginaltext ?? null,
    datumSortVon: optionen.datumSortVon ?? null,
    datumSortBis: optionen.datumSortBis ?? null,
  })
  return aussageId
}

/** Legt eine `quelle` + `zitat` an und verknüpft sie über `aussage_zitat` mit `aussageId` — ein
 * "Beleg" im Sinn von `PersonListeZeile.belegzahl`. */
function belegAnlegen(db: Database.Database, aussageId: string): void {
  const quelleId = uuidv7()
  db.prepare(`INSERT INTO quelle (id, typ) VALUES (@id, 'kirchenbuch')`).run({ id: quelleId })
  const zitatId = uuidv7()
  db.prepare(`INSERT INTO zitat (id, quelle_id) VALUES (@id, @quelleId)`).run({ id: zitatId, quelleId })
  db.prepare(`INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)`).run({ aussageId, zitatId })
}

function elternschaftAnlegen(db: Database.Database, elternteilId: string, kindId: string): void {
  db.prepare(`INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @elternteilId, @kindId, 'biologisch')`).run({
    id: uuidv7(),
    elternteilId,
    kindId,
  })
}

function zeileVon(ergebnis: ReturnType<typeof personListe>, personId: string) {
  const zeile = ergebnis.zeilen.find((eintrag) => eintrag.person_id === personId)
  if (zeile === undefined) throw new Error(`Zeile für ${personId} nicht gefunden.`)
  return zeile
}

describe('PersonListeZeile — neue Felder (AP-1.10 PR-A, U-1.6-spalten-datenvertrag)', () => {
  it('ohne jede Aussage/Elternschaft: beruf=null, belegzahl=0, kinderzahl=0, geburt_datum=null, tod_datum=null', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, 'Ohne')

      const zeile = zeileVon(personListe(db, grundeingabe()), personId)

      expect(zeile.beruf).toBeNull()
      expect(zeile.belegzahl).toBe(0)
      expect(zeile.kinderzahl).toBe(0)
      expect(zeile.geburt_datum).toBeNull()
      expect(zeile.tod_datum).toBeNull()
    } finally {
      db.close()
    }
  })

  it('beruf: wert_text der bevorzugten praedikat="beruf"-Aussage', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, 'Schmied')
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Bauer', istBevorzugt: 0 })
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Schmied', istBevorzugt: 1 })

      const zeile = zeileVon(personListe(db, grundeingabe()), personId)

      expect(zeile.beruf).toBe('Schmied')
    } finally {
      db.close()
    }
  })

  it('belegzahl zählt aussage_zitat über ALLE Aussagen der Person, nicht nur eines Prädikats', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, 'Belegt')
      const berufId = aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Bauer' })
      const geburtId = aussageAnlegen(db, personId, {
        praedikat: 'geburtsdatum',
        datumKalender: 'gregorian',
        datumModifikator: 'exakt',
        datumPraezision: 'jahr',
        datumWert1: '1900',
      })
      belegAnlegen(db, berufId)
      belegAnlegen(db, geburtId)
      belegAnlegen(db, geburtId)

      const zeile = zeileVon(personListe(db, grundeingabe()), personId)

      expect(zeile.belegzahl).toBe(3)
    } finally {
      db.close()
    }
  })

  it('kinderzahl zählt elternschaft-Zeilen mit elternteil_id = person_id', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const elternId = personAnlegen(db, 'Eltern')
      const kind1Id = personAnlegen(db, 'Kind1')
      const kind2Id = personAnlegen(db, 'Kind2')
      elternschaftAnlegen(db, elternId, kind1Id)
      elternschaftAnlegen(db, elternId, kind2Id)

      const zeile = zeileVon(personListe(db, grundeingabe()), elternId)
      const kindZeile = zeileVon(personListe(db, grundeingabe()), kind1Id)

      expect(zeile.kinderzahl).toBe(2)
      expect(kindZeile.kinderzahl).toBe(0)
    } finally {
      db.close()
    }
  })

  it('geburt_datum/tod_datum tragen die volle Spaltengruppe (Modifikator/Präzision/Kalender/wert1/2/sort)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, 'Unscharf')
      aussageAnlegen(db, personId, {
        praedikat: 'geburtsdatum',
        datumKalender: 'gregorian',
        datumModifikator: 'etwa',
        datumPraezision: 'jahr',
        datumWert1: '1890',
        datumSortVon: 2411368,
        datumSortBis: 2411732,
      })
      aussageAnlegen(db, personId, {
        praedikat: 'todesdatum',
        datumKalender: 'gregorian',
        datumModifikator: 'exakt',
        datumPraezision: 'jahr',
        datumWert1: '1961',
        datumSortVon: 2437665,
        datumSortBis: 2438029,
      })

      const zeile = zeileVon(personListe(db, grundeingabe()), personId)

      expect(zeile.geburt_datum).toEqual({
        kalender: 'gregorian',
        modifikator: 'etwa',
        praezision: 'jahr',
        wert1: '1890',
        wert2: null,
        originaltext: null,
        sortVon: 2411368,
        sortBis: 2411732,
      })
      expect(zeile.tod_datum).toEqual({
        kalender: 'gregorian',
        modifikator: 'exakt',
        praezision: 'jahr',
        wert1: '1961',
        wert2: null,
        originaltext: null,
        sortVon: 2437665,
        sortBis: 2438029,
      })
    } finally {
      db.close()
    }
  })

  it('zwischen-Modifikator trägt wert2', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, 'Zwischen')
      aussageAnlegen(db, personId, {
        praedikat: 'geburtsdatum',
        datumKalender: 'gregorian',
        datumModifikator: 'zwischen',
        datumPraezision: 'jahr',
        datumWert1: '1750',
        datumWert2: '1760',
      })

      const zeile = zeileVon(personListe(db, grundeingabe()), personId)

      expect(zeile.geburt_datum?.modifikator).toBe('zwischen')
      expect(zeile.geburt_datum?.wert1).toBe('1750')
      expect(zeile.geburt_datum?.wert2).toBe('1760')
    } finally {
      db.close()
    }
  })
})
