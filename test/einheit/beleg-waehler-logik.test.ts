// AP-1.30 PR 9d (Beleg-Wähler im Reiter Person, docs/80 §33 V-130-9d E1–E11): reine Logik — Ziele je
// Gruppe (E1/E3/E4), Verknüpfungsbefehle ohne Doppel (E2/E5/E6/E9), Kurzformular „neues Zitat" (E7),
// Entfernen (E10), Chips der Beleg-Zeile. Rot zuerst (CLAUDE.md §5): vor PR 9d gibt es
// `beleg-waehler-logik.ts` nicht.
import { describe, expect, it } from 'vitest'
import {
  aktiveZiele,
  belegChips,
  belegZeileZustand,
  belegZiel,
  ohneEntfernte,
  chipAngabenZeigen,
  gruppeVon,
  neuesZitatEin,
  verknuepfungEntfernenEin,
  verknuepfungsBefehle,
  zitatBeschriftung,
  zitatWaehlbar,
  type AussageZiel,
} from '../../src/renderer/ansichten/profil/beleg-waehler-logik'
import { lebensdatumFeld } from '../../src/renderer/ansichten/profil/reiter-person-logik'
import { aussageZitatAnlegenEinSchema, aussageZitatLoeschenEinSchema, zitatAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import type { PersonDetailAussage, PersonDetailBeleg, PersonDetailGrunddatenFeld, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

function beleg(zitatId: string): PersonDetailBeleg {
  return {
    zitat_id: zitatId,
    quelle: { id: 'q-1', typ: 'kirchenbuch', titel: 'Taufregister', archiv_name: null, signatur: null, unmittelbarkeit: null },
    zitat: { seite: '42', eintragsnummer: null, zugriffsdatum_wert1: null, digitalisat_url: null },
    transkript: null,
    feld: null,
    textanker: null,
  }
}

function aussage(id: string, belege: readonly PersonDetailBeleg[] = []): PersonDetailAussage {
  return {
    aussage_id: id,
    wert: '1901',
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: null,
    konfidenz: 2,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege,
  }
}

function feld(praedikat: string, aussagen: readonly PersonDetailAussage[]): PersonDetailGrunddatenFeld {
  return { praedikat, wert: null, konfidenz: null, belegzahl: aussagen.reduce((summe, a) => summe + a.belege.length, 0), hat_widerspruch: false, hatKonkurrierende: false, aussagen }
}

function lebensdatum(angabe: PersonDetailLebensdatum['angabe'], ueberschreibung: Partial<PersonDetailLebensdatum>): PersonDetailLebensdatum {
  return {
    angabe,
    herkunft: null,
    aussage_id: null,
    ereignis_id: null,
    datum: null,
    datum_originaltext: null,
    ort_id: null,
    ort_name: null,
    ...ueberschreibung,
  }
}

describe('belegZiel / belegZeileZustand (E1/E3/E4)', () => {
  it('Ziel ist dieselbe Aussage, die der Reiter für Sicherheit und Zähler nutzt (E1)', () => {
    const grunddaten = [feld('geburtsdatum', [aussage('a-alt'), aussage('a-fuehrt', [beleg('z-1')])])]
    const lebensdaten = [lebensdatum('geburtsdatum', { herkunft: 'aussage', aussage_id: 'a-fuehrt' })]
    const ziel = belegZiel(lebensdatumFeld('geburtsdatum', grunddaten, lebensdaten), [])
    expect(ziel).toEqual({ art: 'aussage', angabe: 'geburtsdatum', aussageId: 'a-fuehrt', zitatIds: ['z-1'] })
  })

  it('ein Wert aus dem Ereignis ist kein Ziel (E3), ohne Wert gibt es nichts zu belegen (E4)', () => {
    const lebensdaten = [lebensdatum('geburtsort', { herkunft: 'ereignis', ereignis_id: 'e-1', ort_id: 'o-1', ort_name: 'Danzig' })]
    const ereignis = belegZiel(lebensdatumFeld('geburtsort', [], lebensdaten), [])
    const leer = belegZiel(lebensdatumFeld('geburtsdatum', [], lebensdaten), [])
    expect(ereignis).toEqual({ art: 'ereignis', angabe: 'geburtsort' })
    expect(leer).toEqual({ art: 'leer', angabe: 'geburtsdatum' })
    expect(belegZeileZustand([leer, ereignis])).toEqual({ art: 'nur_ereignis' })
    expect(belegZeileZustand([leer, { art: 'leer', angabe: 'geburtsort' }])).toEqual({ art: 'ohne_wert' })
  })

  it('gemischt: Aussage-Ziele wählbar, Ereignis-Angaben als Hinweis', () => {
    const zustand = belegZeileZustand([
      { art: 'aussage', angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: [] },
      { art: 'ereignis', angabe: 'geburtsort' },
    ])
    expect(zustand).toEqual({ art: 'waehlbar', ziele: [{ angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: [] }], ereignisAngaben: ['geburtsort'] })
  })

  it('Kästchen: abgewählte Angaben fallen aus den aktiven Zielen', () => {
    const ziele: AussageZiel[] = [
      { angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: [] },
      { angabe: 'geburtsort', aussageId: 'a-2', zitatIds: [] },
    ]
    expect(aktiveZiele(ziele, new Set())).toEqual(ziele)
    expect(aktiveZiele(ziele, new Set(['geburtsort'] as const))).toEqual([ziele[0]])
  })

  it('gruppeVon ordnet jede Angabe ihrer Gruppe zu', () => {
    expect([gruppeVon('geburtsdatum'), gruppeVon('geburtsort'), gruppeVon('todesdatum'), gruppeVon('todesort')]).toEqual(['geburt', 'geburt', 'tod', 'tod'])
  })
})

describe('verknuepfungsBefehle / zitatWaehlbar (E2/E5/E6/E9)', () => {
  const ziele: AussageZiel[] = [
    { angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: ['z-1'] },
    { angabe: 'geburtsort', aussageId: 'a-2', zitatIds: [] },
  ]

  it('je Ziel ohne dieses Zitat EIN Befehl, ohne feld und ohne Textanker, gültig nach Vertrag', () => {
    const befehle = verknuepfungsBefehle('z-2', ziele)
    expect(befehle).toEqual([
      { aussageId: 'a-1', zitatId: 'z-2' },
      { aussageId: 'a-2', zitatId: 'z-2' },
    ])
    for (const ein of befehle) {
      expect(aussageZitatAnlegenEinSchema.parse(ein)).toEqual(ein)
      expect(Object.keys(ein).sort()).toEqual(['aussageId', 'zitatId'])
    }
  })

  it('ein bereits verknüpftes Paar wird nie erneut geschickt (kein KONFLIKT_BEREITS_VORHANDEN)', () => {
    expect(verknuepfungsBefehle('z-1', ziele)).toEqual([{ aussageId: 'a-2', zitatId: 'z-1' }])
    expect(verknuepfungsBefehle('z-1', [ziele[0] as AussageZiel])).toEqual([])
  })

  it('unterwegs geschriebene Paare zählen wie verknüpft, bis das Lesemodell sie liefert', () => {
    const unterwegs = [{ aussageId: 'a-2', zitatId: 'z-1' }]
    expect(verknuepfungsBefehle('z-1', ziele, unterwegs)).toEqual([])
    expect(zitatWaehlbar('z-1', ziele, unterwegs)).toBe(false)
  })

  it('ausgeblendet ist ein Zitat erst, wenn es an allen angekreuzten Zielen hängt', () => {
    expect(zitatWaehlbar('z-1', ziele)).toBe(true)
    expect(zitatWaehlbar('z-1', [ziele[0] as AussageZiel])).toBe(false)
    expect(zitatWaehlbar('z-9', [])).toBe(false)
  })
})

describe('neuesZitatEin / verknuepfungEntfernenEin (E7/E10)', () => {
  it('leere Felder werden weggelassen, Ränder abgeschnitten, Ergebnis gültig nach Vertrag', () => {
    expect(neuesZitatEin('q-1', '  42 ', '')).toEqual({ quelleId: 'q-1', seite: '42' })
    expect(neuesZitatEin('q-1', '', ' 17')).toEqual({ quelleId: 'q-1', eintragsnummer: '17' })
    expect(neuesZitatEin('q-1', ' ', ' ')).toEqual({ quelleId: 'q-1' })
    expect(zitatAnlegenEinSchema.parse(neuesZitatEin('q-1', "O'Brien 3", '4a'))).toEqual({ quelleId: 'q-1', seite: "O'Brien 3", eintragsnummer: '4a' })
  })

  it('Entfernen nennt nur die Verknüpfung', () => {
    const ein = verknuepfungEntfernenEin('a-1', 'z-1')
    expect(aussageZitatLoeschenEinSchema.parse(ein)).toEqual({ aussageId: 'a-1', zitatId: 'z-1' })
  })
})

describe('ohneEntfernte (hueter #176 H3)', () => {
  it('blendet genau die entfernten Paare aus, andere Aussagen und Zitate bleiben', () => {
    const eingang = feld('geburtsdatum', [aussage('a-1', [beleg('z-1'), beleg('z-2')]), aussage('a-2', [beleg('z-1')])])
    const ergebnis = ohneEntfernte(eingang, [{ aussageId: 'a-1', zitatId: 'z-1' }])
    expect(ergebnis.aussagen.map((a) => [a.aussage_id, a.belege.map((b) => b.zitat_id)])).toEqual([
      ['a-1', ['z-2']],
      ['a-2', ['z-1']],
    ])
    expect(ohneEntfernte(eingang, [])).toBe(eingang)
  })
})

describe('belegChips / zitatBeschriftung', () => {
  it('je Zitat ein Chip über die Ziel-Aussagen der Gruppe, Reihenfolge Datum vor Ort', () => {
    const grunddaten = [feld('geburtsdatum', [aussage('a-1', [beleg('z-1'), beleg('z-2')])]), feld('geburtsort', [aussage('a-2', [beleg('z-2'), beleg('z-3')])])]
    const lebensdaten = [lebensdatum('geburtsdatum', { herkunft: 'aussage', aussage_id: 'a-1' }), lebensdatum('geburtsort', { herkunft: 'aussage', aussage_id: 'a-2' })]
    const chips = belegChips([lebensdatumFeld('geburtsdatum', grunddaten, lebensdaten), lebensdatumFeld('geburtsort', grunddaten, lebensdaten)], [])
    expect(chips.map((chip) => [chip.zitatId, chip.angaben])).toEqual([
      ['z-1', ['geburtsdatum']],
      ['z-2', ['geburtsdatum', 'geburtsort']],
      ['z-3', ['geburtsort']],
    ])
    expect(chips.map((chip) => chipAngabenZeigen(chip, 2))).toEqual([true, false, true])
    expect(chips.map((chip) => chipAngabenZeigen(chip, 1))).toEqual([false, false, false])
  })

  it('Belege nicht führender Aussagen und aus Ereignissen erscheinen nicht als Chip', () => {
    const grunddaten = [feld('geburtsdatum', [aussage('a-alt', [beleg('z-alt')]), aussage('a-fuehrt')])]
    const lebensdaten = [lebensdatum('geburtsdatum', { herkunft: 'aussage', aussage_id: 'a-fuehrt' })]
    expect(belegChips([lebensdatumFeld('geburtsdatum', grunddaten, lebensdaten)], [])).toEqual([])
  })

  it('Beschriftung nennt Seite und Eintragsnummer nur, wenn gepflegt', () => {
    expect(zitatBeschriftung('42', '17')).toEqual({ art: 'seite_eintrag', seite: '42', eintragsnummer: '17' })
    expect(zitatBeschriftung('42', null)).toEqual({ art: 'seite', seite: '42' })
    expect(zitatBeschriftung(' ', '17')).toEqual({ art: 'eintrag', eintragsnummer: '17' })
    expect(zitatBeschriftung(null, '')).toEqual({ art: 'ohne' })
  })
})
