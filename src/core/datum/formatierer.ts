// Wählt für einen Datumswert einen i18n-Schlüssel + Platzhalterwerte (AP-1.1). KEIN i18next,
// kein `t()` hier — src/core bleibt reines TypeScript (CLAUDE.md §4). Die Übersetzung selbst
// (Ressourcen: src/shared/i18n/de/datum.json) und die Namensraum-Registrierung im Renderer sind
// nicht Teil von AP-1.1 (siehe docs/80_Offene_Fragen.md, Abschnitt 9).
import type { Datumswert, Formatergebnis, Praezision } from './typen'

const MONATSNAMEN: readonly string[] = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

function monatsname(monatEinstellig: number): string {
  const name = MONATSNAMEN[monatEinstellig - 1]
  return name ?? `Monat ${monatEinstellig}`
}

/** Zerlegt ein ISO-artiges `wert1` ('1750'|'1750-03'|'1750-03-14') in seine Teile. */
function isoTeile(wert1: string): { readonly jahr: string; readonly monat: string | undefined; readonly tag: string | undefined } {
  const [jahr, monat, tag] = wert1.split('-')
  return { jahr: jahr ?? wert1, monat, tag }
}

function praezisionsFormat(wert: Datumswert, praezision: Praezision): Formatergebnis {
  switch (praezision) {
    case 'tag': {
      const { jahr, monat, tag } = isoTeile(wert.wert1)
      return { schluessel: 'datum:tag_monat_jahr', werte: { tag: tag ?? '', monat: monat ?? '', jahr } }
    }
    case 'monat': {
      const { jahr, monat } = isoTeile(wert.wert1)
      const monatNr = monat === undefined ? undefined : Number(monat)
      return { schluessel: 'datum:monat_jahr', werte: { monat: monatNr === undefined ? '' : monatsname(monatNr), jahr } }
    }
    case 'jahr':
      return { schluessel: 'datum:jahr', werte: { jahr: wert.wert1 } }
    case 'jahrzehnt':
      return { schluessel: 'datum:jahrzehnt', werte: { jahrzehnt: wert.wert1 } }
  }
}

/**
 * Formatiert einen `Datumswert` zu einem i18n-Schlüssel (Namensraum `datum`, siehe
 * src/shared/i18n/de/datum.json) + Platzhalterwerten. Ein gesetzter `originaltext` gewinnt immer
 * (sowohl die Old/New-Style-Doppeljahr-Schreibweise als auch die unaufgelöste liturgische
 * Datierung sollen unverändert erscheinen, nicht rekonstruiert werden).
 */
export function formatiere(wert: Datumswert): Formatergebnis {
  if (wert.originaltext !== undefined) {
    return { schluessel: 'datum:originaltext', werte: { text: wert.originaltext } }
  }

  switch (wert.modifikator) {
    case 'etwa':
      return { schluessel: 'datum:um', werte: { jahr: wert.wert1 } }
    case 'vor':
      return { schluessel: 'datum:vor', werte: { jahr: wert.wert1 } }
    case 'nach':
      return { schluessel: 'datum:nach', werte: { jahr: wert.wert1 } }
    case 'zwischen':
    case 'von_bis':
      return { schluessel: 'datum:zwischen', werte: { von: wert.wert1, bis: wert.wert2 ?? wert.wert1 } }
    case 'exakt':
    case 'geschaetzt':
    case 'berechnet':
      return praezisionsFormat(wert, wert.praezision)
  }
}
