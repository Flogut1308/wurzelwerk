// AP-1.3d: `schreibeImport()` gegen `fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json` — prüft
// die Grundabbildung (medium/ort/person/name/quelle/ereignis/beteiligung/elternschaft/
// partnerschaft), die Existenz-Aussagen (ADR-026, `wert_text='ja'`), die abgeleiteten
// `geburtsdatum`/`geburtsort`-Aussagen (NUR aus `typ='geburt'`) und die Vertrags-`aussagen[]`
// (`beruf`). `elternschaft.konfidenz IS NULL` ist ADR-026 wörtlich (50_Datenmodell.md §2.7).
// Assertions laufen über AUFGELÖSTE Beziehungen (`ergebnis.kennungen`), nie über UUID-Literale —
// `neueId()` ist pro Lauf nichtdeterministisch (uuid v7 trägt einen Zeitstempel).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))

function ladeFixture(): ReturnType<typeof importDateiSchema.parse> {
  return importDateiSchema.parse(JSON.parse(readFileSync(FIXTURE_PFAD, 'utf8')))
}

interface ZahlZeile {
  readonly anzahl: number
}

function zaehle(db: ReturnType<typeof frischeDatenbankMitAbgeleitetemSchema>, sql: string): number {
  const zeile = db.prepare<[], ZahlZeile>(sql).get()
  if (zeile === undefined) {
    throw new Error(`zaehle(): keine Zeile für "${sql}".`)
  }
  return zeile.anzahl
}

describe('schreibeImport() — Grundabbildung (beispiel-1-einfach.json, AP-1.3d)', () => {
  const db = frischeDatenbankMitAbgeleitetemSchema()
  const datei = ladeFixture()
  const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

  it('legt die erwartete Zeilenzahl je Grundtabelle an', () => {
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM person')).toBe(3)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name')).toBe(4) // karl(1) + emma(2) + helene(1)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM ort')).toBe(1)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM ortsname')).toBe(1)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM quelle')).toBe(1)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM ereignis')).toBe(3)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM beteiligung')).toBe(6) // 1 + 2 + 3
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM elternschaft')).toBe(2)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM partnerschaft')).toBe(1)
    expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM partnerschaft_person')).toBe(2)
  })

  it('SchreibErgebnis.zeilen spiegelt dieselben Zählungen', () => {
    expect(ergebnis.zeilen['person']).toBe(3)
    expect(ergebnis.zeilen['ereignis']).toBe(3)
    expect(ergebnis.zeilen['elternschaft']).toBe(2)
    expect(ergebnis.zeilen['partnerschaft']).toBe(1)
  })

  it('Existenz-Aussage je belegtem Objekt (person+ereignis+elternschaft+partnerschaft = 3+3+2+1 = 9), wert_text FESTGENAGELT auf "ja"', () => {
    const anzahl = zaehle(db, `SELECT COUNT(*) AS anzahl FROM aussage WHERE praedikat = 'existenz'`)
    expect(anzahl).toBe(9)
    const alleJa = zaehle(db, `SELECT COUNT(*) AS anzahl FROM aussage WHERE praedikat = 'existenz' AND wert_text != 'ja'`)
    expect(alleJa).toBe(0)
  })

  it('Existenz-Aussage von Karl trägt seine Konfidenz (4) und ist über aussage_zitat belegt', () => {
    const karlId = ergebnis.kennungen.get('tmp:karl')
    expect(karlId).toBeDefined()
    interface AussageZeile {
      readonly id: string
      readonly konfidenz: number | null
      readonly wert_text: string | null
    }
    const zeile = db
      .prepare<{ readonly subjektId: string }, AussageZeile>(
        `SELECT id, konfidenz, wert_text FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @subjektId AND praedikat = 'existenz'`,
      )
      .get({ subjektId: karlId ?? '' })
    expect(zeile).toBeDefined()
    expect(zeile?.konfidenz).toBe(4)
    expect(zeile?.wert_text).toBe('ja')

    const belegAnzahl = db
      .prepare<{ readonly aussageId: string }, ZahlZeile>('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE aussage_id = @aussageId')
      .get({ aussageId: zeile?.id ?? '' })
    expect(belegAnzahl?.anzahl).toBe(1)
  })

  it('abgeleitete geburtsdatum/geburtsort-Aussagen NUR aus typ=geburt (Karl: Datum + Ort; Helene: nur Datum, kein Ort im Ereignis)', () => {
    const karlId = ergebnis.kennungen.get('tmp:karl')
    const heleneId = ergebnis.kennungen.get('tmp:helene')
    const ortId = ergebnis.kennungen.get('tmp:ort-marienwerder')
    expect(karlId).toBeDefined()
    expect(heleneId).toBeDefined()
    expect(ortId).toBeDefined()

    interface GeburtZeile {
      readonly datum_wert1: string | null
      readonly wert_ref_id: string | null
    }

    const karlGeburtsdatum = db
      .prepare<{ readonly id: string }, GeburtZeile>(
        `SELECT datum_wert1, wert_ref_id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'geburtsdatum'`,
      )
      .get({ id: karlId ?? '' })
    expect(karlGeburtsdatum?.datum_wert1).toBe('1901-03-14')

    const karlGeburtsort = db
      .prepare<{ readonly id: string }, GeburtZeile>(
        `SELECT datum_wert1, wert_ref_id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'geburtsort'`,
      )
      .get({ id: karlId ?? '' })
    expect(karlGeburtsort?.wert_ref_id).toBe(ortId)

    const heleneGeburtsdatum = db
      .prepare<{ readonly id: string }, GeburtZeile>(
        `SELECT datum_wert1, wert_ref_id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'geburtsdatum'`,
      )
      .get({ id: heleneId ?? '' })
    expect(heleneGeburtsdatum?.datum_wert1).toBe('1927-02-03')

    const heleneGeburtsort = db
      .prepare<{ readonly id: string }, GeburtZeile>(
        `SELECT datum_wert1 FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'geburtsort'`,
      )
      .get({ id: heleneId ?? '' })
    expect(heleneGeburtsort).toBeUndefined() // kein Ort am Ereignis -> keine geburtsort-Aussage

    // trauung (kein geburt/tod) darf keine abgeleitete Aussage erzeugt haben.
    const todesdatumAnzahl = zaehle(db, `SELECT COUNT(*) AS anzahl FROM aussage WHERE praedikat = 'todesdatum'`)
    expect(todesdatumAnzahl).toBe(0)
  })

  it('Vertrags-Aussage "beruf" (Karl) landet unverändert als reguläre Aussage', () => {
    const karlId = ergebnis.kennungen.get('tmp:karl')
    interface BerufZeile {
      readonly wert_text: string | null
      readonly konfidenz: number | null
      readonly ist_bevorzugt: number | null
      readonly gueltig_von: number | null
    }
    const zeile = db
      .prepare<{ readonly id: string }, BerufZeile>(
        `SELECT wert_text, konfidenz, ist_bevorzugt, gueltig_von FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'beruf'`,
      )
      .get({ id: karlId ?? '' })
    expect(zeile?.wert_text).toBe('Schmied')
    expect(zeile?.konfidenz).toBe(3)
    expect(zeile?.ist_bevorzugt).toBe(1)
    expect(zeile?.gueltig_von).toBe(1925)
  })

  it('elternschaft.konfidenz bleibt IMMER NULL (ADR-026)', () => {
    const anzahlMitKonfidenz = zaehle(db, 'SELECT COUNT(*) AS anzahl FROM elternschaft WHERE konfidenz IS NOT NULL')
    expect(anzahlMitKonfidenz).toBe(0)
  })

  it('Elternschaft- und Partnerschaftskanten verbinden die aufgelösten Personen-UUIDs korrekt', () => {
    const karlId = ergebnis.kennungen.get('tmp:karl')
    const emmaId = ergebnis.kennungen.get('tmp:emma')
    const heleneId = ergebnis.kennungen.get('tmp:helene')

    const elternVonHelene = db
      .prepare<{ readonly kindId: string }, { readonly elternteil_id: string }>('SELECT elternteil_id FROM elternschaft WHERE kind_id = @kindId ORDER BY elternteil_id')
      .all({ kindId: heleneId ?? '' })
      .map((zeile) => zeile.elternteil_id)
      .sort()
    expect(elternVonHelene).toEqual([karlId, emmaId].filter((x): x is string => x !== undefined).sort())

    const partnerschaftPersonen = db
      .prepare<[], { readonly person_id: string }>('SELECT person_id FROM partnerschaft_person')
      .all()
      .map((zeile) => zeile.person_id)
      .sort()
    expect(partnerschaftPersonen).toEqual([karlId, emmaId].filter((x): x is string => x !== undefined).sort())
  })
})
