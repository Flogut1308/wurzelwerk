// AP-1.30 PR 11b (A-02, C-26; docs/80 §33 V-130-11b): reine Logik des Vorschau-Umschalters im Reiter
// „Namen". Rot zuerst (CLAUDE.md §5): vor PR 11b gibt es `reiter-namen-logik.ts` nicht.
//
// Geprüft wird die Abbildung `PersonDetailName` → `AnzeigeForm` (einschließlich `reihenfolge`, hueter
// #197 H4: das Feld ist in `AnzeigeForm` optional, ein Weglassen fiele dem Compiler nicht auf), dass jede
// Stufe der Rückfallkette ihre Herkunft liefert, die Sprachliste und ihre Beschriftung. Der Vergleich mit
// dem Kopf läuft über das echte Lesemodell (`personDetail` gegen eine migrierte `:memory:`-Datenbank):
// ohne Wunschsprache muss die Vorschau exakt `kopf.anzeigename` zeigen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { personDetail } from '../../src/main/abfragen/person-detail'
import { fuehreAus } from '../../src/main/befehle/bus'
import profilRessourcen from '../../src/shared/i18n/de/profil.json'
import type { NamensformUebernehmenKopf, NamensformUebernehmenTeil } from '../../src/shared/schemata/befehle'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'
import {
  OBERFLAECHENSPRACHE,
  VORSCHAU_SPRACHE_SCHLUESSEL,
  anzeigeFormAus,
  herkunftSchluessel,
  vorschauFuer,
  vorschauSpracheBeschriftung,
  vorschauSprachen,
} from '../../src/renderer/ansichten/profil/reiter-namen-logik'
import { neuePerson, neueTestDatenbank, uhrStarten, type Db } from './_hilfen-namensteil'

function teil(id: string, art: PersonDetailNamensteil['art'], wert: string, sortierIndex = 0, istRufname = false): PersonDetailNamensteil {
  return { id, art, wert, ist_rufname: istRufname, sortier_index: sortierIndex, feminine_variante: null }
}

function form(id: string, ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
  return {
    id,
    ist_bevorzugt: false,
    typ: 'geburtsname',
    schrift: null,
    vornamen: null,
    nachname: null,
    praefix: null,
    titel_vor: null,
    zusatz_nach: null,
    vatersname: null,
    rufname_text: null,
    rufname_index: null,
    umschrift_von: null,
    umschrift_norm: null,
    sprache: null,
    gueltig_von: null,
    gueltig_bis: null,
    original_text: null,
    rolle: 'geburtsname',
    rollen_notiz: null,
    reihenfolge: null,
    konfidenz: null,
    sortier_index: null,
    teile: [],
    ...ueberschreibung,
  }
}

/** Karl Friedrich Gutnoff (Hauptname, de) · Карл Гутнов (ru) · Гуытнаты Карл (os, nachname_zuerst). */
const HAUPT = form('f1', {
  ist_bevorzugt: true,
  sprache: 'de',
  schrift: 'latn',
  teile: [teil('t1', 'vorname', 'Karl', 0), teil('t2', 'vorname', 'Friedrich', 1, true), teil('t3', 'nachname', 'Gutnoff')],
})
const RUSSISCH = form('f2', { sprache: 'ru', schrift: 'cyrl', rolle: 'sonstiges', teile: [teil('t4', 'vorname', 'Карл'), teil('t5', 'nachname', 'Гутнов')] })
const OSSETISCH = form('f3', {
  sprache: 'os',
  schrift: 'cyrl',
  rolle: 'sonstiges',
  reihenfolge: 'nachname_zuerst',
  teile: [teil('t6', 'vorname', 'Карл'), teil('t7', 'nachname', 'Гуытнаты')],
})

describe('anzeigeFormAus (AP-1.30 PR 11b)', () => {
  it('bildet alle Felder ab, die `anzeigenameFuer` liest — `reihenfolge` ausdrücklich', () => {
    expect(anzeigeFormAus(OSSETISCH)).toEqual({
      formId: 'f3',
      sprache: 'os',
      schrift: 'cyrl',
      istBevorzugt: false,
      umschriftVon: null,
      originalText: null,
      reihenfolge: 'nachname_zuerst',
      teile: [
        { art: 'vorname', wert: 'Карл', istRufname: false, sortierIndex: 0 },
        { art: 'nachname', wert: 'Гуытнаты', istRufname: false, sortierIndex: 0 },
      ],
    })
    // `null` wird als `null` durchgereicht, nicht weggelassen.
    expect(anzeigeFormAus(HAUPT)).toHaveProperty('reihenfolge', null)
  })

  it('reicht `nachname_zuerst` bis in den Anzeigetext durch (Abnahme 2a: „Гуытнаты Карл")', () => {
    expect(vorschauFuer([HAUPT, OSSETISCH], 'os')).toEqual({ text: 'Гуытнаты Карл', quelle: 'sprache', formId: 'f3' })
  })
})

describe('vorschauFuer — jede Stufe der Rückfallkette liefert ihre Herkunft', () => {
  it('Stufe Sprache: eine Form der gewählten Sprache', () => {
    expect(vorschauFuer([HAUPT, RUSSISCH, OSSETISCH], 'ru')).toEqual({ text: 'Карл Гутнов', quelle: 'sprache', formId: 'f2' })
  })

  it('Stufe Umschrift: die Umschrift der Hauptform, wenn die Sprache keine Form hat', () => {
    const hauptOs = form('h1', { ist_bevorzugt: true, sprache: 'os', reihenfolge: 'nachname_zuerst', teile: [teil('a', 'vorname', 'Карл'), teil('b', 'nachname', 'Гуытнаты')] })
    const umschrift = form('h2', { rolle: null, umschrift_von: 'h1', schrift: 'latn', teile: [teil('c', 'vorname', 'Karl'), teil('d', 'nachname', 'Gwytnaty')] })
    expect(vorschauFuer([hauptOs, umschrift], 'ru')).toEqual({ text: 'Karl Gwytnaty', quelle: 'umschrift', formId: 'h2' })
    // Die Oberflächensprache fragt nach keiner Sprachform (V-4-wunschsprache) — also dieselbe Stufe.
    expect(vorschauFuer([hauptOs, umschrift], OBERFLAECHENSPRACHE)).toEqual({ text: 'Karl Gwytnaty', quelle: 'umschrift', formId: 'h2' })
  })

  it('Stufe Hauptname: ohne Sprachform und ohne Umschrift', () => {
    expect(vorschauFuer([HAUPT, RUSSISCH], 'os')).toEqual({ text: 'Karl Friedrich Gutnoff', quelle: 'hauptname', formId: 'f1' })
  })

  it('Oberflächensprache = ohne Wunschsprache: eine de-Form verdrängt den Hauptnamen nicht (V-4-wunschsprache)', () => {
    const haupt = form('g1', { ist_bevorzugt: true, sprache: 'ru', teile: [teil('a', 'vorname', 'Карл')] })
    const ehename = form('g2', { sprache: 'de', rolle: 'ehename', teile: [teil('b', 'vorname', 'Karl')] })
    expect(vorschauFuer([haupt, ehename], OBERFLAECHENSPRACHE)).toEqual({ text: 'Карл', quelle: 'hauptname', formId: 'g1' })
  })

  it('ohne Formen: null', () => {
    expect(vorschauFuer([], OBERFLAECHENSPRACHE)).toBeNull()
  })
})

describe('vorschauSprachen', () => {
  it('Oberflächensprache zuerst, danach die Sprachen der Formen nach Code (binär), ohne Doppel und ohne null', () => {
    const ohneSprache = form('x', { sprache: null })
    const zweitesRu = form('y', { sprache: 'ru' })
    expect(vorschauSprachen([RUSSISCH, OSSETISCH, HAUPT, ohneSprache, zweitesRu])).toEqual(['de', 'os', 'ru'])
  })

  it('unabhängig von der Reihenfolge der Formen', () => {
    const formen = [RUSSISCH, form('e', { sprache: 'en' }), OSSETISCH, form('u', { sprache: 'Uk' }), HAUPT]
    const erwartet = vorschauSprachen(formen)
    expect(erwartet).toEqual(['de', 'Uk', 'en', 'os', 'ru'])
    expect(vorschauSprachen([...formen].reverse())).toEqual(erwartet)
  })

  it('ohne Formen: nur die Oberflächensprache', () => {
    expect(vorschauSprachen([])).toEqual([OBERFLAECHENSPRACHE])
  })
})

describe('Beschriftungen aus i18n', () => {
  const t = (schluessel: string): string => {
    const wert: unknown = Reflect.get(profilRessourcen, schluessel)
    if (typeof wert !== 'string') throw new Error(`Schlüssel fehlt: ${schluessel}`)
    return wert
  }

  it('Sprachen mit Schlüssel tragen ihr Endonym, andere den Sprachcode', () => {
    expect(vorschauSpracheBeschriftung('de', t)).toBe('Deutsch')
    expect(vorschauSpracheBeschriftung('ru', t)).toBe('Русский')
    expect(vorschauSpracheBeschriftung('os', t)).toBe('Ирон')
    expect(vorschauSpracheBeschriftung('en', t)).toBe('English')
    expect(vorschauSpracheBeschriftung('pl', t)).toBe('pl')
  })

  it('jeder Schlüssel der Sprachtabelle steht in profil.json', () => {
    for (const schluessel of Object.values(VORSCHAU_SPRACHE_SCHLUESSEL)) {
      expect(profilRessourcen, schluessel).toHaveProperty(schluessel)
    }
  })

  it('jede Herkunft hat einen eigenen Schlüssel in profil.json', () => {
    const schluessel = (['sprache', 'umschrift', 'hauptname'] as const).map(herkunftSchluessel)
    expect(new Set(schluessel).size).toBe(3)
    for (const eintrag of schluessel) expect(profilRessourcen, eintrag).toHaveProperty(eintrag)
  })
})

describe('Vorschau ohne Wunschsprache = Kopf des Lesemodells (echte Datenbank)', () => {
  let db: Db

  beforeEach(() => {
    uhrStarten()
    db = neueTestDatenbank()
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  function formMitTeilen(personId: string, kopf: NamensformUebernehmenKopf, teile: readonly Pick<NamensformUebernehmenTeil, 'art' | 'wert'>[]): string {
    return fuehreAus(db, 'namensform.uebernehmen', {
      personId,
      formId: null,
      kopf,
      teile: teile.map((eintrag) => ({ ...eintrag, istRufname: false })),
    }).id
  }

  function vergleiche(personId: string): void {
    const detail = personDetail(db, { personId })
    expect(vorschauFuer(detail.namen, OBERFLAECHENSPRACHE)?.text ?? '').toBe(detail.kopf.anzeigename)
  }

  it('Hauptname, Sprachformen, Umschrift der Hauptform und nachname_zuerst', () => {
    const personId = neuePerson(db)
    const haupt = formMitTeilen(personId, { rolle: 'geburtsname', sprache: 'os', schrift: 'cyrl', reihenfolge: 'nachname_zuerst' }, [
      { art: 'vorname', wert: 'Карл' },
      { art: 'nachname', wert: 'Гуытнаты' },
    ])
    vergleiche(personId)
    expect(personDetail(db, { personId }).kopf.anzeigename).toBe('Гуытнаты Карл')

    formMitTeilen(personId, { rolle: 'sonstiges', sprache: 'de', schrift: 'latn' }, [
      { art: 'vorname', wert: 'Karl' },
      { art: 'nachname', wert: 'Gutnoff' },
    ])
    vergleiche(personId)

    formMitTeilen(personId, { rolle: null, umschriftVon: haupt, schrift: 'latn' }, [
      { art: 'vorname', wert: 'Karl' },
      { art: 'nachname', wert: 'Gwytnaty' },
    ])
    vergleiche(personId)
    expect(vorschauFuer(personDetail(db, { personId }).namen, OBERFLAECHENSPRACHE)).toMatchObject({ text: 'Karl Gwytnaty', quelle: 'umschrift' })
    // Die de-Form verdrängt in der Oberflächensprache weder Umschrift noch Hauptname (V-4-wunschsprache);
    // eine andere Sprache fragt nach ihrer Form.
    expect(vorschauFuer(personDetail(db, { personId }).namen, 'os')).toMatchObject({ text: 'Гуытнаты Карл', quelle: 'sprache' })
  })

  it('Altbestand über name.anlegen (flache Brücke) und eine Person ohne Namen', () => {
    const personId = neuePerson(db)
    fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Gutnoff', praefix: 'von' })
    vergleiche(personId)
    vergleiche(neuePerson(db))
  })
})
