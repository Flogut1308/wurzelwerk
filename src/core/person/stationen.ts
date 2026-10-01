// AP-1.30 PR 13a (docs/80 §33 V-130-13-station/-ordnung/-achse/-unscharf): Lebensstationen und
// Zeitspur relativ zur Lebenszeit — rein, ohne Uhr („heute" gibt es nicht), ohne Rendering.
// Alle Zeiten sind JDN (Datumskern). Offene Ränder (`vor`/`nach`) tragen die Sentinels aus
// `datum/typen.ts`; sie werden nie als Anker oder Achsengrenze verwendet und nie verrechnet,
// sondern über die Flags `offenAnfang`/`offenEnde` ausgedrückt (kein NaN, kein Infinity).
import type { Modifikator } from '../datum/typen'
import { DATUMS_PRAEDIKATE } from './datums-wert'
import { EXISTENZ_PRAEDIKAT, KURZBESCHREIBUNG_PRAEDIKAT } from './praedikate'

/** Zeitraum einer Station aus ihrer Datumsgruppe (`sortVon <= sortBis`). */
export interface ZeitIntervall {
  readonly sortVon: number
  readonly sortBis: number
  readonly modifikator: Modifikator
}

export interface Lebensachse {
  readonly von: number
  readonly bis: number
  readonly grenzeVon: 'geburt' | 'stationen'
  readonly grenzeBis: 'tod' | 'stationen'
}

/** Lage einer Station auf der Achse; `anfang`/`ende` sind Anteile 0..1. */
export interface Zeitspur {
  readonly anfang: number
  readonly ende: number
  readonly offenAnfang: boolean
  readonly offenEnde: boolean
  readonly unscharf: boolean
  readonly beginntVorAchse: boolean
  readonly endetNachAchse: boolean
}

/** Anker für den Anfang: bei `vor` das Ende des Intervalls (der Anfang ist offen). */
function ankerAnfang(i: ZeitIntervall): number {
  return i.modifikator === 'vor' ? i.sortBis : i.sortVon
}

/** Anker für das Ende: bei `nach` der Anfang des Intervalls (das Ende ist offen). */
function ankerEnde(i: ZeitIntervall): number {
  return i.modifikator === 'nach' ? i.sortVon : i.sortBis
}

export function lebensachse(ein: {
  readonly geburt: ZeitIntervall | null
  readonly tod: ZeitIntervall | null
  readonly stationen: readonly (ZeitIntervall | null)[]
}): Lebensachse | null {
  const datiert = ein.stationen.filter((s): s is ZeitIntervall => s !== null)
  let von: number
  let grenzeVon: 'geburt' | 'stationen'
  if (ein.geburt !== null) {
    von = ankerAnfang(ein.geburt)
    grenzeVon = 'geburt'
  } else {
    if (datiert.length === 0) {
      return null
    }
    von = Math.min(...datiert.map(ankerAnfang))
    grenzeVon = 'stationen'
  }
  let bis: number
  let grenzeBis: 'tod' | 'stationen'
  if (ein.tod !== null) {
    bis = ankerEnde(ein.tod)
    grenzeBis = 'tod'
  } else {
    if (datiert.length === 0) {
      return null
    }
    bis = Math.max(...datiert.map(ankerEnde))
    grenzeBis = 'stationen'
  }
  if (!(von < bis)) {
    return null
  }
  return { von, bis, grenzeVon, grenzeBis }
}

const UNSCHARF: readonly Modifikator[] = ['etwa', 'geschaetzt', 'berechnet', 'zwischen']

export function zeitspur(intervall: ZeitIntervall, achse: Lebensachse): Zeitspur {
  const laenge = achse.bis - achse.von
  const anteil = (jdn: number): number => Math.min(1, Math.max(0, (jdn - achse.von) / laenge))
  const offenAnfang = intervall.modifikator === 'vor'
  const offenEnde = intervall.modifikator === 'nach'
  const anfang = offenAnfang ? 0 : anteil(intervall.sortVon)
  const ende = Math.max(anfang, offenEnde ? 1 : anteil(intervall.sortBis))
  return {
    anfang,
    ende,
    offenAnfang,
    offenEnde,
    unscharf: UNSCHARF.includes(intervall.modifikator),
    // Offener Rand: nur „sicher ganz außerhalb“ zählt (vor 1850 auf Achse ab 1900), nicht der Sentinel.
    beginntVorAchse: offenAnfang ? intervall.sortBis < achse.von : intervall.sortVon < achse.von,
    endetNachAchse: offenEnde ? intervall.sortVon > achse.bis : intervall.sortBis > achse.bis,
  }
}

interface Ordenbar {
  readonly id: string
  readonly quelle: 'ereignis' | 'aussage'
  readonly intervall: ZeitIntervall | null
}

function vergleiche(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function quelleRang(q: Ordenbar['quelle']): number {
  return q === 'ereignis' ? 0 : 1
}

function ordnung(a: Ordenbar, b: Ordenbar): number {
  if (a.intervall !== null && b.intervall !== null) {
    const nachAnker = vergleiche(ankerAnfang(a.intervall), ankerAnfang(b.intervall))
    if (nachAnker !== 0) {
      return nachAnker
    }
    const nachBis = vergleiche(a.intervall.sortBis, b.intervall.sortBis)
    if (nachBis !== 0) {
      return nachBis
    }
  } else if (a.intervall !== null) {
    return -1
  } else if (b.intervall !== null) {
    return 1
  }
  return vergleiche(quelleRang(a.quelle), quelleRang(b.quelle)) || vergleiche(a.id, b.id)
}

/** Ordnet Stationen nach Zeit; undatierte zuletzt. Gibt eine neue Liste zurück, die Eingabe bleibt unverändert. */
export function stationenOrdnen<T extends Ordenbar>(s: readonly T[]): readonly T[] {
  return [...s].sort(ordnung)
}

const KEINE_STATION: ReadonlySet<string> = new Set<string>([
  ...DATUMS_PRAEDIKATE,
  'geburtsort',
  'todesort',
  KURZBESCHREIBUNG_PRAEDIKAT,
  EXISTENZ_PRAEDIKAT,
])

/** Jede Personen-Aussage ist eine Lebensstation, außer den Lebensdaten, der Kurzbeschreibung und der Existenz. */
export function istStationsPraedikat(praedikat: string): boolean {
  return !KEINE_STATION.has(praedikat)
}

/** Zahl der Stationszeilen des Reiters „Leben“ (V-130-13-zaehler): jede Ereignis-Beteiligung plus jede Aussage
 * eines Stations-Prädikats — dieselbe Regel (`istStationsPraedikat`), nach der der Reiter seine Zeilen sammelt. */
export function stationenAnzahl(ereignisse: number, felder: readonly { readonly praedikat: string; readonly aussagen: number }[]): number {
  return felder.reduce((summe, feld) => (istStationsPraedikat(feld.praedikat) ? summe + feld.aussagen : summe), ereignisse)
}
