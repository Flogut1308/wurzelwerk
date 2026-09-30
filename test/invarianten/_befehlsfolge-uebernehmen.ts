// AP-1.30 PR 11-0b (Prüfpfad-Folge zu #200, docs/80 §33 V-130-11-0, V-130-11-0b) — geschützter Prüfpfad
// (CLAUDE.md §5/§13, ADR-025). Übernehmen-Teil des Befehlsfolge-Generators (`_befehlsfolge-generator.ts`):
// `befehl:namensform.uebernehmen` (Schreibweg des Modals „Namensform bearbeiten") mit gültigen UND absichtlich
// ungültigen Aufrufen. Ausgelagert wie `_befehlsfolge-namensteile.ts`: dieses Modul importiert den Generator
// NICHT; was es vom Generatorzustand braucht, beschreibt `UebernehmenZustand` strukturell.
//
// WEGE (eine Aktion `uebernehmen`, der Weg ist Teil der Aktion; jeder Aufruf schickt die VOLLSTÄNDIGE
// Zielliste der Teile):
// - `gemischt`: in EINEM Aufruf ein Vorname gelöscht, ein Vorname geändert, ein Vorname neu, die übrigen
//   Vornamen umgekehrt (echte Umordnung) und der Rufname auf einen anderen Vornamen gewechselt; die Teile der
//   übrigen Arten je nach Plan behalten, gelöscht, geändert, mit anderer femininer Variante, geleert (entfällt)
//   oder mit Leerraum am Rand (bleibt), dazu in sich umgeordnet; neue Teile beliebiger Art (auch leere, die
//   verworfen werden); ein Kopf aus einzelnen Feldern; `hauptname` nach Wurf.
// - `neueForm`: `formId: null` mit Teilen und `hauptname: true`.
// - `originalTextNeu`: `formId: null` mit gesetztem `originalText`, der wortgetreu bleiben muss — auch eine
//   Montage nur der Teile der ERSTEN Art der Zielliste („Nowak" bei [Nowak, Karl], Review #200 V1), die eine zu
//   frühe Kopf-Schreibung von der Nachführung neu montieren ließe, und `''`.
// - `kopf`: bestehende Form, Teile unverändert, einzelne Kopf-Felder gesetzt (fehlt = bleibt), auch
//   `originalText: ''`.
// - `noop`: Zielliste = gespeicherter Stand (auch mit Leerraum am Rand und leeren neuen Einträgen), Kopf-Felder
//   mit ihrem gespeicherten Wert, `hauptname: true` nur an der bevorzugten Form — keine Transaktion.
// - `leer`: ein bestehender Teil geleert (entfällt), leere neue Einträge (verworfen).
// - `e3Grenzfall`: die beiden Randfälle der E3-Regel je Aufruf (V-130-fix-uebernehmen-e3) gezielt — (a) Text
//   „Karl  Nowak" (Anlege-Montage ohne angehängten Rufnamen, doppelter Leerraum) an [Karl, Peter (Rufname),
//   Nowak], dann Peter gelöscht: die Montage ändert sich, der alte Text passte weiter — geglättet zu „Karl
//   Nowak"; (b) Text „Karl Nowak" an derselben Form, dann Rufname auf Karl: gleiche Montage, der alte Text passt
//   nicht mehr — neu montiert zu „Karl Peter Nowak".
// - Ein Altbestand mit verbotenem Umschrift-Bezug (Mutante A2, U-130-10b-folge) ist über Befehle seit
//   V-130-fix-umschrift-selbstbezug nicht mehr erreichbar; ihn prüft `uebernehmen-altbestand.test.ts` (per Import
//   geschrieben). Hier zählt das Orakel nur `uebernehmen.altbestand`, falls ein solcher Stand doch vorliegt.
// - ABLEHNUNGEN (Grundsatz E-B2-2): Art-Wechsel bei gleicher ID (`VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND`),
//   Leerraum in einem geänderten Vornamen (`VALIDIERUNG_NAMENSTEIL_LEERRAUM`), fremde bzw. unbekannte Teil-ID
//   (`NICHT_GEFUNDEN_NAMENSTEIL`), Rufname an einem Nicht-Vornamen (`VALIDIERUNG_RUFNAME_KEIN_VORNAME`),
//   Umschrift-Bezug (auf sich selbst, auf die Form einer anderen Person, `rolle: null` ohne Ursprungsform —
//   `VALIDIERUNG_UMSCHRIFT_BEZUG`), dazu über die flache Brücke (`ablehnungFlachBezug`): `name.anlegen` mit
//   Bezug auf die Form einer fremden Person, `name.aendern` mit Selbstbezug bzw. mit einem Kreis (a ↔ b) —
//   ebenfalls `VALIDIERUNG_UMSCHRIFT_BEZUG`. Verlangt wird genau dieser Code, keine neue Transaktion und ein bitgleicher
//   kanonischer Abzug — sonst wirft das Modul.
//
// VORLAUF: fehlt, was ein Weg braucht (eine Form, genug Vornamen, ein Rufname, eine wortgetreue Schreibung,
// eine zweite Person mit Form), legt das Modul es per `namensform.uebernehmen` selbst an (je ein Aufruf mit
// demselben Orakel, danach `zwischenSchritt()`), die Kreis-Vorstufe per `name.anlegen`. Ohne Person ist die
// Aktion ein No-op; Personen legt das Modul nie an. Eigene Formen stehen in `zustand.uebernahmeFormen` (weder
// in `namen` noch in `namensformen`: dort verschöben sie die Ziele der Hauptfolge bzw. der Namensteil-Aktionen).
//
// ORAKEL (nach jedem Aufruf, allein aus Stand VORHER und Zielliste — nicht aus der Schrittfolge des Handlers):
// - Teile je Art = genau die nicht leeren Einträge der Zielliste dieser Art in Zielfolge: bestehende mit ihrer
//   ID, neue mit einer bisher unvergebenen; Wert getrimmt (ein getrimmt gleicher Wert bleibt der gespeicherte);
//   feminine Variante fehlt = bleibt (neu: `NULL`); Rufname genau am markierten Eintrag. Keine anderen Teile.
// - Unveränderte Teile: stimmt die Zielliste einer Art bis einschließlich eines Teils mit dem gespeicherten
//   Stand überein (dieselben IDs auf denselben Rängen), behält er `sortier_index`; ohne mitgeschickte Variante
//   behält jeder bestehende Teil seine `feminine_variante`.
// - Kopf: ein mitgeschicktes Feld hat danach diesen Wert, ein fehlendes den bisherigen (neue Form: `NULL`).
//   `original_text` (E3): ein mitgeschickter, vom gespeicherten ABWEICHENDER Wert steht danach wortgetreu (bei
//   einer neuen Form jeder nicht leere Wert, auch `''`); sonst gilt: war der gespeicherte Text vorher eine
//   automatische Montage der Teile (`istMontierterOriginalText`, `NULL` zählt als automatisch) und ändert der
//   Aufruf die Teile, ist er danach die Montage der Zielteile, sonst unverändert.
// - Andere Formen und ihre Teile unverändert, bis auf `ist_bevorzugt` beim Hauptnamenwechsel (`hauptname:
//   true` → genau diese Form bevorzugt; eine neue Form ohne `hauptname` ist bevorzugt genau dann, wenn die
//   Person noch keine Form hatte).
// - Journal: ändert der Aufruf laut Erwartung etwas, genau EIN neuer Undo-Schritt (`journal.namensform_
//   uebernommen`); sonst keine Transaktion.
import fc from 'fast-check'
import type { Tx } from '../../src/main/repositories/basis'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach, type GeladenerTeil } from '../../src/core/name/zerlegung'
import type { NamensformUebernehmenEin, NamensformUebernehmenKopf, NamensformUebernehmenTeil } from '../../src/shared/schemata/befehle'
import { NameFormReihenfolgeEnum, NameFormRolleEnum, NamePartArtEnum, SchriftEnum, UmschriftNormEnum } from '../../src/shared/schemata/name'
import { befehl, txFingerabdruck, type Zweig } from './_befehlsfolge-beleg'
import { ablehnungVerlangen } from './_befehlsfolge-namensteile'

type NamePartArt = (typeof NamePartArtEnum.options)[number]
type NameFormRolle = (typeof NameFormRolleEnum.options)[number]

interface FormInfo {
  readonly id: string
  readonly personId: string
}

/** Was dieses Modul vom Generatorzustand braucht (strukturell, s. Modul-Kommentar). */
export interface UebernehmenZustand {
  readonly personIds: readonly string[]
  /** Formen der Hauptfolge bzw. der Namensteil-Aktionen — hier nur gelesen. */
  readonly namen: readonly FormInfo[]
  readonly namensformen: readonly FormInfo[]
  /** Die Formen dieses Moduls (auch als Vorlauf mitten in der Aktion eingetragen). Der Generator filtert sie
   * nach `person.loeschen` (CASCADE). */
  readonly uebernahmeFormen: FormInfo[]
  readonly zwischenSchritt: () => void
}

export type UebernehmenWeg =
  | 'gemischt'
  | 'neueForm'
  | 'originalTextNeu'
  | 'kopf'
  | 'noop'
  | 'leer'
  | 'e3Grenzfall'
  | 'ablehnungArt'
  | 'ablehnungLeerraum'
  | 'ablehnungFremd'
  | 'ablehnungKeinVorname'
  | 'ablehnungUmschrift'
  | 'ablehnungFlachBezug'

type TeilWas = 'behalten' | 'loeschen' | 'aendern' | 'feminin' | 'leeren' | 'rand'

interface TeilPlan {
  readonly was: TeilWas
  readonly schluessel: number
}

interface NeuerTeilRoh {
  readonly art: NamePartArt
  readonly wert: string
  readonly feminineVariante: string | null | undefined
  readonly stelle: number
}

/** Kopf-Rohwerte: `undefined` = fehlt. Nie `umschriftVon` (nur in den Wegen `noop`/`ablehnungUmschrift`),
 * nie `rolle: null` (E7), `originalText` steuert `textArt`. */
interface KopfRoh {
  readonly rolle: NameFormRolle | undefined
  readonly rollenNotiz: string | null | undefined
  readonly sprache: string | null | undefined
  readonly schrift: (typeof SchriftEnum.options)[number] | null | undefined
  readonly reihenfolge: (typeof NameFormReihenfolgeEnum.options)[number] | null | undefined
  readonly umschriftNorm: (typeof UmschriftNormEnum.options)[number] | null | undefined
  readonly konfidenz: number | null | undefined
  readonly gueltigVon: number | null | undefined
  readonly gueltigBis: number | null | undefined
}

/** Welcher `originalText` mitkommt: Montage des Stands VORHER (bestehende Form) bzw. nur der ersten Art (neue
 * Form), eine wortgetreue Schreibung, der gespeicherte Text unverändert (bestehende Form) bzw. die volle Montage
 * (neue Form), `''`, oder keiner. */
type TextArt = 'praefixMontage' | 'wortgetreu' | 'unveraendert' | 'leer' | 'keiner'

export interface AktionUebernehmen {
  readonly art: 'uebernehmen'
  readonly weg: UebernehmenWeg
  /** Form (aus allen bekannten Formen) bzw. Person bei `neueForm`/`originalTextNeu`. */
  readonly zielRoh: number
  /** Auswahlwerte für Stellen und Teile (Länge 6). */
  readonly wahl: readonly number[]
  /** Plan für die Teile der Nicht-Vorname-Arten (je Teil `plan[i % 6]`). */
  readonly plan: readonly TeilPlan[]
  readonly neue: readonly NeuerTeilRoh[]
  /** Rohwerte für geänderte bzw. neue Werte (Länge 4). */
  readonly werte: readonly string[]
  readonly kopf: KopfRoh
  readonly textArt: TextArt
  readonly hauptname: boolean
  /** Vorname mit innerem Leerraum (Ablehnung). */
  readonly leerraum: string
}

const WORTGETREU = 'Joh. Georg Müller alias Miller'

function wertArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    {
      weight: 4,
      arbitrary: fc.constantFrom(
        'Karl',
        'Anna',
        "O'Brien",
        'Ольга',
        ' Luise ',
        'Jóhann',
        'Lu😀',
        'von der',
        'Nowak',
        'Lüdenscheidt-Meyer genannt Schulte',
        "d'Aboville",
        'Iwanowitsch',
        'Dr.',
      ),
    },
    { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 8 }) },
  )
}

function fehltOder<T>(werte: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> {
  return fc.oneof({ weight: 3, arbitrary: fc.constant(undefined) }, { weight: 1, arbitrary: werte })
}

function kopfArbitrary(): fc.Arbitrary<KopfRoh> {
  return fc.record({
    rolle: fehltOder(fc.constantFrom(...NameFormRolleEnum.options)),
    rollenNotiz: fehltOder(fc.constantFrom<string | null>('Notiz', "O'Brien-Linie", '', null)),
    sprache: fehltOder(fc.constantFrom<string | null>('de', 'ru', 'la', null)),
    schrift: fehltOder(fc.constantFrom(...SchriftEnum.options, null)),
    reihenfolge: fehltOder(fc.constantFrom(...NameFormReihenfolgeEnum.options, null)),
    umschriftNorm: fehltOder(fc.constantFrom(...UmschriftNormEnum.options, null)),
    konfidenz: fehltOder(fc.constantFrom<number | null>(1, 2, 3, 4, null)),
    gueltigVon: fehltOder(fc.constantFrom<number | null>(17500101, 18000000, null)),
    gueltigBis: fehltOder(fc.constantFrom<number | null>(18991231, 19000000, null)),
  })
}

function weg(gewicht: number, w: UebernehmenWeg): { readonly weight: number; readonly arbitrary: fc.Arbitrary<UebernehmenWeg> } {
  return { weight: gewicht, arbitrary: fc.constant<UebernehmenWeg>(w) }
}

/** Gewichte: `gemischt` dreifach, die übrigen gültigen Wege und die beiden Umschrift-Ablehnungen (je drei
 * Varianten) doppelt, `noop`/`leer`/`e3Grenzfall` und jede übrige Ablehnung einfach. */
export function uebernehmenAktionArbitrary(): fc.Arbitrary<AktionUebernehmen> {
  return fc
    .record({
      weg: fc.oneof(
        weg(3, 'gemischt'),
        weg(2, 'neueForm'),
        weg(2, 'originalTextNeu'),
        weg(2, 'kopf'),
        weg(1, 'noop'),
        weg(1, 'leer'),
        weg(1, 'e3Grenzfall'),
        weg(1, 'ablehnungArt'),
        weg(1, 'ablehnungLeerraum'),
        weg(1, 'ablehnungFremd'),
        weg(1, 'ablehnungKeinVorname'),
        weg(2, 'ablehnungUmschrift'),
        weg(2, 'ablehnungFlachBezug'),
      ),
      zielRoh: fc.nat(),
      wahl: fc.array(fc.nat(), { minLength: 6, maxLength: 6 }),
      plan: fc.array(
        fc.record({
          was: fc.constantFrom<TeilWas>('behalten', 'behalten', 'loeschen', 'aendern', 'feminin', 'leeren', 'rand'),
          schluessel: fc.nat(),
        }),
        { minLength: 6, maxLength: 6 },
      ),
      neue: fc.array(
        fc.record({
          art: fc.constantFrom(...NamePartArtEnum.options),
          wert: fc.oneof({ weight: 4, arbitrary: wertArbitrary() }, { weight: 1, arbitrary: fc.constantFrom('', '   ', '\t') }),
          feminineVariante: fc.option(fc.constantFrom<string | null>('Iwanowna', 'Petrowa', 'Müllerin', '', null), { nil: undefined }),
          stelle: fc.nat(),
        }),
        { minLength: 0, maxLength: 3 },
      ),
      werte: fc.array(wertArbitrary(), { minLength: 4, maxLength: 4 }),
      kopf: kopfArbitrary(),
      textArt: fc.constantFrom<TextArt>('praefixMontage', 'wortgetreu', 'unveraendert', 'leer', 'keiner'),
      hauptname: fc.boolean(),
      leerraum: fc.constantFrom('Hans Peter', 'Anna\tMaria', 'Karl Heinz', ' Karl  Otto '),
    })
    .map((r): AktionUebernehmen => ({ art: 'uebernehmen', ...r }))
}

// -----------------------------------------------------------------------------------------------
// Lesehilfen (eigene SQL — `test/` unterliegt nicht CLAUDE.md §2)
// -----------------------------------------------------------------------------------------------

interface TeilZeile {
  readonly id: string
  readonly name_form_id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
}

interface FormZeile {
  readonly id: string
  readonly person_id: string
  readonly rolle: string | null
  readonly rollen_notiz: string | null
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly konfidenz: number | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly original_text: string | null
  readonly ist_bevorzugt: number
  readonly sortier_index: number | null
}

function alleTeile(db: Tx): readonly TeilZeile[] {
  return db
    .prepare<[], TeilZeile>(
      `SELECT id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante
         FROM name_part ORDER BY name_form_id, art, sortier_index, id`,
    )
    .all()
}

function alleFormenLesen(db: Tx): readonly FormZeile[] {
  return db
    .prepare<[], FormZeile>(
      `SELECT id, person_id, rolle, rollen_notiz, sprache, schrift, reihenfolge, umschrift_von, umschrift_norm,
              konfidenz, gueltig_von, gueltig_bis, original_text, ist_bevorzugt, sortier_index
         FROM name_form ORDER BY id`,
    )
    .all()
}

/** Teile einer Form in Zielfolge: nach Art (Reihenfolge von `NamePartArtEnum`), dann Stelle. */
function teileDerForm(db: Tx, formId: string): readonly TeilZeile[] {
  const teile = alleTeile(db).filter((t) => t.name_form_id === formId)
  const rang = (art: string): number => NamePartArtEnum.options.findIndex((a) => a === art)
  return [...teile].sort((a, b) => rang(a.art) - rang(b.art) || a.sortier_index - b.sortier_index)
}

function formLesen(db: Tx, formId: string): FormZeile {
  const form = alleFormenLesen(db).find((f) => f.id === formId)
  if (form === undefined) {
    throw new Error(`uebernehmen: Form ${formId} fehlt in der Datenbank.`)
  }
  return form
}

function artVon(roh: string): NamePartArt {
  return NamePartArtEnum.parse(roh)
}

function zielAus<T>(liste: readonly T[], roh: number): T | undefined {
  return liste.length === 0 ? undefined : liste[roh % liste.length]
}

function wahl(aktion: AktionUebernehmen, i: number): number {
  return aktion.wahl[i] ?? 0
}

/** Ein gültiger Wert der Art (Vornamen ohne inneren Leerraum, nie leer); Leerraum am Rand bleibt. */
function gueltigerWert(art: string, roh: string): string {
  const wert = art === 'vorname' && /\s/u.test(roh.trim()) ? roh.replace(/\s/gu, '') : roh
  if (wert.trim() === '') {
    return art === 'vorname' ? 'Karl' : 'von der'
  }
  return wert
}

/** Ein gültiger Wert der Art, der sich (getrimmt) vom gespeicherten unterscheidet. */
function andererWert(art: string, gespeichert: string, roh: string): string {
  const wert = gueltigerWert(art, roh)
  if (wert.trim() !== gespeichert) return wert
  const ersatz = art === 'vorname' ? ['Karl', 'Anna'] : ['von der', 'Nowak']
  return ersatz[0] === gespeichert ? (ersatz[1] ?? 'Anna') : (ersatz[0] ?? 'Karl')
}

/** Der gespeicherte Teil als unveränderter Eintrag der Zielliste. */
function unveraendert(t: TeilZeile): NamensformUebernehmenTeil {
  return { id: t.id, art: artVon(t.art), wert: t.wert, istRufname: t.ist_rufname === 1 }
}

function flachAus(teile: readonly { readonly art: NamePartArt; readonly wert: string; readonly istRufname: boolean }[]): ReturnType<typeof rekonstruiereFlach> {
  const geladen: GeladenerTeil[] = []
  const zaehler = new Map<NamePartArt, number>()
  for (const t of teile) {
    const rang = zaehler.get(t.art) ?? 0
    zaehler.set(t.art, rang + 1)
    geladen.push({ art: t.art, wert: t.wert, istRufname: t.istRufname, sortierIndex: rang })
  }
  return rekonstruiereFlach(geladen)
}

function flachDerZeilen(teile: readonly TeilZeile[]): ReturnType<typeof rekonstruiereFlach> {
  return flachAus(teile.map((t) => ({ art: artVon(t.art), wert: t.wert, istRufname: t.ist_rufname === 1 })))
}

// -----------------------------------------------------------------------------------------------
// Orakel
// -----------------------------------------------------------------------------------------------

/** Erwarteter Teil (s. Modul-Kommentar ORAKEL). `id` fehlt bei einem neuen Teil. */
interface SollTeil {
  readonly id: string | undefined
  readonly art: NamePartArt
  readonly wert: string
  readonly feminineVariante: string | null
  readonly istRufname: boolean
}

function sollTeile(ein: NamensformUebernehmenEin, gespeichert: readonly TeilZeile[]): readonly SollTeil[] {
  const soll: SollTeil[] = []
  for (const t of ein.teile) {
    if (t.wert.trim() === '') continue
    const alt = t.id === undefined ? undefined : gespeichert.find((g) => g.id === t.id)
    if (t.id !== undefined && alt === undefined) {
      throw new Error('uebernehmen: Zielliste nennt eine unbekannte Teil-ID (Generatorfehler).')
    }
    soll.push({
      id: t.id,
      art: t.art,
      wert: alt !== undefined && t.wert.trim() === alt.wert ? alt.wert : t.wert.trim(),
      feminineVariante: t.feminineVariante === undefined ? (alt?.feminine_variante ?? null) : t.feminineVariante,
      istRufname: t.istRufname,
    })
  }
  return soll
}

function sollDerArt(soll: readonly SollTeil[], art: NamePartArt): readonly SollTeil[] {
  return soll.filter((s) => s.art === art)
}

function zeilenDerArt(teile: readonly TeilZeile[], art: NamePartArt): readonly TeilZeile[] {
  return teile.filter((t) => t.art === art).sort((a, b) => a.sortier_index - b.sortier_index)
}

/** Ändert die Zielliste die Teile gegenüber dem gespeicherten Stand (IDs, Werte, Varianten, Rufname, Folge)? */
function teileGeaendert(soll: readonly SollTeil[], gespeichert: readonly TeilZeile[]): boolean {
  return NamePartArtEnum.options.some((art) => {
    const s = sollDerArt(soll, art)
    const g = zeilenDerArt(gespeichert, art)
    return (
      s.length !== g.length ||
      s.some((e, i) => {
        const z = g[i]
        return z === undefined || e.id !== z.id || e.wert !== z.wert || e.feminineVariante !== z.feminine_variante || e.istRufname !== (z.ist_rufname === 1)
      })
    )
  })
}

type KopfSpalte = 'rolle' | 'rollen_notiz' | 'sprache' | 'schrift' | 'reihenfolge' | 'umschrift_von' | 'umschrift_norm' | 'konfidenz' | 'gueltig_von' | 'gueltig_bis'

/** Die Kopf-Felder außer `originalText`, je mit ihrer Spalte. */
const KOPF_FELDER: readonly (readonly [Exclude<keyof NamensformUebernehmenKopf, 'originalText'>, KopfSpalte])[] = [
  ['rolle', 'rolle'],
  ['rollenNotiz', 'rollen_notiz'],
  ['sprache', 'sprache'],
  ['schrift', 'schrift'],
  ['reihenfolge', 'reihenfolge'],
  ['umschriftVon', 'umschrift_von'],
  ['umschriftNorm', 'umschrift_norm'],
  ['konfidenz', 'konfidenz'],
  ['gueltigVon', 'gueltig_von'],
  ['gueltigBis', 'gueltig_bis'],
]

/**
 * Erwarteter `original_text` (E3, s. Modul-Kommentar ORAKEL) und der Zweig, den er belegt. Die Regel gilt für
 * den AUFRUF als Ganzes (V-130-fix-uebernehmen-e3), nie für Zwischenstände:
 * - mitgeschickt und vom gespeicherten abweichend (neue Form: jeder nicht-`NULL`-Wert) → wortgetreu;
 * - sonst, wenn der Text VORHER den Teilen folgte (automatische Montage, `NULL` zählt; neue Form: immer) UND
 *   (1) die Montage der Zielteile von der Montage vorher abweicht ODER (2) der alte Text zu den Zielteilen nicht
 *   mehr als Montage passte → die Montage der Zielteile;
 * - sonst bleibt der Text bitgleich (kein stilles „Glätten" bei No-op, Kopfänderung oder gleicher Montage).
 * Benutzte Kernhilfen (nur als Montage-Definition, nicht als Schrittfolge des Handlers): `montiereOriginalText`,
 * `rekonstruiereFlach` (über `flachAus`) und `istMontierterOriginalText` — dieselben, die E3 überhaupt erst
 * definieren (hueter #198 H5).
 */
function sollOriginalText(
  ein: NamensformUebernehmenEin,
  vorher: FormZeile | undefined,
  gespeichert: readonly TeilZeile[],
  soll: readonly SollTeil[],
): { readonly text: string | null; readonly zweig: Zweig | undefined } {
  const gesendet = ein.kopf.originalText
  const montageNachher = montiereOriginalText(flachAus(soll))
  if (vorher === undefined) {
    if (gesendet !== undefined && gesendet !== null) {
      return { text: gesendet, zweig: gesendet === '' ? 'uebernehmen.originalText.leer' : 'uebernehmen.originalText.neueForm' }
    }
    return { text: montageNachher, zweig: undefined }
  }
  if (gesendet !== undefined && gesendet !== vorher.original_text) {
    return {
      text: gesendet,
      zweig: gesendet === '' ? 'uebernehmen.originalText.leer' : teileGeaendert(soll, gespeichert) ? 'uebernehmen.originalText.explizitMitTeilen' : 'uebernehmen.originalText.explizit',
    }
  }
  const folgt = istMontierterOriginalText(vorher.original_text, flachDerZeilen(gespeichert))
  const montageVorher = montiereOriginalText(flachDerZeilen(gespeichert))
  const passtNachher = istMontierterOriginalText(vorher.original_text, flachAus(soll))
  if (!folgt) {
    return { text: vorher.original_text, zweig: teileGeaendert(soll, gespeichert) ? 'uebernehmen.originalText.wortgetreuBleibt' : undefined }
  }
  if (montageNachher !== montageVorher || !passtNachher) {
    let zweig: Zweig | undefined
    if (montageNachher === montageVorher) zweig = 'uebernehmen.originalText.dritteBedingung'
    else if (passtNachher && montageNachher !== vorher.original_text) zweig = 'uebernehmen.originalText.geglaettet'
    else if (gesendet !== undefined && montageNachher !== vorher.original_text) zweig = 'uebernehmen.originalText.mitgeschicktNachgefuehrt'
    return { text: montageNachher, zweig }
  }
  return { text: vorher.original_text, zweig: undefined }
}

function wert(kopf: NamensformUebernehmenKopf, feld: (typeof KOPF_FELDER)[number][0]): string | number | null | undefined {
  return kopf[feld]
}

/** Führt `namensform.uebernehmen` aus und prüft das Ergebnis (s. Modul-Kommentar ORAKEL); liefert die Form-ID. */
function uebernehmen(db: Tx, zweige: Zweig[], ein: NamensformUebernehmenEin, wo: string): string {
  const formenVorher = alleFormenLesen(db)
  const teileVorher = alleTeile(db)
  const txVorher = txFingerabdruck(db)
  const vorher = ein.formId === null ? undefined : formenVorher.find((f) => f.id === ein.formId)
  if (ein.formId !== null && vorher === undefined) {
    throw new Error(`uebernehmen (${wo}): Zielform fehlt (Generatorfehler).`)
  }
  const gespeichert = vorher === undefined ? [] : teileVorher.filter((t) => t.name_form_id === vorher.id)
  const soll = sollTeile(ein, gespeichert)
  const text = sollOriginalText(ein, vorher, gespeichert, soll)
  const personHatteFormen = formenVorher.some((f) => f.person_id === ein.personId)

  // Erwarteter Kopf (ohne `original_text`) und `ist_bevorzugt`.
  const sollKopf = new Map<KopfSpalte, string | number | null>()
  for (const [feld, spalte] of KOPF_FELDER) {
    const gesendet = wert(ein.kopf, feld)
    sollKopf.set(spalte, gesendet !== undefined ? gesendet : vorher === undefined ? null : vorher[spalte])
  }
  const sollBevorzugt = ein.hauptname === true ? 1 : vorher !== undefined ? vorher.ist_bevorzugt : personHatteFormen ? 0 : 1
  const hauptnameWechsel = sollBevorzugt === 1 && (vorher === undefined ? personHatteFormen : vorher.ist_bevorzugt === 0)
  const aenderungErwartet =
    vorher === undefined ||
    teileGeaendert(soll, gespeichert) ||
    text.text !== vorher.original_text ||
    KOPF_FELDER.some(([, spalte]) => sollKopf.get(spalte) !== vorher[spalte]) ||
    hauptnameWechsel

  const { id } = befehl(zweige, db, 'namensform.uebernehmen', ein)
  if (vorher !== undefined && id !== vorher.id) {
    throw new Error(`uebernehmen (${wo}): Ergebnis-ID ${id} ist nicht die Zielform.`)
  }
  const formenNachher = alleFormenLesen(db)
  const teileNachher = alleTeile(db)
  const form = formenNachher.find((f) => f.id === id)
  if (form === undefined) {
    throw new Error(`uebernehmen (${wo}): Form ${id} fehlt nach dem Befehl.`)
  }

  // 1. Teile je Art = Zielliste in Zielfolge.
  const eigene = teileNachher.filter((t) => t.name_form_id === id)
  const vergeben = new Set(teileVorher.map((t) => t.id))
  for (const art of NamePartArtEnum.options) {
    const ist = zeilenDerArt(eigene, art)
    const s = sollDerArt(soll, art)
    const alt = zeilenDerArt(gespeichert, art)
    if (ist.length !== s.length) {
      throw new Error(`uebernehmen (${wo}): Art ${art} hat ${String(ist.length)} Teile, Zielliste ${String(s.length)}.`)
    }
    let praefixGleich = true
    s.forEach((e, i) => {
      const z = ist[i]
      if (z === undefined) {
        throw new Error('uebernehmen: unerreichbar — Längen gleich.')
      }
      const idPasst = e.id !== undefined ? z.id === e.id : !vergeben.has(z.id)
      if (!idPasst || z.wert !== e.wert || z.feminine_variante !== e.feminineVariante || (z.ist_rufname === 1) !== e.istRufname) {
        throw new Error(`uebernehmen (${wo}): Art ${art} Rang ${String(i)} gespeichert ${JSON.stringify(z)}, erwartet ${JSON.stringify(e)}.`)
      }
      praefixGleich = praefixGleich && e.id !== undefined && alt[i]?.id === e.id
      const vorherZeile = alt[i]
      if (praefixGleich && vorherZeile !== undefined && vorherZeile.sortier_index !== z.sortier_index) {
        throw new Error(`uebernehmen (${wo}): unveränderter Teil auf Rang ${String(i)} der Art ${art} hat seinen sortier_index verloren.`)
      }
    })
  }

  // 2. Andere Formen und ihre Teile unverändert (bis auf `ist_bevorzugt` beim Hauptnamenwechsel).
  const fremd = (teile: readonly TeilZeile[]): string => JSON.stringify(teile.filter((t) => t.name_form_id !== id))
  if (fremd(teileVorher) !== fremd(teileNachher)) {
    throw new Error(`uebernehmen (${wo}): Teile anderer Formen verändert.`)
  }
  const ohneBevorzugt = (f: FormZeile): string => JSON.stringify({ ...f, ist_bevorzugt: 0 })
  const andereNachher = formenNachher.filter((f) => f.id !== id)
  if (JSON.stringify(andereNachher.map(ohneBevorzugt)) !== JSON.stringify(formenVorher.filter((f) => f.id !== id).map(ohneBevorzugt))) {
    throw new Error(`uebernehmen (${wo}): Kopf einer anderen Form verändert.`)
  }
  for (const f of andereNachher) {
    const bisher = formenVorher.find((v) => v.id === f.id)?.ist_bevorzugt
    const erwartet = f.person_id === ein.personId && sollBevorzugt === 1 ? 0 : bisher
    if (f.ist_bevorzugt !== erwartet) {
      throw new Error(`uebernehmen (${wo}): ist_bevorzugt der Form ${f.id} ist ${String(f.ist_bevorzugt)}, erwartet ${String(erwartet)}.`)
    }
  }

  // 3. Kopf.
  const kopfFehler = KOPF_FELDER.filter(([, spalte]) => form[spalte] !== sollKopf.get(spalte)).map(([, spalte]) => spalte)
  if (kopfFehler.length > 0 || form.original_text !== text.text || form.ist_bevorzugt !== sollBevorzugt || form.person_id !== ein.personId) {
    throw new Error(
      `uebernehmen (${wo}): Kopf ${JSON.stringify(form)} passt nicht (Felder ${JSON.stringify(kopfFehler)}, original_text erwartet ` +
        `${JSON.stringify(text.text)}, ist_bevorzugt erwartet ${String(sollBevorzugt)}).`,
    )
  }
  if (vorher !== undefined && form.sortier_index !== vorher.sortier_index) {
    throw new Error(`uebernehmen (${wo}): sortier_index der Form verändert.`)
  }

  // 4. Journal: genau ein neuer Undo-Schritt bzw. keiner.
  const txNachher = txFingerabdruck(db)
  if (!aenderungErwartet) {
    if (txNachher !== txVorher) {
      throw new Error(`uebernehmen (${wo}): unveränderter Aufruf hat eine Transaktion hinterlassen.`)
    }
    zweige.push('uebernehmen.noop')
  } else {
    const anzahlVorher = Number(txVorher.split(':')[0])
    const anzahlNachher = Number(txNachher.split(':')[0])
    if (anzahlNachher !== anzahlVorher + 1 || undoZiel(db)?.beschreibung !== 'journal.namensform_uebernommen') {
      throw new Error(`uebernehmen (${wo}): nicht genau ein neuer Undo-Schritt (vorher ${txVorher}, nachher ${txNachher}, oben ${String(undoZiel(db)?.beschreibung)}).`)
    }
  }

  // Deckungszweige (am Stand vorher und an der Zielliste).
  if (vorher !== undefined && vorher.umschrift_von !== null) {
    const ursprung = formenVorher.find((f) => f.id === vorher.umschrift_von)
    if (vorher.umschrift_von === vorher.id || (ursprung !== undefined && ursprung.person_id !== vorher.person_id)) zweige.push('uebernehmen.altbestand')
  }
  if (text.zweig !== undefined) zweige.push(text.zweig)
  if (hauptnameWechsel) zweige.push('uebernehmen.hauptname.gewechselt')
  if (ein.teile.some((t) => t.id === undefined && t.wert.trim() === '')) zweige.push('uebernehmen.leer.verworfen')
  if (ein.teile.some((t) => t.id !== undefined && t.wert.trim() === '')) zweige.push('uebernehmen.leer.entfallen')
  if (vorher !== undefined && KOPF_FELDER.some(([, spalte]) => sollKopf.get(spalte) !== vorher[spalte]) && KOPF_FELDER.some(([feld]) => wert(ein.kopf, feld) === undefined)) {
    zweige.push('uebernehmen.kopf.fehltBleibt')
  }
  const umgeordnet = NamePartArtEnum.options.some((art) => {
    const behalten = zeilenDerArt(gespeichert, art)
      .map((t) => t.id)
      .filter((tid) => soll.some((s) => s.id === tid))
    const folge = sollDerArt(soll, art).flatMap((s) => (s.id !== undefined && behalten.includes(s.id) ? [s.id] : []))
    return JSON.stringify(behalten) !== JSON.stringify(folge)
  })
  if (umgeordnet) zweige.push('uebernehmen.umgeordnet')
  const rufVorher = gespeichert.find((t) => t.ist_rufname === 1)?.id
  if (rufVorher !== undefined && eigene.some((t) => t.ist_rufname === 1 && t.id !== rufVorher)) zweige.push('uebernehmen.rufname.wechsel')
  return id
}

// -----------------------------------------------------------------------------------------------
// Vorlauf
// -----------------------------------------------------------------------------------------------

function alleFormen(zustand: UebernehmenZustand): readonly FormInfo[] {
  return [...zustand.namen, ...zustand.namensformen, ...zustand.uebernahmeFormen]
}

const VORLAUF_VORNAMEN = ['Anna', 'Karl', 'Ольга', 'Jóhann'] as const

/** Eine neue Form per `namensform.uebernehmen` (Vorlauf bzw. Weg `neueForm`). */
function neueFormAnlegen(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], ein: NamensformUebernehmenEin, wo: string): string {
  const id = uebernehmen(db, zweige, ein, wo)
  zustand.uebernahmeFormen.push({ id, personId: ein.personId })
  return id
}

/** Eine bestehende Form (aus allen bekannten); ohne Form legt der Vorlauf eine an, ohne Person `undefined`. */
function formSicherstellen(
  db: Tx,
  zustand: UebernehmenZustand,
  zweige: Zweig[],
  aktion: AktionUebernehmen,
  bedarf: { readonly vornamen: number; readonly rufname: boolean; readonly wortgetreu: boolean } = { vornamen: 1, rufname: false, wortgetreu: false },
): FormInfo | undefined {
  const vorhanden = zielAus(alleFormen(zustand), aktion.zielRoh)
  if (vorhanden !== undefined) return vorhanden
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) return undefined
  // Gleich mit allem, was der Weg braucht (ein Aufruf statt zwei — Laufzeit, s. docs/80 §33 V-130-11-0b).
  const vornamen: NamensformUebernehmenTeil[] = []
  for (let i = 0; i < bedarf.vornamen; i += 1) {
    vornamen.push({ art: 'vorname', wert: i === 0 ? 'Karl' : (VORLAUF_VORNAMEN[i % VORLAUF_VORNAMEN.length] ?? 'Anna'), istRufname: bedarf.rufname && i === 0 })
  }
  const id = neueFormAnlegen(
    db,
    zustand,
    zweige,
    {
      personId,
      formId: null,
      kopf: { rolle: 'geburtsname', ...(bedarf.wortgetreu ? { originalText: WORTGETREU } : {}) },
      teile: [...vornamen, { art: 'nachname', wert: 'Nowak', istRufname: false }],
    },
    'Vorlauf Form',
  )
  zweige.push('uebernehmen.vorlauf')
  zustand.zwischenSchritt()
  return { id, personId }
}

/** Stellt per `namensform.uebernehmen` sicher, dass die Form mindestens `vornamen` Vornamen und `andere`
 * Nicht-Vorname-Teile trägt, bei `rufname` einen Rufnamen und bei `wortgetreu` eine wortgetreue Schreibung. */
function teileSicherstellen(
  db: Tx,
  zustand: UebernehmenZustand,
  zweige: Zweig[],
  form: FormInfo,
  bedarf: { readonly vornamen: number; readonly andere: number; readonly rufname: boolean; readonly wortgetreu: boolean },
): readonly TeilZeile[] {
  const teile = teileDerForm(db, form.id)
  const vornamen = teile.filter((t) => t.art === 'vorname').length
  const andere = teile.length - vornamen
  const hatRufname = teile.some((t) => t.ist_rufname === 1)
  const f = formLesen(db, form.id)
  const textNoetig = bedarf.wortgetreu && istMontierterOriginalText(f.original_text, flachDerZeilen(teile))
  if (vornamen >= bedarf.vornamen && andere >= bedarf.andere && (hatRufname || !bedarf.rufname) && !textNoetig) {
    return teile
  }
  const ziel: NamensformUebernehmenTeil[] = teile.map(unveraendert)
  for (let i = vornamen; i < bedarf.vornamen; i += 1) {
    ziel.push({ art: 'vorname', wert: VORLAUF_VORNAMEN[i % VORLAUF_VORNAMEN.length] ?? 'Karl', istRufname: false })
  }
  for (let i = andere; i < bedarf.andere; i += 1) {
    ziel.push({ art: 'nachname', wert: 'Nowak', istRufname: false })
  }
  const zielMitRufname =
    bedarf.rufname && !hatRufname
      ? (() => {
          const erster = ziel.findIndex((t) => t.art === 'vorname')
          return ziel.map((t, i) => (i === erster ? { ...t, istRufname: true } : t))
        })()
      : ziel
  uebernehmen(db, zweige, { personId: form.personId, formId: form.id, kopf: textNoetig ? { originalText: WORTGETREU } : {}, teile: zielMitRufname }, 'Vorlauf Teile')
  zweige.push('uebernehmen.vorlauf')
  zustand.zwischenSchritt()
  return teileDerForm(db, form.id)
}

// -----------------------------------------------------------------------------------------------
// Zielliste und Kopf
// -----------------------------------------------------------------------------------------------

/** Kopf aus den Rohwerten (fehlende Felder bleiben weg). */
function kopfAus(k: KopfRoh): NamensformUebernehmenKopf {
  return {
    ...(k.rolle !== undefined ? { rolle: k.rolle } : {}),
    ...(k.rollenNotiz !== undefined ? { rollenNotiz: k.rollenNotiz } : {}),
    ...(k.sprache !== undefined ? { sprache: k.sprache } : {}),
    ...(k.schrift !== undefined ? { schrift: k.schrift } : {}),
    ...(k.reihenfolge !== undefined ? { reihenfolge: k.reihenfolge } : {}),
    ...(k.umschriftNorm !== undefined ? { umschriftNorm: k.umschriftNorm } : {}),
    ...(k.konfidenz !== undefined ? { konfidenz: k.konfidenz } : {}),
    ...(k.gueltigVon !== undefined ? { gueltigVon: k.gueltigVon } : {}),
    ...(k.gueltigBis !== undefined ? { gueltigBis: k.gueltigBis } : {}),
  }
}

/** `originalText` für eine bestehende Form nach `textArt` (`undefined` = fehlt). */
function textBestehend(aktion: AktionUebernehmen, form: FormZeile, teile: readonly TeilZeile[]): string | null | undefined {
  switch (aktion.textArt) {
    case 'praefixMontage':
      return montiereOriginalText(flachDerZeilen(teile))
    case 'wortgetreu':
      return WORTGETREU
    case 'unveraendert':
      return form.original_text
    case 'leer':
      return ''
    case 'keiner':
      return undefined
  }
}

/** Neue Einträge an ihre Stellen in die Zielliste (nacheinander, Stelle `stelle % (Länge + 1)`). */
function neueEinflechten(ziel: readonly NamensformUebernehmenTeil[], neue: readonly NeuerTeilRoh[]): readonly NamensformUebernehmenTeil[] {
  const ergebnis = [...ziel]
  for (const n of neue) {
    const wertNeu = n.wert.trim() === '' ? n.wert : gueltigerWert(n.art, n.wert)
    ergebnis.splice(n.stelle % (ergebnis.length + 1), 0, {
      art: n.art,
      wert: wertNeu,
      ...(n.feminineVariante !== undefined ? { feminineVariante: n.feminineVariante } : {}),
      istRufname: false,
    })
  }
  return ergebnis
}

/** Die Nicht-Vorname-Teile nach Plan (behalten/löschen/ändern/Variante/leeren/Rand), je Art umgeordnet. */
function andereNachPlan(aktion: AktionUebernehmen, teile: readonly TeilZeile[]): readonly NamensformUebernehmenTeil[] {
  const eintraege = teile
    .filter((t) => t.art !== 'vorname')
    .flatMap((t, i): readonly (readonly [number, NamensformUebernehmenTeil])[] => {
      const plan = aktion.plan[i % aktion.plan.length] ?? { was: 'behalten', schluessel: i }
      const basis = unveraendert(t)
      switch (plan.was) {
        case 'behalten':
          return [[plan.schluessel, basis]]
        case 'loeschen':
          return []
        case 'aendern':
          return [[plan.schluessel, { ...basis, wert: andererWert(t.art, t.wert, aktion.werte[i % aktion.werte.length] ?? '') }]]
        case 'feminin':
          return [[plan.schluessel, { ...basis, feminineVariante: t.feminine_variante === 'Petrowa' ? null : 'Petrowa' }]]
        case 'leeren':
          return [[plan.schluessel, { ...basis, wert: '  ' }]]
        case 'rand':
          return [[plan.schluessel, { ...basis, wert: ` ${t.wert}\t` }]]
      }
    })
  return [...eintraege].sort((a, b) => a[0] - b[0]).map(([, e]) => e)
}

// -----------------------------------------------------------------------------------------------
// Wege
// -----------------------------------------------------------------------------------------------

function gemischt(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const bedarf = { vornamen: 3, rufname: true, wortgetreu: aktion.textArt === 'praefixMontage' } as const
  const form = formSicherstellen(db, zustand, zweige, aktion, bedarf)
  if (form === undefined) return
  const teile = teileSicherstellen(db, zustand, zweige, form, { ...bedarf, andere: 0 })
  const f = formLesen(db, form.id)
  const vornamen = teile.filter((t) => t.art === 'vorname')
  const rufname = vornamen.find((t) => t.ist_rufname === 1)
  const weg = zielAus(vornamen, wahl(aktion, 0))
  if (weg === undefined || rufname === undefined) {
    throw new Error('uebernehmen (gemischt): unerreichbar — der Vorlauf hat drei Vornamen und einen Rufnamen angelegt.')
  }
  const rest = vornamen.filter((t) => t.id !== weg.id).reverse()
  const geaendert = zielAus(rest, wahl(aktion, 1))
  const zielVornamen: { readonly teil: NamensformUebernehmenTeil; readonly bisher: string | undefined }[] = rest.map((t) => ({
    teil: t.id === geaendert?.id ? { ...unveraendert(t), wert: andererWert('vorname', t.wert, aktion.werte[0] ?? ''), istRufname: false } : { ...unveraendert(t), istRufname: false },
    bisher: t.id,
  }))
  zielVornamen.splice(wahl(aktion, 2) % (zielVornamen.length + 1), 0, {
    teil: { art: 'vorname', wert: gueltigerWert('vorname', aktion.werte[1] ?? ''), istRufname: false },
    bisher: undefined,
  })
  const kandidaten = zielVornamen.filter((z) => z.bisher !== rufname.id)
  const neuerRuf = zielAus(kandidaten, wahl(aktion, 3))
  const vornameListe = zielVornamen.map((z) => (z === neuerRuf ? { ...z.teil, istRufname: true } : z.teil))
  const ziel = neueEinflechten([...vornameListe, ...andereNachPlan(aktion, teile)], aktion.neue)
  const text = textBestehend(aktion, f, teile)
  uebernehmen(
    db,
    zweige,
    {
      personId: form.personId,
      formId: form.id,
      kopf: { ...kopfAus(aktion.kopf), ...(text !== undefined ? { originalText: text } : {}) },
      teile: ziel,
      hauptname: aktion.hauptname,
    },
    'gemischt',
  )
  zweige.push('uebernehmen.gemischt')
}

/** Teile einer neuen Form: ein Vorname und die neuen Einträge (leere werden verworfen); bei `mitNachnameVorn`
 * steht ein Nachname als ERSTE Art vorn. */
function neueTeile(aktion: AktionUebernehmen, mitNachnameVorn: boolean): readonly NamensformUebernehmenTeil[] {
  const vorn: NamensformUebernehmenTeil[] = mitNachnameVorn ? [{ art: 'nachname', wert: gueltigerWert('nachname', aktion.werte[2] ?? 'Nowak'), istRufname: false }] : []
  const vorname: NamensformUebernehmenTeil = { art: 'vorname', wert: gueltigerWert('vorname', aktion.werte[0] ?? ''), istRufname: wahl(aktion, 0) % 2 === 0 }
  return neueEinflechten([...vorn, vorname], aktion.neue)
}

function neueForm(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) return
  neueFormAnlegen(
    db,
    zustand,
    zweige,
    { personId, formId: null, kopf: { ...kopfAus(aktion.kopf), rolle: aktion.kopf.rolle ?? 'geburtsname' }, teile: neueTeile(aktion, false), hauptname: true },
    'neueForm',
  )
  zweige.push('uebernehmen.neueForm')
}

function originalTextNeu(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) return
  const teile = neueTeile(aktion, true)
  const nichtLeer = teile.filter((t) => t.wert.trim() !== '')
  const ersteArt = nichtLeer[0]?.art
  // Die Montage nur der Teile der ersten Art (s. Modul-Kommentar) — nur zur Wahl der Eingabe, nie im Orakel.
  const praefix = montiereOriginalText(flachAus(nichtLeer.filter((t) => t.art === ersteArt).map((t) => ({ ...t, wert: t.wert.trim() }))))
  const voll = montiereOriginalText(flachAus(nichtLeer.map((t) => ({ ...t, wert: t.wert.trim() }))))
  const text = aktion.textArt === 'praefixMontage' ? (praefix ?? WORTGETREU) : aktion.textArt === 'leer' ? '' : aktion.textArt === 'unveraendert' ? (voll ?? WORTGETREU) : WORTGETREU
  if (aktion.textArt === 'praefixMontage' && praefix !== null && praefix !== voll) {
    zweige.push('uebernehmen.originalText.praefixMontage')
  }
  neueFormAnlegen(
    db,
    zustand,
    zweige,
    { personId, formId: null, kopf: { rolle: aktion.kopf.rolle ?? 'geburtsname', originalText: text }, teile, hauptname: aktion.hauptname },
    'originalTextNeu',
  )
}

function kopf(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const form = formSicherstellen(db, zustand, zweige, aktion)
  if (form === undefined) return
  const teile = teileDerForm(db, form.id)
  const f = formLesen(db, form.id)
  const roh = kopfAus(aktion.kopf)
  const text = aktion.textArt === 'leer' ? '' : aktion.textArt === 'wortgetreu' ? WORTGETREU : undefined
  const k: NamensformUebernehmenKopf = {
    ...(Object.keys(roh).length === 0 ? { rollenNotiz: aktion.werte[0] ?? 'Notiz' } : roh),
    ...(text !== undefined ? { originalText: text } : {}),
  }
  const ziel = teile.map((t, i) => (i === wahl(aktion, 0) % Math.max(teile.length, 1) ? { ...unveraendert(t), wert: ` ${t.wert} ` } : unveraendert(t)))
  uebernehmen(db, zweige, { personId: form.personId, formId: form.id, kopf: k, teile: ziel }, 'kopf')
  if (f.original_text !== '' && text === '') zweige.push('uebernehmen.kopf.originalTextLeer')
  zweige.push('uebernehmen.kopf')
}

function noop(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const form = formSicherstellen(db, zustand, zweige, aktion)
  if (form === undefined) return
  const teile = teileDerForm(db, form.id)
  const f = formLesen(db, form.id)
  const ziel = teile.map((t, i) => {
    const basis = unveraendert(t)
    const mitVariante = i % 2 === 0 ? { ...basis, feminineVariante: t.feminine_variante } : basis
    return wahl(aktion, 1) % 2 === 0 ? { ...mitVariante, wert: ` ${t.wert} ` } : mitVariante
  })
  const leer: readonly NeuerTeilRoh[] = [{ art: 'nachname', wert: '  ', feminineVariante: undefined, stelle: wahl(aktion, 2) }]
  // Ob der Aufruf wirklich nichts ändert, entscheidet das Orakel in `uebernehmen()` an der Zielliste (keine
  // Transaktion genau dann); gezählt wird `uebernehmen.noop`.
  uebernehmen(
    db,
    zweige,
    {
      personId: form.personId,
      formId: form.id,
      kopf: { rollenNotiz: f.rollen_notiz, sprache: f.sprache, originalText: f.original_text, gueltigVon: f.gueltig_von, umschriftVon: f.umschrift_von },
      teile: neueEinflechten(ziel, leer),
      ...(f.ist_bevorzugt === 1 ? { hauptname: true } : {}),
    },
    'noop',
  )
}

function leer(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const form = formSicherstellen(db, zustand, zweige, aktion)
  if (form === undefined) return
  const teile = teileSicherstellen(db, zustand, zweige, form, { vornamen: 1, andere: 1, rufname: false, wortgetreu: false })
  const geleert = wahl(aktion, 0) % teile.length
  const ziel = teile.map((t, i) => (i === geleert ? { ...unveraendert(t), wert: wahl(aktion, 1) % 2 === 0 ? '' : ' \t ' } : unveraendert(t)))
  const leere: readonly NeuerTeilRoh[] = [
    { art: 'vorname', wert: '', feminineVariante: undefined, stelle: wahl(aktion, 2) },
    { art: 'suffix', wert: '   ', feminineVariante: 'Petrowa', stelle: wahl(aktion, 3) },
  ]
  uebernehmen(db, zweige, { personId: form.personId, formId: form.id, kopf: {}, teile: neueEinflechten(ziel, leere) }, 'leer')
}

/** Eine Form einer ANDEREN Person als `personId` (aus allen bekannten); fehlt eine, legt der Vorlauf für eine
 * andere Person eine an. Ohne zweite Person `undefined`. */
function fremdeFormSicherstellen(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], personId: string, roh: number): FormInfo | undefined {
  const vorhanden = zielAus(
    alleFormen(zustand).filter((f) => f.personId !== personId),
    roh,
  )
  if (vorhanden !== undefined) return vorhanden
  const zweite = zielAus(
    zustand.personIds.filter((p) => p !== personId),
    roh,
  )
  if (zweite === undefined) return undefined
  const id = neueFormAnlegen(
    db,
    zustand,
    zweige,
    { personId: zweite, formId: null, kopf: { rolle: 'geburtsname' }, teile: [{ art: 'nachname', wert: 'Nowak', istRufname: false }] },
    'Vorlauf fremde Form',
  )
  zweige.push('uebernehmen.vorlauf')
  zustand.zwischenSchritt()
  return { id, personId: zweite }
}

/** Weg `e3Grenzfall` (s. Modul-Kommentar): neue Form mit [Karl, Peter (Rufname), Nowak] und wortgetreu
 * geschriebenem Text, dann der Randfall-Aufruf. Die Erwartung stellt das Orakel in `uebernehmen()` selbst auf. */
function e3Grenzfall(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) return
  const glaetten = wahl(aktion, 0) % 2 === 0
  const id = neueFormAnlegen(
    db,
    zustand,
    zweige,
    {
      personId,
      formId: null,
      kopf: { rolle: 'geburtsname', originalText: glaetten ? 'Karl  Nowak' : 'Karl Nowak' },
      teile: [
        { art: 'vorname', wert: 'Karl', istRufname: false },
        { art: 'vorname', wert: 'Peter', istRufname: true },
        { art: 'nachname', wert: 'Nowak', istRufname: false },
      ],
    },
    'Vorlauf e3Grenzfall',
  )
  zweige.push('uebernehmen.vorlauf')
  zustand.zwischenSchritt()
  const teile = teileDerForm(db, id)
  const karl = teile.find((t) => t.wert === 'Karl')
  const peter = teile.find((t) => t.wert === 'Peter')
  const nowak = teile.find((t) => t.wert === 'Nowak')
  if (karl === undefined || peter === undefined || nowak === undefined) {
    throw new Error('uebernehmen (e3Grenzfall): unerreichbar — der Vorlauf hat die drei Teile angelegt.')
  }
  const ziel = glaetten
    ? [unveraendert(karl), unveraendert(nowak)]
    : [{ ...unveraendert(karl), istRufname: true }, { ...unveraendert(peter), istRufname: false }, unveraendert(nowak)]
  uebernehmen(db, zweige, { personId, formId: id, kopf: {}, teile: ziel }, 'e3Grenzfall')
  zweige.push(glaetten ? 'uebernehmen.e3Grenzfall.geglaettet' : 'uebernehmen.e3Grenzfall.dritteBedingung')
}

/** Weg `ablehnungFlachBezug`: verbotener Umschrift-Bezug über die flache Brücke (V-130-fix-umschrift-selbstbezug)
 * — fremde Person (`name.anlegen`), Selbstbezug bzw. Kreis (`name.aendern`). */
function flachBezugAblehnen(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) return
  const flach = { typ: 'transliteriert', vornamen: 'Karl', nachname: 'Nowak' } as const
  const code = 'VALIDIERUNG_UMSCHRIFT_BEZUG'
  const variante = wahl(aktion, 0) % 3
  if (variante === 0) {
    const fremd = fremdeFormSicherstellen(db, zustand, zweige, personId, wahl(aktion, 1))
    if (fremd !== undefined) {
      ablehnungVerlangen(db, 'uebernehmen.flachFremdePerson', code, () => befehl(zweige, db, 'name.anlegen', { personId, ...flach, umschriftVon: fremd.id }))
      zweige.push('ablehnung.uebernehmen.flachFremdePerson')
      return
    }
  }
  const form = formSicherstellen(db, zustand, zweige, aktion)
  if (form === undefined) return
  if (variante === 2) {
    // Vorstufe (gültig): eine Umschrift der Form derselben Person; dann soll die Form auf ihre Umschrift zeigen.
    const { id: umschrift } = befehl(zweige, db, 'name.anlegen', { personId: form.personId, ...flach, umschriftVon: form.id })
    zustand.uebernahmeFormen.push({ id: umschrift, personId: form.personId })
    zweige.push('uebernehmen.vorlauf')
    zustand.zwischenSchritt()
    ablehnungVerlangen(db, 'uebernehmen.flachKreis', code, () => befehl(zweige, db, 'name.aendern', { id: form.id, ...flach, umschriftVon: umschrift }))
    zweige.push('ablehnung.uebernehmen.flachKreis')
    return
  }
  if (formLesen(db, form.id).umschrift_von === form.id) return
  ablehnungVerlangen(db, 'uebernehmen.flachSelbst', code, () => befehl(zweige, db, 'name.aendern', { id: form.id, ...flach, umschriftVon: form.id }))
  zweige.push('ablehnung.uebernehmen.flachSelbst')
}

// -----------------------------------------------------------------------------------------------
// Ablehnungen
// -----------------------------------------------------------------------------------------------

function ablehnen(db: Tx, zustand: UebernehmenZustand, zweige: Zweig[], aktion: AktionUebernehmen): void {
  const form = formSicherstellen(db, zustand, zweige, aktion)
  if (form === undefined) return
  const teile = teileSicherstellen(db, zustand, zweige, form, { vornamen: 1, andere: 1, rufname: false, wortgetreu: false })
  const f = formLesen(db, form.id)
  const ohneRuf = teile.map((t) => ({ ...unveraendert(t), istRufname: false }))
  const aufruf = (ziel: readonly NamensformUebernehmenTeil[], k: NamensformUebernehmenKopf = {}): (() => void) => {
    return () => {
      befehl(zweige, db, 'namensform.uebernehmen', { personId: form.personId, formId: form.id, kopf: k, teile: [...ziel].reverse() })
    }
  }
  switch (aktion.weg) {
    case 'ablehnungArt': {
      // Nur ein Teil mit nicht leerem Wert (ein leerer Eintrag würde vor jeder Prüfung verworfen); Vornamen
      // sind nie leer, der Vorlauf hat einen angelegt.
      const kandidat = zielAus(
        teile.filter((t) => t.wert.trim() !== ''),
        wahl(aktion, 0),
      )
      if (kandidat === undefined) throw new Error('uebernehmen (ablehnungArt): unerreichbar — der Vorlauf hat einen Vornamen angelegt.')
      const teil = kandidat
      const i = teile.indexOf(kandidat)
      const kandidaten = NamePartArtEnum.options.filter((a) => a !== teil.art && (a !== 'vorname' || !/\s/u.test(teil.wert)))
      const neueArt = zielAus(kandidaten, wahl(aktion, 1)) ?? 'suffix'
      const ziel = ohneRuf.map((t, j) => (j === i ? { ...t, art: neueArt } : t))
      ablehnungVerlangen(db, 'uebernehmen.ablehnungArt', 'VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND', aufruf(ziel))
      zweige.push('ablehnung.uebernehmen.art')
      return
    }
    case 'ablehnungLeerraum': {
      const vornamen = teile.filter((t) => t.art === 'vorname')
      const teil = zielAus(vornamen, wahl(aktion, 0))
      if (teil === undefined) throw new Error('uebernehmen (ablehnungLeerraum): unerreichbar — der Vorlauf hat einen Vornamen angelegt.')
      const ungueltig = aktion.leerraum.trim() === teil.wert ? 'Hans Peter Paul' : aktion.leerraum
      const ziel = ohneRuf.map((t) => (t.id === teil.id ? { ...t, wert: ungueltig } : t))
      ablehnungVerlangen(db, 'uebernehmen.ablehnungLeerraum', 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', aufruf(ziel))
      zweige.push('ablehnung.uebernehmen.leerraum')
      return
    }
    case 'ablehnungFremd': {
      // Nur Teile mit nicht leerem Wert: ein gespeicherter Leerraum-Teil (etwa ein Vatersname ' ' aus
      // `name.aendern`) wäre in der Zielliste ein leerer Eintrag und würde vor jeder Prüfung verworfen.
      const fremdeTeile = alleTeile(db).filter((t) => t.name_form_id !== form.id && t.wert.trim() !== '')
      const fremd = zielAus(fremdeTeile, wahl(aktion, 0))
      const eintrag: NamensformUebernehmenTeil =
        fremd === undefined ? { id: 'unbekannte-teil-id', art: 'nachname', wert: 'Nowak', istRufname: false } : { id: fremd.id, art: artVon(fremd.art), wert: fremd.wert, istRufname: false }
      const ziel = [...ohneRuf]
      ziel.splice(wahl(aktion, 1) % (ziel.length + 1), 0, eintrag)
      ablehnungVerlangen(db, 'uebernehmen.ablehnungFremd', 'NICHT_GEFUNDEN_NAMENSTEIL', aufruf(ziel))
      zweige.push(fremd === undefined ? 'ablehnung.uebernehmen.unbekannt' : 'ablehnung.uebernehmen.fremd')
      return
    }
    case 'ablehnungKeinVorname': {
      // Ein Nicht-Vorname mit nicht leerem Wert; fehlt er (nur Leerraum-Teile), ein neuer Nachname als Rufname.
      const teil = zielAus(
        teile.filter((t) => t.art !== 'vorname' && t.wert.trim() !== ''),
        wahl(aktion, 0),
      )
      const ziel =
        teil === undefined
          ? [...ohneRuf, { art: 'nachname' as const, wert: 'Nowak', istRufname: true }]
          : ohneRuf.map((t) => (t.id === teil.id ? { ...t, istRufname: true } : t))
      ablehnungVerlangen(db, 'uebernehmen.ablehnungKeinVorname', 'VALIDIERUNG_RUFNAME_KEIN_VORNAME', aufruf(ziel))
      zweige.push('ablehnung.uebernehmen.keinVorname')
      return
    }
    case 'ablehnungUmschrift': {
      // An einer Form mit gespeichertem Selbstbezug (Altbestand, `uebernehmen-altbestand.test.ts`) wäre
      // `umschriftVon: form.id` keine Änderung und damit keine Ablehnung.
      if (f.umschrift_von === form.id) return
      const variante = wahl(aktion, 0) % 3
      const fremdePerson = variante === 1 ? fremdeFormSicherstellen(db, zustand, zweige, form.personId, wahl(aktion, 1)) : undefined
      let k: NamensformUebernehmenKopf = { umschriftVon: form.id }
      let zweig: Zweig = 'ablehnung.uebernehmen.umschriftSelbst'
      if (variante === 1 && fremdePerson !== undefined && fremdePerson.id !== f.umschrift_von) {
        k = { umschriftVon: fremdePerson.id }
        zweig = 'ablehnung.uebernehmen.umschriftFremdePerson'
      } else if (variante === 2 && f.rolle !== null && f.umschrift_von === null) {
        k = { rolle: null }
        zweig = 'ablehnung.uebernehmen.umschriftOhneUrsprung'
      }
      ablehnungVerlangen(db, 'uebernehmen.ablehnungUmschrift', 'VALIDIERUNG_UMSCHRIFT_BEZUG', aufruf(teile.map(unveraendert), k))
      zweige.push(zweig)
      return
    }
    default:
      throw new Error(`uebernehmen: ${aktion.weg} ist kein Ablehnungsweg.`)
  }
}

// -----------------------------------------------------------------------------------------------
// Ausführung
// -----------------------------------------------------------------------------------------------

/** Führt die Aktion aus (s. Modul-Kommentar); neue Formen trägt sie selbst in `zustand.uebernahmeFormen` ein. */
export function uebernehmenAusfuehren(db: Tx, zustand: UebernehmenZustand, aktion: AktionUebernehmen, zweige: Zweig[]): void {
  switch (aktion.weg) {
    case 'gemischt':
      gemischt(db, zustand, zweige, aktion)
      return
    case 'neueForm':
      neueForm(db, zustand, zweige, aktion)
      return
    case 'originalTextNeu':
      originalTextNeu(db, zustand, zweige, aktion)
      return
    case 'kopf':
      kopf(db, zustand, zweige, aktion)
      return
    case 'noop':
      noop(db, zustand, zweige, aktion)
      return
    case 'leer':
      leer(db, zustand, zweige, aktion)
      return
    case 'e3Grenzfall':
      e3Grenzfall(db, zustand, zweige, aktion)
      return
    case 'ablehnungFlachBezug':
      flachBezugAblehnen(db, zustand, zweige, aktion)
      return
    default:
      ablehnen(db, zustand, zweige, aktion)
      return
  }
}
