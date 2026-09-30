// AP-1.30 PR 9d-2 (docs/80 §33 V-130-9d2): Beleg verknüpfen an Werten aus einem Ereignis — Ziel ist
// die Existenz-Aussage des Ereignisses (ADR-026) mit `feld` = datum/ort (F1), Datum+Ort desselben
// Ereignisses mit einem Zitat = eine Zeile ohne feld (F2), Erweiterung per aussage_zitat.aendern (F3),
// kein Angebot bei fremdem feld (F4). Reine Logik.
import { describe, expect, it } from 'vitest'
import {
  belegChips,
  belegDecktAngabe,
  belegZeileZustand,
  belegZiel,
  ereignisBelegeFuer,
  ereignisZielAngaben,
  erweiterungsBefehle,
  existenzOhneEntfernte,
  verknuepfungsBefehle,
  zitatWaehlbar,
  type EreignisZiel,
  type VerknuepfungsZiel,
} from '../../src/renderer/ansichten/profil/beleg-waehler-logik'
import { lebensdatumFeld } from '../../src/renderer/ansichten/profil/reiter-person-logik'
import { aussageZitatAendernEinSchema, aussageZitatAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import type { PersonDetailBeleg, PersonDetailEreignisExistenz, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

function beleg(zitatId: string, feld: string | null, textanker: PersonDetailBeleg['textanker'] = null): PersonDetailBeleg {
  return {
    zitat_id: zitatId,
    quelle: { id: 'q-1', typ: 'kirchenbuch', titel: 'Taufregister', archiv_name: null, signatur: null, unmittelbarkeit: null },
    zitat: { seite: '42', eintragsnummer: null, zugriffsdatum_wert1: null, digitalisat_url: null },
    transkript: 'getauft am 3. März 1850 zu Danzig',
    feld,
    textanker,
  }
}

function lebensdatum(angabe: PersonDetailLebensdatum['angabe'], ueberschreibung: Partial<PersonDetailLebensdatum>): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null, ...ueberschreibung }
}

const ausEreignis = (angabe: PersonDetailLebensdatum['angabe'], ereignisId: string): PersonDetailLebensdatum =>
  angabe === 'geburtsort' || angabe === 'todesort'
    ? lebensdatum(angabe, { herkunft: 'ereignis', ereignis_id: ereignisId, ort_id: 'o-1', ort_name: 'Danzig' })
    : lebensdatum(angabe, { herkunft: 'ereignis', ereignis_id: ereignisId, datum_originaltext: '1850' })

function existenz(ereignisId: string, aussageId: string, belege: readonly PersonDetailBeleg[] = []): PersonDetailEreignisExistenz {
  return { ereignis_id: ereignisId, aussage_id: aussageId, belege }
}

function ereignisZiel(angabe: 'geburtsdatum' | 'geburtsort', aussageId: string, belege: readonly PersonDetailBeleg[] = []): EreignisZiel {
  const ziel = belegZiel(lebensdatumFeld(angabe, [], [ausEreignis(angabe, 'e-' + aussageId)]), [existenz('e-' + aussageId, aussageId, belege)])
  if (ziel.art !== 'existenz') throw new Error('kein Existenz-Ziel')
  return { angabe: ziel.angabe, aussageId: ziel.aussageId, zitatIds: ziel.zitatIds, ereignisFeld: ziel.ereignisFeld, verknuepfungen: ziel.verknuepfungen }
}

describe('Ziel an der Existenz-Aussage (F1)', () => {
  it('Ereigniswert mit Existenz-Aussage ist ein Ziel; zitatIds = nur Belege mit feld NULL oder passend', () => {
    const lebensdaten = [ausEreignis('geburtsdatum', 'e-1'), ausEreignis('geburtsort', 'e-1')]
    const ex = existenz('e-1', 'x-1', [beleg('z-datum', 'datum'), beleg('z-ort', 'ort'), beleg('z-ganz', null), beleg('z-beschr', 'beschreibung')])
    const datum = belegZiel(lebensdatumFeld('geburtsdatum', [], lebensdaten), [ex])
    const ort = belegZiel(lebensdatumFeld('geburtsort', [], lebensdaten), [ex])
    expect(datum).toMatchObject({ art: 'existenz', angabe: 'geburtsdatum', aussageId: 'x-1', zitatIds: ['z-datum', 'z-ganz'], ereignisFeld: 'datum' })
    expect(ort).toMatchObject({ art: 'existenz', angabe: 'geburtsort', aussageId: 'x-1', zitatIds: ['z-ort', 'z-ganz'], ereignisFeld: 'ort' })
    expect(datum.art === 'existenz' ? datum.verknuepfungen.map((v) => [v.zitatId, v.feld]) : []).toEqual([
      ['z-datum', 'datum'],
      ['z-ort', 'ort'],
      ['z-ganz', null],
      ['z-beschr', 'beschreibung'],
    ])
  })

  it('ohne passende Existenz-Aussage bleibt es beim Hinweis (E3); die Existenz eines ANDEREN Ereignisses zählt nicht', () => {
    const lebensdaten = [ausEreignis('geburtsdatum', 'e-1')]
    const ziel = belegZiel(lebensdatumFeld('geburtsdatum', [], lebensdaten), [existenz('e-anderes', 'x-9')])
    expect(ziel).toEqual({ art: 'ereignis', angabe: 'geburtsdatum' })
    expect(belegZeileZustand([ziel])).toEqual({ art: 'nur_ereignis' })
  })

  it('Zustand: Existenz-Ziele sind wählbar und werden als Ereignis-Ziele benannt', () => {
    const zustand = belegZeileZustand([
      { art: 'aussage', angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: [] },
      { art: 'existenz', angabe: 'geburtsort', aussageId: 'x-1', zitatIds: [], ereignisFeld: 'ort', verknuepfungen: [] },
    ])
    expect(zustand.art).toBe('waehlbar')
    if (zustand.art !== 'waehlbar') return
    expect(zustand.ziele.map((z) => z.aussageId)).toEqual(['a-1', 'x-1'])
    expect(zustand.ereignisAngaben).toEqual([])
    expect(ereignisZielAngaben(zustand.ziele)).toEqual(['geburtsort'])
  })

  it('belegDecktAngabe: NULL deckt Datum und Ort, datum nur Datum, ort nur Ort, beschreibung keins', () => {
    expect([belegDecktAngabe(null, 'geburtsdatum'), belegDecktAngabe(null, 'todesort')]).toEqual([true, true])
    expect([belegDecktAngabe('datum', 'todesdatum'), belegDecktAngabe('datum', 'todesort')]).toEqual([true, false])
    expect([belegDecktAngabe('ort', 'geburtsort'), belegDecktAngabe('ort', 'geburtsdatum')]).toEqual([true, false])
    expect([belegDecktAngabe('beschreibung', 'geburtsdatum'), belegDecktAngabe('beschreibung', 'geburtsort')]).toEqual([false, false])
  })
})

describe('Befehle an der Existenz-Aussage (F1–F4)', () => {
  it('F1: nur Datum → ein anlegen mit feld datum, gültig nach Vertrag', () => {
    const befehle = verknuepfungsBefehle('z-1', [ereignisZiel('geburtsdatum', 'x-1')])
    expect(befehle).toEqual([{ aussageId: 'x-1', zitatId: 'z-1', feld: 'datum' }])
    expect(aussageZitatAnlegenEinSchema.parse(befehle[0])).toEqual(befehle[0])
    expect(erweiterungsBefehle('z-1', [ereignisZiel('geburtsdatum', 'x-1')])).toEqual([])
  })

  it('F2: Datum und Ort desselben Ereignisses → EIN anlegen ohne feld (ganzes Ereignis)', () => {
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsdatum', 'x-1'), ereignisZiel('geburtsort', 'x-1')]
    const befehle = verknuepfungsBefehle('z-1', ziele)
    expect(befehle).toEqual([{ aussageId: 'x-1', zitatId: 'z-1' }])
    expect(Object.keys(befehle[0] ?? {}).sort()).toEqual(['aussageId', 'zitatId'])
  })

  it('F2: Datum und Ort aus VERSCHIEDENEN Ereignissen → je ein anlegen mit seinem feld', () => {
    expect(verknuepfungsBefehle('z-1', [ereignisZiel('geburtsdatum', 'x-1'), ereignisZiel('geburtsort', 'x-2')])).toEqual([
      { aussageId: 'x-1', zitatId: 'z-1', feld: 'datum' },
      { aussageId: 'x-2', zitatId: 'z-1', feld: 'ort' },
    ])
  })

  it('gemischt: Personen-Aussage ohne feld, Existenz-Aussage mit feld', () => {
    const ziele: VerknuepfungsZiel[] = [{ angabe: 'geburtsdatum', aussageId: 'a-1', zitatIds: [] }, ereignisZiel('geburtsort', 'x-1')]
    expect(verknuepfungsBefehle('z-1', ziele)).toEqual([
      { aussageId: 'a-1', zitatId: 'z-1' },
      { aussageId: 'x-1', zitatId: 'z-1', feld: 'ort' },
    ])
  })

  it('schon gedeckt (feld NULL oder passend) → kein Befehl, nicht wählbar', () => {
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsdatum', 'x-1', [beleg('z-ganz', null), beleg('z-datum', 'datum')])]
    for (const zitatId of ['z-ganz', 'z-datum']) {
      expect(verknuepfungsBefehle(zitatId, ziele)).toEqual([])
      expect(erweiterungsBefehle(zitatId, ziele)).toEqual([])
      expect(zitatWaehlbar(zitatId, ziele)).toBe(false)
    }
  })

  it('F3: hängt das Zitat mit dem anderen Feld, wird auf NULL erweitert — Textanker bleibt, kein anlegen', () => {
    const anker = { von: 9, bis: 21 }
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsort', 'x-1', [beleg('z-1', 'datum', anker)])]
    expect(zitatWaehlbar('z-1', ziele)).toBe(true)
    expect(verknuepfungsBefehle('z-1', ziele)).toEqual([])
    const erweitert = erweiterungsBefehle('z-1', ziele)
    expect(erweitert).toEqual([{ aussageId: 'x-1', zitatId: 'z-1', feld: null, textanker: anker }])
    expect(aussageZitatAendernEinSchema.parse(erweitert[0])).toEqual(erweitert[0])
  })

  it('F3: sind beide Angaben angekreuzt und hängt das Zitat schon am Datum, genau eine Erweiterung', () => {
    const belege = [beleg('z-1', 'datum')]
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsdatum', 'x-1', belege), ereignisZiel('geburtsort', 'x-1', belege)]
    expect(verknuepfungsBefehle('z-1', ziele)).toEqual([])
    expect(erweiterungsBefehle('z-1', ziele)).toEqual([{ aussageId: 'x-1', zitatId: 'z-1', feld: null, textanker: null }])
  })

  it('F4: hängt das Zitat mit einem fremden Feld (beschreibung), wird es nicht angeboten und nichts geschrieben', () => {
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsdatum', 'x-1', [beleg('z-1', 'beschreibung')])]
    expect(zitatWaehlbar('z-1', ziele)).toBe(false)
    expect(verknuepfungsBefehle('z-1', ziele)).toEqual([])
    expect(erweiterungsBefehle('z-1', ziele)).toEqual([])
  })

  it('unterwegs: ein eben geschriebenes datum deckt das Datum, der Ort wird erweitert; nach der Erweiterung ist alles gedeckt', () => {
    const ziele: VerknuepfungsZiel[] = [ereignisZiel('geburtsdatum', 'x-1'), ereignisZiel('geburtsort', 'x-1')]
    const nachAnlegen = [{ aussageId: 'x-1', zitatId: 'z-1', feld: 'datum' as const }]
    expect(verknuepfungsBefehle('z-1', ziele, nachAnlegen)).toEqual([])
    expect(erweiterungsBefehle('z-1', ziele, nachAnlegen)).toEqual([{ aussageId: 'x-1', zitatId: 'z-1', feld: null, textanker: null }])
    const nachErweitern = [...nachAnlegen, { aussageId: 'x-1', zitatId: 'z-1' }]
    expect(zitatWaehlbar('z-1', ziele, nachErweitern)).toBe(false)
    expect(erweiterungsBefehle('z-1', ziele, nachErweitern)).toEqual([])
  })
})

describe('Chips und Schublade am Ereigniswert', () => {
  it('Chips: feld NULL nennt Datum und Ort, datum/ort nur ihre Angabe, beschreibung keinen', () => {
    const lebensdaten = [ausEreignis('geburtsdatum', 'e-1'), ausEreignis('geburtsort', 'e-1')]
    const ex = existenz('e-1', 'x-1', [beleg('z-ganz', null), beleg('z-ort', 'ort'), beleg('z-beschr', 'beschreibung'), beleg('z-datum', 'datum')])
    const chips = belegChips([lebensdatumFeld('geburtsdatum', [], lebensdaten), lebensdatumFeld('geburtsort', [], lebensdaten)], [ex])
    expect(chips.map((chip) => [chip.zitatId, chip.angaben])).toEqual([
      ['z-ganz', ['geburtsdatum', 'geburtsort']],
      ['z-datum', ['geburtsdatum']],
      ['z-ort', ['geburtsort']],
    ])
    expect(ereignisBelegeFuer('geburtsort', ex).map((b) => b.zitat_id)).toEqual(['z-ganz', 'z-ort'])
  })

  it('existenzOhneEntfernte blendet genau die entfernten Paare dieser Aussage aus', () => {
    const ex = existenz('e-1', 'x-1', [beleg('z-1', null), beleg('z-2', 'datum')])
    expect(existenzOhneEntfernte(ex, [{ aussageId: 'x-1', zitatId: 'z-1' }]).belege.map((b) => b.zitat_id)).toEqual(['z-2'])
    expect(existenzOhneEntfernte(ex, [{ aussageId: 'a-anders', zitatId: 'z-1' }]).belege.map((b) => b.zitat_id)).toEqual(['z-1', 'z-2'])
    expect(existenzOhneEntfernte(ex, [])).toBe(ex)
  })
})
