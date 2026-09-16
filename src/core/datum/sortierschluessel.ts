// Rechnet Präzision + Modifikator (+ ggf. ein zweites Teildatum) in ein JDN-Intervall um, das
// `sortVon <= sortBis` garantiert (AP-1.1). Reine Funktion, baut auf kalender.ts auf.
import { nachJdn } from './kalender'
import { SENTINEL_JDN_MAX, SENTINEL_JDN_MIN } from './typen'
import type { Kalender, Modifikator, Praezision } from './typen'

/** Ein unvollständiges Kalenderdatum, wie es der Parser aus dem Text herausliest. */
export interface Teildatum {
  readonly jahr: number
  /** 1-12, gesetzt bei `praezision:'tag'|'monat'`. Bei `'jahrzehnt'` ist `jahr` der Dekadenanfang (z. B. 1750 für die 1750er). */
  readonly monat?: number
  /** gesetzt bei `praezision:'tag'`. */
  readonly tag?: number
}

export interface SortIntervallEingabe {
  readonly kalender: Kalender
  readonly modifikator: Modifikator
  readonly praezision: Praezision
  readonly datum: Teildatum
  /** nur bei `modifikator:'zwischen'|'von_bis'`: das Ende der Spanne. */
  readonly zweitesDatum?: Teildatum
}

export interface SortIntervall {
  readonly sortVon: number
  readonly sortBis: number
}

function jahresAnfangJdn(jahr: number, kalender: Kalender): number {
  return nachJdn(jahr, 1, 1, kalender)
}

function jahresEndeJdn(jahr: number, kalender: Kalender): number {
  return nachJdn(jahr + 1, 1, 1, kalender) - 1
}

function monatsAnfangJdn(jahr: number, monat: number, kalender: Kalender): number {
  return nachJdn(jahr, monat, 1, kalender)
}

function monatsEndeJdn(jahr: number, monat: number, kalender: Kalender): number {
  if (monat === 12) {
    return nachJdn(jahr + 1, 1, 1, kalender) - 1
  }
  return nachJdn(jahr, monat + 1, 1, kalender) - 1
}

function teildatumAnfang(datum: Teildatum, praezision: Praezision, kalender: Kalender): number {
  switch (praezision) {
    case 'tag': {
      const { monat, tag } = datum
      if (monat === undefined || tag === undefined) {
        throw new Error("sortIntervall: praezision 'tag' braucht monat und tag im Teildatum.")
      }
      return nachJdn(datum.jahr, monat, tag, kalender)
    }
    case 'monat': {
      const { monat } = datum
      if (monat === undefined) {
        throw new Error("sortIntervall: praezision 'monat' braucht monat im Teildatum.")
      }
      return monatsAnfangJdn(datum.jahr, monat, kalender)
    }
    case 'jahr':
      return jahresAnfangJdn(datum.jahr, kalender)
    case 'jahrzehnt':
      // "Jahrzehnt spannt zehn Jahre": datum.jahr ist der Dekadenanfang (z. B. 1750 -> 1750-1759).
      return jahresAnfangJdn(datum.jahr, kalender)
  }
}

function teildatumEnde(datum: Teildatum, praezision: Praezision, kalender: Kalender): number {
  switch (praezision) {
    case 'tag':
      return teildatumAnfang(datum, praezision, kalender)
    case 'monat': {
      const { monat } = datum
      if (monat === undefined) {
        throw new Error("sortIntervall: praezision 'monat' braucht monat im Teildatum.")
      }
      return monatsEndeJdn(datum.jahr, monat, kalender)
    }
    case 'jahr':
      return jahresEndeJdn(datum.jahr, kalender)
    case 'jahrzehnt':
      return jahresEndeJdn(datum.jahr + 9, kalender)
  }
}

/**
 * Rechnet Präzision + Modifikator in ein garantiert sortiertes JDN-Intervall um
 * (`sortVon <= sortBis`). `vor`/`nach` sind exklusiv: die Grenze liegt einen Tag vor/nach dem
 * angegebenen Teildatum, die offene Seite bekommt die passende Sentinel-Konstante aus typen.ts.
 */
export function sortIntervall(eingabe: SortIntervallEingabe): SortIntervall {
  const { kalender, modifikator, praezision, datum, zweitesDatum } = eingabe

  switch (modifikator) {
    case 'vor':
      return { sortVon: SENTINEL_JDN_MIN, sortBis: teildatumAnfang(datum, praezision, kalender) - 1 }
    case 'nach':
      return { sortVon: teildatumEnde(datum, praezision, kalender) + 1, sortBis: SENTINEL_JDN_MAX }
    case 'zwischen':
    case 'von_bis': {
      const ende = zweitesDatum ?? datum
      return { sortVon: teildatumAnfang(datum, praezision, kalender), sortBis: teildatumEnde(ende, praezision, kalender) }
    }
    case 'exakt':
    case 'etwa':
    case 'geschaetzt':
    case 'berechnet':
      return { sortVon: teildatumAnfang(datum, praezision, kalender), sortBis: teildatumEnde(datum, praezision, kalender) }
  }
}
