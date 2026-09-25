// AP-1.34 PR-D (ADR-031, §31 U-1.34-E7, U-1.34-D1…D11): Kernangaben und Vollständigkeitsgrad im Kern.
// Vorarbeiten AP-1.30, PR 2 (Nachtrag ADR-031, §32): Name nach Vorhandensein (D1 neu), Ereignis-
// Rückfall für Geburt/Tod auch ohne Beleg (D9 neu), Aufschlüsselung je Angabe (D3).
import { describe, expect, it } from 'vitest'
import { kernangabenAuswerten, type KernAussage, type KernEreignis, type KernOrtAussage, type KernangabenEingabe, type KernElternteil } from '../../src/core/person/kernangaben'

const BELEGT: KernAussage = { hatWert: true, belegt: true }
const UNBELEGT: KernAussage = { hatWert: true, belegt: false }
const OHNE_WERT: KernAussage = { hatWert: false, belegt: true }
const ORT_BELEGT: KernOrtAussage = { wertRefId: null, wertText: 'Irgendwo', belegt: true }
const ORT_UNBELEGT: KernOrtAussage = { wertRefId: null, wertText: 'Irgendwo', belegt: false }
// Weder Verweis noch Text (z. B. nur wert_zahl): trägt keinen Ort (traegtOrt, hueter #123 H1).
const ORT_OHNE: KernOrtAussage = { wertRefId: null, wertText: null, belegt: true }

/** Ein Rückfall-Ereignis (Geburt/Tod); Standard: Datum und Ort vorhanden, nichts belegt. */
function ereignis(teil: Partial<KernEreignis> = {}): KernEreignis {
  return { datumVorhanden: true, ortVorhanden: true, datumBelegt: false, ortBelegt: false, ...teil }
}

function eingabe(teil: Partial<KernangabenEingabe> = {}): KernangabenEingabe {
  return {
    istPlatzhalter: false,
    lebendStatus: 'lebend',
    geschlecht: null,
    nameVorhanden: false,
    hauptformBelegt: false,
    geburtsdatum: [],
    geburtsort: [],
    todesdatum: [],
    todesort: [],
    geburtEreignisse: [],
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

/** Zustand der ERSTEN Angabe mit dieser Id in der Aufschlüsselung. */
function zustand(teil: Partial<KernangabenEingabe>, id: string): string {
  return auswerten(teil)?.aufschluesselung.find((a) => a.id === id)?.zustand ?? '<keine>'
}

/** Voll belegte Person (ohne Todesangaben) — Grundlage, um EINE Angabe gezielt wegzunehmen. */
const VOLL: Partial<KernangabenEingabe> = {
  geschlecht: 'M',
  nameVorhanden: true,
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
    const ids = ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'vater', 'mutter'] as const
    expect(auswerten({})).toEqual({ erfuellt: 0, anwendbar: 6, prozent: 0, fehlend: ids, aufschluesselung: ids.map((id) => ({ id, zustand: 'fehlt' })) })
  })

  it('K3: Lebensstatus — nur verstorben hat 8 Angaben, auch mit Todesaussagen bleiben es sonst 6', () => {
    const tod: Partial<KernangabenEingabe> = { todesdatum: [BELEGT], todesort: [ORT_BELEGT] }
    expect(auswerten({ ...VOLL, ...tod, lebendStatus: 'verstorben' })).toMatchObject({ erfuellt: 8, anwendbar: 8, prozent: 100 })
    for (const lebendStatus of ['lebend', 'vermutet_verstorben', null] as const) {
      expect(auswerten({ ...VOLL, ...tod, lebendStatus })).toEqual({
        erfuellt: 6,
        anwendbar: 6,
        prozent: 100,
        fehlend: [],
        aufschluesselung: [
          { id: 'name', zustand: 'belegt' },
          { id: 'geschlecht', zustand: 'vorhanden' },
          { id: 'geburtsdatum', zustand: 'belegt' },
          { id: 'geburtsort', zustand: 'belegt' },
          { id: 'vater', zustand: 'belegt' },
          { id: 'mutter', zustand: 'belegt' },
        ],
      })
    }
    expect(auswerten({ lebendStatus: 'verstorben' })?.fehlend).toEqual(['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'vater', 'mutter'])
  })

  it('K4: Geschlecht — M/F/X zählen, U und nicht erfasst nicht', () => {
    for (const geschlecht of ['M', 'F', 'X'] as const) expect(fehlend({ ...VOLL, geschlecht })).toEqual([])
    for (const geschlecht of ['U', null] as const) expect(fehlend({ ...VOLL, geschlecht })).toEqual(['geschlecht'])
  })

  it('K5: Name zählt, sobald er vorhanden ist (D1 neu); „belegt" nur mit Beleg an der Hauptform (D3)', () => {
    expect(fehlend({ ...VOLL, hauptformBelegt: false })).toEqual([])
    expect(zustand({ ...VOLL, hauptformBelegt: false }, 'name')).toBe('vorhanden')
    expect(zustand({ ...VOLL, hauptformBelegt: true }, 'name')).toBe('belegt')
    // Ohne Anzeigetext der Hauptform ist kein Name da — auch ein Beleg an ihr ändert das nicht.
    expect(fehlend({ ...VOLL, nameVorhanden: false, hauptformBelegt: true })).toEqual(['name'])
    expect(zustand({ ...VOLL, nameVorhanden: false, hauptformBelegt: true }, 'name')).toBe('fehlt')
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
    const ortBelegt = [ereignis({ ortBelegt: true })]
    expect(fehlend({ ...tot, todesort: [ORT_BELEGT] })).toEqual([])
    // Nur wert_zahl (ORT_OHNE) belegt, kein Ereignis: kein Ort, nicht erfüllt (hueter #123 H1, wie sterbeortAufloesen).
    expect(fehlend({ ...tot, todesort: [ORT_OHNE] })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todesort: [ORT_UNBELEGT], todEreignisse: ortBelegt })).toEqual(['todesort'])
    expect(fehlend({ ...tot, todesort: [], todEreignisse: ortBelegt })).toEqual([])
    // Eine Aussage ohne Wert trägt keinen Ort und verdrängt den Rückfall nicht (wie sterbeortAufloesen).
    expect(fehlend({ ...tot, todesort: [ORT_OHNE], todEreignisse: ortBelegt })).toEqual([])
    expect(fehlend({ ...tot, todEreignisse: [ereignis({ ortVorhanden: false, ortBelegt: true })] })).toEqual(['todesort'])
    // D9 neu: der Ereignisort zählt auch ohne Beleg — Zustand `vorhanden` statt `belegt`.
    expect(fehlend({ ...tot, todEreignisse: [ereignis()] })).toEqual([])
    expect(zustand({ ...tot, todEreignisse: [ereignis()] }, 'todesort')).toBe('vorhanden')
    expect(zustand({ ...tot, todEreignisse: [ereignis(), ereignis({ ortBelegt: true })] }, 'todesort')).toBe('belegt')
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
      [{ ...VOLL, nameVorhanden: false }, 83],
      [{ ...VOLL, lebendStatus: 'verstorben', todesdatum: [BELEGT], eltern: [] }, 62],
      [{ ...VOLL, lebendStatus: 'verstorben', todesdatum: [BELEGT], todesort: [ORT_BELEGT], nameVorhanden: false }, 87],
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
    const e = tief(eingabe({ ...VOLL, lebendStatus: 'verstorben', geburtEreignisse: [ereignis()], todEreignisse: [ereignis({ ortBelegt: true })], eltern: [el('b', 'F', true), el('a', 'M', false), el('a', 'M', true)] }))
    const vorher = JSON.stringify(e)
    expect(() => kernangabenAuswerten(e)).not.toThrow()
    expect(JSON.stringify(e)).toBe(vorher)
  })

  it('K13: D9 neu — ohne Aussage zählt das Geburts-/Tod-Ereignis für Datum und Ort, auch ohne Beleg', () => {
    const ohneGeburt = { ...VOLL, geburtsdatum: [], geburtsort: [] }
    expect(fehlend(ohneGeburt)).toEqual(['geburtsdatum', 'geburtsort'])
    expect(fehlend({ ...ohneGeburt, geburtEreignisse: [ereignis()] })).toEqual([])
    expect(zustand({ ...ohneGeburt, geburtEreignisse: [ereignis()] }, 'geburtsdatum')).toBe('vorhanden')
    expect(zustand({ ...ohneGeburt, geburtEreignisse: [ereignis({ datumBelegt: true })] }, 'geburtsdatum')).toBe('belegt')
    expect(zustand({ ...ohneGeburt, geburtEreignisse: [ereignis({ ortBelegt: true })] }, 'geburtsort')).toBe('belegt')
    // Ein Ereignis ohne Datum bzw. ohne Ort trägt diese Angabe nicht.
    expect(fehlend({ ...ohneGeburt, geburtEreignisse: [ereignis({ datumVorhanden: false })] })).toEqual(['geburtsdatum'])
    expect(fehlend({ ...ohneGeburt, geburtEreignisse: [ereignis({ ortVorhanden: false })] })).toEqual(['geburtsort'])
    // Ein Tod-Ereignis ist kein Geburts-Rückfall und umgekehrt.
    expect(fehlend({ ...ohneGeburt, todEreignisse: [ereignis()] })).toEqual(['geburtsdatum', 'geburtsort'])
    const tot = { ...VOLL, lebendStatus: 'verstorben' as const }
    expect(fehlend(tot)).toEqual(['todesdatum', 'todesort'])
    expect(fehlend({ ...tot, todEreignisse: [ereignis()] })).toEqual([])
    expect(fehlend({ ...tot, geburtEreignisse: [ereignis()] })).toEqual(['todesdatum', 'todesort'])
  })

  it('K14: die Aussage führt — gibt es eine Aussage mit Wert, entscheidet allein sie (V-D9-aussage-fuehrt)', () => {
    const ohneGeburt = { ...VOLL, geburtsdatum: [UNBELEGT], geburtsort: [ORT_UNBELEGT] }
    expect(fehlend({ ...ohneGeburt, geburtEreignisse: [ereignis({ datumBelegt: true, ortBelegt: true })] })).toEqual(['geburtsdatum', 'geburtsort'])
    expect(zustand({ ...ohneGeburt, geburtEreignisse: [ereignis()] }, 'geburtsdatum')).toBe('unbelegt')
    expect(zustand({ ...ohneGeburt, geburtEreignisse: [ereignis()] }, 'geburtsort')).toBe('unbelegt')
    // Eine Aussage ohne Wert bzw. ohne Ort verdrängt das Ereignis nicht.
    expect(fehlend({ ...VOLL, geburtsdatum: [OHNE_WERT], geburtsort: [ORT_OHNE], geburtEreignisse: [ereignis()] })).toEqual([])
  })

  it('K15: Datum und Ort werden je Angabe getrennt aufgelöst (V-D9-getrennt)', () => {
    const k = auswerten({ ...VOLL, geburtsdatum: [BELEGT], geburtsort: [], geburtEreignisse: [ereignis({ datumVorhanden: false })] })
    expect(k?.fehlend).toEqual([])
    expect(k?.aufschluesselung.filter((a) => a.id === 'geburtsdatum' || a.id === 'geburtsort')).toEqual([
      { id: 'geburtsdatum', zustand: 'belegt' },
      { id: 'geburtsort', zustand: 'vorhanden' },
    ])
  })

  it('K16: Aufschlüsselung — Geschlecht nur vorhanden, Eltern belegt/unbelegt/fehlt, zweiter elternteil fehlt', () => {
    expect(zustand({ ...VOLL, geschlecht: 'F' }, 'geschlecht')).toBe('vorhanden')
    expect(zustand({ ...VOLL, geschlecht: 'U' }, 'geschlecht')).toBe('fehlt')
    const k = auswerten({ ...VOLL, eltern: [el('a', 'M', true), el('b', 'F', false)] })
    expect(k?.aufschluesselung.slice(-2)).toEqual([
      { id: 'vater', zustand: 'belegt' },
      { id: 'mutter', zustand: 'unbelegt' },
    ])
    expect(auswerten({ ...VOLL, eltern: [el('a', 'U', false)] })?.aufschluesselung.slice(-2)).toEqual([
      { id: 'elternteil', zustand: 'unbelegt' },
      { id: 'elternteil', zustand: 'fehlt' },
    ])
    expect(auswerten({ ...VOLL, eltern: [] })?.aufschluesselung.slice(-2)).toEqual([
      { id: 'vater', zustand: 'fehlt' },
      { id: 'mutter', zustand: 'fehlt' },
    ])
  })

  it('K17: Aufschlüsselung und fehlend stimmen überein — fehlend = unbelegt + fehlt in derselben Reihenfolge', () => {
    const k = auswerten({ lebendStatus: 'verstorben', geschlecht: 'X', nameVorhanden: true, geburtsdatum: [UNBELEGT], todEreignisse: [ereignis({ ortBelegt: true })], eltern: [el('a', 'M', false)] })
    expect(k?.aufschluesselung).toEqual([
      { id: 'name', zustand: 'vorhanden' },
      { id: 'geschlecht', zustand: 'vorhanden' },
      { id: 'geburtsdatum', zustand: 'unbelegt' },
      { id: 'geburtsort', zustand: 'fehlt' },
      { id: 'todesdatum', zustand: 'vorhanden' },
      { id: 'todesort', zustand: 'belegt' },
      { id: 'vater', zustand: 'unbelegt' },
      { id: 'mutter', zustand: 'fehlt' },
    ])
    expect(k).toMatchObject({ erfuellt: 4, anwendbar: 8, prozent: 50, fehlend: ['geburtsdatum', 'geburtsort', 'vater', 'mutter'] })
  })
})
