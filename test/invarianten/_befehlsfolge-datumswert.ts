// AP-1.30 PR 9a-b (Prüfpfad-Folge zu #163, docs/80 §33 V-130-9-d1-datumswert) — geschützter
// Prüfpfad (CLAUDE.md §5/§13, ADR-025). Datumswert-Teil des Befehlsfolge-Generators
// (`_befehlsfolge-generator.ts`): Aussagen an Datumsprädikaten (`DATUMS_PRAEDIKATE`,
// src/core/person/datums-wert.ts — heute `geburtsdatum`/`todesdatum`), deren Wert die Datumsgruppe
// selbst IST (Entscheidung D1, so schreibt sie der Import). Ausgelagert wie `_befehlsfolge-beleg.ts`
// und `_befehlsfolge-koaleszenz.ts`: dieses Modul importiert den Generator NICHT; was es vom
// Generatorzustand braucht, beschreibt `DatumswertZustand` strukturell.
//
// WEGE (eine Aktion `datumswert`, der Weg ist Teil der Aktion):
// - `anlegen`: `aussage.anlegen` an einem Datumsprädikat NUR mit `datum` (keine Wertspalte).
// - `aendernDatum`: `aussage.aendern` an einer Datumsaussage ohne Wert, mit neuem `datum` — auch an
//   einer Zeile, die (Altbestand, Oberfläche seit AP-1.12) noch einen `wertText` trug: danach ist sie
//   eine reine Datumsaussage.
// - `aendernBeibehalten`: `aussage.aendern` an einer Datumsaussage ohne Wert, mit
//   `datumBeibehalten: true`. Trägt die Zeile ein Datum, bleibt die Datumsgruppe in allen elf Spalten
//   gleich; trägt sie keins (der allgemeine `aussageAendern`-Weg des Generators schickt einen Wert ohne
//   `datum` und entfernt es damit, O10), MUSS der Handler ablehnen — sonst entstünde eine Aussage ganz
//   ohne Wert (`VALIDIERUNG_PFLICHTFELD`).
// - Ablehnungswege (bewusst ungültig, wie `belegAblehnen`): `fremdMitDatum`/`fremdBeibehalten` —
//   `aussage.aendern` ohne Wert an einem Nicht-Datumsprädikat, mit `datum` bzw. `datumBeibehalten`
//   (das Schema lässt beides durch, der Handler lehnt gegen das gespeicherte Prädikat ab,
//   `VALIDIERUNG_PFLICHTFELD`); `fremdOhneWert` — `aussage.aendern` ganz ohne Wert und ohne Datum
//   (Schemafehler, `ZodError` aus `def.schema.parse` im Bus); `anlegenOhneDatum` — `aussage.anlegen`
//   an einem Datumsprädikat ohne Wert und ohne Datum (Schemafehler).
//
// VORLAUF: die beiden `aendern`-Wege brauchen eine Datumsaussage in DERSELBEN Folge. Ohne Vorlauf
// trafen sie über `{ seed, numRuns }` von `undo-bitgleich` nur 2 bzw. 3 Mal (gemessen, damals noch
// als Gewicht in `aktionArbitrary()`), die Altbestandsformen (Wert mit bzw. ohne Datum) nie. Darum legen sie — wenn `neuesZiel` gesetzt ist
// oder es keine Datumsaussage gibt — zuerst eine an, in einer von drei Formen (`vorlaufForm`): nur
// Datum (D1), `wertText` mit Datum (so schreibt die Oberfläche seit AP-1.12) oder `wertText` ohne Datum
// (Zustand nach dem allgemeinen `aussageAendern` ohne `datum`, O10) — und ändern dann genau sie. Das
// sind zwei Befehle und damit zwei Undo-Schritte: nach dem Vorlauf ruft der Weg `zwischenSchritt()`
// (Muster Serie, `_befehlsfolge-koaleszenz.ts`).
//
// ORAKEL (nicht nur Deckung): jeder erfolgreiche Weg prüft am Datenbankergebnis, dass die Zeile danach
// keine Wertspalte trägt und das erwartete Datum; jeder Ablehnungsweg prüft die erwartete Fehlerart
// UND dass der Bestand bitgleich blieb (kanonischer Abzug) und keine Transaktion entstand. Ein
// abgelehnter Befehl erzeugt keinen Undo-Schritt; `undo-bitgleich` ersetzt dann nur den letzten
// Schnappschuss durch einen identischen — ohne diese Prüfung sähe es eine Ablehnung, die doch etwas
// geschrieben hätte, nur über den nächsten Undo-Schritt.
import fc from 'fast-check'
import { ZodError } from 'zod'
import type { Tx } from '../../src/main/repositories/basis'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import type { AussageZeile } from '../../src/main/repositories/aussage-repo'
import { DATUMS_PRAEDIKATE, istDatumsPraedikat } from '../../src/core/person/datums-wert'
import type { Datumswert } from '../../src/shared/schemata/import-v1'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { befehl, txFingerabdruck, type Zweig } from './_befehlsfolge-beleg'
import { kanonischerAbzug } from './_kanonischer-abzug'

/** Was dieses Modul vom Generatorzustand braucht (strukturell, s. Modul-Kommentar). */
export interface DatumswertZustand {
  readonly personIds: readonly string[]
  readonly aussagen: readonly { readonly id: string }[]
  /** Nach jedem Befehl außer dem letzten einer Aktion (s. Modul-Kommentar VORLAUF). */
  readonly zwischenSchritt: () => void
}

/** Form der im Vorlauf angelegten Datumsaussage (s. Modul-Kommentar VORLAUF). */
export type VorlaufForm = 'nurDatum' | 'wertMitDatum' | 'wertOhneDatum'

export type DatumswertWeg =
  | 'anlegen'
  | 'aendernDatum'
  | 'aendernBeibehalten'
  | 'fremdMitDatum'
  | 'fremdBeibehalten'
  | 'fremdOhneWert'
  | 'anlegenOhneDatum'

export interface AktionDatumswert {
  readonly art: 'datumswert'
  readonly weg: DatumswertWeg
  readonly zielRoh: number
  readonly praedikat: (typeof DATUMS_PRAEDIKATE)[number]
  readonly datum: Datumswert
  readonly konfidenz: number
  /** Immer vorhandener Schlüssel (s. `AktionAussageAnlegen.istBevorzugt` im Generator). */
  readonly istBevorzugt: 0 | 1 | undefined
  readonly neuesZiel: boolean
  readonly vorlaufForm: VorlaufForm
}

/** Fester Vorrat gültiger Vertrags-Datumswerte (Muster `AUSSAGE_DATUMSWERTE` im Generator): ein
 * Tag, ein unscharfer Monat mit Apostroph im Originaltext, ein Zeitraum und die Altbestandsform mit
 * Zweitkalender und Doppeljahr. */
const DATUMSWERTE: readonly Datumswert[] = [
  { modifikator: 'exakt', praezision: 'tag', wert1: '1850-03-14' },
  { modifikator: 'etwa', praezision: 'monat', wert1: '1812-06', original_text: "um Juni 1812 (lt. O'Brien)" },
  { modifikator: 'zwischen', praezision: 'jahr', wert1: '1750', wert2: '1760', original_text: 'zwischen 1750 und 1760' },
  {
    kalender: 'julian',
    modifikator: 'exakt',
    praezision: 'tag',
    wert1: '1749-02-14',
    zweitkalender: 'gregorian',
    zweitwert: '1749-02-25',
    doppeljahr: '1748/49',
  },
]

/** Gewichte der Wege: die beiden `aendern`-Wege am höchsten (sie tragen die meisten Zweige,
 * `aendernBeibehalten` auch die Ablehnung ohne gespeichertes Datum), die übrigen je 1. */
export function datumswertAktionArbitrary(): fc.Arbitrary<AktionDatumswert> {
  return fc
    .record({
      weg: fc.oneof(
        { weight: 1, arbitrary: fc.constant<DatumswertWeg>('anlegen') },
        { weight: 2, arbitrary: fc.constant<DatumswertWeg>('aendernDatum') },
        { weight: 3, arbitrary: fc.constant<DatumswertWeg>('aendernBeibehalten') },
        { weight: 1, arbitrary: fc.constant<DatumswertWeg>('fremdMitDatum') },
        { weight: 1, arbitrary: fc.constant<DatumswertWeg>('fremdBeibehalten') },
        { weight: 1, arbitrary: fc.constant<DatumswertWeg>('fremdOhneWert') },
        { weight: 1, arbitrary: fc.constant<DatumswertWeg>('anlegenOhneDatum') },
      ),
      zielRoh: fc.nat(),
      praedikat: fc.constantFrom(...DATUMS_PRAEDIKATE),
      datum: fc.constantFrom(...DATUMSWERTE),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      istBevorzugt: fc.option(fc.constantFrom<0 | 1>(0, 1), { nil: undefined }),
      neuesZiel: fc.boolean(),
      vorlaufForm: fc.constantFrom<VorlaufForm>('nurDatum', 'wertMitDatum', 'wertOhneDatum'),
    })
    .map((r): AktionDatumswert => ({ art: 'datumswert', ...r }))
}

function zielAus<T>(liste: readonly T[], roh: number): T | undefined {
  return liste.length === 0 ? undefined : liste[roh % liste.length]
}

function zeileLesen(db: Tx, id: string): AussageZeile {
  const zeile = aussageRepo.lesen(db, id)
  if (zeile === undefined) {
    throw new Error(`datumswert: getrackte Aussage ${id} fehlt in der Datenbank.`)
  }
  return zeile
}

/** Getrackte Aussagen, deren gespeichertes Prädikat (k)ein Datumsprädikat ist — Reihenfolge des
 * Zustands (deterministisch, anders als eine Sortierung nach UUID v7). */
function zieleNachPraedikat(db: Tx, zustand: DatumswertZustand, datumsPraedikat: boolean): readonly string[] {
  return zustand.aussagen.map((a) => a.id).filter((id) => istDatumsPraedikat(zeileLesen(db, id).praedikat) === datumsPraedikat)
}

function hatWert(zeile: AussageZeile): boolean {
  return zeile.wert_text !== null || zeile.wert_zahl !== null || zeile.wert_ref_id !== null
}

/** Die elf Spalten der Datumsgruppe als kanonische Zeichenkette. */
function datumsgruppe(zeile: AussageZeile): string {
  return JSON.stringify([
    zeile.datum_kalender,
    zeile.datum_modifikator,
    zeile.datum_praezision,
    zeile.datum_wert1,
    zeile.datum_wert2,
    zeile.datum_originaltext,
    zeile.datum_sort_von,
    zeile.datum_sort_bis,
    zeile.datum_zweitkalender,
    zeile.datum_zweitwert,
    zeile.datum_doppeljahr,
  ])
}

/** Nach einem erfolgreichen Weg: keine Wertspalte, und das gesendete Datum steht in der Zeile. */
function nurDatumPruefen(zeile: AussageZeile, datum: Datumswert, weg: DatumswertWeg): void {
  if (hatWert(zeile) || !istDatumsPraedikat(zeile.praedikat)) {
    throw new Error(`datumswert (${weg}): die Zeile trägt danach eine Wertspalte oder kein Datumsprädikat.`)
  }
  if (zeile.datum_wert1 !== datum.wert1 || zeile.datum_modifikator !== datum.modifikator || zeile.datum_praezision !== datum.praezision) {
    throw new Error(`datumswert (${weg}): das gesendete Datum steht nicht in der Zeile.`)
  }
}

/** Das Ziel der `aendern`-Wege: eine bestehende Datumsaussage oder (Vorlauf) eine neu angelegte. */
function aendernZiel(db: Tx, zustand: DatumswertZustand, aktion: AktionDatumswert, zweige: Zweig[]): { readonly id: string; readonly angelegt: { readonly id: string; readonly subjektId: string } | undefined } | undefined {
  const bestehend = zielAus(zieleNachPraedikat(db, zustand, true), aktion.zielRoh)
  if (bestehend !== undefined && !aktion.neuesZiel) {
    return { id: bestehend, angelegt: undefined }
  }
  const subjektId = zielAus(zustand.personIds, aktion.zielRoh)
  if (subjektId === undefined) {
    return undefined
  }
  const { id } = befehl(zweige, db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId,
    praedikat: aktion.praedikat,
    konfidenz: aktion.konfidenz,
    ...(aktion.vorlaufForm === 'nurDatum' ? {} : { wertText: '1850' }),
    ...(aktion.vorlaufForm === 'wertOhneDatum' ? {} : { datum: aktion.datum }),
  })
  zustand.zwischenSchritt()
  return { id, angelegt: { id, subjektId } }
}

type Ablehnung = 'pflichtfeld' | 'schema'

/** Führt `ausfuehren` aus, verlangt die erwartete Ablehnung und einen bitgleichen Bestand ohne neue
 * Transaktion (s. Modul-Kommentar ORAKEL). */
function ablehnungVerlangen(db: Tx, weg: DatumswertWeg, erwartet: Ablehnung, ausfuehren: () => void): void {
  const abzugVorher = kanonischerAbzug(db)
  const txVorher = txFingerabdruck(db)
  let fehler: unknown
  try {
    ausfuehren()
  } catch (e) {
    fehler = e
  }
  const passt =
    erwartet === 'schema' ? fehler instanceof ZodError : fehler instanceof WurzelFehler && fehler.code === 'VALIDIERUNG_PFLICHTFELD'
  if (!passt) {
    throw new Error(`datumswert (${weg}): Ablehnung ${erwartet} erwartet, erhalten: ${fehler === undefined ? 'kein Fehler' : String(fehler)}`)
  }
  if (txFingerabdruck(db) !== txVorher) {
    throw new Error(`datumswert (${weg}): abgelehnter Befehl hat eine Transaktion hinterlassen.`)
  }
  if (kanonischerAbzug(db) !== abzugVorher) {
    throw new Error(`datumswert (${weg}): abgelehnter Befehl hat den Bestand verändert.`)
  }
}

/** Führt die Aktion aus; liefert eine neu angelegte Aussage (für `zustand.aussagen`) oder `undefined`. */
export function datumswertAusfuehren(
  db: Tx,
  zustand: DatumswertZustand,
  aktion: AktionDatumswert,
  zweige: Zweig[],
): { readonly id: string; readonly subjektId: string } | undefined {
  switch (aktion.weg) {
    case 'anlegen':
    case 'anlegenOhneDatum': {
      const subjektId = zielAus(zustand.personIds, aktion.zielRoh)
      if (subjektId === undefined) {
        return undefined
      }
      const basis = {
        subjektTyp: 'person' as const, // Literal für die Union `AussageSubjektTyp`
        subjektId,
        praedikat: aktion.praedikat,
        konfidenz: aktion.konfidenz,
        ...(aktion.istBevorzugt === undefined ? {} : { istBevorzugt: aktion.istBevorzugt }),
      }
      if (aktion.weg === 'anlegenOhneDatum') {
        ablehnungVerlangen(db, aktion.weg, 'schema', () => befehl(zweige, db, 'aussage.anlegen', basis))
        zweige.push('ablehnung.datumswert.anlegenOhneDatum')
        return undefined
      }
      const { id } = befehl(zweige, db, 'aussage.anlegen', { ...basis, datum: aktion.datum })
      nurDatumPruefen(zeileLesen(db, id), aktion.datum, aktion.weg)
      zweige.push('datumswert.anlegen.nurDatum')
      return { id, subjektId }
    }

    case 'aendernDatum': {
      const ziel = aendernZiel(db, zustand, aktion, zweige)
      if (ziel === undefined) {
        return undefined
      }
      const vorher = zeileLesen(db, ziel.id)
      befehl(zweige, db, 'aussage.aendern', { id: ziel.id, datum: aktion.datum, konfidenz: aktion.konfidenz })
      nurDatumPruefen(zeileLesen(db, ziel.id), aktion.datum, aktion.weg)
      zweige.push(hatWert(vorher) ? 'datumswert.aendern.wertEntfernt' : 'datumswert.aendern.nurDatum')
      return ziel.angelegt
    }

    case 'aendernBeibehalten': {
      const ziel = aendernZiel(db, zustand, aktion, zweige)
      if (ziel === undefined) {
        return undefined
      }
      const vorher = zeileLesen(db, ziel.id)
      const ein = { id: ziel.id, datumBeibehalten: true as const, konfidenz: aktion.konfidenz } // Literal für `datumBeibehalten?: true`
      if (vorher.datum_wert1 === null) {
        ablehnungVerlangen(db, aktion.weg, 'pflichtfeld', () => befehl(zweige, db, 'aussage.aendern', ein))
        zweige.push('ablehnung.datumswert.beibehaltenOhneDatum')
        return ziel.angelegt
      }
      befehl(zweige, db, 'aussage.aendern', ein)
      const nachher = zeileLesen(db, ziel.id)
      if (hatWert(nachher) || datumsgruppe(nachher) !== datumsgruppe(vorher)) {
        throw new Error('datumswert (aendernBeibehalten): Wertspalte danach gesetzt oder Datumsgruppe verändert.')
      }
      zweige.push('datumswert.aendern.beibehalten')
      return ziel.angelegt
    }

    case 'fremdMitDatum':
    case 'fremdBeibehalten':
    case 'fremdOhneWert': {
      const id = zielAus(zieleNachPraedikat(db, zustand, false), aktion.zielRoh)
      if (id === undefined) {
        return undefined
      }
      const ein =
        aktion.weg === 'fremdMitDatum'
          ? { id, datum: aktion.datum, konfidenz: aktion.konfidenz }
          : aktion.weg === 'fremdBeibehalten'
            ? { id, datumBeibehalten: true as const, konfidenz: aktion.konfidenz } // Literal für `datumBeibehalten?: true`
            : { id, konfidenz: aktion.konfidenz }
      ablehnungVerlangen(db, aktion.weg, aktion.weg === 'fremdOhneWert' ? 'schema' : 'pflichtfeld', () => befehl(zweige, db, 'aussage.aendern', ein))
      zweige.push(`ablehnung.datumswert.${aktion.weg}`)
      return undefined
    }
  }
}
