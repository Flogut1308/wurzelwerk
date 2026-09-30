// AP-1.30 PR 10b (Prüfpfad-Folge zu #189/#193/#194, docs/80 §33 V-130-10b) — geschützter Prüfpfad
// (CLAUDE.md §5/§13, ADR-025). Namensteil-Teil des Befehlsfolge-Generators (`_befehlsfolge-generator.ts`):
// die sieben granularen Namensbefehle `namensform.anlegen`/`.aendern`, `namensteil.anlegen`/`.loeschen`/
// `.aendern`/`.verschieben` und `namensform.rufnameSetzen`, mit gültigen UND absichtlich ungültigen
// Eingaben. Ausgelagert wie `_befehlsfolge-kurzbeschreibung.ts`: dieses Modul importiert den Generator
// NICHT; was es vom Generatorzustand braucht, beschreibt `NamensteileZustand` strukturell.
//
// WEGE (eine Aktion `namensteile`, der Weg ist Teil der Aktion):
// - `formAnlegen`: `namensform.anlegen` für eine Person — mit Rolle, oder (falls die Person schon eine
//   Form hat) ohne Rolle als Umschrift dieser Form (E7). Die neue Form trägt das Modul in
//   `zustand.namensformen` ein, NICHT in `zustand.namen` (s. `NamensteileZustand`): Ziel der übrigen Wege
//   sind beide Listen, die Hauptfolge sieht nur ihre eigenen Formen.
// - `formAendern`: 1–4 Aufrufe `namensform.aendern` auf DIESELBE Form und dasselbe Kopf-Feld (`feld` je
//   Aufruf, Teil-Semantik: nur dieses Feld mitgeschickt), Abstände wie beim Tippen — Koaleszenz.
// - `teilAnlegen`: `namensteil.anlegen` mit oder ohne `position` (0 … Anzahl), jede Art.
// - `teilLoeschen`: `namensteil.loeschen` eines Teils der Art `teilArt` (vorher 1–3 Teile dieser Art).
// - `teilAendern`: 1–4 Aufrufe `namensteil.aendern` auf DENSELBEN Teil, `feld: 'wert'` oder
//   `'feminineVariante'` je Aufruf — Koaleszenz.
// - `teilVerschieben`: `namensteil.verschieben` an eine andere Stelle derselben Art (immer eine echte
//   Bewegung; der Parkwert-Pfad, `namensteil-verschieben.ts` E1).
// - `rufnameSetzen`: `namensform.rufnameSetzen` auf einen ANDEREN Vorname-Teil der Form (Wechsel) oder
//   `null` (Entfernen); trägt die Form noch keinen Rufnamen, setzt der Vorlauf zuerst einen.
// - ABLEHNUNGEN (Grundsatz E-B2-2 wie `belegAblehnen`): leerer Wert (`VALIDIERUNG_NAMENSTEIL_LEER`),
//   Leerraum im Vornamen (`VALIDIERUNG_NAMENSTEIL_LEERRAUM`), Position außerhalb
//   (`VALIDIERUNG_WERTEBEREICH`, anlegen und verschieben), Rufname auf einen Nicht-Vorname-Teil
//   (`VALIDIERUNG_RUFNAME_KEIN_VORNAME`), Rufname mit dem Vorname-Teil einer FREMDEN Form
//   (`NICHT_GEFUNDEN_NAMENSTEIL`). Verlangt wird genau dieser Code, keine neue Transaktion und ein
//   bitgleicher Bestand (`kanonischerAbzug`) — sonst wirft das Modul.
//
// VORLAUF: fehlt, was ein Weg braucht (eine Form, Teile einer Art, ein Vorname-Teil, ein
// Nicht-Vorname-Teil, eine Rufname-Markierung, eine zweite Form), legt das Modul es zuerst per
// `namensform.anlegen`/`namensteil.anlegen`/`namensform.rufnameSetzen` an (je ein eigener Befehl und
// Undo-Schritt; danach `zwischenSchritt()`, Muster `_befehlsfolge-kurzbeschreibung.ts`). Ohne Person ist
// die Aktion ein No-op (Personen legt das Modul nie an — gemessen verschob das die Deckung der ganzen
// Hauptfolge und verdoppelte die Laufzeit von `undo-bitgleich`).
//
// ORAKEL (nicht nur Deckung), am Datenbankergebnis, nach jedem Befehl:
// - Teile der Zielform: je Art kein doppelter `sortier_index`, höchstens ein Rufname, Rufname nur an
//   einem Vorname-Teil; Teile ANDERER Arten unverändert (über alle Formen und auch mitten im Befehl prüft
//   das `namensteil-sortierindex-eindeutig.test.ts`).
// - anlegen: der neue Teil steht an der verlangten Stelle (bzw. hinten), trägt den getrimmten Wert, keine
//   Rufname-Markierung, die übrigen Teile der Art in unveränderter Reihenfolge.
// - loeschen: der Teil ist weg, die übrigen Teile der Art in unveränderter Reihenfolge auf den Stellen
//   0 … n − 1 (lückenlos nachnummeriert, `namensteil-loeschen.ts`); war er der Rufname, hat die Form keinen.
// - verschieben: der Teil steht auf der Zielstelle, die übrigen in unveränderter Reihenfolge, die Menge
//   der Stellen (Slots) der Art unverändert.
// - aendern: nur `wert` (getrimmt) bzw. `feminine_variante` bzw. das eine Kopf-Feld verändert; dazu das
//   Koaleszenz-Orakel (a)/(b) aus `_befehlsfolge-koaleszenz.ts` gegen den Schlüssel
//   `namensteil.aendern:<id>:<feld>` bzw. `namensform.aendern:<id>:<feld>` und (c): ein neuer Schritt trägt
//   genau diesen Schlüssel (jeder Aufruf ändert nur das eine mitgeschickte Feld).
// - rufnameSetzen: danach trägt genau der gewählte Teil die Markierung (bzw. keiner).
// - `original_text` (E3): war er vor dem Befehl eine automatische Montage der Teile
//   (`istMontierterOriginalText`), ist er danach die Montage der Teile NACH dem Befehl; sonst unverändert.
import fc from 'fast-check'
import type { BefehlEin } from '../../src/main/befehle/registrierung'
import type { Tx } from '../../src/main/repositories/basis'
import * as nameFormRepo from '../../src/main/repositories/name-form-repo'
import type { NameFormZeile } from '../../src/main/repositories/name-form-repo'
import { geladeneTeile } from '../../src/main/repositories/name-repo'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach } from '../../src/core/name/zerlegung'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import type { FehlerCode } from '../../src/shared/fehler/codes'
import { NameFormReihenfolgeEnum, NameFormRolleEnum, NamePartArtEnum, SchriftEnum } from '../../src/shared/schemata/name'
import type { NamensformAendernEin, NamensformAendernFeld } from '../../src/shared/schemata/befehle'
import { befehl, txFingerabdruck, type Zweig } from './_befehlsfolge-beleg'
import { befehlBeobachtet, KOALESZENZ_FENSTER_MS, uhrVorruecken, type Testuhr } from './_befehlsfolge-koaleszenz'
import { kanonischerAbzug } from './_kanonischer-abzug'

type NamePartArt = (typeof NamePartArtEnum.options)[number]
type NameFormRolle = (typeof NameFormRolleEnum.options)[number]

/** Was dieses Modul vom Generatorzustand braucht (strukturell, s. Modul-Kommentar). Seine eigenen Formen
 * trägt es SELBST in `namensformen` ein (auch als Vorlauf mitten in der Aktion — eine spätere Stelle
 * derselben Aktion braucht sie schon); die Liste ist darum veränderlich. */
export interface NamensteileZustand extends Testuhr {
  readonly personIds: readonly string[]
  /** Die Formen der Hauptfolge (`name.anlegen`) — hier nur gelesen. */
  readonly namen: readonly { readonly id: string; readonly personId: string }[]
  /** Die Formen aus `namensform.anlegen` dieses Moduls. Bewusst NICHT in `namen`: dort würden sie Ziel der
   * Hauptfolge und verschöben deren Deckung (gemessen: `name.aendern` 319 → 1678, Laufzeit ×2). Der
   * Generator filtert sie nach `person.loeschen` (CASCADE). */
  readonly namensformen: { readonly id: string; readonly personId: string }[]
  /** Nach jedem Befehl außer dem letzten einer Aktion (s. Modul-Kommentar VORLAUF). */
  readonly zwischenSchritt: () => void
}

export type NamensteileWeg =
  | 'formAnlegen'
  | 'formAendern'
  | 'teilAnlegen'
  | 'teilLoeschen'
  | 'teilAendern'
  | 'teilVerschieben'
  | 'rufnameSetzen'
  | 'ablehnungLeer'
  | 'ablehnungLeerraum'
  | 'ablehnungPosition'
  | 'ablehnungKeinVorname'
  | 'ablehnungFremdeForm'

/** Die Kopf-Felder, die `formAendern` schreibt (Textfelder; `''` leert, s. `formFeldWert`). */
const FORM_FELDER = ['rollenNotiz', 'sprache', 'originalText'] as const satisfies readonly NamensformAendernFeld[]
type FormFeld = (typeof FORM_FELDER)[number]

const TEIL_FELDER = ['wert', 'feminineVariante'] as const

export interface AktionNamensteile {
  readonly art: 'namensteile'
  readonly weg: NamensteileWeg
  /** Form (aus `zustand.namen`) bzw. bei `formAnlegen` Person (aus `zustand.personIds`). */
  readonly zielRoh: number
  /** Teil innerhalb der Form bzw. der Art; bei `ablehnungFremdeForm` die fremde Form. */
  readonly teilRoh: number
  readonly positionRoh: number
  readonly teilArt: NamePartArt
  /** `teilAnlegen`: mit `position` (sonst hinten angehängt). Ablehnungen Leer/Leerraum/Position: über
   * `namensteil.anlegen` (sonst über `namensteil.aendern` bzw. `.verschieben`). */
  readonly mitPosition: boolean
  readonly feldRoh: number
  /** Je Aufruf ein Rohwert (`formAendern`/`teilAendern`); `teilAnlegen` und der Vorlauf nutzen `werte[0]`. */
  readonly werte: readonly string[]
  /** Uhrvorschub VOR Aufruf i + 1 (Länge `werte.length - 1`). */
  readonly abstaendeMs: readonly number[]
  readonly feminineVariante: string | undefined
  /** `formAnlegen`: Rolle; `null` = Umschrift einer bestehenden Form derselben Person (falls vorhanden). */
  readonly rolle: NameFormRolle | null
  readonly schrift: (typeof SchriftEnum.options)[number] | undefined
  readonly reihenfolge: (typeof NameFormReihenfolgeEnum.options)[number] | undefined
  /** `rufnameSetzen`: Markierung entfernen (`null`) statt setzen. */
  readonly rufnameEntfernen: boolean
  /** Ungültiger Wert für die Ablehnungswege Leer/Leerraum. */
  readonly ungueltig: string
}

/** Rohwerte: Apostroph, Umlaut, Kyrillisch, Ersatzpaar, Leerraum am Rand (getrimmt), mehrwortige
 * Nicht-Vornamen; dazu freie Zeichenketten. Für Vornamen macht `gueltigerWert()` daraus ein Wort. */
function wertArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    {
      weight: 3,
      arbitrary: fc.constantFrom(
        'Karl',
        'Anna',
        "O'Brien",
        'Ольга',
        ' Luise ',
        'Jóhann',
        'Lu😀',
        'von der',
        'Lüdenscheidt-Meyer genannt Schulte',
        "d'Aboville",
        'Iwanowitsch',
        'Dr.',
      ),
    },
    { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 10 }) },
  )
}

/** Abstände: überwiegend im Fenster (Tippen), die Grenze 1999/2000 ausdrücklich, sonst darüber. */
function abstandArbitrary(): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0, max: KOALESZENZ_FENSTER_MS - 1 }) },
    { weight: 1, arbitrary: fc.constantFrom(KOALESZENZ_FENSTER_MS - 1, KOALESZENZ_FENSTER_MS) },
    { weight: 1, arbitrary: fc.integer({ min: KOALESZENZ_FENSTER_MS, max: 3 * KOALESZENZ_FENSTER_MS }) },
  )
}

function weg(gewicht: number, w: NamensteileWeg): { readonly weight: number; readonly arbitrary: fc.Arbitrary<NamensteileWeg> } {
  return { weight: gewicht, arbitrary: fc.constant<NamensteileWeg>(w) }
}

/** Gewichte: die Koaleszenz-Wege und das Verschieben (Parkwert) doppelt, jede Ablehnung einfach. */
export function namensteileAktionArbitrary(): fc.Arbitrary<AktionNamensteile> {
  return fc
    .record({
      weg: fc.oneof(
        weg(2, 'formAnlegen'),
        weg(2, 'formAendern'),
        weg(2, 'teilAnlegen'),
        weg(2, 'teilLoeschen'),
        weg(2, 'teilAendern'),
        weg(2, 'teilVerschieben'),
        weg(2, 'rufnameSetzen'),
        weg(1, 'ablehnungLeer'),
        weg(1, 'ablehnungLeerraum'),
        weg(1, 'ablehnungPosition'),
        weg(1, 'ablehnungKeinVorname'),
        weg(1, 'ablehnungFremdeForm'),
      ),
      zielRoh: fc.nat(),
      teilRoh: fc.nat(),
      positionRoh: fc.nat(),
      teilArt: fc.constantFrom(...NamePartArtEnum.options),
      mitPosition: fc.boolean(),
      feldRoh: fc.nat(),
      anzahl: fc.integer({ min: 1, max: 4 }),
      werte: fc.array(wertArbitrary(), { minLength: 4, maxLength: 4 }),
      abstaendeMs: fc.array(abstandArbitrary(), { minLength: 3, maxLength: 3 }),
      feminineVariante: fc.option(fc.constantFrom('Iwanowna', 'Petrowa', 'Müllerin', ''), { nil: undefined }),
      rolle: fc.oneof({ weight: 3, arbitrary: fc.constantFrom(...NameFormRolleEnum.options) }, { weight: 1, arbitrary: fc.constant(null) }),
      schrift: fc.option(fc.constantFrom(...SchriftEnum.options), { nil: undefined }),
      reihenfolge: fc.option(fc.constantFrom(...NameFormReihenfolgeEnum.options), { nil: undefined }),
      rufnameEntfernen: fc.constantFrom(false, false, true),
      ungueltig: fc.constantFrom('', ' ', '  \t', ' ', 'Hans Peter', 'Anna\tMaria', 'Karl Heinz'),
    })
    .map(
      (r): AktionNamensteile => ({
        art: 'namensteile',
        weg: r.weg,
        zielRoh: r.zielRoh,
        teilRoh: r.teilRoh,
        positionRoh: r.positionRoh,
        teilArt: r.teilArt,
        mitPosition: r.mitPosition,
        feldRoh: r.feldRoh,
        werte: r.werte.slice(0, r.anzahl),
        abstaendeMs: r.abstaendeMs.slice(0, r.anzahl - 1),
        feminineVariante: r.feminineVariante,
        rolle: r.rolle,
        schrift: r.schrift,
        reihenfolge: r.reihenfolge,
        rufnameEntfernen: r.rufnameEntfernen,
        ungueltig: r.ungueltig,
      }),
    )
}

// -----------------------------------------------------------------------------------------------
// Lesehilfen (eigene SQL, Muster `_kanonischer-abzug.ts` — `test/` unterliegt nicht CLAUDE.md §2)
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

/** Alle Teile einer Form, deterministisch sortiert (Art, Stelle, id). */
function teileLesen(db: Tx, formId: string): readonly TeilZeile[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>(
      `SELECT id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante
         FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index, id`,
    )
    .all({ formId })
}

function teileDerArt(teile: readonly TeilZeile[], art: string): readonly TeilZeile[] {
  return teile.filter((t) => t.art === art)
}

function formLesen(db: Tx, formId: string): NameFormZeile {
  const form = nameFormRepo.lesen(db, formId)
  if (form === undefined) {
    throw new Error(`namensteile: getrackte Form ${formId} fehlt in der Datenbank.`)
  }
  return form
}

function zielAus<T>(liste: readonly T[], roh: number): T | undefined {
  return liste.length === 0 ? undefined : liste[roh % liste.length]
}

/** Macht aus einem Rohwert einen gültigen Wert der Art: Vornamen ohne inneren Leerraum, nie leer.
 * Leerraum am Rand bleibt (der Handler trimmt — das Orakel prüft es). */
function gueltigerWert(art: string, roh: string): string {
  const wert = art === 'vorname' && /\s/u.test(roh.trim()) ? roh.replace(/\s/gu, '') : roh
  if (wert.trim() === '') {
    return art === 'vorname' ? 'Karl' : 'von der'
  }
  return wert
}

// -----------------------------------------------------------------------------------------------
// Orakel
// -----------------------------------------------------------------------------------------------

/** Struktur je Form: kein doppelter `sortier_index` je Art, höchstens ein Rufname, Rufname nur am Vornamen. */
function strukturPruefen(teile: readonly TeilZeile[], wo: string): void {
  const stellen = new Set<string>()
  let rufnamen = 0
  for (const t of teile) {
    const schluessel = `${t.art}\u0001${String(t.sortier_index)}`
    if (stellen.has(schluessel)) {
      throw new Error(`namensteile (${wo}): doppelter sortier_index ${String(t.sortier_index)} in Art ${t.art}.`)
    }
    stellen.add(schluessel)
    if (t.ist_rufname === 1) {
      rufnamen += 1
      if (t.art !== 'vorname') {
        throw new Error(`namensteile (${wo}): Rufname an einem Teil der Art ${t.art}.`)
      }
    }
  }
  if (rufnamen > 1) {
    throw new Error(`namensteile (${wo}): ${String(rufnamen)} Rufnamen in einer Form.`)
  }
}

function abdruck(teile: readonly TeilZeile[]): string {
  return JSON.stringify(teile)
}

/** Teile anderer Arten als `art` — die darf ein Befehl auf einen Teil der Art `art` nicht berühren. */
function andereArten(teile: readonly TeilZeile[], art: string): string {
  return abdruck(teile.filter((t) => t.art !== art))
}

function reihenfolge(teile: readonly TeilZeile[]): readonly string[] {
  return teile.map((t) => t.id)
}

function gleicheListe(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** E3 (s. Modul-Kommentar ORAKEL): nur wenn sich die Teile geändert haben UND `original_text` vorher
 * automatisch montiert war, ist er danach die Montage der neuen Teile; sonst unverändert (ein No-op-Befehl
 * schreibt nichts, auch keinen normierten Leerraum). */
function originalTextPruefen(db: Tx, vorher: NameFormZeile, automatisch: boolean, teileGeaendert: boolean, wo: string): void {
  const nachher = formLesen(db, vorher.id)
  const soll = automatisch && teileGeaendert ? montiereOriginalText(rekonstruiereFlach(geladeneTeile(db, vorher.id))) : vorher.original_text
  if (nachher.original_text !== soll) {
    throw new Error(
      `namensteile (${wo}): original_text danach ${JSON.stringify(nachher.original_text)}, erwartet ${JSON.stringify(soll)} ` +
        `(vorher automatisch montiert: ${String(automatisch)}, Teile geändert: ${String(teileGeaendert)}).`,
    )
  }
}

/** Führt einen Teil-Befehl auf der Form `formId` aus und prüft Struktur + E3. `pruefen` bekommt die Teile
 * vorher und nachher. */
function teilBefehl(db: Tx, formId: string, wo: string, ausfuehren: () => void, pruefen: (vorher: readonly TeilZeile[], nachher: readonly TeilZeile[]) => void): void {
  const form = formLesen(db, formId)
  const teileVorher = teileLesen(db, formId)
  const automatisch = istMontierterOriginalText(form.original_text, rekonstruiereFlach(geladeneTeile(db, formId)))
  ausfuehren()
  const teileNachher = teileLesen(db, formId)
  strukturPruefen(teileNachher, wo)
  pruefen(teileVorher, teileNachher)
  originalTextPruefen(db, form, automatisch, abdruck(teileVorher) !== abdruck(teileNachher), wo)
}

/** Führt `ausfuehren` aus und verlangt genau den Fehlercode, keine neue Transaktion und einen bitgleichen
 * Bestand (Grundsatz E-B2-2). */
function ablehnungVerlangen(db: Tx, wo: string, code: FehlerCode, ausfuehren: () => void): void {
  const abzugVorher = kanonischerAbzug(db)
  const txVorher = txFingerabdruck(db)
  let fehler: unknown
  try {
    ausfuehren()
  } catch (e) {
    fehler = e
  }
  if (!(fehler instanceof WurzelFehler) || fehler.code !== code) {
    throw new Error(`namensteile (${wo}): Ablehnung ${code} erwartet, erhalten: ${fehler === undefined ? 'kein Fehler' : String(fehler)}`)
  }
  if (txFingerabdruck(db) !== txVorher) {
    throw new Error(`namensteile (${wo}): abgelehnter Befehl hat eine Transaktion hinterlassen.`)
  }
  if (kanonischerAbzug(db) !== abzugVorher) {
    throw new Error(`namensteile (${wo}): abgelehnter Befehl hat den Bestand verändert.`)
  }
}

// -----------------------------------------------------------------------------------------------
// Einzelbefehle mit Orakel
// -----------------------------------------------------------------------------------------------

/** `namensteil.anlegen` mit Orakel; liefert die neue Teil-ID. */
function teilAnlegen(db: Tx, zweige: Zweig[], formId: string, art: NamePartArt, roh: string, position: number | undefined, feminineVariante: string | undefined): string {
  const wert = gueltigerWert(art, roh)
  let neueId = ''
  teilBefehl(
    db,
    formId,
    'teilAnlegen',
    () => {
      neueId = befehl(zweige, db, 'namensteil.anlegen', {
        namensformId: formId,
        art,
        wert,
        ...(feminineVariante !== undefined ? { feminineVariante } : {}),
        ...(position !== undefined ? { position } : {}),
      }).id
    },
    (vorher, nachher) => {
      const alt = teileDerArt(vorher, art)
      const neu = teileDerArt(nachher, art)
      const stelle = position ?? alt.length
      const soll = [...reihenfolge(alt).slice(0, stelle), neueId, ...reihenfolge(alt).slice(stelle)]
      if (!gleicheListe(reihenfolge(neu), soll)) {
        throw new Error('namensteile (teilAnlegen): der neue Teil steht nicht an der verlangten Stelle oder die übrigen haben die Reihenfolge gewechselt.')
      }
      const teil = neu[stelle]
      if (teil === undefined || teil.wert !== wert.trim() || teil.ist_rufname !== 0 || teil.feminine_variante !== (feminineVariante ?? null)) {
        throw new Error(`namensteil.anlegen: gespeichert ${JSON.stringify(teil)}, gesendet ${JSON.stringify({ wert, feminineVariante })}.`)
      }
      if (andereArten(vorher, art) !== andereArten(nachher, art)) {
        throw new Error('namensteile (teilAnlegen): Teile anderer Arten verändert.')
      }
      if (stelle < alt.length) {
        zweige.push('namensteile.teilAnlegen.eingeschoben')
      }
    },
  )
  return neueId
}

/** Stellt sicher, dass die Form mindestens `anzahl` Teile der Art trägt (Vorlauf, je Befehl `zwischenSchritt()`). */
function teileSicherstellen(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], formId: string, art: NamePartArt, anzahl: number, aktion: AktionNamensteile): readonly TeilZeile[] {
  let teile = teileDerArt(teileLesen(db, formId), art)
  let i = 0
  while (teile.length < anzahl) {
    teilAnlegen(db, zweige, formId, art, aktion.werte[i % aktion.werte.length] ?? 'Karl', undefined, undefined)
    zustand.zwischenSchritt()
    i += 1
    teile = teileDerArt(teileLesen(db, formId), art)
  }
  return teile
}

function teilLoeschen(db: Tx, zweige: Zweig[], formId: string, teil: TeilZeile): void {
  teilBefehl(
    db,
    formId,
    'teilLoeschen',
    () => {
      befehl(zweige, db, 'namensteil.loeschen', { id: teil.id })
    },
    (vorher, nachher) => {
      const alt = teileDerArt(vorher, teil.art)
      const neu = teileDerArt(nachher, teil.art)
      if (!gleicheListe(reihenfolge(neu), reihenfolge(alt).filter((id) => id !== teil.id))) {
        throw new Error('namensteile (teilLoeschen): der Teil besteht noch oder die übrigen haben die Reihenfolge gewechselt.')
      }
      if (!gleicheListe(neu.map((t) => t.sortier_index), neu.map((_, rang) => rang))) {
        throw new Error(`namensteil.loeschen: nicht lückenlos nachnummeriert (${JSON.stringify(neu.map((t) => t.sortier_index))}).`)
      }
      if (andereArten(vorher, teil.art) !== andereArten(nachher, teil.art)) {
        throw new Error('namensteile (teilLoeschen): Teile anderer Arten verändert.')
      }
      if (teil.ist_rufname === 1 && nachher.some((t) => t.ist_rufname === 1)) {
        throw new Error('namensteil.loeschen: nach dem Löschen des Rufnamens trägt ein anderer Teil die Markierung.')
      }
      if (neu.some((t) => alt.find((a) => a.id === t.id)?.sortier_index !== t.sortier_index)) {
        zweige.push('namensteile.teilLoeschen.nachnummeriert')
      }
    },
  )
}

/** Wurde der bewegte Teil in der obersten Transaktion auf den Parkwert gesetzt? (Deckungszweig, am Journal.) */
function geparkt(db: Tx, teilId: string, park: number): boolean {
  const zeile = db
    .prepare<{ readonly teilId: string; readonly park: number }, { readonly anzahl: number }>(
      `SELECT COUNT(*) AS anzahl FROM aenderung
        WHERE transaktion_id = (SELECT id FROM transaktion WHERE status = 'angewendet' ORDER BY lfd DESC LIMIT 1)
          AND tabelle = 'name_part' AND datensatz_id = @teilId AND operation = 'update'
          AND json_extract(wert_neu_json, '$.sortier_index') = @park`,
    )
    .get({ teilId, park })
  return zeile !== undefined && zeile.anzahl > 0
}

function teilVerschieben(db: Tx, zweige: Zweig[], formId: string, teil: TeilZeile, position: number): void {
  teilBefehl(
    db,
    formId,
    'teilVerschieben',
    () => {
      befehl(zweige, db, 'namensteil.verschieben', { id: teil.id, position })
    },
    (vorher, nachher) => {
      const alt = teileDerArt(vorher, teil.art)
      const neu = teileDerArt(nachher, teil.art)
      const ohne = reihenfolge(alt).filter((id) => id !== teil.id)
      const soll = [...ohne.slice(0, position), teil.id, ...ohne.slice(position)]
      if (!gleicheListe(reihenfolge(neu), soll)) {
        throw new Error('namensteil.verschieben: der Teil steht nicht auf der Zielstelle oder die übrigen haben die Reihenfolge gewechselt.')
      }
      if (!gleicheListe(neu.map((t) => t.sortier_index), alt.map((t) => t.sortier_index))) {
        throw new Error('namensteil.verschieben: die Stellen (Slots) der Art haben sich verändert.')
      }
      if (andereArten(vorher, teil.art) !== andereArten(nachher, teil.art)) {
        throw new Error('namensteile (teilVerschieben): Teile anderer Arten verändert.')
      }
      const hoechste = alt[alt.length - 1]
      if (hoechste !== undefined && geparkt(db, teil.id, hoechste.sortier_index + 1)) {
        zweige.push('namensteile.verschieben.geparkt')
      }
    },
  )
}

function rufnameSetzen(db: Tx, zweige: Zweig[], formId: string, teilId: string | null): void {
  teilBefehl(
    db,
    formId,
    'rufnameSetzen',
    () => {
      befehl(zweige, db, 'namensform.rufnameSetzen', { namensformId: formId, namensteilId: teilId })
    },
    (vorher, nachher) => {
      const markiert = nachher.filter((t) => t.ist_rufname === 1).map((t) => t.id)
      if (!gleicheListe(markiert, teilId === null ? [] : [teilId])) {
        throw new Error(`namensform.rufnameSetzen: markiert danach ${JSON.stringify(markiert)}, verlangt ${JSON.stringify(teilId)}.`)
      }
      const ohneMarkierung = (teile: readonly TeilZeile[]): string => abdruck(teile.map((t) => ({ ...t, ist_rufname: 0 })))
      if (ohneMarkierung(vorher) !== ohneMarkierung(nachher)) {
        throw new Error('namensform.rufnameSetzen: außer der Markierung hat sich an den Teilen etwas verändert.')
      }
      const alt = vorher.find((t) => t.ist_rufname === 1)?.id
      if (teilId === null && alt !== undefined) {
        zweige.push('namensteile.rufname.null')
      } else if (teilId !== null && alt !== undefined && alt !== teilId) {
        zweige.push('namensteile.rufname.wechsel')
      } else if (teilId !== null && alt === undefined) {
        zweige.push('namensteile.rufname.gesetzt')
      }
    },
  )
}

/** Koaleszenz-Orakel (a)/(b) wie `serieAusfuehren()` in `_befehlsfolge-koaleszenz.ts`; meldet den Zweig. */
function koaleszenzPruefen(
  zweige: Zweig[],
  zustand: NamensteileZustand,
  beobachtet: ReturnType<typeof befehlBeobachtet>,
  erwarteterSchluessel: string,
  wo: 'formAendern' | 'teilAendern',
): void {
  const oberste = beobachtet.vorher.oberste
  const kandidatPasst = oberste !== undefined && zustand.uhrMs - oberste.zeitpunkt < KOALESZENZ_FENSTER_MS && oberste.koaleszenz_schluessel === erwarteterSchluessel
  if (beobachtet.landung === 'zusammengefasst' && !kandidatPasst) {
    throw new Error(`namensteile (${wo}): zusammengefasst ohne Anlass (Schlüssel vorher ${String(oberste?.koaleszenz_schluessel)}).`)
  }
  if (beobachtet.landung === 'neu' && kandidatPasst && beobachtet.nachher.oberste?.koaleszenz_schluessel === erwarteterSchluessel) {
    throw new Error(`namensteile (${wo}): keine Koaleszenz trotz gleichem Schlüssel im Fenster.`)
  }
  if (beobachtet.landung === 'neu' && beobachtet.nachher.oberste?.koaleszenz_schluessel !== erwarteterSchluessel) {
    throw new Error(`namensteile (${wo}): neuer Schritt ohne den Schlüssel ${erwarteterSchluessel} (erhalten ${String(beobachtet.nachher.oberste?.koaleszenz_schluessel)}).`)
  }
  if (beobachtet.landung === 'zusammengefasst') {
    zweige.push(wo === 'formAendern' ? 'namensteile.formAendern.zusammengefasst' : 'namensteile.teilAendern.zusammengefasst')
  } else if (beobachtet.landung === 'neu') {
    zweige.push(wo === 'formAendern' ? 'namensteile.formAendern.neuerSchritt' : 'namensteile.teilAendern.neuerSchritt')
  }
}

/** Führt einen Befehl über `befehlBeobachtet` aus, ohne dessen `koaleszenz.*`-Zweige weiterzugeben (die
 * zählen die Serien der Hauptfolge, Muster `_befehlsfolge-kurzbeschreibung.ts`). */
function beobachtet<N extends 'namensform.aendern' | 'namensteil.aendern'>(
  zweige: Zweig[],
  db: Tx,
  name: N,
  ein: BefehlEin<N>,
): ReturnType<typeof befehlBeobachtet> {
  const lokal: Zweig[] = []
  const ergebnis = befehlBeobachtet(lokal, db, name, ein)
  zweige.push(...lokal.filter((z) => z.startsWith('befehl:')))
  return ergebnis
}

function formFeldWert(roh: string): string | null {
  return roh === '' ? null : roh
}

/** Nutzlast mit genau dem einen Kopf-Feld (Teil-Semantik E6: fehlende Felder bleiben). */
function formAendernEin(id: string, feld: FormFeld, wert: string | null): NamensformAendernEin {
  switch (feld) {
    case 'rollenNotiz':
      return { id, rollenNotiz: wert, feld }
    case 'sprache':
      return { id, sprache: wert, feld }
    case 'originalText':
      return { id, originalText: wert, feld }
  }
}

function formSpalte(form: NameFormZeile, feld: FormFeld): string | null {
  switch (feld) {
    case 'rollenNotiz':
      return form.rollen_notiz
    case 'sprache':
      return form.sprache
    case 'originalText':
      return form.original_text
  }
}

function formOhneFeld(form: NameFormZeile, feld: FormFeld): string {
  const spalte = feld === 'rollenNotiz' ? 'rollen_notiz' : feld === 'sprache' ? 'sprache' : 'original_text'
  return JSON.stringify(Object.entries(form).filter(([s]) => s !== spalte))
}

function formAendern(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], formId: string, aktion: AktionNamensteile): void {
  const feld = FORM_FELDER[aktion.feldRoh % FORM_FELDER.length] ?? 'rollenNotiz'
  const erwarteterSchluessel = `namensform.aendern:${formId}:${feld}`
  const teileVorher = abdruck(teileLesen(db, formId))
  for (let i = 0; i < aktion.werte.length; i += 1) {
    if (i > 0) {
      zustand.zwischenSchritt()
      uhrVorruecken(zustand, aktion.abstaendeMs[i - 1] ?? 0)
    }
    const wert = formFeldWert(aktion.werte[i] ?? '')
    const vorher = formLesen(db, formId)
    const ein = formAendernEin(formId, feld, wert)
    const b = beobachtet(zweige, db, 'namensform.aendern', ein)
    const nachher = formLesen(db, formId)
    if (formSpalte(nachher, feld) !== wert) {
      throw new Error(`namensform.aendern: ${feld} danach ${JSON.stringify(formSpalte(nachher, feld))}, gesendet ${JSON.stringify(wert)}.`)
    }
    if (formOhneFeld(nachher, feld) !== formOhneFeld(vorher, feld)) {
      throw new Error(`namensform.aendern: außer ${feld} hat sich ein Kopf-Feld verändert (Teil-Semantik E6).`)
    }
    koaleszenzPruefen(zweige, zustand, b, erwarteterSchluessel, 'formAendern')
  }
  if (abdruck(teileLesen(db, formId)) !== teileVorher) {
    throw new Error('namensform.aendern: die Teile der Form haben sich verändert.')
  }
}

function teilAendern(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], formId: string, teil: TeilZeile, aktion: AktionNamensteile): void {
  const feld = TEIL_FELDER[aktion.feldRoh % TEIL_FELDER.length] ?? 'wert'
  const erwarteterSchluessel = `namensteil.aendern:${teil.id}:${feld}`
  for (let i = 0; i < aktion.werte.length; i += 1) {
    if (i > 0) {
      zustand.zwischenSchritt()
      uhrVorruecken(zustand, aktion.abstaendeMs[i - 1] ?? 0)
    }
    const roh = aktion.werte[i] ?? ''
    const wert = feld === 'wert' ? gueltigerWert(teil.art, roh) : undefined
    const feminineVariante = feld === 'feminineVariante' ? formFeldWert(roh) : undefined
    let b: ReturnType<typeof befehlBeobachtet> | undefined
    teilBefehl(
      db,
      formId,
      'teilAendern',
      () => {
        b = beobachtet(zweige, db, 'namensteil.aendern', {
          id: teil.id,
          ...(wert !== undefined ? { wert } : {}),
          ...(feminineVariante !== undefined ? { feminineVariante } : {}),
          feld,
        })
      },
      (vorher, nachher) => {
        const alt = vorher.find((t) => t.id === teil.id)
        const neu = nachher.find((t) => t.id === teil.id)
        if (alt === undefined || neu === undefined) {
          throw new Error('namensteile (teilAendern): der Teil fehlt.')
        }
        const soll: TeilZeile = {
          ...alt,
          wert: wert !== undefined ? wert.trim() : alt.wert,
          feminine_variante: feminineVariante !== undefined ? feminineVariante : alt.feminine_variante,
        }
        if (abdruck([neu]) !== abdruck([soll])) {
          throw new Error(`namensteil.aendern: gespeichert ${JSON.stringify(neu)}, erwartet ${JSON.stringify(soll)}.`)
        }
        if (abdruck(vorher.filter((t) => t.id !== teil.id)) !== abdruck(nachher.filter((t) => t.id !== teil.id))) {
          throw new Error('namensteil.aendern: andere Teile der Form verändert.')
        }
      },
    )
    if (b === undefined) {
      throw new Error('namensteile (teilAendern): unerreichbar — der Befehl wurde ausgeführt.')
    }
    koaleszenzPruefen(zweige, zustand, b, erwarteterSchluessel, 'teilAendern')
  }
}

/** Alle Formen, an denen dieses Modul arbeitet: die der Hauptfolge und die selbst angelegten. */
function alleFormen(zustand: NamensteileZustand): readonly { readonly id: string; readonly personId: string }[] {
  return [...zustand.namen, ...zustand.namensformen]
}

/** `namensform.anlegen` mit Orakel; ohne Person ein No-op (`undefined`). */
function formAnlegen(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], aktion: AktionNamensteile): string | undefined {
  const personId = zielAus(zustand.personIds, aktion.zielRoh)
  if (personId === undefined) {
    return undefined
  }
  const eigene = alleFormen(zustand).filter((n) => n.personId === personId)
  const ursprung = zielAus(eigene, aktion.teilRoh)
  const umschrift = aktion.rolle === null && ursprung !== undefined
  const bisherige = db
    .prepare<{ readonly personId: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM name_form WHERE person_id = @personId')
    .get({ personId })
  const { id } = befehl(zweige, db, 'namensform.anlegen', {
    personId,
    rolle: umschrift ? null : (aktion.rolle ?? 'geburtsname'),
    ...(umschrift ? { umschriftVon: ursprung.id } : {}),
    ...(aktion.schrift !== undefined ? { schrift: aktion.schrift } : {}),
    ...(aktion.reihenfolge !== undefined ? { reihenfolge: aktion.reihenfolge } : {}),
  })
  const form = formLesen(db, id)
  const sollBevorzugt = (bisherige?.anzahl ?? 0) === 0 ? 1 : 0
  if (
    form.person_id !== personId ||
    form.ist_bevorzugt !== sollBevorzugt ||
    form.rolle !== (umschrift ? null : (aktion.rolle ?? 'geburtsname')) ||
    form.umschrift_von !== (umschrift ? ursprung.id : null) ||
    form.original_text !== null ||
    teileLesen(db, id).length !== 0
  ) {
    throw new Error(`namensform.anlegen: gespeichert ${JSON.stringify(form)} passt nicht zur Anforderung (bevorzugt soll ${String(sollBevorzugt)}).`)
  }
  if (umschrift) {
    zweige.push('namensteile.formAnlegen.umschrift')
  }
  zustand.namensformen.push({ id, personId })
  return id
}

/** Eine Form (s. `alleFormen`); ohne Form legt der Vorlauf eine per `namensform.anlegen` an, ohne Person
 * `undefined` (No-op). */
function formSicherstellen(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], aktion: AktionNamensteile): string | undefined {
  const vorhanden = zielAus(alleFormen(zustand), aktion.zielRoh)
  if (vorhanden !== undefined) {
    return vorhanden.id
  }
  const id = formAnlegen(db, zustand, zweige, aktion)
  if (id !== undefined) {
    zustand.zwischenSchritt()
  }
  return id
}

// -----------------------------------------------------------------------------------------------
// Ablehnungen
// -----------------------------------------------------------------------------------------------

function ablehnen(db: Tx, zustand: NamensteileZustand, zweige: Zweig[], formId: string, aktion: AktionNamensteile): void {
  switch (aktion.weg) {
    case 'ablehnungLeer':
    case 'ablehnungLeerraum': {
      const leer = aktion.weg === 'ablehnungLeer'
      // Leer: jeder Wert, der getrimmt leer ist; Leerraum: ein Vorname mit innerem Leerraum.
      const wert = leer ? (aktion.ungueltig.trim() === '' ? aktion.ungueltig : ' ') : /\s/u.test(aktion.ungueltig.trim()) ? aktion.ungueltig : 'Hans Peter'
      const art: NamePartArt = leer ? aktion.teilArt : 'vorname'
      const code = leer ? 'VALIDIERUNG_NAMENSTEIL_LEER' : 'VALIDIERUNG_NAMENSTEIL_LEERRAUM'
      if (aktion.mitPosition) {
        ablehnungVerlangen(db, aktion.weg, code, () => befehl(zweige, db, 'namensteil.anlegen', { namensformId: formId, art, wert }))
      } else {
        const teile = teileSicherstellen(db, zustand, zweige, formId, art, 1, aktion)
        const teil = zielAus(teile, aktion.teilRoh)
        if (teil === undefined) {
          throw new Error('namensteile (Ablehnung): unerreichbar — der Vorlauf hat einen Teil angelegt.')
        }
        ablehnungVerlangen(db, aktion.weg, code, () => befehl(zweige, db, 'namensteil.aendern', { id: teil.id, wert, feld: 'wert' }))
      }
      zweige.push(leer ? 'ablehnung.namensteile.leer' : 'ablehnung.namensteile.leerraum')
      return
    }

    case 'ablehnungPosition': {
      const teile = teileDerArt(teileLesen(db, formId), aktion.teilArt)
      if (aktion.mitPosition || teile.length === 0) {
        const position = teile.length + 1 + (aktion.positionRoh % 3)
        ablehnungVerlangen(db, aktion.weg, 'VALIDIERUNG_WERTEBEREICH', () =>
          befehl(zweige, db, 'namensteil.anlegen', { namensformId: formId, art: aktion.teilArt, wert: gueltigerWert(aktion.teilArt, aktion.werte[0] ?? ''), position }),
        )
      } else {
        const teil = zielAus(teile, aktion.teilRoh)
        if (teil === undefined) {
          throw new Error('namensteile (Ablehnung): unerreichbar — die Art hat Teile.')
        }
        const position = teile.length + (aktion.positionRoh % 3)
        ablehnungVerlangen(db, aktion.weg, 'VALIDIERUNG_WERTEBEREICH', () => befehl(zweige, db, 'namensteil.verschieben', { id: teil.id, position }))
      }
      zweige.push('ablehnung.namensteile.position')
      return
    }

    case 'ablehnungKeinVorname': {
      const art: NamePartArt = aktion.teilArt === 'vorname' ? 'nachname' : aktion.teilArt
      const teile = teileSicherstellen(db, zustand, zweige, formId, art, 1, aktion)
      const teil = zielAus(teile, aktion.teilRoh)
      if (teil === undefined) {
        throw new Error('namensteile (Ablehnung): unerreichbar — der Vorlauf hat einen Teil angelegt.')
      }
      ablehnungVerlangen(db, aktion.weg, 'VALIDIERUNG_RUFNAME_KEIN_VORNAME', () =>
        befehl(zweige, db, 'namensform.rufnameSetzen', { namensformId: formId, namensteilId: teil.id }),
      )
      zweige.push('ablehnung.namensteile.keinVorname')
      return
    }

    case 'ablehnungFremdeForm': {
      // Die fremde Form: eine andere aus `zustand.namen`, sonst legt der Vorlauf eine an (für eine Person
      // aus `zielRoh` — auch dieselbe Person: „fremd" heißt eine andere Form, nicht eine andere Person).
      let fremdeId = zielAus(
        alleFormen(zustand).filter((n) => n.id !== formId),
        aktion.teilRoh,
      )?.id
      if (fremdeId === undefined) {
        fremdeId = formAnlegen(db, zustand, zweige, aktion)
        if (fremdeId === undefined) {
          throw new Error('namensteile (Ablehnung): unerreichbar — die Zielform hat eine Person.')
        }
        zustand.zwischenSchritt()
      }
      const teile = teileSicherstellen(db, zustand, zweige, fremdeId, 'vorname', 1, aktion)
      const teil = zielAus(teile, aktion.positionRoh)
      if (teil === undefined) {
        throw new Error('namensteile (Ablehnung): unerreichbar — der Vorlauf hat einen Vorname-Teil angelegt.')
      }
      ablehnungVerlangen(db, aktion.weg, 'NICHT_GEFUNDEN_NAMENSTEIL', () =>
        befehl(zweige, db, 'namensform.rufnameSetzen', { namensformId: formId, namensteilId: teil.id }),
      )
      zweige.push('ablehnung.namensteile.fremdeForm')
      return
    }

    default:
      throw new Error(`namensteile: ${aktion.weg} ist kein Ablehnungsweg.`)
  }
}

// -----------------------------------------------------------------------------------------------
// Ausführung
// -----------------------------------------------------------------------------------------------

/** Führt die Aktion aus (s. Modul-Kommentar); neue Personen und Formen trägt sie selbst in den Zustand ein. */
export function namensteileAusfuehren(db: Tx, zustand: NamensteileZustand, aktion: AktionNamensteile, zweige: Zweig[]): void {
  if (aktion.weg === 'formAnlegen') {
    formAnlegen(db, zustand, zweige, aktion)
    return
  }
  const formId = formSicherstellen(db, zustand, zweige, aktion)
  if (formId === undefined) {
    return
  }
  const form = { id: formId }
  switch (aktion.weg) {
    case 'formAendern':
      formAendern(db, zustand, zweige, form.id, aktion)
      return

    case 'teilAnlegen': {
      // Mit `position`: vorher 1–2 Teile der Art (Vorlauf), sonst gäbe es nichts, vor das eingefügt würde.
      const anzahl = aktion.mitPosition
        ? teileSicherstellen(db, zustand, zweige, form.id, aktion.teilArt, 1 + (aktion.teilRoh % 2), aktion).length
        : teileDerArt(teileLesen(db, form.id), aktion.teilArt).length
      teilAnlegen(db, zweige, form.id, aktion.teilArt, aktion.werte[0] ?? '', aktion.mitPosition ? aktion.positionRoh % (anzahl + 1) : undefined, aktion.feminineVariante)
      return
    }

    case 'teilLoeschen': {
      // Ein Teil der Art `teilArt`; mit 1–3 Teilen dieser Art (Vorlauf), damit auch mittlere Teile fallen
      // und die übrigen nachrücken müssen.
      const teile = teileSicherstellen(db, zustand, zweige, form.id, aktion.teilArt, 1 + (aktion.positionRoh % 3), aktion)
      const teil = zielAus(teile, aktion.teilRoh)
      if (teil === undefined) {
        throw new Error('namensteile (teilLoeschen): unerreichbar — die Form hat Teile.')
      }
      teilLoeschen(db, zweige, form.id, teil)
      return
    }

    case 'teilAendern': {
      const vorhanden = teileLesen(db, form.id)
      const teile = vorhanden.length > 0 ? vorhanden : teileSicherstellen(db, zustand, zweige, form.id, aktion.teilArt, 1, aktion)
      const teil = zielAus(teile, aktion.teilRoh)
      if (teil === undefined) {
        throw new Error('namensteile (teilAendern): unerreichbar — die Form hat Teile.')
      }
      teilAendern(db, zustand, zweige, form.id, teil, aktion)
      return
    }

    case 'teilVerschieben': {
      const teile = teileSicherstellen(db, zustand, zweige, form.id, aktion.teilArt, 2 + (aktion.positionRoh % 2), aktion)
      const alt = aktion.teilRoh % teile.length
      const teil = teile[alt]
      if (teil === undefined) {
        throw new Error('namensteile (teilVerschieben): unerreichbar — Index per Modulo.')
      }
      // Immer eine echte Bewegung: die Zielstelle ist nie die bisherige.
      const position = (alt + 1 + (aktion.positionRoh % (teile.length - 1))) % teile.length
      teilVerschieben(db, zweige, form.id, teil, position)
      return
    }

    case 'rufnameSetzen': {
      // Immer ein Wechsel bzw. ein Entfernen: ohne Markierung setzt der Vorlauf zuerst eine (Zweig
      // `gesetzt`), fürs Wechseln braucht die Form zwei Vornamen.
      const teile = teileSicherstellen(db, zustand, zweige, form.id, 'vorname', aktion.rufnameEntfernen ? 1 : 2, aktion)
      let aktuell = teile.find((t) => t.ist_rufname === 1)
      if (aktuell === undefined) {
        aktuell = zielAus(teile, aktion.teilRoh)
        if (aktuell === undefined) {
          throw new Error('namensteile (rufnameSetzen): unerreichbar — der Vorlauf hat Vorname-Teile angelegt.')
        }
        rufnameSetzen(db, zweige, form.id, aktuell.id)
        zustand.zwischenSchritt()
      }
      if (aktion.rufnameEntfernen) {
        rufnameSetzen(db, zweige, form.id, null)
        return
      }
      const bisher = aktuell.id
      const neu = zielAus(
        teile.filter((t) => t.id !== bisher),
        aktion.positionRoh,
      )
      if (neu === undefined) {
        throw new Error('namensteile (rufnameSetzen): unerreichbar — die Form hat zwei Vorname-Teile.')
      }
      rufnameSetzen(db, zweige, form.id, neu.id)
      return
    }

    default:
      ablehnen(db, zustand, zweige, form.id, aktion)
      return
  }
}
