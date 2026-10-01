// AP-1.30 PR 13c (docs/80 §33 V-130-13-station/-zeitraum-aussage/-ordnung/-achse/-sprungziele): reine
// Aufbereitung des Reiters „Leben". Rot zuerst (CLAUDE.md §5): geprüft wird das Verhalten gegen unabhängig
// gerechnete Werte (JDN-Differenzen), nicht gegen die Implementierung.
import { describe, expect, it } from 'vitest'
import { nachJdn } from '../../src/core/datum/kalender'
import { SENTINEL_JDN_MIN, type Modifikator } from '../../src/core/datum/typen'
import { angabenZielStationId, lebenAnsicht, type LebenEingabe } from '../../src/renderer/ansichten/profil/reiter-leben-logik'
import type {
  PersonDetailAussage,
  PersonDetailAussageDatum,
  PersonDetailEreignis,
  PersonDetailGrunddatenFeld,
  PersonDetailLebensdatum,
} from '../../src/shared/schemata/person-detail'

const jdn = (jahr: number, monat: number, tag: number): number => nachJdn(jahr, monat, tag, 'gregorian')

function gruppe(modifikator: Modifikator, vonJahr: number, bisJahr: number = vonJahr): PersonDetailAussageDatum {
  return {
    kalender: 'gregorian',
    modifikator,
    praezision: 'jahr',
    wert1: String(vonJahr),
    wert2: bisJahr === vonJahr ? null : String(bisJahr),
    originaltext: null,
    sort_von: jdn(vonJahr, 1, 1),
    sort_bis: jdn(bisJahr, 12, 31),
    zweitkalender: null,
    zweitwert: null,
    doppeljahr: null,
  }
}

function ereignis(id: string, ueberschreibung: Partial<PersonDetailEreignis> = {}): PersonDetailEreignis {
  return {
    ereignis_id: `e-${id}`,
    beteiligung_id: `b-${id}`,
    typ: 'umzug',
    rolle: 'hauptperson',
    datum_wert1: null,
    datum_sort_von: null,
    datum: null,
    konfidenz: null,
    ort_name: null,
    beschreibung: null,
    ...ueberschreibung,
  }
}

function aussage(id: string, ueberschreibung: Partial<PersonDetailAussage> = {}): PersonDetailAussage {
  return {
    aussage_id: id,
    wert: 'Schmied',
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: null,
    konfidenz: null,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
    ...ueberschreibung,
  }
}

function feld(praedikat: string, aussagen: readonly PersonDetailAussage[], ueberschreibung: Partial<PersonDetailGrunddatenFeld> = {}): PersonDetailGrunddatenFeld {
  return { praedikat, wert: aussagen[0]?.wert ?? null, konfidenz: null, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen, ...ueberschreibung }
}

function leerLebensdatum(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

const LEER_LEBENSDATEN: readonly PersonDetailLebensdatum[] = (['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'] as const).map(leerLebensdatum)

/** Geburt führt als Aussage (Datum im Grunddatenfeld), Tod als Ereignis (Datum am Lebensdatum). */
function mitLebensdaten(geburtJahr: number | null, todJahr: number | null, rest: Partial<LebenEingabe> = {}): LebenEingabe {
  const grunddaten: PersonDetailGrunddatenFeld[] = [...(rest.grunddaten ?? [])]
  const geburt: PersonDetailLebensdatum =
    geburtJahr === null ? leerLebensdatum('geburtsdatum') : { ...leerLebensdatum('geburtsdatum'), herkunft: 'aussage', aussage_id: 'a-geburt' }
  if (geburtJahr !== null) {
    grunddaten.push(feld('geburtsdatum', [aussage('a-geburt', { wert: String(geburtJahr), datum: gruppe('exakt', geburtJahr) })]))
  }
  const tod: PersonDetailLebensdatum =
    todJahr === null
      ? leerLebensdatum('todesdatum')
      : {
          ...leerLebensdatum('todesdatum'),
          herkunft: 'ereignis',
          ereignis_id: 'e-tod',
          datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: String(todJahr), wert2: null, originaltext: null, sortVon: jdn(todJahr, 1, 1), sortBis: jdn(todJahr, 12, 31) },
        }
  return { ereignisse: rest.ereignisse ?? [], grunddaten, lebensdaten: [geburt, leerLebensdatum('geburtsort'), tod, leerLebensdatum('todesort')] }
}

function ohneLebensdaten(rest: Partial<LebenEingabe>): LebenEingabe {
  return { ereignisse: rest.ereignisse ?? [], grunddaten: rest.grunddaten ?? [], lebensdaten: LEER_LEBENSDATEN }
}

const ids = (e: LebenEingabe): readonly string[] => lebenAnsicht(e).stationen.map((s) => s.id)

describe('lebenAnsicht — was eine Station ist (V-130-13-station)', () => {
  it('jede Beteiligung ist eine Station, auch Pate und die Lebensereignisse selbst', () => {
    const e = ohneLebensdaten({
      ereignisse: [
        ereignis('geburt', { typ: 'geburt' }),
        ereignis('pate', { typ: 'taufe', rolle: 'pate' }),
        ereignis('tod', { typ: 'tod', rolle: 'verstorbener' }),
      ],
    })
    expect([...ids(e)].sort()).toEqual(['b-geburt', 'b-pate', 'b-tod'])
  })

  it('Aussagen zu Beruf, Wohnort und freien Prädikaten sind Stationen — eine Zeile je Aussage', () => {
    const e = ohneLebensdaten({
      grunddaten: [feld('beruf', [aussage('a1'), aussage('a2', { wert: 'Müller' })]), feld('wohnort', [aussage('a3')]), feld('hofbesitzer', [aussage('a4')])],
    })
    expect([...ids(e)].sort()).toEqual(['a1', 'a2', 'a3', 'a4'])
  })

  it('Lebensdaten, Kurzbeschreibung und Existenz sind keine Stationen', () => {
    const e = ohneLebensdaten({
      grunddaten: ['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'kurzbeschreibung', 'existenz'].map((p, i) => feld(p, [aussage(`x${i}`)])),
    })
    expect(ids(e)).toEqual([])
  })

  it('Station trägt Quelle, Ereignis bzw. Angabe', () => {
    const e = ohneLebensdaten({ ereignisse: [ereignis('x')], grunddaten: [feld('beruf', [aussage('a1')])] })
    const [erste, zweite] = lebenAnsicht(e).stationen
    expect(erste?.quelle).toBe('ereignis')
    expect(erste?.ereignis?.beteiligung_id).toBe('b-x')
    expect(zweite?.quelle).toBe('aussage')
    expect(zweite?.angabe?.praedikat).toBe('beruf')
  })
})

describe('lebenAnsicht — Ordnung und Zeitraum (V-130-13-ordnung, -zeitraum-aussage)', () => {
  it('nach Anfang geordnet, undatierte zuletzt (Ereignis vor Aussage)', () => {
    const e = ohneLebensdaten({
      ereignisse: [ereignis('spaet', { datum: gruppe('exakt', 1950) }), ereignis('undatiert'), ereignis('frueh', { datum: gruppe('exakt', 1920) })],
      grunddaten: [feld('beruf', [aussage('a-undatiert'), aussage('a-mitte', { datum: gruppe('von_bis', 1930, 1940) })])],
    })
    expect(ids(e)).toEqual(['b-frueh', 'a-mitte', 'b-spaet', 'b-undatiert', 'a-undatiert'])
  })

  it('Zeitraum aus der Datumsgruppe über den Formatierer', () => {
    const e = ohneLebensdaten({ ereignisse: [ereignis('x', { datum: gruppe('exakt', 1850) })] })
    expect(lebenAnsicht(e).stationen[0]?.zeitraum).toEqual({ art: 'datum', ergebnis: { schluessel: 'datum:jahr', werte: { jahr: '1850' } } })
  })

  it('ohne Datum und ohne gueltig_*: „ohne Zeitangabe", kein Intervall', () => {
    const station = lebenAnsicht(ohneLebensdaten({ grunddaten: [feld('beruf', [aussage('a1')])] })).stationen[0]
    expect(station?.zeitraum).toEqual({ art: 'ohne' })
    expect(station?.intervall).toBeNull()
    expect(station?.spur).toBeNull()
  })

  it('nur gueltig_von/bis: „Zeitraum erfasst, noch nicht darstellbar", keine Spur, kein Intervall (Einheit offen)', () => {
    const e = ohneLebensdaten({ grunddaten: [feld('wohnort', [aussage('a1', { gueltig_von: 2400000, gueltig_bis: 2410000 })])] })
    const station = lebenAnsicht(mitLebensdaten(1900, 1980, e)).stationen[0]
    expect(station?.zeitraum).toEqual({ art: 'nicht_darstellbar' })
    expect(station?.intervall).toBeNull()
    expect(station?.spur).toBeNull()
  })

  it('Datumsgruppe gewinnt gegen gueltig_*', () => {
    const e = ohneLebensdaten({ grunddaten: [feld('beruf', [aussage('a1', { datum: gruppe('exakt', 1930), gueltig_von: 1, gueltig_bis: 2 })])] })
    expect(lebenAnsicht(e).stationen[0]?.zeitraum.art).toBe('datum')
  })

  it('nur Originaltext ohne Sortwerte: Text, undatiert', () => {
    const roh: PersonDetailAussageDatum = { ...gruppe('exakt', 1900), originaltext: 'Mitte des 19. Jh.', sort_von: null, sort_bis: null }
    const station = lebenAnsicht(ohneLebensdaten({ ereignisse: [ereignis('x', { datum: roh })] })).stationen[0]
    expect(station?.zeitraum).toEqual({ art: 'text', text: 'Mitte des 19. Jh.' })
    expect(station?.intervall).toBeNull()
  })

  it('Ereignis ohne Gruppe, aber mit datum_wert1 (Altbestand): Text statt „ohne"', () => {
    const station = lebenAnsicht(ohneLebensdaten({ ereignisse: [ereignis('x', { datum_wert1: '1850-03-14' })] })).stationen[0]
    expect(station?.zeitraum).toEqual({ art: 'text', text: '1850-03-14' })
  })

  it('Sicherheit wird je Station mitgeführt (Ereignis- und Aussage-Konfidenz)', () => {
    const e = ohneLebensdaten({ ereignisse: [ereignis('x', { konfidenz: 3 })], grunddaten: [feld('beruf', [aussage('a1', { konfidenz: 2 })])] })
    expect(lebenAnsicht(e).stationen.map((s) => s.konfidenz)).toEqual([3, 2])
  })

  it('Widerspruch am Feld wird je Aussage-Station mitgeführt', () => {
    const e = ohneLebensdaten({ grunddaten: [feld('beruf', [aussage('a1')], { hatKonkurrierende: true, hat_widerspruch: true })] })
    const station = lebenAnsicht(e).stationen[0]
    expect(station?.angabe?.feld.hat_widerspruch).toBe(true)
  })

  it('verändert die Eingabe nicht', () => {
    const e = ohneLebensdaten({ ereignisse: [ereignis('b', { datum: gruppe('exakt', 1950) }), ereignis('a', { datum: gruppe('exakt', 1920) })] })
    const kopie = JSON.stringify(e)
    lebenAnsicht(e)
    expect(JSON.stringify(e)).toBe(kopie)
    expect(e.ereignisse.map((x) => x.beteiligung_id)).toEqual(['b-b', 'b-a'])
  })
})

describe('lebenAnsicht — Achse und Spur (V-130-13-achse, -unscharf)', () => {
  it('Achse von Geburt (Aussage) bis Tod (Ereignis), in Jahren, und Spur aus JDN-Anteilen', () => {
    const e = mitLebensdaten(1900, 1980, { grunddaten: [feld('beruf', [aussage('a1', { datum: gruppe('von_bis', 1920, 1958) })])] })
    const ansicht = lebenAnsicht(e)
    expect(ansicht.achse).toEqual({ von: 1900, bis: 1980, grenzeVon: 'geburt', grenzeBis: 'tod' })
    expect(ansicht.achseFehlt).toBe(false)
    const laenge = jdn(1980, 12, 31) - jdn(1900, 1, 1)
    const spur = ansicht.stationen[0]?.spur
    expect(spur?.anfang).toBeCloseTo((jdn(1920, 1, 1) - jdn(1900, 1, 1)) / laenge, 6)
    expect(spur?.ende).toBeCloseTo((jdn(1958, 12, 31) - jdn(1900, 1, 1)) / laenge, 6)
    expect(spur?.unscharf).toBe(false)
  })

  it('„etwa" ist unscharf, „vor" ist am Anfang offen', () => {
    const e = mitLebensdaten(1900, 1980, {
      grunddaten: [feld('beruf', [aussage('a1', { datum: gruppe('etwa', 1940) })]), feld('konfession', [aussage('a2', { datum: { ...gruppe('vor', 1930), sort_von: SENTINEL_JDN_MIN } })])],
    })
    const stationen = lebenAnsicht(e).stationen
    expect(stationen.find((s) => s.id === 'a1')?.spur?.unscharf).toBe(true)
    const vor = stationen.find((s) => s.id === 'a2')?.spur
    expect(vor?.offenAnfang).toBe(true)
    expect(vor?.anfang).toBe(0)
  })

  it('Station nach dem Tod: Lage „nach dem Tod", Ende am Rand', () => {
    const e = mitLebensdaten(1900, 1980, { ereignisse: [ereignis('beerdigung', { typ: 'beerdigung', datum: gruppe('exakt', 1981) })] })
    const station = lebenAnsicht(e).stationen[0]
    expect(station?.lage).toBe('nach_tod')
    expect(station?.spur?.endetNachAchse).toBe(true)
    expect(station?.spur?.ende).toBe(1)
  })

  it('Station vor der Geburt: Lage „vor der Geburt"', () => {
    const e = mitLebensdaten(1900, 1980, { ereignisse: [ereignis('x', { datum: gruppe('exakt', 1890) })] })
    expect(lebenAnsicht(e).stationen[0]?.lage).toBe('vor_geburt')
  })

  it('Station innerhalb: keine Lage', () => {
    const e = mitLebensdaten(1900, 1980, { ereignisse: [ereignis('x', { datum: gruppe('exakt', 1940) })] })
    expect(lebenAnsicht(e).stationen[0]?.lage).toBeNull()
  })

  it('fehlt der Tod, begrenzen die Stationen die Achse (kein „heute")', () => {
    const e = mitLebensdaten(1900, null, { ereignisse: [ereignis('x', { datum: gruppe('exakt', 1940) }), ereignis('y', { datum: gruppe('exakt', 1960) })] })
    expect(lebenAnsicht(e).achse).toEqual({ von: 1900, bis: 1960, grenzeVon: 'geburt', grenzeBis: 'stationen' })
  })

  it('ohne Lebensdaten und ohne zwei Zeitpunkte: keine Achse, Hinweis, keine Spuren', () => {
    // Ein einziger Tag: Anfang und Ende der Achse fallen zusammen.
    const einTag: PersonDetailAussageDatum = { ...gruppe('exakt', 1940), praezision: 'tag', sort_bis: jdn(1940, 1, 1) }
    const e = ohneLebensdaten({ ereignisse: [ereignis('x', { datum: einTag })] })
    const ansicht = lebenAnsicht(e)
    expect(ansicht.achse).toBeNull()
    expect(ansicht.achseFehlt).toBe(true)
    expect(ansicht.stationen[0]?.spur).toBeNull()
    expect(ansicht.stationen[0]?.lage).toBeNull()
  })

  it('ohne Stationen kein Achsen-Hinweis', () => {
    expect(lebenAnsicht(ohneLebensdaten({})).achseFehlt).toBe(false)
  })

  it('Tod vor Geburt: keine Achse', () => {
    expect(lebenAnsicht(mitLebensdaten(1980, 1900, { ereignisse: [ereignis('x')] })).achse).toBeNull()
  })
})

describe('angabenZielStationId (V-130-13-sprungziele)', () => {
  it('erste Aussage-Station mit Widerspruch, sonst erste Aussage-Station, sonst null', () => {
    const mitWiderspruch = lebenAnsicht(
      ohneLebensdaten({ ereignisse: [ereignis('e')], grunddaten: [feld('beruf', [aussage('a1')]), feld('wohnort', [aussage('a2')], { hat_widerspruch: true, hatKonkurrierende: true })] }),
    )
    expect(angabenZielStationId(mitWiderspruch.stationen)).toBe('a2')
    const ohneWiderspruch = lebenAnsicht(ohneLebensdaten({ ereignisse: [ereignis('e')], grunddaten: [feld('beruf', [aussage('a1')]), feld('wohnort', [aussage('a2')])] }))
    expect(angabenZielStationId(ohneWiderspruch.stationen)).toBe('a1')
    expect(angabenZielStationId(lebenAnsicht(ohneLebensdaten({ ereignisse: [ereignis('e')] })).stationen)).toBeNull()
  })
})
