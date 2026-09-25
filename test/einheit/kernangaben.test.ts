// AP-1.34 PR-D (ADR-031, §31 U-1.34-E7, U-1.34-D1…D11): Kernangaben und Vollständigkeitsgrad im Kern.
import { describe, expect, it } from 'vitest'
import { kernangabenAuswerten, type KernAussage, type KernOrtAussage, type KernangabenEingabe, type KernElternteil } from '../../src/core/person/kernangaben'

const BELEGT: KernAussage = { hatWert: true, belegt: true }
const UNBELEGT: KernAussage = { hatWert: true, belegt: false }
const OHNE_WERT: KernAussage = { hatWert: false, belegt: true }
const ORT_BELEGT: KernOrtAussage = { wertRefId: null, wertText: 'Irgendwo', belegt: true }
const ORT_UNBELEGT: KernOrtAussage = { wertRefId: null, wertText: 'Irgendwo', belegt: false }
// Weder Verweis noch Text (z. B. nur wert_zahl): trägt keinen Ort (traegtOrt, hueter #123 H1).
const ORT_OHNE: KernOrtAussage = { wertRefId: null, wertText: null, belegt: true }

function eingabe(teil: Partial<KernangabenEingabe> = {}): KernangabenEingabe {
  return {
    istPlatzhalter: false,
    lebendStatus: 'lebend',
    geschlecht: null,
    hauptformBelegt: false,
    geburtsdatum: [],
    geburtsort: [],
    todesdatum: [],
    todesort: [],
    todEreignisse: [],
    eltern: [],
    ...teil,
  }
}

function el(id: string, geschlecht: KernElternteil['geschlecht'], belegt: boolean): KernElternteil {
  return { id, geschlecht, belegt }
}

function auswerten(teil: Partial<KernangabenEingabe>): ReturnType<typeof kernangabenAuswerten> {
  return kernangabenAuswerten(eingabe(teil))
}

function fehlend(teil: Partial<KernangabenEingabe>): readonly string[] {
  return auswerten(teil)?.fehlend ?? ['<null>']
}

/** Voll belegte Person (ohne Todesangaben) — Grundlage, um EINE Angabe gezielt wegzunehmen. */
const VOLL: Partial<KernangabenEingabe> = {
  geschlecht: 'M',
  hauptformBelegt: true,
  geburtsdatum: [BELEGT],
  geburtsort: [ORT_BELEGT],
  eltern: [el('a', 'M', true), el('b', 'F', true)],
}

describe('kernangabenAuswerten (AP-1.34 PR-D, ADR-031)', () => {
  it('K1: Platzhalter → null, auch voll belegt', () => {
    expect(auswerten({ ...VOLL, istPlatzhalter: true })).toBeNull()
  })

  it('K2: leere lebende Person 0/6, fehlend in fester Reihenfolge', () => {
    expect(auswerten({})).toEqual({ erfuellt: 0, anwendbar: 6, prozent: 0, fehlend: ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'vater', 'mutter'] })
  })

  it('K3: Lebensstatus — nur verstorben hat 8 Angaben, auch mit Todesaussagen bleiben es sonst 6', () => {
    const tod: Partial<KernangabenEingabe> = { todesdatum: [BELEGT], todesort: [ORT_BELEGT] }
    expect(auswerten({ ...VOLL, ...tod, lebendStatus: 'verstorben' })).toMatchObject({ erfuellt: 8, anwendbar: 8, prozent: 100 })
    for (const lebendStatus of ['lebend', 'vermutet_verstorben', null] as const) {
      expect(auswerten({ ...VOLL, ...tod, lebendStatus })).toEqual({ erfuellt: 6, anwendbar: 6, prozent: 100, fehlend: [] })
    }
    expect(auswerten({ lebendStatus: 'verstorben' })?.fehlend).toEqual(['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'vater', 'mutter'])
  })

  it('K4: Geschlecht — M/F/X zählen, U und nicht erfasst nicht', () => {
    for (const geschlecht of ['M', 'F', 'X'] as const) expect(fehlend({ ...VOLL, geschlecht })).toEqual([])
    for (const geschlecht of ['U', null] as const) expect(fehlend({ ...VOLL, geschlecht })).toEqual(['geschlecht'])
  })

  it('K5: Name nur über die belegte Hauptform', () => {
    expect(fehlend({ ...VOLL, hauptformBelegt: false })).toEqual(['name'])
    expect(fehlend({ ...VOLL, hauptformBelegt: true })).toEqual([])
  })

  it('K6: Datum — Wert ohne Beleg nein, Beleg ohne Wert nein, eine von zwei belegt ja', () => {
    expect(fehlend({ ...VOLL, geburtsdatum: [UNBELEGT] })).toEqual(['geburtsdatum'])
    expect(fehlend({ ...VOLL, geburtsdatum: [OHNE_WERT] })).toEqual(['geburtsdatum'])
    expect(fehlend({ ...VOLL, geburtsdatum: [UNBELEGT, OHNE_WERT] })).toEqual(['geburtsdatum'])
    expect(fehlend({ ...VOLL, geburtsdatum: [UNBELEGT, BELEGT] })).toEqual([])
    const tot = { ...VOLL, lebendStatus: 'verstorben' as const, todesort: [ORT_BELEGT] }
    expect(fehlend({ ...tot, todesdatum: [UNBELEGT] })).toEqual(['todesdatum'])
    expect(fehlend({ ...tot, todesdatum: [BELEGT] })).toEqual([])
  })

  it('K7: Geburtsort — eine belegte Aussage (auch nur freier Text) genügt, ohne Aussage fehlt er', () => {
    expect(fehlend({ ...VOLL, geburtsort: [ORT_BELEGT] })).toEqual([])
    expect(fehlend({ ...VOLL, geburtsort: [] })).toEqual(['geburtsort'])
    expect(fehlend({ ...VOLL, geburtsort: [{ wertRefId: 'ort-1', wertText: null, belegt: true }] })).toEqual([])
    expect(fehlend({ ...VOLL, geburtsort: [ORT_OHNE] })).toEqual(['geburtsort'])
  })

  it('K8: Todesort — Aussage führt, Ereignisort nur als Rückfall', () => {
    const tot = { ...VOLL, lebendStatus: 'verstorben' as const, todesdatum: [BELEGT] }
    const ortBelegt = [{ ortVorhanden: true, ortBelegt: true }]
    expect(fehlend({ ...tot, todesort: [ORT_BELEGT] })).toEqual([])
    // Nur wert_zahl (ORT_OHNE) belegt, kein Ereignis: kein Ort, nicht erfüllt (hueter #123 H1, wie sterbeortAufloesen).
    expect(fehlend({ ...tot, todesort: [ORT_OHNE] })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todesort: [ORT_UNBELEGT], todEreignisse: ortBelegt })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todesort: [], todEreignisse: ortBelegt })).toEqual([])
    // Eine Aussage ohne Wert trägt keinen Ort und verdrängt den Rückfall nicht (wie sterbeortAufloesen).
    expect(fehlend({ ...tot, todesort: [ORT_OHNE], todEreignisse: ortBelegt })).toEqual([])
    expect(fehlend({ ...tot, todEreignisse: [{ ortVorhanden: false, ortBelegt: true }] })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todEreignisse: [{ ortVorhanden: true, ortBelegt: false }] })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todEreignisse: [{ ortVorhanden: true, ortBelegt: false }, { ortVorhanden: true, ortBelegt: true }] })).toEqual([])
  })

  it('K9: Eltern — Platz besetzt UND belegt, Doppelkanten, unbestimmter Elternteil, Überzählige', () => {
    const basis = { ...VOLL }
    expect(auswerten({ ...basis, eltern: [el('a', 'M', true), el('b', 'F', true)] })?.erfuellt).toBe(6)
    expect(fehlend({ ...basis, eltern: [el('a', 'M', true), el('b', 'F', false)] })).toEqual(['mutter'])
    expect(auswerten({ ...basis, eltern: [el('a', 'U', true)] })).toMatchObject({ erfuellt: 5, anwendbar: 6, fehlend: ['elternteil'] })
    expect(fehlend({ ...basis, eltern: [el('a', 'U', false)] })).toEqual(['elternteil', 'elternteil'])
    // Überzähliger Elternteil belegt, Vater unbelegt → Vater fehlt (der Überzählige zählt nicht).
    expect(fehlend({ ...basis, eltern: [el('a', 'M', false), el('b', 'F', true), el('c', 'M', true)] })).toEqual(['vater'])
    // Doppelkante (biologisch unbelegt, adoptiv belegt) → eine genügt, in jeder Reihenfolge.
    expect(fehlend({ ...basis, eltern: [el('a', 'M', false), el('a', 'M', true), el('b', 'F', true)] })).toEqual([])
    expect(fehlend({ ...basis, eltern: [el('a', 'M', true), el('a', 'M', false), el('b', 'F', true)] })).toEqual([])
    // Platzhalter-Elternteil: die Eingabe kennt kein Platzhalterflag — er zählt wie jeder andere (E6).
    expect(fehlend({ ...basis, eltern: [el('a', 'M', true), el('p', null, true)] })).toEqual([])
    expect(fehlend({ ...basis, eltern: [] })).toEqual(['vater', 'mutter'])
  })

  it('K10: Prozent abgerundet', () => {
    const faelle: readonly [Partial<KernangabenEingabe>, number][] = [
      [{ geschlecht: 'M' }, 16],
      [{ ...VOLL, hauptformBelegt: false }, 83],
      [{ ...VOLL, lebendStatus: 'verstorben', todesdatum: [BELEGT], eltern: [] }, 62],
      [{ ...VOLL, lebendStatus: 'verstorben', todesdatum: [BELEGT], todesort: [ORT_BELEGT], hauptformBelegt: false }, 87],
      [{ ...VOLL, lebendStatus: 'verstorben', todesdatum: [BELEGT], todesort: [ORT_BELEGT] }, 100],
    ]
    for (const [teil, prozent] of faelle) expect(auswerten(teil)?.prozent).toBe(prozent)
  })

  it('K11: fehlend in fester Reihenfolge, unabhängig von der Eingabereihenfolge der Eltern', () => {
    expect(fehlend({ lebendStatus: 'verstorben', geschlecht: 'M', eltern: [el('b', 'F', false), el('a', 'M', true)] })).toEqual(['name', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'mutter'])
  })

  it('K12: die Eingabe bleibt unverändert', () => {
    const tief = <T>(wert: T): T => {
      if (typeof wert === 'object' && wert !== null) {
        for (const kind of Object.values(wert)) tief(kind)
        Object.freeze(wert)
      }
      return wert
    }
    const e = tief(eingabe({ ...VOLL, lebendStatus: 'verstorben', todEreignisse: [{ ortVorhanden: true, ortBelegt: true }], eltern: [el('b', 'F', true), el('a', 'M', false), el('a', 'M', true)] }))
    const vorher = JSON.stringify(e)
    expect(() => kernangabenAuswerten(e)).not.toThrow()
    expect(JSON.stringify(e)).toBe(vorher)
  })
})
