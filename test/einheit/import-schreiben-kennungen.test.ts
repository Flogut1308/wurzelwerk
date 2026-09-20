// AP-1.3d: Kennungsauflösung (56_Import_Vertrag.md §2.1) — `tmp:` wird zu einer gültigen, in sich
// konsistenten UUID v7; `db:` OHNE `ueberschreiben` verändert die bestehende Zeile nicht (§2.1
// "Schutzregel für db:": "referenziert nur, ersetzt nichts").
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { einfuegen as personEinfuegen, lesen as personLesen } from '../../src/main/repositories/person-repo'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))

function ladeFixture(): ReturnType<typeof importDateiSchema.parse> {
  return importDateiSchema.parse(JSON.parse(readFileSync(FIXTURE_PFAD, 'utf8')))
}

describe('schreibeImport() — Kennungsauflösung (AP-1.3d, 56_Import_Vertrag.md §2.1)', () => {
  it('tmp:-Kennungen werden zu gültigen, in sich konsistenten UUID-v7-Werten', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const datei = ladeFixture()
    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

    const karlId = ergebnis.kennungen.get('tmp:karl')
    expect(karlId).toBeDefined()
    expect(karlId).toMatch(UUID_V7_REGEX)

    // Konsistent: dieselbe UUID taucht überall auf, wo tmp:karl referenziert wird — als
    // beteiligung.person_id (Ereignis "Trauung") UND als elternschaft.elternteil_id.
    const beteiligungPersonIds = db
      .prepare<[], { readonly person_id: string }>(
        `SELECT DISTINCT b.person_id FROM beteiligung b
         JOIN ereignis e ON e.id = b.ereignis_id
         WHERE e.typ = 'trauung'`,
      )
      .all()
      .map((zeile) => zeile.person_id)
    expect(beteiligungPersonIds).toContain(karlId)

    const elternteilIds = db.prepare<[], { readonly elternteil_id: string }>('SELECT elternteil_id FROM elternschaft').all().map((z) => z.elternteil_id)
    expect(elternteilIds).toContain(karlId)

    // Jede aufgelöste UUID ist ein gültiger UUID-v7-Wert, keine nur zufällig passende Zeichenkette.
    for (const uuid of ergebnis.kennungen.values()) {
      expect(uuid).toMatch(UUID_V7_REGEX)
    }
  })

  it('db:-Kennung OHNE ueberschreiben verändert die bestehende person-Zeile nicht (§2.1)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const bestehendeId = '018f2c44-7a91-7c3e-9d10-5b6e7f801234'
    personEinfuegen(db, {
      id: bestehendeId,
      geschlecht: 'F',
      notiz: 'URSPRUENGLICHE NOTIZ — darf NICHT überschrieben werden',
      privat: 0,
      ist_platzhalter: 0,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })

    const rohImport = {
      vertrag: 'wurzelwerk-import/v1',
      erzeugt: { am: '2026-09-17', werkzeug: 'test' },
      zusammenfassung: { personen: 1, notizen_unverarbeitet: 0 },
      quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
      personen: [
        {
          id: `db:${bestehendeId}`,
          geschlecht: 'M', // widerspricht bewusst dem bestehenden 'F'
          namen: [{ typ: 'geburtsname', vornamen: 'Sollte', nachname: 'Nichtangelegt', ist_bevorzugt: true }],
          konfidenz: 3,
          belege: [{ quelle: 'tmp:q1', konfidenz: 3 }],
        },
      ],
      notizen_unverarbeitet: [],
    }
    const datei = importDateiSchema.parse(rohImport)

    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

    expect(ergebnis.kennungen.get(`db:${bestehendeId}`)).toBe(bestehendeId)

    const zeileNachImport = personLesen(db, bestehendeId)
    expect(zeileNachImport?.geschlecht).toBe('F') // unverändert, NICHT auf 'M' überschrieben
    expect(zeileNachImport?.notiz).toBe('URSPRUENGLICHE NOTIZ — darf NICHT überschrieben werden')

    const personenAnzahl = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
    expect(personenAnzahl?.anzahl).toBe(1) // keine zweite person-Zeile angelegt

    const namenAnzahl = db
      .prepare<{ readonly id: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM name WHERE person_id = @id')
      .get({ id: bestehendeId })
    expect(namenAnzahl?.anzahl).toBe(0) // kein neuer Name für die db:-Person angelegt

    // Die Existenz-Aussage wird trotzdem geschrieben (neue Bezeugung, keine Eigenschaft der Zeile).
    const existenzAnzahl = db
      .prepare<{ readonly id: string }, { readonly anzahl: number }>(
        `SELECT COUNT(*) AS anzahl FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'existenz'`,
      )
      .get({ id: bestehendeId })
    expect(existenzAnzahl?.anzahl).toBe(1)
  })
})
