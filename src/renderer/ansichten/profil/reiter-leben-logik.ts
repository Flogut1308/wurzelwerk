// AP-1.30 PR 13c (docs/80 §33 V-130-13-station, -zeitraum-aussage, -ordnung, -achse, -unscharf, -sprungziele):
// reine Aufbereitung des Reiters „Leben" (Artboard „Leben", Vorgaben §2.6/§3.2). Reines TypeScript ohne React
// und ohne i18next: der Aufrufer übersetzt.
//
// Nichts wird hier neu entschieden, was der Kern entscheidet: was eine Station ist (`istStationsPraedikat`),
// die Ordnung, die Lebensachse und die Lage einer Station auf ihr (`stationenOrdnen`, `lebensachse`,
// `zeitspur`, src/core/person/stationen.ts, PR 13a). Dieses Modul sammelt die Stationen aus dem Lesemodell
// (jede Beteiligung, jede Stations-Aussage), liest ihre Zeiträume und ordnet an.
//
// `gueltig_von`/`gueltig_bis` einer Aussage werden NICHT ausgewertet (Einheit offen, V-130-13-zeitraum-aussage):
// eine Station mit nur diesen Werten gilt als undatiert und zeigt „Zeitraum erfasst, noch nicht darstellbar".
import { vonJdn } from '../../../core/datum/kalender'
import type { Formatergebnis } from '../../../core/datum/typen'
import { istStationsPraedikat, lebensachse, stationenOrdnen, zeitspur, type Lebensachse, type ZeitIntervall, type Zeitspur } from '../../../core/person/stationen'
import { DatumModifikatorEnum } from '../../../shared/schemata/gemeinsam'
import type {
  PersonDetailAus,
  PersonDetailAussage,
  PersonDetailAussageDatum,
  PersonDetailEreignis,
  PersonDetailGrunddatenFeld,
  PersonDetailLebensdatum,
} from '../../../shared/schemata/person-detail'
import { datumsgruppeAnzeige } from './reiter-person-logik'

/** Was der Reiter vom Lesemodell braucht — ein Ausschnitt von `PersonDetailAus`. */
export type LebenEingabe = Pick<PersonDetailAus, 'ereignisse' | 'grunddaten' | 'lebensdaten'>

export type StationZeitraum =
  | { readonly art: 'datum'; readonly ergebnis: Formatergebnis }
  | { readonly art: 'text'; readonly text: string }
  | { readonly art: 'nicht_darstellbar' }
  | { readonly art: 'ohne' }

export interface LebenStation {
  /** `beteiligung_id` (Ereignis) bzw. `aussage_id` — eindeutig, Schlüssel der Zeile. */
  readonly id: string
  readonly quelle: 'ereignis' | 'aussage'
  readonly intervall: ZeitIntervall | null
  readonly zeitraum: StationZeitraum
  /** Sicherheit: Konfidenz der Aussage bzw. der Existenz-Aussage des Ereignisses. */
  readonly konfidenz: number | null
  readonly ereignis: PersonDetailEreignis | null
  readonly angabe: { readonly praedikat: string; readonly feld: PersonDetailGrunddatenFeld; readonly aussage: PersonDetailAussage } | null
  /** `null` ohne Achse oder ohne Intervall. */
  readonly spur: Zeitspur | null
  /** Nur gesetzt, wenn die Achse von echten Geburts-/Todesdaten begrenzt wird. */
  readonly lage: 'vor_geburt' | 'nach_tod' | null
}

/** Die Lebensachse mit ihren Rändern als Jahr (Anzeige); `grenze*` sagt, woher der Rand kommt. */
export interface LebenAchse {
  readonly von: number
  readonly bis: number
  readonly grenzeVon: Lebensachse['grenzeVon']
  readonly grenzeBis: Lebensachse['grenzeBis']
}

export interface LebenAnsicht {
  readonly stationen: readonly LebenStation[]
  readonly achse: LebenAchse | null
  /** Es gibt Stationen, aber keine Achse (zu wenige Zeitpunkte oder Tod vor Geburt). */
  readonly achseFehlt: boolean
}

/** Intervall einer Datumsgruppe; `null`, wenn sie sich nicht als Zeitraum lesen lässt (Altbestand). */
function intervallAus(modifikator: string | null, sortVon: number | null, sortBis: number | null): ZeitIntervall | null {
  const art = DatumModifikatorEnum.safeParse(modifikator)
  if (!art.success || sortVon === null || sortBis === null || sortVon > sortBis) return null
  return { sortVon, sortBis, modifikator: art.data }
}

function intervallAusGruppe(gruppe: PersonDetailAussageDatum | null): ZeitIntervall | null {
  return gruppe === null ? null : intervallAus(gruppe.modifikator, gruppe.sort_von, gruppe.sort_bis)
}

function zeitraumAusGruppe(gruppe: PersonDetailAussageDatum): StationZeitraum | null {
  const anzeige = datumsgruppeAnzeige(gruppe)
  switch (anzeige.art) {
    case 'formatiert':
      return { art: 'datum', ergebnis: anzeige.ergebnis }
    case 'text':
      return { art: 'text', text: anzeige.text }
    case 'leer':
      return null
  }
}

interface Roh {
  readonly id: string
  readonly quelle: 'ereignis' | 'aussage'
  readonly intervall: ZeitIntervall | null
  readonly zeitraum: StationZeitraum
  readonly konfidenz: number | null
  readonly ereignis: PersonDetailEreignis | null
  readonly angabe: LebenStation['angabe']
}

function ereignisStation(ereignis: PersonDetailEreignis): Roh {
  const ausGruppe = ereignis.datum === null ? null : zeitraumAusGruppe(ereignis.datum)
  const zeitraum: StationZeitraum = ausGruppe ?? (ereignis.datum_wert1 === null ? { art: 'ohne' } : { art: 'text', text: ereignis.datum_wert1 })
  return {
    id: ereignis.beteiligung_id,
    quelle: 'ereignis',
    intervall: intervallAusGruppe(ereignis.datum),
    zeitraum,
    konfidenz: ereignis.konfidenz,
    ereignis,
    angabe: null,
  }
}

function aussageStation(feld: PersonDetailGrunddatenFeld, aussage: PersonDetailAussage): Roh {
  const ausGruppe = aussage.datum === null ? null : zeitraumAusGruppe(aussage.datum)
  const nurGueltig = aussage.gueltig_von !== null || aussage.gueltig_bis !== null
  const zeitraum: StationZeitraum = ausGruppe ?? (nurGueltig ? { art: 'nicht_darstellbar' } : { art: 'ohne' })
  return {
    id: aussage.aussage_id,
    quelle: 'aussage',
    intervall: intervallAusGruppe(aussage.datum),
    zeitraum,
    konfidenz: aussage.konfidenz,
    ereignis: null,
    angabe: { praedikat: feld.praedikat, feld, aussage },
  }
}

/** Intervall von Geburt bzw. Tod, aus derselben Quelle wie die Lebensdaten (`lebensdaten.herkunft`). */
function lebensIntervall(angabe: PersonDetailLebensdatum['angabe'], eingabe: LebenEingabe): ZeitIntervall | null {
  const eintrag = eingabe.lebensdaten.find((kandidat) => kandidat.angabe === angabe)
  if (eintrag === undefined) return null
  if (eintrag.herkunft === 'ereignis') {
    return eintrag.datum === null ? null : intervallAus(eintrag.datum.modifikator, eintrag.datum.sortVon, eintrag.datum.sortBis)
  }
  if (eintrag.herkunft === 'aussage') {
    const feld = eingabe.grunddaten.find((kandidat) => kandidat.praedikat === angabe)
    const aussage = feld?.aussagen.find((kandidat) => kandidat.aussage_id === eintrag.aussage_id)
    return aussage === undefined ? null : intervallAusGruppe(aussage.datum)
  }
  return null
}

/** Jahr eines JDN (Anzeige der Achsenränder; proleptisch-gregorianisch wie die Sortierwerte). */
function jahrVon(jdn: number): number {
  return vonJdn(jdn, 'gregorian').jahr
}

export function lebenAnsicht(eingabe: LebenEingabe): LebenAnsicht {
  const roh: Roh[] = eingabe.ereignisse.map(ereignisStation)
  for (const feld of eingabe.grunddaten) {
    if (!istStationsPraedikat(feld.praedikat)) continue
    for (const aussage of feld.aussagen) roh.push(aussageStation(feld, aussage))
  }
  const geordnet = stationenOrdnen(roh)
  const kernAchse = lebensachse({ geburt: lebensIntervall('geburtsdatum', eingabe), tod: lebensIntervall('todesdatum', eingabe), stationen: geordnet.map((s) => s.intervall) })
  // Eine Achse ohne beide echten Ränder, die nur eine Station (bzw. ein einziges Jahr) umspannt, ist diese Station
  // selbst („1974 – 1974“, volle Breite — z. B. nur der Tod als Station) und sagt nichts über ein Leben: dann keine
  // Achse, nur der Hinweis (§33 V-130-13-achse).
  const randAusStationen = kernAchse !== null && (kernAchse.grenzeVon === 'stationen' || kernAchse.grenzeBis === 'stationen')
  const entartet =
    kernAchse !== null &&
    randAusStationen &&
    ((kernAchse.grenzeVon === 'stationen' && kernAchse.grenzeBis === 'stationen' && geordnet.filter((s) => s.intervall !== null).length < 2) || jahrVon(kernAchse.von) === jahrVon(kernAchse.bis))
  const achse = entartet ? null : kernAchse
  const stationen: LebenStation[] = geordnet.map((s) => {
    const spur = achse === null || s.intervall === null ? null : zeitspur(s.intervall, achse)
    const lage = achse === null || spur === null ? null : spur.beginntVorAchse && achse.grenzeVon === 'geburt' ? 'vor_geburt' : spur.endetNachAchse && achse.grenzeBis === 'tod' ? 'nach_tod' : null
    return { ...s, spur, lage }
  })
  return {
    stationen,
    achse: achse === null ? null : { von: jahrVon(achse.von), bis: jahrVon(achse.bis), grenzeVon: achse.grenzeVon, grenzeBis: achse.grenzeBis },
    achseFehlt: achse === null && stationen.length > 0,
  }
}

/** Sprungziel `angaben`: die erste Aussage-Station mit unaufgelöstem Widerspruch, sonst die erste
 * Aussage-Station; `null`, wenn es keine gibt (dann trägt der Abschnitt die Kennung). */
export function angabenZielStationId(stationen: readonly LebenStation[]): string | null {
  const aussagen = stationen.filter((s) => s.angabe !== null)
  return (aussagen.find((s) => s.angabe?.feld.hat_widerspruch === true) ?? aussagen[0])?.id ?? null
}
