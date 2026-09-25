// AP-1.34 PR-C2c (Vorgaben §5.5, docs/80_Offene_Fragen.md §31 U-1.34-C2-O2…O5, E6/E7/E8):
// Regelwerk offene Punkte und Elternplätze — reine Kernfunktionen.
import { describe, expect, it } from 'vitest'
import { elternPlaetze, type ElternteilEintrag } from '../../src/core/person/eltern-plaetze'
import {
  OFFENE_PUNKTE_REGELN,
  OFFENE_PUNKTE_REGEL_IDS,
  offenePunkteAuswerten,
  regelAktiv,
  type OffenePunkteEingabe,
  type OffenerPunkt,
} from '../../src/core/person/offene-punkte'

const P = 'p-0000'

/** Eine Person ohne jeden offenen Punkt: lebend, Vater und Mutter, keine Kinder, kein Widerspruch. */
function eingabe(teil: Partial<OffenePunkteEingabe> = {}): OffenePunkteEingabe {
  return {
    personId: P,
    istPlatzhalter: false,
    lebendStatus: 'lebend',
    hatSterbeort: false,
    eltern: [
      { id: 'e-v', geschlecht: 'M' },
      { id: 'e-m', geschlecht: 'F' },
    ],
    hatPortraet: false,
    kinder: [],
    partnerIds: [],
    widerspruchPraedikate: [],
    feldwarnungen: [],
    ...teil,
  }
}

function regelIds(punkte: readonly OffenerPunkt[]): readonly string[] {
  return punkte.map((p) => p.regelId)
}

describe('Regelwerk offene Punkte (AP-1.34 PR-C2c)', () => {
  it('R0: genau fünf Regeln mit eindeutigen IDs in Tabellenreihenfolge; kein_portraet inaktiv', () => {
    const ids = OFFENE_PUNKTE_REGELN.map((r) => r.id)
    expect(ids).toEqual([...OFFENE_PUNKTE_REGEL_IDS])
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect(OFFENE_PUNKTE_REGELN.filter((r) => !r.aktiv).map((r) => r.id)).toEqual(['kein_portraet'])
    const portraet = OFFENE_PUNKTE_REGELN.find((r) => r.id === 'kein_portraet')
    expect(portraet).toMatchObject({ reiter: 'belege_medien', feld: 'portraet', meldungsschluessel: 'offener_punkt_kein_portraet' })
    // Die Regel selbst meldet (gebaut), wird aber nicht ausgewertet.
    expect(portraet?.pruefe(eingabe({ hatPortraet: false }))).toEqual([{ bezugId: null }])
    expect(portraet?.pruefe(eingabe({ hatPortraet: true }))).toEqual([])
    expect(offenePunkteAuswerten(eingabe({ hatPortraet: false }))).toEqual([])
  })

  it('R1: sterbeort_fehlt nur bei verstorben ohne Sterbeort', () => {
    expect(offenePunkteAuswerten(eingabe({ lebendStatus: 'verstorben' }))).toEqual([
      { regelId: 'sterbeort_fehlt', reiter: 'person', feld: 'todesort', meldungsschluessel: 'offener_punkt_sterbeort_fehlt', bezugId: null },
    ])
    expect(offenePunkteAuswerten(eingabe({ lebendStatus: 'verstorben', hatSterbeort: true }))).toEqual([])
    expect(offenePunkteAuswerten(eingabe({ lebendStatus: 'vermutet_verstorben' }))).toEqual([])
    expect(offenePunkteAuswerten(eingabe({ lebendStatus: null }))).toEqual([])
  })

  it('R2: elternteil_nicht_zugeordnet je leerem Platz, Schlüssel je Platz', () => {
    const schluessel = (eltern: readonly ElternteilEintrag[]): readonly string[] => offenePunkteAuswerten(eingabe({ eltern })).map((p) => p.meldungsschluessel)
    expect(schluessel([])).toEqual(['offener_punkt_vater_nicht_zugeordnet', 'offener_punkt_mutter_nicht_zugeordnet'])
    expect(schluessel([{ id: 'a', geschlecht: 'M' }])).toEqual(['offener_punkt_mutter_nicht_zugeordnet'])
    expect(schluessel([{ id: 'a', geschlecht: 'F' }])).toEqual(['offener_punkt_vater_nicht_zugeordnet'])
    expect(schluessel([{ id: 'a', geschlecht: 'U' }])).toEqual(['offener_punkt_elternteil_nicht_zugeordnet'])
    expect(schluessel([{ id: 'a', geschlecht: null }])).toEqual(['offener_punkt_elternteil_nicht_zugeordnet'])
    // Zwei Mütter: die zweite füllt den Vaterplatz → kein Punkt.
    expect(schluessel([{ id: 'a', geschlecht: 'F' }, { id: 'b', geschlecht: 'F' }])).toEqual([])
    expect(schluessel([{ id: 'a', geschlecht: 'M' }, { id: 'b', geschlecht: 'X' }])).toEqual([])
    const punkt = offenePunkteAuswerten(eingabe({ eltern: [] }))[0]
    expect(punkt).toMatchObject({ regelId: 'elternteil_nicht_zugeordnet', reiter: 'beziehungen', feld: 'eltern', bezugId: null })
  })

  it('R3: kind_ohne_partnerschaft streng, ein Punkt je Kind mit bezugId', () => {
    const partnerin = 'q-1'
    const mitPartnerin = { id: 'k-1', istPlatzhalter: false, elternIds: [P, partnerin] }
    const alleinig = { id: 'k-2', istPlatzhalter: false, elternIds: [P] }
    const andereBeziehung = { id: 'k-3', istPlatzhalter: false, elternIds: [P, 'q-2'] }
    const punkte = offenePunkteAuswerten(eingabe({ kinder: [andereBeziehung, mitPartnerin, alleinig], partnerIds: [partnerin] }))
    expect(punkte).toEqual([
      { regelId: 'kind_ohne_partnerschaft', reiter: 'beziehungen', feld: 'kinder', meldungsschluessel: 'offener_punkt_kind_ohne_partnerschaft', bezugId: 'k-2' },
      { regelId: 'kind_ohne_partnerschaft', reiter: 'beziehungen', feld: 'kinder', meldungsschluessel: 'offener_punkt_kind_ohne_partnerschaft', bezugId: 'k-3' },
    ])
    // Knapp nicht: der andere Elternteil ist Partner → kein Punkt.
    expect(offenePunkteAuswerten(eingabe({ kinder: [mitPartnerin], partnerIds: [partnerin] }))).toEqual([])
    // Die Person selbst in partnerIds macht kein Kind zugeordnet.
    expect(regelIds(offenePunkteAuswerten(eingabe({ kinder: [alleinig], partnerIds: [P] })))).toEqual(['kind_ohne_partnerschaft'])
    // Platzhalter-Kind löst nichts aus (A-17).
    expect(offenePunkteAuswerten(eingabe({ kinder: [{ ...alleinig, istPlatzhalter: true }] }))).toEqual([])
  })

  it('R3b: ein doppelt geliefertes Kind ergibt genau einen Punkt (hueter-H2)', () => {
    const kind = { id: 'k-1', istPlatzhalter: false, elternIds: [P] }
    expect(offenePunkteAuswerten(eingabe({ kinder: [kind, { ...kind }, kind] })).map((p) => p.bezugId)).toEqual(['k-1'])
  })

  it('R4: widerspruch_vorhanden je (reiter, feld) aus ungelöstem Widerspruch und Feldwarnung', () => {
    const punkte = offenePunkteAuswerten(
      eingabe({
        // Alle vier Prädikate mit eigenem Sprungziel (hueter-H1) plus zwei „übrige“, bewusst ungeordnet.
        widerspruchPraedikate: ['beruf', 'todesort', 'todesdatum', 'konfession', 'geburtsort', 'geburtsdatum'],
        feldwarnungen: [
          { reiter: 'beziehungen', feld: 'kinder' },
          { reiter: 'person', feld: 'todesdatum' },
          { reiter: 'beziehungen', feld: 'kinder' },
        ],
      }),
    )
    expect(punkte.map((p) => [p.regelId, p.reiter, p.feld, p.meldungsschluessel, p.bezugId])).toEqual([
      ['widerspruch_vorhanden', 'person', 'geburtsdatum', 'offener_punkt_widerspruch_vorhanden', null],
      ['widerspruch_vorhanden', 'person', 'geburtsort', 'offener_punkt_widerspruch_vorhanden', null],
      ['widerspruch_vorhanden', 'person', 'todesdatum', 'offener_punkt_widerspruch_vorhanden', null],
      ['widerspruch_vorhanden', 'person', 'todesort', 'offener_punkt_widerspruch_vorhanden', null],
      ['widerspruch_vorhanden', 'leben', 'angaben', 'offener_punkt_widerspruch_vorhanden', null],
      ['widerspruch_vorhanden', 'beziehungen', 'kinder', 'offener_punkt_widerspruch_vorhanden', null],
    ])
    expect(offenePunkteAuswerten(eingabe({ widerspruchPraedikate: [], feldwarnungen: [] }))).toEqual([])
  })

  it('R5: kein_portraet bleibt auch mit fehlendem Porträt stumm (aktiv:false bis AP-1.31b)', () => {
    expect(regelIds(offenePunkteAuswerten(eingabe({ hatPortraet: false, lebendStatus: 'verstorben' })))).toEqual(['sterbeort_fehlt'])
  })

  it('R5b: kein_portraet als aktive Regelkopie — ohne Titelbild ein Punkt, mit keiner (hueter-H3)', () => {
    const aktiv = OFFENE_PUNKTE_REGELN.map((r) => (r.id === 'kein_portraet' ? { ...r, aktiv: true } : r))
    expect(regelAktiv('kein_portraet')).toBe(false)
    expect(regelAktiv('kein_portraet', aktiv)).toBe(true)
    expect(regelAktiv('sterbeort_fehlt')).toBe(true)
    expect(offenePunkteAuswerten(eingabe({ hatPortraet: false }), aktiv)).toEqual([
      { regelId: 'kein_portraet', reiter: 'belege_medien', feld: 'portraet', meldungsschluessel: 'offener_punkt_kein_portraet', bezugId: null },
    ])
    expect(offenePunkteAuswerten(eingabe({ hatPortraet: true }), aktiv)).toEqual([])
  })

  it('R6: Platzhalterperson bekommt keine offenen Punkte', () => {
    const alles = eingabe({
      istPlatzhalter: true,
      lebendStatus: 'verstorben',
      eltern: [],
      kinder: [{ id: 'k', istPlatzhalter: false, elternIds: [P] }],
      widerspruchPraedikate: ['beruf'],
      feldwarnungen: [{ reiter: 'person', feld: 'todesdatum' }],
    })
    expect(offenePunkteAuswerten(alles)).toEqual([])
    expect(offenePunkteAuswerten({ ...alles, istPlatzhalter: false }).length).toBeGreaterThan(0)
  })

  it('R7: Reihenfolge = Regelreihenfolge, unabhängig von der Eingabereihenfolge', () => {
    const kinder = [
      { id: 'k-b', istPlatzhalter: false, elternIds: [P] },
      { id: 'k-a', istPlatzhalter: false, elternIds: [P] },
    ]
    const a = offenePunkteAuswerten(eingabe({ lebendStatus: 'verstorben', eltern: [], kinder, widerspruchPraedikate: ['beruf', 'geburtsdatum'] }))
    const b = offenePunkteAuswerten(eingabe({ lebendStatus: 'verstorben', eltern: [], kinder: [...kinder].reverse(), widerspruchPraedikate: ['geburtsdatum', 'beruf'] }))
    expect(a).toEqual(b)
    expect(a.map((p) => `${p.regelId}:${p.bezugId ?? p.feld}`)).toEqual([
      'sterbeort_fehlt:todesort',
      'elternteil_nicht_zugeordnet:eltern',
      'elternteil_nicht_zugeordnet:eltern',
      'kind_ohne_partnerschaft:k-a',
      'kind_ohne_partnerschaft:k-b',
      'widerspruch_vorhanden:geburtsdatum',
      'widerspruch_vorhanden:angaben',
    ])
  })
})

describe('elternPlaetze (U-1.34-C2-O2)', () => {
  const faelle: readonly (readonly [string, readonly ElternteilEintrag[], ReturnType<typeof elternPlaetze>])[] = [
    ['keine Eltern', [], { vater: null, mutter: null, unbestimmt: null, ueberzaehlig: [], offen: ['vater', 'mutter'] }],
    ['nur M', [{ id: 'a', geschlecht: 'M' }], { vater: 'a', mutter: null, unbestimmt: null, ueberzaehlig: [], offen: ['mutter'] }],
    ['nur F', [{ id: 'a', geschlecht: 'F' }], { vater: null, mutter: 'a', unbestimmt: null, ueberzaehlig: [], offen: ['vater'] }],
    ['nur U', [{ id: 'a', geschlecht: 'U' }], { vater: null, mutter: null, unbestimmt: 'a', ueberzaehlig: [], offen: ['elternteil'] }],
    ['M und F', [{ id: 'b', geschlecht: 'F' }, { id: 'a', geschlecht: 'M' }], { vater: 'a', mutter: 'b', unbestimmt: null, ueberzaehlig: [], offen: [] }],
    ['zwei F', [{ id: 'b', geschlecht: 'F' }, { id: 'a', geschlecht: 'F' }], { vater: 'b', mutter: 'a', unbestimmt: null, ueberzaehlig: [], offen: [] }],
    ['zwei M', [{ id: 'a', geschlecht: 'M' }, { id: 'b', geschlecht: 'M' }], { vater: 'a', mutter: 'b', unbestimmt: null, ueberzaehlig: [], offen: [] }],
    ['F und X', [{ id: 'a', geschlecht: 'X' }, { id: 'b', geschlecht: 'F' }], { vater: 'a', mutter: 'b', unbestimmt: null, ueberzaehlig: [], offen: [] }],
    ['zwei ohne Geschlecht', [{ id: 'b', geschlecht: null }, { id: 'a', geschlecht: null }], { vater: 'a', mutter: 'b', unbestimmt: null, ueberzaehlig: [], offen: [] }],
    ['drei Eltern', [{ id: 'c', geschlecht: 'M' }, { id: 'a', geschlecht: 'F' }, { id: 'b', geschlecht: 'U' }], { vater: 'c', mutter: 'a', unbestimmt: null, ueberzaehlig: ['b'], offen: [] }],
    ['doppelte Kante', [{ id: 'a', geschlecht: 'U' }, { id: 'a', geschlecht: 'U' }], { vater: null, mutter: null, unbestimmt: 'a', ueberzaehlig: [], offen: ['elternteil'] }],
  ]
  it.each(faelle)('%s', (_name, eltern, erwartet) => {
    expect(elternPlaetze(eltern)).toEqual(erwartet)
  })
})
