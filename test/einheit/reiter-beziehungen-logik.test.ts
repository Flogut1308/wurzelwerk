// AP-1.30 PR 12c (A-07, docs/80 §33 V-130-12-zeilen, -einzelpartnerschaft, -kinder-zuordnung): reine
// Aufbereitung des Reiters „Beziehungen". Rot zuerst (CLAUDE.md §5): vor PR 12c gibt es
// `reiter-beziehungen-logik.ts` nicht.
//
// Geprüft: Elternplätze mit offenem Platz, eine Zeile je Kante (zwei Kanten zur selben Person), Kinder
// unter ihrer Partnerschaft, Partnerschaft nur mit der Person selbst („Partner nicht erfasst"), Kinder
// ohne Partnerschaft mit Hinweis nur für Nicht-Platzhalter, Geschwister mit Art, Schlüssel der Anzeige.
import { describe, expect, it } from 'vitest'
import profilRessourcen from '../../src/shared/i18n/de/profil.json'
import {
  ELTERN_PLATZ_SCHLUESSEL,
  GESCHWISTER_ART_SCHLUESSEL,
  WEITERE_GESCHWISTER_SCHLUESSEL,
  beziehungenAnsicht,
  type BeziehungenEingabe,
} from '../../src/renderer/ansichten/profil/reiter-beziehungen-logik'
import { PersonDetailGeschwisterArtEnum, type PersonDetailBeziehung, type PersonDetailGeschwister } from '../../src/shared/schemata/person-detail'

function beziehung(ueberschreibung: Partial<PersonDetailBeziehung> & Pick<PersonDetailBeziehung, 'person_id' | 'richtung'>): PersonDetailBeziehung {
  return {
    anzeigename: ueberschreibung.person_id,
    kantentyp: ueberschreibung.richtung === 'partner' ? 'ehe_zivil' : 'biologisch',
    ist_platzhalter: false,
    kante_id: `k-${ueberschreibung.person_id}`,
    kante_notiz: null,
    geschlecht: null,
    ...ueberschreibung,
  }
}

function geschwister(person_id: string, art: PersonDetailGeschwister['art']): PersonDetailGeschwister {
  return { person_id, anzeigename: person_id, ist_platzhalter: false, geschlecht: null, art, gemeinsame_eltern_ids: [] }
}

function eingabe(ueberschreibung: Partial<BeziehungenEingabe> = {}): BeziehungenEingabe {
  return { beziehungen: [], geschwister: [], partnerschaften: [], kinder_ohne_partnerschaft: [], ...ueberschreibung }
}

describe('beziehungenAnsicht — Eltern', () => {
  it('ohne Eltern: zwei offene Plätze Vater und Mutter', () => {
    const ansicht = beziehungenAnsicht(eingabe())
    expect(ansicht.eltern).toEqual([
      { art: 'offen', platz: 'vater' },
      { art: 'offen', platz: 'mutter' },
    ])
  })

  it('Vater und offene Mutter: Vater besetzt, Mutter offen — jede Zeile trägt Kanten-ID, Typ und Notiz', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({ beziehungen: [beziehung({ person_id: 'v', richtung: 'elternteil', geschlecht: 'M', kante_id: 'e1', kante_notiz: 'Taufbuch', kantentyp: 'adoptiv' })] }),
    )
    expect(ansicht.eltern).toEqual([
      { art: 'besetzt', platz: 'vater', kante: { kanteId: 'e1', personId: 'v', anzeigename: 'v', istPlatzhalter: false, typ: 'adoptiv', notiz: 'Taufbuch' } },
      { art: 'offen', platz: 'mutter' },
    ])
  })

  it('zwei Kanten zur selben Person: eine Zeile je Kante auf demselben Platz', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [
          beziehung({ person_id: 'm', richtung: 'elternteil', geschlecht: 'F', kante_id: 'e1', kantentyp: 'biologisch' }),
          beziehung({ person_id: 'm', richtung: 'elternteil', geschlecht: 'F', kante_id: 'e2', kantentyp: 'adoptiv' }),
        ],
      }),
    )
    expect(ansicht.eltern.map((zeile) => (zeile.art === 'besetzt' ? `${zeile.platz}:${zeile.kante.kanteId}` : `offen:${zeile.platz}`))).toEqual(['offen:vater', 'mutter:e1', 'mutter:e2'])
  })

  it('ein Elternteil ohne Geschlecht: Platz unbestimmt, danach ein offener „Elternteil"-Platz', () => {
    const ansicht = beziehungenAnsicht(eingabe({ beziehungen: [beziehung({ person_id: 'x', richtung: 'elternteil', kante_id: 'e1' })] }))
    expect(ansicht.eltern.map((zeile) => `${zeile.art}:${zeile.platz}`)).toEqual(['besetzt:elternteil', 'offen:elternteil'])
  })

  it('ein dritter Elternteil steht als „Elternteil" hinter Vater und Mutter', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [
          beziehung({ person_id: 'v', richtung: 'elternteil', geschlecht: 'M' }),
          beziehung({ person_id: 'm', richtung: 'elternteil', geschlecht: 'F' }),
          beziehung({ person_id: 'z', richtung: 'elternteil', geschlecht: 'U', kantentyp: 'stief' }),
        ],
      }),
    )
    expect(ansicht.eltern.map((zeile) => `${zeile.art}:${zeile.platz}`)).toEqual(['besetzt:vater', 'besetzt:mutter', 'besetzt:elternteil'])
  })

  it('Platzhalter-Elternteil ist besetzt und trägt das Flag', () => {
    const ansicht = beziehungenAnsicht(eingabe({ beziehungen: [beziehung({ person_id: 'v', richtung: 'elternteil', geschlecht: 'M', ist_platzhalter: true })] }))
    expect(ansicht.eltern[0]).toMatchObject({ art: 'besetzt', platz: 'vater', kante: { istPlatzhalter: true } })
  })
})

describe('beziehungenAnsicht — Partnerschaften und Kinder', () => {
  const partnerQ = beziehung({ person_id: 'q', richtung: 'partner', kante_id: 'p1', kantentyp: 'ehe_kirchlich' })
  const k1 = beziehung({ person_id: 'k1', richtung: 'kind', kante_id: 'e-k1' })
  const k2 = beziehung({ person_id: 'k2', richtung: 'kind', kante_id: 'e-k2' })

  it('Kinder stehen unter ihrer Partnerschaft, Kinder ohne Partnerschaft getrennt', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [partnerQ, k1, k2],
        partnerschaften: [{ id: 'p1', typ: 'ehe_kirchlich', partner_ids: ['q'], kind_ids: ['k1'] }],
        kinder_ohne_partnerschaft: ['k2'],
      }),
    )
    expect(ansicht.partnerschaften).toHaveLength(1)
    expect(ansicht.partnerschaften[0]).toMatchObject({
      id: 'p1',
      typ: 'ehe_kirchlich',
      partner: [{ personId: 'q', anzeigename: 'q', istPlatzhalter: false }],
      kinder: [{ kanteId: 'e-k1', personId: 'k1' }],
    })
    expect(ansicht.kinderOhne.map((kind) => kind.personId)).toEqual(['k2'])
    expect(ansicht.kinderOhneHinweise).toEqual([{ personId: 'k2', anzeigename: 'k2' }])
  })

  it('Partnerschaft nur mit der Person selbst: Karte ohne Partner (V-130-12-einzelpartnerschaft)', () => {
    const ansicht = beziehungenAnsicht(eingabe({ partnerschaften: [{ id: 'p9', typ: 'unbekannt', partner_ids: [], kind_ids: [] }] }))
    expect(ansicht.partnerschaften).toEqual([{ id: 'p9', typ: 'unbekannt', partner: [], kinder: [] }])
  })

  it('Kind mit zwei Kanten: eine Kindzeile je Kante, in der Reihenfolge der Kind-IDs', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [
          partnerQ,
          beziehung({ person_id: 'k2', richtung: 'kind', kante_id: 'e-k2a' }),
          k1,
          beziehung({ person_id: 'k2', richtung: 'kind', kante_id: 'e-k2b', kantentyp: 'adoptiv' }),
        ],
        partnerschaften: [{ id: 'p1', typ: 'ehe_kirchlich', partner_ids: ['q'], kind_ids: ['k1', 'k2'] }],
      }),
    )
    expect(ansicht.partnerschaften[0]?.kinder.map((kind) => kind.kanteId)).toEqual(['e-k1', 'e-k2a', 'e-k2b'])
  })

  it('Platzhalterkind ohne Partnerschaft steht in der Liste, bekommt aber keinen Hinweis (C2c)', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [beziehung({ person_id: 'pk', richtung: 'kind', ist_platzhalter: true }), k2],
        kinder_ohne_partnerschaft: ['pk', 'k2'],
      }),
    )
    expect(ansicht.kinderOhne.map((kind) => kind.personId)).toEqual(['pk', 'k2'])
    expect(ansicht.kinderOhneHinweise.map((hinweis) => hinweis.personId)).toEqual(['k2'])
  })

  it('Hinweis je Kind nur einmal, auch bei zwei Kanten', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [k2, beziehung({ person_id: 'k2', richtung: 'kind', kante_id: 'e-k2b' })],
        kinder_ohne_partnerschaft: ['k2'],
      }),
    )
    expect(ansicht.kinderOhne).toHaveLength(2)
    expect(ansicht.kinderOhneHinweise).toHaveLength(1)
  })
})

describe('beziehungenAnsicht — Geschwister', () => {
  it('Geschwister behalten Reihenfolge und Art; mit offenem Elternplatz folgt der Hinweis „weitere Geschwister"', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [beziehung({ person_id: 'v', richtung: 'elternteil', geschlecht: 'M' })],
        geschwister: [geschwister('a', 'voll'), geschwister('h', 'halb')],
      }),
    )
    expect(ansicht.geschwister.map((eintrag) => `${eintrag.personId}:${eintrag.art}`)).toEqual(['a:voll', 'h:halb'])
    expect(ansicht.weitereGeschwisterPlaetze).toEqual(['mutter'])
  })

  it('ohne offenen Elternplatz kein Hinweis', () => {
    const ansicht = beziehungenAnsicht(
      eingabe({
        beziehungen: [beziehung({ person_id: 'v', richtung: 'elternteil', geschlecht: 'M' }), beziehung({ person_id: 'm', richtung: 'elternteil', geschlecht: 'F' })],
      }),
    )
    expect(ansicht.weitereGeschwisterPlaetze).toEqual([])
  })
})

describe('Schlüssel der Anzeige', () => {
  it('jeder Schlüssel existiert in profil.json', () => {
    const schluessel = [
      ...Object.values(ELTERN_PLATZ_SCHLUESSEL),
      ...Object.values(WEITERE_GESCHWISTER_SCHLUESSEL),
      ...PersonDetailGeschwisterArtEnum.options.map((art) => GESCHWISTER_ART_SCHLUESSEL[art]),
    ]
    expect(schluessel.length).toBe(3 + 3 + 4)
    for (const eintrag of schluessel) expect(profilRessourcen, `Schlüssel ${eintrag} fehlt`).toHaveProperty(eintrag)
  })
})
