// Parst deutschsprachige genealogische Datumsangaben zu einem `Datumswert` (AP-1.1). `parse()`
// wirft NIE — jede Eingabe liefert ein `ParseErgebnis`, notfalls mit einem `ParseGrund`.
import { tageImMonat } from './kalender'
import { sortIntervall } from './sortierschluessel'
import type { Datumswert, Kalender, Modifikator, ParseErgebnis, ParseGrund } from './typen'

const STANDARDKALENDER: Kalender = 'gregorian'

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

function monatVonName(name: string): number | undefined {
  const index = MONATSNAMEN.findIndex((monatsname) => monatsname.toLowerCase() === name.toLowerCase())
  return index === -1 ? undefined : index + 1
}

function zweistellig(zahl: number): string {
  return zahl < 10 ? `0${zahl}` : `${zahl}`
}

function isoTag(jahr: number, monat: number, tag: number): string {
  return `${jahr}-${zweistellig(monat)}-${zweistellig(tag)}`
}

/**
 * Liest eine Regex-Fanggruppe sicher aus (`noUncheckedIndexedAccess`, kein `!`). Nur für
 * Gruppen, die die aufrufende Regex laut ihrer eigenen Struktur bei einem Treffer immer belegt —
 * ein Fehlschlag hier ist ein Programmierfehler im Muster selbst, keine Nutzereingabe.
 */
function gruppe(treffer: RegExpExecArray, index: number): string {
  const wert = treffer[index]
  if (wert === undefined) {
    throw new Error(`parse: Regex-Gruppe ${index} unerwartet leer (Musterfehler).`)
  }
  return wert
}

function tagMonatPruefen(jahr: number, monat: number, tag: number, kalender: Kalender): ParseGrund | undefined {
  if (monat < 1 || monat > 12) {
    return 'ungueltiger_monat'
  }
  const maxTag = tageImMonat(jahr, monat, kalender)
  if (tag < 1 || tag > maxTag) {
    return 'ungueltiger_tag'
  }
  return undefined
}

function tagErgebnis(jahr: number, monat: number, tag: number, kalender: Kalender): ParseErgebnis {
  const grund = tagMonatPruefen(jahr, monat, tag, kalender)
  if (grund !== undefined) {
    return { ok: false, grund }
  }
  const { sortVon, sortBis } = sortIntervall({ kalender, modifikator: 'exakt', praezision: 'tag', datum: { jahr, monat, tag } })
  return {
    ok: true,
    wert: { kalender, modifikator: 'exakt', praezision: 'tag', wert1: isoTag(jahr, monat, tag), sortVon, sortBis },
  }
}

function jahrErgebnis(jahr: number, modifikator: Modifikator, kalender: Kalender = STANDARDKALENDER): ParseErgebnis {
  const { sortVon, sortBis } = sortIntervall({ kalender, modifikator, praezision: 'jahr', datum: { jahr } })
  return { ok: true, wert: { kalender, modifikator, praezision: 'jahr', wert1: `${jahr}`, sortVon, sortBis } }
}

/** Setzt `originaltext` (und optional `doppeljahr`) auf einem bereits erfolgreichen `jahrErgebnis`. */
function mitOriginaltext(basis: ParseErgebnis, originaltext: string, doppeljahr?: string): ParseErgebnis {
  if (!basis.ok) {
    return basis
  }
  const wert: Datumswert = doppeljahr === undefined ? { ...basis.wert, originaltext } : { ...basis.wert, originaltext, doppeljahr }
  return { ok: true, wert }
}

const MUSTER_ZWISCHEN = /^zwischen\s+(\d{4})\s+und\s+(\d{4})$/u
const MUSTER_OFFENES_INTERVALL = /^(vor|nach|um|etwa)\s+(\d{4})$/u
const MUSTER_TAG_MONAT_JAHR = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/u
const MUSTER_ISO_TAG = /^(\d{4})-(\d{2})-(\d{2})$/u
const MUSTER_MONATSNAME_JAHR = /^([A-Za-zÄÖÜäöü]+)\s+(\d{4})$/u
const MUSTER_DOPPELJAHR = /^(\d{4})\/(\d{2})$/u
const MUSTER_JAHR = /^(\d{4})$/u
const MUSTER_EINGEBETTETES_JAHR = /(\d{4})/u

export function parse(text: string): ParseErgebnis {
  const bereinigt = text.trim()
  if (bereinigt.length === 0) {
    return { ok: false, grund: 'leer' }
  }

  const zwischen = MUSTER_ZWISCHEN.exec(bereinigt)
  if (zwischen !== null) {
    const jahrVon = Number(gruppe(zwischen, 1))
    const jahrBis = Number(gruppe(zwischen, 2))
    const { sortVon, sortBis } = sortIntervall({
      kalender: STANDARDKALENDER,
      modifikator: 'zwischen',
      praezision: 'jahr',
      datum: { jahr: jahrVon },
      zweitesDatum: { jahr: jahrBis },
    })
    return {
      ok: true,
      wert: {
        kalender: STANDARDKALENDER,
        modifikator: 'zwischen',
        praezision: 'jahr',
        wert1: `${jahrVon}`,
        wert2: `${jahrBis}`,
        sortVon,
        sortBis,
      },
    }
  }

  const offenesIntervall = MUSTER_OFFENES_INTERVALL.exec(bereinigt)
  if (offenesIntervall !== null) {
    const schluesselwort = gruppe(offenesIntervall, 1)
    const jahr = Number(gruppe(offenesIntervall, 2))
    const modifikator: Modifikator = schluesselwort === 'vor' ? 'vor' : schluesselwort === 'nach' ? 'nach' : 'etwa'
    return jahrErgebnis(jahr, modifikator)
  }

  const tagMonatJahr = MUSTER_TAG_MONAT_JAHR.exec(bereinigt)
  if (tagMonatJahr !== null) {
    const tag = Number(gruppe(tagMonatJahr, 1))
    const monat = Number(gruppe(tagMonatJahr, 2))
    const jahr = Number(gruppe(tagMonatJahr, 3))
    return tagErgebnis(jahr, monat, tag, STANDARDKALENDER)
  }

  const isoTagTreffer = MUSTER_ISO_TAG.exec(bereinigt)
  if (isoTagTreffer !== null) {
    const jahr = Number(gruppe(isoTagTreffer, 1))
    const monat = Number(gruppe(isoTagTreffer, 2))
    const tag = Number(gruppe(isoTagTreffer, 3))
    return tagErgebnis(jahr, monat, tag, STANDARDKALENDER)
  }

  const monatsnameJahr = MUSTER_MONATSNAME_JAHR.exec(bereinigt)
  if (monatsnameJahr !== null) {
    const monat = monatVonName(gruppe(monatsnameJahr, 1))
    if (monat !== undefined) {
      const jahr = Number(gruppe(monatsnameJahr, 2))
      const { sortVon, sortBis } = sortIntervall({
        kalender: STANDARDKALENDER,
        modifikator: 'exakt',
        praezision: 'monat',
        datum: { jahr, monat },
      })
      return {
        ok: true,
        wert: {
          kalender: STANDARDKALENDER,
          modifikator: 'exakt',
          praezision: 'monat',
          wert1: `${jahr}-${zweistellig(monat)}`,
          sortVon,
          sortBis,
        },
      }
    }
  }

  const doppeljahr = MUSTER_DOPPELJAHR.exec(bereinigt)
  if (doppeljahr !== null) {
    const jahr = Number(gruppe(doppeljahr, 1))
    return mitOriginaltext(jahrErgebnis(jahr, 'exakt'), bereinigt, bereinigt)
  }

  const bloszesJahr = MUSTER_JAHR.exec(bereinigt)
  if (bloszesJahr !== null) {
    return jahrErgebnis(Number(gruppe(bloszesJahr, 1)), 'exakt')
  }

  const eingebettetesJahr = MUSTER_EINGEBETTETES_JAHR.exec(bereinigt)
  if (eingebettetesJahr !== null) {
    const jahr = Number(gruppe(eingebettetesJahr, 1))
    return mitOriginaltext(jahrErgebnis(jahr, 'exakt'), bereinigt)
  }

  return { ok: false, grund: 'unbekanntes_format' }
}
