// AP-1.3d: `schreibeImport()` gegen `fixtures/import/v1/gueltig/beispiel-3-interview.json` —
// prüft, dass jedes `$defs/Beleg`-Feld (56_Import_Vertrag.md §2.3), das diese Fixture belegt, in
// der richtigen `zitat`-Spalte landet (v. a. `zeitmarke_sekunden`, die 0005-Spalte, A-16), und dass
// die `aussage_zitat`-Verknüpfungen stehen. Die `db:018f2c44-…`-Person (Erna) wird VOR dem Import
// von Hand in die DB geseedet — die Fixture erwartet genau diesen Bestand (56_Import_Vertrag.md
// §2.1: `db:` referenziert einen vorhandenen Datensatz).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { einfuegen as personEinfuegen } from '../../src/main/repositories/person-repo'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/beispiel-3-interview.json', import.meta.url))
const ERNA_UUID = '018f2c44-7a91-7c3e-9d10-5b6e7f801234' // db:-Kennung aus der Fixture, ohne Präfix

function ladeFixture(): ReturnType<typeof importDateiSchema.parse> {
  return importDateiSchema.parse(JSON.parse(readFileSync(FIXTURE_PFAD, 'utf8')))
}

function seedeErna(db: ReturnType<typeof frischeDatenbankMitAbgeleitetemSchema>): void {
  personEinfuegen(db, {
    id: ERNA_UUID,
    privat: 0,
    ist_platzhalter: 0,
    erstelltAm: 1_600_000_000_000,
    geaendertAm: 1_600_000_000_000,
  })
}

interface ZitatZeile {
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly band: string | null
  readonly jahr: number | null
  readonly zeitmarke_sekunden: number | null
  readonly transkript: string | null
  readonly uebersetzung: string | null
  readonly digitalisat_url: string | null
  readonly konfidenz: number | null
}

/** Der (einzige) über `aussage_zitat` verknüpfte `zitat` für eine Aussage mit gegebenem
 * `subjekt_typ`+`subjekt_id`+`praedikat`. */
function zitatFuerAussage(
  db: ReturnType<typeof frischeDatenbankMitAbgeleitetemSchema>,
  subjektTyp: string,
  subjektId: string,
  praedikat: string,
): ZitatZeile | undefined {
  return db
    .prepare<{ readonly subjektTyp: string; readonly subjektId: string; readonly praedikat: string }, ZitatZeile>(
      `SELECT z.seite, z.eintragsnummer, z.band, z.jahr, z.zeitmarke_sekunden, z.transkript, z.uebersetzung, z.digitalisat_url, z.konfidenz
       FROM aussage a
       JOIN aussage_zitat az ON az.aussage_id = a.id
       JOIN zitat z ON z.id = az.zitat_id
       WHERE a.subjekt_typ = @subjektTyp AND a.subjekt_id = @subjektId AND a.praedikat = @praedikat`,
    )
    .get({ subjektTyp, subjektId, praedikat })
}

describe('schreibeImport() — Beleg-Spalten (beispiel-3-interview.json, AP-1.3d)', () => {
  const db = frischeDatenbankMitAbgeleitetemSchema()
  seedeErna(db)
  const datei = ladeFixture()
  const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

  it('db:-Person (Erna) bleibt unverändert (keine neue person-Zeile), bekommt aber trotzdem eine Existenz-Aussage mit ihrem Beleg', () => {
    expect(zaehlePersonen(db)).toBe(2) // Erna (geseedet) + Walter (tmp:, neu)
    expect(ergebnis.kennungen.get('db:018f2c44-7a91-7c3e-9d10-5b6e7f801234')).toBe(ERNA_UUID)

    const zitat = zitatFuerAussage(db, 'person', ERNA_UUID, 'existenz')
    expect(zitat?.zeitmarke_sekunden).toBe(12)
    expect(zitat?.konfidenz).toBe(4)
    expect(zitat?.transkript).toBeNull() // Ernas Existenz-Beleg trägt kein transkript-Feld
  })

  it('Existenz-Aussage von Walter (tmp:) trägt zeitmarke_sekunden + transkript + konfidenz aus seinem Beleg', () => {
    const walterId = ergebnis.kennungen.get('tmp:walter')
    expect(walterId).toBeDefined()
    const zitat = zitatFuerAussage(db, 'person', walterId ?? '', 'existenz')
    expect(zitat?.zeitmarke_sekunden).toBe(95)
    expect(zitat?.transkript).toBe('Mein Vater, der Walter, der war Bergmann auf Zollverein.')
    expect(zitat?.konfidenz).toBe(4)
  })

  it('abgeleitete todesdatum-Aussage (typ=tod) trägt denselben Beleg wie das Ereignis (zeitmarke_sekunden=640)', () => {
    const walterId = ergebnis.kennungen.get('tmp:walter')
    const zitat = zitatFuerAussage(db, 'person', walterId ?? '', 'todesdatum')
    expect(zitat?.zeitmarke_sekunden).toBe(640)
    expect(zitat?.konfidenz).toBe(3)
    expect(zitat?.transkript).toBe('kurz nach meiner Hochzeit, das muss 74 gewesen sein')
  })

  it('regulaere Vertrags-Aussage "beruf" (Walter) trägt ihren eigenen Beleg', () => {
    const walterId = ergebnis.kennungen.get('tmp:walter')
    const zitat = zitatFuerAussage(db, 'person', walterId ?? '', 'beruf')
    expect(zitat?.zeitmarke_sekunden).toBe(95)
    expect(zitat?.konfidenz).toBe(4)
  })

  it('Diagnose-Existenz-Aussagen tragen je ihren eigenen Beleg (Staublunge vs. "was mit dem Herzen" bleiben getrennt)', () => {
    interface DiagnoseZeile {
      readonly id: string
      readonly bezeichnung: string
    }
    const diagnosen = db.prepare<[], DiagnoseZeile>('SELECT id, bezeichnung FROM diagnose ORDER BY bezeichnung').all()
    expect(diagnosen).toHaveLength(2)

    const staublunge = diagnosen.find((d) => d.bezeichnung === 'Staublunge')
    const herz = diagnosen.find((d) => d.bezeichnung === 'was mit dem Herzen')
    expect(staublunge).toBeDefined()
    expect(herz).toBeDefined()

    const zitatStaublunge = zitatFuerAussage(db, 'diagnose', staublunge?.id ?? '', 'existenz')
    expect(zitatStaublunge?.zeitmarke_sekunden).toBe(610)
    expect(zitatStaublunge?.konfidenz).toBe(2)

    const zitatHerz = zitatFuerAussage(db, 'diagnose', herz?.id ?? '', 'existenz')
    expect(zitatHerz?.zeitmarke_sekunden).toBe(655)
    expect(zitatHerz?.konfidenz).toBe(1)
  })

  it('Risikofaktor-Existenz-Aussagen tragen je ihren eigenen Beleg (beruf_exposition vs. rauchen bleiben getrennt)', () => {
    interface RisikofaktorZeile {
      readonly id: string
      readonly art: string
    }
    const eintraege = db.prepare<[], RisikofaktorZeile>('SELECT id, art FROM risikofaktor ORDER BY art').all()
    expect(eintraege).toHaveLength(2)

    const beruf = eintraege.find((r) => r.art === 'beruf_exposition')
    const rauchen = eintraege.find((r) => r.art === 'rauchen')
    expect(beruf).toBeDefined()
    expect(rauchen).toBeDefined()

    const zitatBeruf = zitatFuerAussage(db, 'risikofaktor', beruf?.id ?? '', 'existenz')
    expect(zitatBeruf?.zeitmarke_sekunden).toBe(95)
    expect(zitatBeruf?.konfidenz).toBe(3)

    const zitatRauchen = zitatFuerAussage(db, 'risikofaktor', rauchen?.id ?? '', 'existenz')
    expect(zitatRauchen?.zeitmarke_sekunden).toBe(618)
    expect(zitatRauchen?.konfidenz).toBe(2)
  })

  it('jede aussage_zitat-Verknüpfung zeigt auf eine tatsächlich vorhandene aussage- und zitat-Zeile', () => {
    interface WaisenZeile {
      readonly anzahl: number
    }
    const verwaisteAussage = db
      .prepare<[], WaisenZeile>('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE aussage_id NOT IN (SELECT id FROM aussage)')
      .get()
    const verwaistesZitat = db
      .prepare<[], WaisenZeile>('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE zitat_id NOT IN (SELECT id FROM zitat)')
      .get()
    expect(verwaisteAussage?.anzahl).toBe(0)
    expect(verwaistesZitat?.anzahl).toBe(0)
  })
})

function zaehlePersonen(db: ReturnType<typeof frischeDatenbankMitAbgeleitetemSchema>): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
  if (zeile === undefined) {
    throw new Error('zaehlePersonen(): keine Zeile.')
  }
  return zeile.anzahl
}
