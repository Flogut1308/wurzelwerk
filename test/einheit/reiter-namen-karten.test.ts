// AP-1.30 PR 11c-1 (A-02, A-19, C-26; docs/80 §33 V-130-11-E3, E6, E10): reine Logik der Karten im Reiter
// „Namen". Rot zuerst (CLAUDE.md §5): vor PR 11c-1 gibt es `kartenFolge`, `teileInAnzeigefolge`,
// `istUmschrift`, `sortiertUnter` und `gueltigkeitJahre` nicht.
//
// - Kartenfolge E10: Hauptname zuerst, dann Sprache (Code binär, NULL zuletzt), dann `sortier_index`
//   (NULL zuletzt), dann `id` — unabhängig von der Eingabefolge.
// - Anzeigefolge der Teile: die Wortfolge des Kerns (`anzeigeArtFolge`), bei `nachname_zuerst` umgestellt;
//   innerhalb einer Art nach `sortier_index`, dann `id`. Die Teile des Lesemodells kommen in fester
//   Art-Folge (V-130-10-4), nicht in Anzeigefolge.
import { describe, expect, it } from 'vitest'
import { anzeigetextVon } from '../../src/core/name/anzeigename'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'
import {
  anzeigeFormAus,
  gueltigkeitJahre,
  istUmschrift,
  kartenFolge,
  sortiertUnter,
  teileInAnzeigefolge,
} from '../../src/renderer/ansichten/profil/reiter-namen-logik'

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

const ids = (namen: readonly PersonDetailName[]): readonly string[] => namen.map((name) => name.id)

describe('kartenFolge (V-130-11-E10)', () => {
  it('Hauptname zuerst, auch wenn seine Sprache später sortierte', () => {
    const haupt = form('z', { ist_bevorzugt: true, sprache: 'ru' })
    const de = form('a', { sprache: 'de' })
    expect(ids(kartenFolge([de, haupt]))).toEqual(['z', 'a'])
  })

  it('dann Sprache nach Code binär (Großbuchstaben vor Kleinbuchstaben), NULL zuletzt', () => {
    const haupt = form('h', { ist_bevorzugt: true })
    const namen = [form('n1'), form('ru', { sprache: 'ru' }), form('de', { sprache: 'de' }), form('Uk', { sprache: 'Uk' }), haupt]
    expect(ids(kartenFolge(namen))).toEqual(['h', 'Uk', 'de', 'ru', 'n1'])
  })

  it('bei gleicher Sprache nach sortier_index (NULL zuletzt), dann nach id', () => {
    const namen = [
      form('d', { sprache: 'de', sortier_index: null }),
      form('c', { sprache: 'de', sortier_index: 2 }),
      form('b', { sprache: 'de', sortier_index: 1 }),
      form('a', { sprache: 'de', sortier_index: null }),
      form('e', { sprache: 'de', sortier_index: 1 }),
    ]
    expect(ids(kartenFolge(namen))).toEqual(['b', 'e', 'c', 'a', 'd'])
  })

  it('unabhängig von der Eingabefolge und ohne die Eingabe zu verändern', () => {
    const namen = [form('x', { sprache: 'os' }), form('y', { ist_bevorzugt: true, sprache: 'de' }), form('w', { sprache: null }), form('v', { sprache: 'os', sortier_index: 0 })]
    const kopie = [...namen]
    const erwartet = ['y', 'v', 'x', 'w']
    expect(ids(kartenFolge(namen))).toEqual(erwartet)
    expect(ids(kartenFolge([...namen].reverse()))).toEqual(erwartet)
    expect(namen).toEqual(kopie)
  })
})

describe('teileInAnzeigefolge (V-130-11-E3, Wortfolge aus dem Kern)', () => {
  // Lesemodell-Folge: Titel, Vorname, Vatersname, Präfix, Nachname, Suffix (V-130-10-4).
  const TEILE = [
    teil('t', 'titel', 'Dr.'),
    teil('v2', 'vorname', 'Karl', 1, true),
    teil('v1', 'vorname', 'Iwan', 0),
    teil('p', 'vatersname', 'Petrowitsch'),
    teil('pr', 'praefix', 'von'),
    teil('n', 'nachname', 'Iwanow'),
    teil('s', 'suffix', 'Jr.'),
  ]

  it('NULL/vorname_zuerst: Titel, Vornamen, Vatersname, Präfix, Nachname, Suffix — Vornamen nach sortier_index', () => {
    for (const reihenfolge of [null, 'vorname_zuerst'] as const) {
      expect(teileInAnzeigefolge(form('f', { reihenfolge, teile: TEILE })).map((eintrag) => eintrag.id)).toEqual(['t', 'v1', 'v2', 'p', 'pr', 'n', 's'])
    }
  })

  it('nachname_zuerst: Titel, Präfix, Nachname, Vornamen, Vatersname, Suffix', () => {
    expect(teileInAnzeigefolge(form('f', { reihenfolge: 'nachname_zuerst', teile: TEILE })).map((eintrag) => eintrag.id)).toEqual(['t', 'pr', 'n', 'v1', 'v2', 'p', 's'])
  })

  it('gleiche Folge wie der Anzeigetext (ossetisch: „Гуытнаты Карл")', () => {
    const os = form('os', { reihenfolge: 'nachname_zuerst', teile: [teil('a', 'vorname', 'Карл'), teil('b', 'nachname', 'Гуытнаты')] })
    const werte = teileInAnzeigefolge(os).map((eintrag) => eintrag.wert)
    expect(werte).toEqual(['Гуытнаты', 'Карл'])
    expect(werte.join(' ')).toBe(anzeigetextVon(anzeigeFormAus(os)))
  })

  it('gleicher sortier_index innerhalb einer Art: nach id', () => {
    const namen = form('f', { teile: [teil('n2', 'nachname', 'B'), teil('n1', 'nachname', 'A')] })
    expect(teileInAnzeigefolge(namen).map((eintrag) => eintrag.id)).toEqual(['n1', 'n2'])
  })
})

describe('istUmschrift, sortiertUnter, gueltigkeitJahre', () => {
  it('eine Form ohne Rolle ist eine Umschrift (0006: rolle IS NULL), auch ohne Ursprung', () => {
    expect(istUmschrift(form('u', { rolle: null, umschrift_von: 'h' }))).toBe(true)
    expect(istUmschrift(form('u', { rolle: null, umschrift_von: null }))).toBe(true)
    expect(istUmschrift(form('g'))).toBe(false)
  })

  it('„Sortiert unter" kommt aus dem Kern (Präfix zählt nicht)', () => {
    const f = form('f', { teile: [teil('a', 'vorname', 'Karl'), teil('b', 'praefix', 'von'), teil('c', 'nachname', 'Gutnoff')] })
    expect(sortiertUnter(f)).toBe('Gutnoff, Karl')
  })

  it('Gültigkeit: JDN → gregorianisches Jahr, offene Grenzen bleiben offen', () => {
    // JDN 2431822 = 1. 1. 1946, 2440588 = 1. 1. 1970 (gregorianisch).
    expect(gueltigkeitJahre(form('f', { gueltig_von: 2431822, gueltig_bis: 2440588 }))).toEqual({ von: 1946, bis: 1970 })
    expect(gueltigkeitJahre(form('f', { gueltig_von: 2431822 }))).toEqual({ von: 1946 })
    expect(gueltigkeitJahre(form('f', { gueltig_bis: 2440588 }))).toEqual({ bis: 1970 })
    expect(gueltigkeitJahre(form('f'))).toEqual({})
  })
})
