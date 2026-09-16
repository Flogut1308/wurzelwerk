// AP-1.1 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invarianten für das
// Datumsmodul (src/core/datum/{typen,parser,kalender,sortierschluessel,formatierer}.ts, auf main
// gemergt). Dieser PR fügt AUSSCHLIESSLICH diese eine Datei hinzu — kein Produktivcode wird
// angefasst (dependency-cruiser/ESLint sind hier ohnehin nicht anwendbar, das Gate ist der
// separate `pruefpfad-pruefen`-Lauf im PR).
//
// Geprüfte Invarianten (AP-1.1-Testliste):
//  1. `parse` ist idempotent: ein per Konstruktion gültiger Eingabestring `x` liefert ein
//     `ok:true`-Ergebnis; das Reserialisieren des gewonnenen `Datumswert` zurück in einen
//     äquivalenten Eingabetext und erneutes Parsen liefert denselben `Datumswert` (bitgleich,
//     `toEqual`). Zusätzlich: `parse(x)` ist bei wiederholtem Aufruf stabil (reine Funktion).
//  2. `formatiere(parse(x))` ist ein Fixpunkt: erneutes Formatieren desselben `Datumswert` liefert
//     dasselbe `Formatergebnis`, und der Rundlauf-Wert aus (1) formatiert identisch zum
//     Originalwert. Die über den Generator erreichbare Schlüsselmenge aus `formatiere` deckt sich
//     exakt mit der Teilmenge, die die abgedeckten Formate erzeugen können (kein Schlüssel fällt
//     "durch", keiner taucht unerwartet auf).
//  3. Für jedes `ok:true`-Ergebnis gilt `sortVon <= sortBis`.
//
// Reserialisierung: Die Testdatei baut aus einem `Datumswert` bewusst NICHT über `formatiere`
// (das ist reine Anzeige, kein Eingabeformat), sondern über eine kleine, hier lokal gehaltene
// Inverse zu den Mustern in parser.ts einen erneut parsbaren Text. Das ist Testmaterial, keine
// Produktionslogik — sie dupliziert absichtlich nichts aus src/core, sondern bildet nur die in
// AP-1.1 dokumentierten Textformen ('DD.MM.YYYY', 'Monatsname JAHR', 'YYYY', 'um/vor/nach YYYY',
// 'zwischen YYYY und YYYY') aus den Feldern des Ergebniswertes zurück.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parse } from '../../src/core/datum/parser'
import { tageImMonat } from '../../src/core/datum/kalender'
import { formatiere } from '../../src/core/datum/formatierer'
import type { Datumswert, Formatergebnis } from '../../src/core/datum/typen'

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

/** Zerlegt ein 'YYYY-MM'-`wert1` sicher (kein `!`, `noUncheckedIndexedAccess`, CLAUDE.md §4). */
function jahrMonatAusWert1(wert1: string): { readonly jahr: string; readonly monat: string } {
  const teile = wert1.split('-')
  const jahr = teile[0]
  const monat = teile[1]
  if (jahr === undefined || monat === undefined) {
    throw new Error(`reserialisiere: wert1 '${wert1}' hat nicht das erwartete Format 'YYYY-MM'.`)
  }
  return { jahr, monat }
}

/**
 * Baut aus einem von `parse()` gewonnenen `Datumswert` einen Text, der laut den Mustern in
 * parser.ts erneut zu einem äquivalenten `Datumswert` parsen sollte. Deckt genau die Formen ab,
 * die der Generator unten erzeugt (kein `originaltext`-Fall, siehe Generator-Kommentar).
 */
function reserialisiere(wert: Datumswert): string {
  if (wert.originaltext !== undefined) {
    // Fallback-/Doppeljahr-Treffer erzeugen den Text nicht neu, sondern übernehmen ihn
    // unverändert — Reserialisierung ist hier die Identität auf `originaltext` selbst.
    return wert.originaltext
  }

  switch (wert.modifikator) {
    case 'etwa':
      return `um ${wert.wert1}`
    case 'vor':
      return `vor ${wert.wert1}`
    case 'nach':
      return `nach ${wert.wert1}`
    case 'zwischen':
    case 'von_bis':
      return `zwischen ${wert.wert1} und ${wert.wert2 ?? wert.wert1}`
    case 'exakt':
    case 'geschaetzt':
    case 'berechnet':
      switch (wert.praezision) {
        case 'tag':
          return wert.wert1 // 'YYYY-MM-DD' ist bereits die ISO-Tagesform.
        case 'monat': {
          const { jahr, monat } = jahrMonatAusWert1(wert.wert1)
          const monatNr = Number(monat)
          const name = MONATSNAMEN[monatNr - 1]
          if (name === undefined) {
            throw new Error(`reserialisiere: Monatsnummer ${monatNr} außerhalb 1-12.`)
          }
          return `${name} ${jahr}`
        }
        case 'jahr':
          return wert.wert1
        case 'jahrzehnt':
          return wert.wert1
      }
  }
}

type ErzeugteEingabe = { readonly art: string; readonly text: string }

/** 'DD.MM.YYYY' mit echter Monatslänge (`tageImMonat`), Jahr vierstellig (\d{4}-Muster). */
function tagArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc
    .record({ jahr: fc.integer({ min: 1000, max: 9999 }), monat: fc.integer({ min: 1, max: 12 }) })
    .chain(({ jahr, monat }) =>
      fc
        .integer({ min: 1, max: tageImMonat(jahr, monat, 'gregorian') })
        .map((tag): ErzeugteEingabe => ({ art: 'tag', text: `${tag}.${monat}.${jahr}` })),
    )
}

/** 'Monatsname JAHR'. */
function monatsnameArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc
    .record({ jahr: fc.integer({ min: 1000, max: 9999 }), monatIndex: fc.integer({ min: 0, max: 11 }) })
    .map(({ jahr, monatIndex }): ErzeugteEingabe => ({ art: 'monatsname', text: `${MONATSNAMEN[monatIndex] ?? 'Januar'} ${jahr}` }))
}

/** Bloße Jahreszahl 'YYYY'. */
function jahrArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc.integer({ min: 1000, max: 9999 }).map((jahr): ErzeugteEingabe => ({ art: 'jahr', text: `${jahr}` }))
}

/** 'um YYYY' / 'etwa YYYY' — beide Schlüsselwörter parsen auf denselben Modifikator 'etwa'. */
function etwaArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc
    .record({ jahr: fc.integer({ min: 1000, max: 9999 }), schluesselwort: fc.constantFrom('um', 'etwa') })
    .map(({ jahr, schluesselwort }): ErzeugteEingabe => ({ art: 'etwa', text: `${schluesselwort} ${jahr}` }))
}

/** 'vor YYYY'. */
function vorArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc.integer({ min: 1000, max: 9999 }).map((jahr): ErzeugteEingabe => ({ art: 'vor', text: `vor ${jahr}` }))
}

/** 'nach YYYY', über den vollen gültigen Jahresbereich wie die anderen Formen (inkl. `jahr:9999`). */
function nachArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc.integer({ min: 1000, max: 9999 }).map((jahr): ErzeugteEingabe => ({ art: 'nach', text: `nach ${jahr}` }))
}

/** 'zwischen YYYY und YYYY', aufsteigend (die dokumentierte gültige Verwendung dieser Form). */
function zwischenArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc
    .record({ jahrVon: fc.integer({ min: 1000, max: 9900 }), spanne: fc.integer({ min: 0, max: 99 }) })
    .map(({ jahrVon, spanne }): ErzeugteEingabe => ({ art: 'zwischen', text: `zwischen ${jahrVon} und ${jahrVon + spanne}` }))
}

/**
 * Vereinigt alle sieben abgedeckten, per Konstruktion gültigen Textformen. Die Doppeljahr-Form
 * ('1750/51') ist bewusst NICHT enthalten: sie setzt `originaltext`/`doppeljahr` und deren
 * Reserialisierung ist laut `reserialisiere()` die Identität auf sich selbst — ein eigener Test
 * unten deckt diesen Fall gezielt mit festen Beispielen ab, statt die Fixpunkt-Eigenschaft der
 * Property künstlich zu verwässern.
 */
function eingabeArbitrary(): fc.Arbitrary<ErzeugteEingabe> {
  return fc.oneof(tagArbitrary(), monatsnameArbitrary(), jahrArbitrary(), etwaArbitrary(), vorArbitrary(), nachArbitrary(), zwischenArbitrary())
}

/** Formatierer-Schlüssel, die die obigen sieben Formen über `parse` + `formatiere` erreichen können. */
const ERREICHBARE_SCHLUESSEL: ReadonlySet<string> = new Set([
  'datum:tag_monat_jahr',
  'datum:monat_jahr',
  'datum:jahr',
  'datum:um',
  'datum:vor',
  'datum:nach',
  'datum:zwischen',
])

describe('Invariante: Datums-Rundlauf (parse/formatiere, AP-1.1)', () => {
  it('parse ist idempotent (Reserialisierung + erneutes Parsen ergibt denselben Datumswert) und formatiere(parse(x)) ist ein Fixpunkt', () => {
    const gesehen = new Set<string>()

    fc.assert(
      fc.property(eingabeArbitrary(), ({ text }) => {
        const erstesErgebnis = parse(text)
        expect(erstesErgebnis.ok).toBe(true)
        if (!erstesErgebnis.ok) {
          return
        }

        // (3) sortVon <= sortBis für jeden ok-Wert.
        expect(erstesErgebnis.wert.sortVon).toBeLessThanOrEqual(erstesErgebnis.wert.sortBis)

        // parse(x) ist bei Wiederholung stabil (reine Funktion, kein verstecktes Datum/Zeit).
        expect(parse(text)).toEqual(erstesErgebnis)

        // (1) Idempotenz über Reserialisierung: Text -> Wert -> Text' -> Wert' ist bitgleich.
        const reserialisierterText = reserialisiere(erstesErgebnis.wert)
        const zweitesErgebnis = parse(reserialisierterText)
        expect(zweitesErgebnis).toEqual(erstesErgebnis)

        // (2) formatiere(parse(x)) ist ein Fixpunkt: erneutes Formatieren liefert denselben
        // Formatergebnis-Wert, und der Rundlauf-Wert formatiert identisch zum Original.
        const ersteFormatierung: Formatergebnis = formatiere(erstesErgebnis.wert)
        expect(formatiere(erstesErgebnis.wert)).toEqual(ersteFormatierung)
        if (zweitesErgebnis.ok) {
          expect(formatiere(zweitesErgebnis.wert)).toEqual(ersteFormatierung)
        }

        expect(ERREICHBARE_SCHLUESSEL.has(ersteFormatierung.schluessel)).toBe(true)
        gesehen.add(ersteFormatierung.schluessel)
      }),
      { seed: 20260916, numRuns: 500 },
    )

    // Deckungsgleichheit: über den Generator wird tatsächlich jeder erreichbare Schlüssel
    // getroffen — keiner fehlt, keiner taucht zusätzlich auf (Parser-/Formatierer-Schlüsselmenge
    // sind für die abgedeckten Formen deckungsgleich).
    expect(gesehen).toEqual(ERREICHBARE_SCHLUESSEL)
  })

  it('Doppeljahr-Form (z. B. "1750/51"): Reserialisierung ist die Identität auf originaltext, Rundlauf bleibt bitgleich', () => {
    for (const text of ['1750/51', '1799/00', '2024/25']) {
      const erstesErgebnis = parse(text)
      expect(erstesErgebnis.ok).toBe(true)
      if (!erstesErgebnis.ok) {
        continue
      }
      expect(erstesErgebnis.wert.sortVon).toBeLessThanOrEqual(erstesErgebnis.wert.sortBis)

      const reserialisierterText = reserialisiere(erstesErgebnis.wert)
      expect(reserialisierterText).toBe(text)
      expect(parse(reserialisierterText)).toEqual(erstesErgebnis)

      const ersteFormatierung = formatiere(erstesErgebnis.wert)
      expect(formatiere(erstesErgebnis.wert)).toEqual(ersteFormatierung)
      expect(ersteFormatierung.schluessel).toBe('datum:originaltext')
    }
  })
})
