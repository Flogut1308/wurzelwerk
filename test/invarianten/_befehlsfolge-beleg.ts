// AP-1.34 PR-B2 — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Beleg-Teil des Befehlsfolge-
// Generators (`_befehlsfolge-generator.ts`): Transkripte, Textanker (B-01, §31 U-1.34-E4/F4) und
// `feld` (§31 U-1.34-F1/C1b-feld-praedikat) für `aussage_zitat.anlegen`/`.aendern` und
// `zitat.aendern`. Ausgelagert, damit der Generator nicht weiter wächst; dieses Modul importiert den
// Generator NICHT (keine Zyklen) — was es vom Generatorzustand braucht, beschreibt `BelegZustand`
// strukturell.
//
// TRANSKRIPTE: `fc.string()` liefert unter fast-check 4 nur druckbares ASCII — ein Anker über „ä",
// „ß", „Ё", „ł" oder ein Emoji (UTF-16-Ersatzpaar, F4) käme so nie vor. `transkriptArbitrary()` baut
// Transkripte darum aus festen Bausteinen: ASCII, Apostroph (O'Brien), Umlaute, Kyrillisch,
// Polnisch, „é“, ein Emoji aus EINEM Ersatzpaar (👶) und eine ZWJ-Folge aus DREI
// Ersatzpaaren (👨‍👩‍👧). Bewusst KEINE einsamen Surrogate: better-sqlite3 ersetzt sie beim Schreiben
// durch U+FFFD (lokal geprüft, AP-1.34 PR-B2) — ein solches Transkript käme verändert zurück, und die
// einzige F4-Regel, die nur mit ihnen erreichbar ist (eine Grenze teilt im NEUEN Transkript ein
// Paar, §31 U-1.34-E4), ist über die Datenbank ohnehin nicht herstellbar.
import fc from 'fast-check'
import { fuehreAus } from '../../src/main/befehle/bus'
import type { BefehlAus, BefehlEin, BefehlName } from '../../src/main/befehle/registrierung'
import type { Tx } from '../../src/main/repositories/basis'
import { ankerPruefen } from '../../src/core/beleg/textanker'
import type { Textanker } from '../../src/shared/schemata/befehle'
import { BELEG_FELDER_JE_SUBJEKT, BelegFeldEnum, type BelegFeld } from '../../src/shared/schemata/aussage-zitat'
import { AussageSubjektTypEnum } from '../../src/shared/schemata/gemeinsam'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { QuelleTypEnum } from '../../src/shared/schemata/quelle'

/** Die Bausteine der Transkripte (s. Modul-Kommentar). */
const TRANSKRIPT_BAUSTEINE: readonly string[] = ['a', 'Z', ' ', "'", 'ä', 'ß', 'Ё', 'ł', 'é', '👶', '👨‍👩‍👧']

/** Ein nichtleeres Stück aus 1 bis 3 Bausteinen — Einschub für `zitat.aendern` (`im`/`vor`). */
function bausteinArbitrary(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...TRANSKRIPT_BAUSTEINE), { minLength: 1, maxLength: 3 })
    .map((teile) => teile.join(''))
}

/** Ein Transkript aus 0 bis 12 Bausteinen (auch leer). */
export function transkriptArbitrary(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...TRANSKRIPT_BAUSTEINE), { minLength: 0, maxLength: 12 })
    .map((teile) => teile.join(''))
}

// -----------------------------------------------------------------------------------------------
// DECKUNGSZWEIGE (AP-1.34 PR-B2, Eigentümer-Entscheidung E-B2-1 (c)): `aktionAusfuehren()` meldet je
// Aktion, welche Zweige sie TATSÄCHLICH getroffen hat — gemessen am Datenbankergebnis, nicht an der
// Absicht der Aktion. Die Invarianten-Tests zählen die Zweige über alle Läufe und verlangen je
// Pflichtzweig mehr als 0 Treffer: ein Zweig, den keine Folge mehr erreicht (z. B. nach einer
// Gewichtsänderung), macht den Test rot, statt still ungeprüft zu bleiben.
// -----------------------------------------------------------------------------------------------

export type Zweig =
  /** Jeder erfolgreich ausgeführte Befehl (auch einer, den der Bus als leer verwirft). */
  | `befehl:${BefehlName}`
  /** `aussage.anlegen` mit `istBevorzugt: 1`, während schon eine bevorzugte Aussage desselben
   * (Subjekt, Prädikat) besteht („Fakt ändern", DEMOTE-DECKUNG). */
  | 'demote'
  /** `name.loeschen` der bevorzugten Form einer Person mit weiteren Formen (Nachrücken). */
  | 'nachruecken'
  /** `aussage.aendern` mit `datumBeibehalten: true` an einer Aussage, die vorher ein Datum trug —
   * nach dem Befehl dieselbe Datumsgruppe in allen elf Spalten (AP-1.30 PR 4c, V-E5-erhalt). */
  | 'aussage.aendern.datumBeibehalten'
  /** `name.anlegen`/`name.aendern` (auch die weitere Form), nach dem Befehl hat die Form einen
   * `name_part(art = 'vatersname')` — am Datenbankergebnis gemessen (AP-1.30 PR 3b, docs/80 §33
   * V-130-3-vatersname). */
  | 'name.vatersname.gesetzt'
  /** `name.aendern` an einer Form, die vorher einen Vatersnamen-Teil trug und danach keinen mehr
   * (Löschen des Teils, fehlt = null). */
  | 'name.vatersname.entfernt'
  /** AP-1.30 PR 4b (`_befehlsfolge-koaleszenz.ts`), am Journal gemessen: ein Aufruf wurde mit der
   * obersten Transaktion zusammengefasst (keine neue angewendete Transaktion, ihre Änderungszeilen
   * neu verdichtet). */
  | 'koaleszenz.zusammengefasst'
  /** … und dabei verschwand ein `insert` der obersten Transaktion ganz (insert+delete-Paar). */
  | 'koaleszenz.verdichtet'
  /** Serienaufruf mit demselben Schlüssel wie die oberste Transaktion, aber nach Ablauf des Fensters
   * (≥ 2000 ms): neuer Undo-Schritt. */
  | 'koaleszenz.fensterAbgelaufen'
  /** Serienaufruf mit absichtlich unpassendem `feld`: neue Transaktion ohne Schlüssel. */
  | 'koaleszenz.feldUnpassend'
  | 'beleg.anlegen.ohneAnker'
  | 'beleg.anlegen.anker'
  /** Der Ausschnitt enthält eine Nicht-ASCII-Codeeinheit. */
  | 'beleg.anlegen.ankerNichtAscii'
  /** Eine Ankergrenze liegt unmittelbar vor oder hinter einem Ersatzpaar (nicht darin, F4). */
  | 'beleg.anlegen.grenzeNebenErsatzpaar'
  | 'beleg.anlegen.feld'
  | 'beleg.anlegen.ankerUndFeld'
  /** `aussage_zitat.aendern` nach Datenbankergebnis: Anker neu (vorher keiner), ersetzt (vorher ein
   * anderer), entfernt; No-op ohne neue Transaktion; feld gesetzt/geändert bzw. entfernt. */
  | 'beleg.aendern.setzen'
  | 'beleg.aendern.ersetzen'
  | 'beleg.aendern.entfernen'
  | 'beleg.aendern.noop'
  | 'beleg.aendern.feldGesetzt'
  | 'beleg.aendern.feldEntfernt'
  /** `zitat.aendern` nach Datenbankergebnis am Bezugsanker (s. `AktionZitatAendern`): gleiches
   * Transkript → Anker bleibt; nur hinter dem Ausschnitt geändert → bleibt; im Ausschnitt, davor,
   * gekürzt oder weggelassen → entwertet. */
  | 'zitat.gleich.bleibt'
  | 'zitat.hinter.bleibt'
  | 'zitat.im.entwertet'
  | 'zitat.vor.entwertet'
  | 'zitat.kuerzen.entwertet'
  | 'zitat.weglassen.entwertet'
  /** Eine Transkriptänderung, bei der ein Anker desselben Zitats bleibt und ein anderer entwertet wird. */
  | 'zitat.gemischt'
  /** Irgendein Anker wurde entwertet (für „Undo einer Entwertung" in den Tests). */
  | 'zitat.entwertet'
  /** Ablehnungs-Aktion (E-B2-2): ungültiger Anker bzw. ungültiges feld, abgelehnt über
   * `aussage_zitat.anlegen` bzw. `.aendern` — und je Fehlerart. */
  | 'ablehnung.anker.anlegen'
  | 'ablehnung.anker.aendern'
  | 'ablehnung.feld.anlegen'
  | 'ablehnung.feld.aendern'
  | 'ablehnung.ankerAusserhalb'
  | 'ablehnung.ankerOhneTranskript'
  | 'ablehnung.ankerErsatzpaar'
  /** Welche Grenze das Ersatzpaar teilt (hueter PR #119, H5). */
  | 'ablehnung.ankerErsatzpaarVon'
  | 'ablehnung.ankerErsatzpaarBis'
  | 'ablehnung.feldNichtExistenz'
  | 'ablehnung.feldFalscherTyp'
  /** AP-1.30 PR 9a-b (`_befehlsfolge-datumswert.ts`), am Datenbankergebnis gemessen: Datumsaussage
   * nur mit `datum` angelegt; per `aussage.aendern` ohne Wert mit neuem `datum` geändert (vorher ohne
   * bzw. mit Wertspalte); mit `datumBeibehalten` ohne Wert, Datumsgruppe gleich. */
  | 'datumswert.anlegen.nurDatum'
  | 'datumswert.aendern.nurDatum'
  | 'datumswert.aendern.wertEntfernt'
  | 'datumswert.aendern.beibehalten'
  /** … und die Ablehnungswege, je bitgleicher Bestand ohne Transaktion. */
  | 'ablehnung.datumswert.beibehaltenOhneDatum'
  | 'ablehnung.datumswert.fremdMitDatum'
  | 'ablehnung.datumswert.fremdBeibehalten'
  | 'ablehnung.datumswert.fremdOhneWert'
  | 'ablehnung.datumswert.anlegenOhneDatum'

/** Beleg-Pflichtzweige (E-B2-1 (c)): über `{ seed, numRuns }` von `textanker-gueltig.test.ts`
 * (Profil `beleg`) je mehr als 0 Treffer. `undo-bitgleich.test.ts` (Profil `bestand`) prüft seit
 * hueter-Review PR #119 stattdessen je Befehl die Schwelle gegen main (ADR-009-Nachtrag). */
export const BELEG_PFLICHTZWEIGE: readonly Zweig[] = [
  'beleg.anlegen.ohneAnker',
  'beleg.anlegen.anker',
  'beleg.anlegen.ankerNichtAscii',
  'beleg.anlegen.grenzeNebenErsatzpaar',
  'beleg.anlegen.feld',
  'beleg.anlegen.ankerUndFeld',
  'beleg.aendern.setzen',
  'beleg.aendern.ersetzen',
  'beleg.aendern.entfernen',
  'beleg.aendern.noop',
  'beleg.aendern.feldGesetzt',
  'beleg.aendern.feldEntfernt',
  'zitat.gleich.bleibt',
  'zitat.hinter.bleibt',
  'zitat.im.entwertet',
  'zitat.vor.entwertet',
  'zitat.kuerzen.entwertet',
  'zitat.weglassen.entwertet',
  'zitat.gemischt',
  'ablehnung.anker.anlegen',
  'ablehnung.anker.aendern',
  'ablehnung.feld.anlegen',
  'ablehnung.feld.aendern',
  'ablehnung.ankerAusserhalb',
  'ablehnung.ankerOhneTranskript',
  'ablehnung.ankerErsatzpaar',
  'ablehnung.ankerErsatzpaarVon',
  'ablehnung.ankerErsatzpaarBis',
  'ablehnung.feldNichtExistenz',
  'ablehnung.feldFalscherTyp',
  'zitat.entwertet',
]

/** Führt einen Befehl über den echten Bus aus und vermerkt `befehl:<name>` in `zweige`. */
export function befehl<N extends BefehlName>(zweige: Zweig[], db: Tx, name: N, ein: BefehlEin<N>): BefehlAus<N> {
  const aus = fuehreAus(db, name, ein)
  zweige.push(`befehl:${name}`)
  return aus
}

// -----------------------------------------------------------------------------------------------
// Zustand, Lesehilfen, Textanker, feld
// -----------------------------------------------------------------------------------------------

/** Eine getrackte Aussage — `istExistenz` für die bevorzugte Wahl von Existenz-Aussagen (nur an
 * ihnen ist `feld` zulässig, §31 U-1.34-C1b-feld-praedikat). */
export interface BelegAussageInfo {
  readonly id: string
  readonly istExistenz: boolean
}

export interface BelegVerknuepfungInfo {
  readonly aussageId: string
  readonly zitatId: string
}

/** Was `aussage_zitat.aendern` bzw. `.anlegen` zuletzt angefordert hat — für I2 in
 * `textanker-gueltig.test.ts` (die Verknüpfung muss danach genau diese Werte tragen). */
export interface BelegAenderungInfo {
  readonly aussageId: string
  readonly zitatId: string
  readonly feld: string | null
  readonly von: number | null
  readonly bis: number | null
}

/** Der Teil des Generatorzustands, den dieses Modul liest/pflegt (strukturell, s. Modul-Kommentar).
 * `aussageVorlauf` liefert der Generator: legt genau EINE Person bzw. — wenn schon eine existiert —
 * ein Ereignis (mit Existenz-Aussage) über seine eigene Zustandspflege an (Vorlauf-Schritt 3). */
export interface BelegZustand {
  readonly aussagen: readonly BelegAussageInfo[]
  zitatIds: string[]
  quelleIds: string[]
  aussageZitatVerknuepfungen: BelegVerknuepfungInfo[]
  belegAenderung: BelegAenderungInfo | undefined
  /** Anforderung des zuletzt ausgeführten `aussage_zitat.anlegen` (auch aus dem Vorlauf) — für I2
   * (neue Zeile trägt genau diese Werte, hueter PR #119 H3). */
  belegAnlage: BelegAenderungInfo | undefined
}

/** Vom Generator geliefert (s. `BelegZustand`): genau ein `fuehreAus()`, das eine Aussage schafft
 * oder vorbereitet. */
export type AussageVorlauf = (zweige: Zweig[]) => void

/** Wie `zielAusListe()` im Generator (hier dupliziert, damit dieses Modul den Generator nicht
 * importiert): `roh` modulo Länge, `undefined` bei leerer Liste. */
function ausListe<T>(liste: readonly T[], roh: number): T | undefined {
  if (liste.length === 0) {
    return undefined
  }
  const element = liste[roh % liste.length]
  if (element === undefined) {
    throw new Error('ausListe(): unerreichbar — der Index liegt per Modulo innerhalb der Listenlänge.')
  }
  return element
}

interface ZitatZeile {
  readonly transkript: string | null
  readonly seite: string | null
}

function zitatLesen(db: Tx, id: string): ZitatZeile {
  const zeile = db
    .prepare<{ readonly id: string }, ZitatZeile>('SELECT transkript, seite FROM zitat WHERE id = @id')
    .get({ id })
  if (zeile === undefined) {
    throw new Error(`zitatLesen(): Zitat ${id} fehlt, obwohl es im Generatorzustand steht.`)
  }
  return zeile
}

interface AussageKopfZeile {
  readonly subjekt_typ: string
  readonly praedikat: string
}

function aussageKopfLesen(db: Tx, id: string): AussageKopfZeile {
  const zeile = db
    .prepare<{ readonly id: string }, AussageKopfZeile>('SELECT subjekt_typ, praedikat FROM aussage WHERE id = @id')
    .get({ id })
  if (zeile === undefined) {
    throw new Error(`aussageKopfLesen(): Aussage ${id} fehlt, obwohl sie im Generatorzustand steht.`)
  }
  return zeile
}

export interface VerknuepfungZeile {
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

function verknuepfungLesen(db: Tx, v: BelegVerknuepfungInfo): VerknuepfungZeile {
  const zeile = db
    .prepare<BelegVerknuepfungInfo, VerknuepfungZeile>(
      'SELECT feld, textanker_von, textanker_bis FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId',
    )
    .get({ aussageId: v.aussageId, zitatId: v.zitatId })
  if (zeile === undefined) {
    throw new Error(`verknuepfungLesen(): Verknüpfung ${v.aussageId}/${v.zitatId} fehlt, obwohl sie im Generatorzustand steht.`)
  }
  return zeile
}

/** Fingerabdruck des Journals (Anzahl + höchste `lfd` der `transaktion`-Zeilen): gleich vorher und
 * nachher heißt „keine neue Transaktion" (No-op oder abgelehnter Befehl). */
export function txFingerabdruck(db: Tx): string {
  const zeile = db
    .prepare<[], { readonly anzahl: number; readonly hoechste: number | null }>(
      'SELECT COUNT(*) AS anzahl, MAX(lfd) AS hoechste FROM transaktion',
    )
    .get()
  if (zeile === undefined) {
    throw new Error('txFingerabdruck(): COUNT liefert immer eine Zeile — unerreichbar.')
  }
  return `${zeile.anzahl}:${zeile.hoechste ?? 'leer'}`
}

function ankerVon(zeile: VerknuepfungZeile): Textanker | null {
  return zeile.textanker_von === null || zeile.textanker_bis === null ? null : { von: zeile.textanker_von, bis: zeile.textanker_bis }
}

function istHoch(einheit: number): boolean {
  return einheit >= 0xd800 && einheit <= 0xdbff
}

function istTief(einheit: number): boolean {
  return einheit >= 0xdc00 && einheit <= 0xdfff
}

/** `true`, wenn die Grenze `i` zwischen High- und Low-Surrogate liegt (eigene Nachbildung, nicht
 * `ankerPruefen` — der Generator soll ein Ersatzpaar auch dann richtig umgehen, wenn die
 * Produktivregel kaputt ist). */
function teiltPaar(text: string, i: number): boolean {
  return i > 0 && i < text.length && istHoch(text.charCodeAt(i - 1)) && istTief(text.charCodeAt(i))
}

/** `true`, wenn unmittelbar an der Grenze `i` (davor oder dahinter) ein Ersatzpaar beginnt/endet. */
function grenzeNebenPaar(text: string, i: number): boolean {
  return (i < text.length && istHoch(text.charCodeAt(i))) || (i > 0 && istTief(text.charCodeAt(i - 1)))
}

/** Rohwerte eines Textankers — der echte Anker entsteht erst beim Ausführen gegen das gelesene
 * Transkript (`ankerAusRoh()`). */
export interface AnkerRoh {
  readonly vonRoh: number
  readonly laengeRoh: number
}

function ankerRohArbitrary(): fc.Arbitrary<AnkerRoh> {
  return fc.record({ vonRoh: fc.nat(), laengeRoh: fc.nat() })
}

/**
 * Berechnet einen GÜLTIGEN Anker [von, bis) gegen `transkript`: `von = vonRoh % len`,
 * `bis = von + 1 + laengeRoh % (len - von)`; eine Grenze mitten in einem Ersatzpaar wird an dessen
 * Rand geschoben (`von` nach vorn, `bis` nach hinten — beides bleibt innerhalb). NULL/leeres
 * Transkript → kein Anker. Zur Sicherheit `ankerPruefen() === 'ok'`, sonst wirft der Generator.
 */
function ankerAusRoh(transkript: string | null, roh: AnkerRoh): Textanker | undefined {
  if (transkript === null || transkript.length === 0) {
    return undefined
  }
  const laenge = transkript.length
  let von = roh.vonRoh % laenge
  let bis = von + 1 + (roh.laengeRoh % (laenge - von))
  if (teiltPaar(transkript, von)) {
    von -= 1
  }
  if (teiltPaar(transkript, bis)) {
    bis += 1
  }
  const pruefung = ankerPruefen(transkript, von, bis)
  if (pruefung !== 'ok') {
    throw new Error(`ankerAusRoh(): erzeugter Anker [${von}, ${bis}) ist ${pruefung} — Generatorfehler.`)
  }
  return { von, bis }
}

function ausschnittNichtAscii(transkript: string, anker: Textanker): boolean {
  for (let i = anker.von; i < anker.bis; i += 1) {
    if (transkript.charCodeAt(i) > 0x7f) {
      return true
    }
  }
  return false
}

/** `feld` für eine Aussage: nur an einer Existenz-Aussage, aus der Liste ihres Subjekttyps;
 * sonst (oder bei leerer Liste) keins. */
function feldAusRoh(kopf: AussageKopfZeile, roh: number): BelegFeld | undefined {
  if (kopf.praedikat !== 'existenz') {
    return undefined
  }
  const typ = AussageSubjektTypEnum.parse(kopf.subjekt_typ)
  return ausListe(BELEG_FELDER_JE_SUBJEKT[typ], roh)
}

/** Wählt eine Aussage, die mit `zitatId` noch NICHT verknüpft ist — bei geradem `wahlRoh`
 * bevorzugt eine Existenz-Aussage (~50 %), sonst aus allen; ab `zielRoh` rundum in
 * Einfügereihenfolge des Zustands (statt No-op bei einer schon vergebenen Kombination — nur so
 * sammeln sich mehrere Anker an EINEM Zitat). */
function aussageWaehlen(zustand: BelegZustand, zitatId: string, wahlRoh: number, zielRoh: number): BelegAussageInfo | undefined {
  const frei = (a: BelegAussageInfo): boolean =>
    !zustand.aussageZitatVerknuepfungen.some((v) => v.aussageId === a.id && v.zitatId === zitatId)
  if (wahlRoh % 2 === 0) {
    const existenz = rundum(
      zustand.aussagen.filter((a) => a.istExistenz),
      zielRoh,
    ).find(frei)
    if (existenz !== undefined) {
      return existenz
    }
  }
  return rundum(zustand.aussagen, zielRoh).find(frei)
}

/**
 * Wählt das Zitat für `aussage_zitat.anlegen` gewichtet (Einfügereihenfolge des Zustands): ~60 %
 * eines, das schon einen Anker trägt (mehrere Anker an EINEM Zitat — nur so entsteht bei
 * `zitat.aendern` ein gemischter Ausgang), ~20 % eines mit nichtleerem Transkript (nur dort ist ein
 * Anker möglich), sonst irgendeins. Leere Teilmenge → nächste Stufe.
 */
function zitatWaehlen(db: Tx, zustand: BelegZustand, wahlRoh: number, zielRoh: number): string | undefined {
  const stufe = wahlRoh % 100
  if (stufe < 60) {
    const mitAnker: string[] = []
    for (const e of verknuepfungenMitAnker(db, zustand.aussageZitatVerknuepfungen)) {
      if (!mitAnker.includes(e.verknuepfung.zitatId)) {
        mitAnker.push(e.verknuepfung.zitatId)
      }
    }
    const gewaehlt = ausListe(mitAnker, zielRoh)
    if (gewaehlt !== undefined) {
      return gewaehlt
    }
  }
  if (stufe < 80) {
    const mitText = zustand.zitatIds.filter((id) => {
      const { transkript } = zitatLesen(db, id)
      return transkript !== null && transkript.length > 0
    })
    const gewaehlt = ausListe(mitText, zielRoh)
    if (gewaehlt !== undefined) {
      return gewaehlt
    }
  }
  return ausListe(zustand.zitatIds, zielRoh)
}

// -----------------------------------------------------------------------------------------------
// VORLAUF: der nächste fehlende Schritt der Beleg-Kette
// -----------------------------------------------------------------------------------------------

/**
 * Ein Anker braucht die Kette `quelle.anlegen` → `zitat.anlegen` (mit Transkript) →
 * `aussage_zitat.anlegen` IN DIESER REIHENFOLGE innerhalb derselben Folge, und erst danach haben
 * `zitat.aendern`/`aussage_zitat.aendern` einen Anker, auf den sie wirken. Über Gewichte allein
 * entstand diese Kette zu selten (gemessen AP-1.34 PR-B2: einzelne Zweige bei 0–2 Treffern in 100
 * bzw. 300 Läufen), weil die meisten Beleg-Aktionen VOR ihrem Vorgänger fielen und No-ops blieben.
 * Findet eine Beleg-Aktion ihr Ziel nicht, führt sie darum stattdessen den NÄCHSTEN FEHLENDEN
 * Kettenschritt aus — weiterhin GENAU EIN `fuehreAus()` je Aktion (ein Schnappschuss je Aktion in
 * `undo-bitgleich`), keine Befehlskette: 1. Quelle, 2. Zitat mit Transkript, 3. (noch keine
 * Aussage) Person bzw. Ereignis mit Existenz-Aussage über den Generator (`AussageVorlauf`),
 * 4. die Verknüpfung über dieselbe Logik wie `aussageZitatAnlegen` (immer mit Anker-Rohwerten, an
 *    einem Zitat, das schon einen Anker trägt, falls es eins gibt — so entstehen Zitate mit mehreren
 *    Ankern, die `zitat.aendern` für einen gemischten Ausgang braucht).
 */
export interface VorlaufRoh {
  readonly quelleTypRoh: number
  readonly transkript: string
  readonly existenzWahlRoh: number
  readonly aussageZielRoh: number
  readonly zitatWahlRoh: number
  readonly zitatZielRoh: number
  readonly ankerRoh: AnkerRoh
  readonly feldRoh: number
}

export function vorlaufRohArbitrary(): fc.Arbitrary<VorlaufRoh> {
  return fc.record({
    quelleTypRoh: fc.nat(),
    transkript: fc.array(fc.constantFrom(...TRANSKRIPT_BAUSTEINE), { minLength: 2, maxLength: 10 }).map((teile) => teile.join('')),
    existenzWahlRoh: fc.nat(),
    aussageZielRoh: fc.nat(),
    zitatWahlRoh: fc.nat(),
    zitatZielRoh: fc.nat(),
    ankerRoh: ankerRohArbitrary(),
    feldRoh: fc.nat(),
  })
}

function vorlauf(db: Tx, zustand: BelegZustand, roh: VorlaufRoh, zweige: Zweig[], aussageVorlauf: AussageVorlauf): void {
  const quelleId = zustand.quelleIds[zustand.quelleIds.length - 1]
  if (quelleId === undefined) {
    const typ = ausListe(QuelleTypEnum.options, roh.quelleTypRoh)
    if (typ === undefined) {
      throw new Error('vorlauf(): QuelleTypEnum ist leer — unerreichbar.')
    }
    const { id } = befehl(zweige, db, 'quelle.anlegen', { typ, titel: 'Vorlauf' })
    zustand.quelleIds.push(id)
    return
  }
  const mitText = zustand.zitatIds.some((id) => {
    const { transkript } = zitatLesen(db, id)
    return transkript !== null && transkript.length > 0
  })
  if (!mitText) {
    const { id } = befehl(zweige, db, 'zitat.anlegen', { quelleId, transkript: roh.transkript })
    zustand.zitatIds.push(id)
    return
  }
  if (zustand.aussagen.length === 0) {
    aussageVorlauf(zweige)
    return
  }
  aussageZitatAnlegenAusfuehren(
    db,
    zustand,
    {
      art: 'aussageZitatAnlegen',
      existenzWahlRoh: roh.existenzWahlRoh,
      aussageZielRoh: roh.aussageZielRoh,
      zitatWahlRoh: roh.zitatWahlRoh % 60, // immer ein Zitat mit Anker, sonst eins mit Transkript (`zitatWaehlen()`)
      zitatZielRoh: roh.zitatZielRoh,
      ankerRoh: roh.ankerRoh,
      feldRoh: roh.feldRoh,
      vorlauf: undefined,
    },
    zweige,
    aussageVorlauf,
  )
}

// -----------------------------------------------------------------------------------------------
// aussage_zitat.anlegen mit Textanker und feld
// -----------------------------------------------------------------------------------------------

/**
 * AP-1.29 PR-B, erweitert AP-1.34 PR-B2: `aussage_zitat.anlegen` — verknüpft eine BESTEHENDE
 * `aussage` mit einem BESTEHENDEN `zitat` (`zitatWaehlen()`, dann eine damit noch nicht verknüpfte
 * Aussage, `aussageWaehlen()` — der zusammengesetzte Primärschlüssel wird nie verletzt); ist jede
 * Aussage schon verknüpft, bleibt die Aktion ein No-op, fehlt Zitat oder Aussage ganz: Vorlauf. `ankerRoh`/`feldRoh`: `undefined`
 * = weglassen. Der Anker wird gegen das gelesene Transkript berechnet (`ankerAusRoh()`), `feld` nur
 * an einer Existenz-Aussage gesetzt (`feldAusRoh()`) — immer gültige Eingaben; die ungültigen
 * erzeugt die Ablehnungs-Aktion.
 */
export interface AktionAussageZitatAnlegen {
  readonly art: 'aussageZitatAnlegen'
  readonly existenzWahlRoh: number
  readonly aussageZielRoh: number
  readonly zitatWahlRoh: number
  readonly zitatZielRoh: number
  readonly ankerRoh: AnkerRoh | undefined
  readonly feldRoh: number | undefined
  /** Fehlt noch jedes Zitat oder jede Aussage: Vorlauf (s. `VorlaufRoh`) statt No-op. `undefined` =
   * kein Vorlauf (nur der interne Aufruf aus `vorlauf()` selbst). */
  readonly vorlauf: VorlaufRoh | undefined
}

/** `profil` (s. `GeneratorProfil` im Generator): nur `beleg` erzeugt einen Vorlauf. */
export function aussageZitatAnlegenAktionArbitrary(profil: 'bestand' | 'beleg'): fc.Arbitrary<AktionAussageZitatAnlegen> {
  return fc
    .record({
      existenzWahlRoh: fc.nat(),
      aussageZielRoh: fc.nat(),
      zitatWahlRoh: fc.nat(),
      zitatZielRoh: fc.nat(),
      ankerRoh: fc.option(ankerRohArbitrary(), { nil: undefined, freq: 4 }),
      feldRoh: fc.option(fc.nat(), { nil: undefined, freq: 2 }),
      vorlauf: profil === 'beleg' ? vorlaufRohArbitrary() : fc.constant(undefined),
    })
    .map((r): AktionAussageZitatAnlegen => ({ art: 'aussageZitatAnlegen', ...r }))
}

export function aussageZitatAnlegenAusfuehren(
  db: Tx,
  zustand: BelegZustand,
  aktion: AktionAussageZitatAnlegen,
  zweige: Zweig[],
  aussageVorlauf: AussageVorlauf,
): void {
  if ((zustand.zitatIds.length === 0 || zustand.aussagen.length === 0) && aktion.vorlauf !== undefined) {
    vorlauf(db, zustand, aktion.vorlauf, zweige, aussageVorlauf)
    return
  }
  const zitatId = zitatWaehlen(db, zustand, aktion.zitatWahlRoh, aktion.zitatZielRoh)
  if (zitatId === undefined) {
    return
  }
  const aussage = aussageWaehlen(zustand, zitatId, aktion.existenzWahlRoh, aktion.aussageZielRoh)
  if (aussage === undefined) {
    return
  }
  const { transkript } = zitatLesen(db, zitatId)
  const anker = aktion.ankerRoh === undefined ? undefined : ankerAusRoh(transkript, aktion.ankerRoh)
  const feld = aktion.feldRoh === undefined ? undefined : feldAusRoh(aussageKopfLesen(db, aussage.id), aktion.feldRoh)
  befehl(zweige, db, 'aussage_zitat.anlegen', {
    aussageId: aussage.id,
    zitatId,
    ...(feld === undefined ? {} : { feld }),
    ...(anker === undefined ? {} : { textanker: anker }),
  })
  const verknuepfung = { aussageId: aussage.id, zitatId }
  zustand.aussageZitatVerknuepfungen.push(verknuepfung)
  zustand.belegAnlage = { aussageId: aussage.id, zitatId, feld: feld ?? null, von: anker?.von ?? null, bis: anker?.bis ?? null }

  // Zweige am DATENBANKERGEBNIS (hueter PR #119, H3): die angelegte Zeile zurücklesen, nicht die
  // Anforderung zählen — speichert der Handler Anker oder feld nicht, fällt der Zweig weg.
  const gespeichert = verknuepfungLesen(db, verknuepfung)
  const gespeicherterAnker = ankerVon(gespeichert)
  if (gespeicherterAnker === null || transkript === null) {
    zweige.push('beleg.anlegen.ohneAnker')
  } else {
    zweige.push('beleg.anlegen.anker')
    if (ausschnittNichtAscii(transkript, gespeicherterAnker)) {
      zweige.push('beleg.anlegen.ankerNichtAscii')
    }
    if (grenzeNebenPaar(transkript, gespeicherterAnker.von) || grenzeNebenPaar(transkript, gespeicherterAnker.bis)) {
      zweige.push('beleg.anlegen.grenzeNebenErsatzpaar')
    }
  }
  if (gespeichert.feld !== null) {
    zweige.push(gespeicherterAnker === null ? 'beleg.anlegen.feld' : 'beleg.anlegen.ankerUndFeld')
  }
}

// -----------------------------------------------------------------------------------------------
// aussage_zitat.aendern (AP-1.34 PR-C1b, §31 U-1.34-F2)
// -----------------------------------------------------------------------------------------------

/**
 * `aussage_zitat.aendern` auf eine BESTEHENDE Verknüpfung (`zustand.aussageZitatVerknuepfungen`,
 * leer → No-op). `ankerModus`: `neu` berechnet einen gültigen Anker aus `ankerRoh` (ob das
 * „setzen" oder „ersetzen" ist, entscheidet der Vorzustand — gezählt wird das Datenbankergebnis;
 * leeres/NULL-Transkript → kein Anker), `entfernen` schickt `null`, `noop` schickt Anker UND
 * feld unverändert aus der Datenbank zurück — dann darf KEINE Transaktion entstehen, sonst wirft der
 * Generator (der No-op-Zweig des Handlers, AP-0.22). `feldModus` (außer bei `noop`): `behalten`,
 * `setzen` (nur an einer Existenz-Aussage möglich, sonst wie `behalten`), `entfernen`.
 */
export interface AktionAussageZitatAendern {
  readonly art: 'aussageZitatAendern'
  readonly verknuepfungZielRoh: number
  readonly ankerModus: 'neu' | 'entfernen' | 'noop'
  readonly ankerRoh: AnkerRoh
  readonly feldModus: 'behalten' | 'setzen' | 'entfernen'
  readonly feldRoh: number
  /** Noch keine Verknüpfung: Vorlauf statt No-op (s. `VorlaufRoh`). */
  readonly vorlauf: VorlaufRoh
}

export function aussageZitatAendernAktionArbitrary(): fc.Arbitrary<AktionAussageZitatAendern> {
  return fc
    .record({
      verknuepfungZielRoh: fc.nat(),
      ankerModus: fc.constantFrom<AktionAussageZitatAendern['ankerModus']>('neu', 'neu', 'entfernen', 'noop'),
      ankerRoh: ankerRohArbitrary(),
      feldModus: fc.constantFrom<AktionAussageZitatAendern['feldModus']>('behalten', 'setzen', 'setzen', 'entfernen'),
      feldRoh: fc.nat(),
      vorlauf: vorlaufRohArbitrary(),
    })
    .map((r): AktionAussageZitatAendern => ({ art: 'aussageZitatAendern', ...r }))
}

export function aussageZitatAendernAusfuehren(
  db: Tx,
  zustand: BelegZustand,
  aktion: AktionAussageZitatAendern,
  zweige: Zweig[],
  aussageVorlauf: AussageVorlauf,
): void {
  const ziel = ausListe(zustand.aussageZitatVerknuepfungen, aktion.verknuepfungZielRoh)
  if (ziel === undefined) {
    vorlauf(db, zustand, aktion.vorlauf, zweige, aussageVorlauf)
    return
  }
  const vorher = verknuepfungLesen(db, ziel)
  const altFeld = BelegFeldEnum.nullable().parse(vorher.feld)
  const altAnker = ankerVon(vorher)

  let feld: BelegFeld | null
  let anker: Textanker | null
  if (aktion.ankerModus === 'noop') {
    feld = altFeld
    anker = altAnker
  } else {
    anker = aktion.ankerModus === 'entfernen' ? null : (ankerAusRoh(zitatLesen(db, ziel.zitatId).transkript, aktion.ankerRoh) ?? null)
    if (aktion.feldModus === 'entfernen') {
      feld = null
    } else if (aktion.feldModus === 'setzen') {
      feld = feldAusRoh(aussageKopfLesen(db, ziel.aussageId), aktion.feldRoh) ?? altFeld
    } else {
      feld = altFeld
    }
  }

  const txVorher = txFingerabdruck(db)
  befehl(zweige, db, 'aussage_zitat.aendern', { aussageId: ziel.aussageId, zitatId: ziel.zitatId, feld, textanker: anker })
  zustand.belegAenderung = { aussageId: ziel.aussageId, zitatId: ziel.zitatId, feld, von: anker?.von ?? null, bis: anker?.bis ?? null }
  const neueTransaktion = txFingerabdruck(db) !== txVorher

  if (aktion.ankerModus === 'noop') {
    if (neueTransaktion) {
      throw new Error('aussage_zitat.aendern mit unveränderten Werten hat eine Transaktion erzeugt (No-op-Zweig, AP-0.22).')
    }
    zweige.push('beleg.aendern.noop')
    return
  }

  const nachher = ankerVon(verknuepfungLesen(db, ziel))
  if (altAnker === null && nachher !== null) {
    zweige.push('beleg.aendern.setzen')
  } else if (altAnker !== null && nachher !== null && (altAnker.von !== nachher.von || altAnker.bis !== nachher.bis)) {
    zweige.push('beleg.aendern.ersetzen')
  } else if (altAnker !== null && nachher === null) {
    zweige.push('beleg.aendern.entfernen')
  }
  const neuesFeld = verknuepfungLesen(db, ziel).feld
  if (neuesFeld !== null && neuesFeld !== altFeld) {
    zweige.push('beleg.aendern.feldGesetzt')
  } else if (neuesFeld === null && altFeld !== null) {
    zweige.push('beleg.aendern.feldEntfernt')
  }
}

// -----------------------------------------------------------------------------------------------
// zitat.aendern mit Wirkung auf Textanker (E4, §31 U-1.34-E4)
// -----------------------------------------------------------------------------------------------

type ZitatModus = 'frei' | 'gleich' | 'hinter' | 'im' | 'vor' | 'kuerzen' | 'weglassen'

/**
 * AP-1.17 PR-B, erweitert AP-1.34 PR-B2: `zitat.aendern`. Das Zitat wird zu ~80 % (`bezugWahlRoh`)
 * über eine Verknüpfung MIT Anker gewählt (davon ~3/4 an einem Zitat mit mehreren Ankern;
 * `hinter`/`im`/`vor`/`kuerzen` wechseln danach innerhalb des Zitats auf den Anker, an dem ein
 * gemischter Ausgang möglich ist) — dieser Anker ist der Bezug; sonst frei aus `zustand.zitatIds`
 * (Bezug = erster Anker dieses Zitats, falls es einen gibt). Gibt es den gewünschten Bezug (noch)
 * nicht, läuft stattdessen der Vorlauf (`VorlaufRoh`, er legt einen weiteren Anker an). Das neue Transkript
 * leitet `modus` aus dem alten ab:
 * - `frei`: `transkript` (unabhängig vom alten),
 * - `gleich`: gleiches Transkript, andere `seite` (Anker bleiben unberührt),
 * - `hinter`: `alt.slice(0, bis)` + anderes Suffix, geschnitten hinter dem Anker mit dem kleinsten
 *   `bis` dieses Zitats (er wird der Bezug und bleibt; weiter reichende Anker werden entwertet),
 * - `im`: der Ausschnitt [von, bis) durch einen anderen Baustein ersetzt (entwertet),
 * - `vor`: ein Baustein vor `von` eingefügt (entwertet — E4 verschiebt nicht, R1),
 * - `kuerzen`: auf eine Länge < `bis` gekürzt (entwertet) — bei diesen drei ist der Bezug der Anker
 *   mit dem größten `von` des Zitats,
 * - `weglassen`: Schlüssel `transkript` fehlt → NULL (entwertet alle Anker).
 * Ohne Bezug oder ohne altes Transkript fallen `hinter`/`im`/`vor`/`kuerzen` auf `transkript` zurück.
 * Gezählt wird das tatsächliche Datenbankergebnis, nicht der Modus.
 */
export interface AktionZitatAendern {
  readonly art: 'zitatAendern'
  readonly modus: ZitatModus
  readonly bezugWahlRoh: number
  readonly bezugZielRoh: number
  readonly zitatZielRoh: number
  readonly quelleZielRoh: number
  readonly seite: string
  readonly transkript: string
  readonly baustein: string
  readonly kuerzRoh: number
  readonly konfidenz: number
  /** Bezug gewünscht (~80 %), aber noch kein Anker vorhanden: Vorlauf statt Änderung ohne Bezug.
   * `undefined` (Profil `bestand`): dann freie Zitatwahl wie auf main. */
  readonly vorlauf: VorlaufRoh | undefined
}

/** `profil` (s. `GeneratorProfil` im Generator): nur `beleg` erzeugt einen Vorlauf. */
export function zitatAendernAktionArbitrary(profil: 'bestand' | 'beleg'): fc.Arbitrary<AktionZitatAendern> {
  return fc
    .record({
      modus: fc.constantFrom<ZitatModus>('frei', 'gleich', 'hinter', 'im', 'vor', 'kuerzen', 'weglassen'),
      bezugWahlRoh: fc.nat(),
      bezugZielRoh: fc.nat(),
      zitatZielRoh: fc.nat(),
      quelleZielRoh: fc.nat(),
      seite: fc.string(),
      transkript: transkriptArbitrary(),
      baustein: bausteinArbitrary(),
      kuerzRoh: fc.nat(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      vorlauf: profil === 'beleg' ? vorlaufRohArbitrary() : fc.constant(undefined),
    })
    .map((r): AktionZitatAendern => ({ art: 'zitatAendern', ...r }))
}

interface VerknuepfungMitAnker {
  readonly verknuepfung: BelegVerknuepfungInfo
  readonly anker: Textanker
}

/** Alle Verknüpfungen mit gesetztem Anker, in Einfügereihenfolge des Zustands (nie `ORDER BY id`). */
function verknuepfungenMitAnker(db: Tx, verknuepfungen: readonly BelegVerknuepfungInfo[]): readonly VerknuepfungMitAnker[] {
  const ergebnis: VerknuepfungMitAnker[] = []
  for (const verknuepfung of verknuepfungen) {
    const anker = ankerVon(verknuepfungLesen(db, verknuepfung))
    if (anker !== null) {
      ergebnis.push({ verknuepfung, anker })
    }
  }
  return ergebnis
}

/** Die Anker an Zitaten mit MEHREREN Ankern (nur dort ist ein gemischter Ausgang möglich). */
function ankerAnMehrfachZitaten(alleMitAnker: readonly VerknuepfungMitAnker[]): readonly VerknuepfungMitAnker[] {
  return alleMitAnker.filter((e) => alleMitAnker.filter((f) => f.verknuepfung.zitatId === e.verknuepfung.zitatId).length >= 2)
}

/** `bezugWahlRoh % 100 < 60`: der Bezug soll an einem Zitat mit mehreren Ankern liegen. */
function mehrfachGewuenscht(aktion: AktionZitatAendern): boolean {
  return aktion.bezugWahlRoh % 100 < 60
}

function transkriptAbleiten(aktion: AktionZitatAendern, alt: string | null, bezug: Textanker | undefined): string | undefined {
  switch (aktion.modus) {
    case 'frei':
      return aktion.transkript
    case 'gleich':
      return alt ?? undefined
    case 'weglassen':
      return undefined
    default:
      break
  }
  if (alt === null || bezug === undefined) {
    return aktion.transkript
  }
  const { von, bis } = bezug
  switch (aktion.modus) {
    case 'hinter': {
      const rest = aktion.transkript === alt.slice(bis) ? `${aktion.transkript}ß` : aktion.transkript
      return alt.slice(0, bis) + rest
    }
    case 'im': {
      const einschub = aktion.baustein === alt.slice(von, bis) ? `${aktion.baustein}a` : aktion.baustein
      return alt.slice(0, von) + einschub + alt.slice(bis)
    }
    case 'vor':
      return alt.slice(0, von) + aktion.baustein + alt.slice(von)
    case 'kuerzen': {
      let laenge = aktion.kuerzRoh % bis
      if (teiltPaar(alt, laenge)) {
        laenge -= 1 // nie ein einsames Surrogat erzeugen (s. Modul-Kommentar)
      }
      return alt.slice(0, laenge)
    }
    default: {
      const nieErreicht: never = aktion.modus
      throw new Error(`transkriptAbleiten(): unbehandelter Modus ${JSON.stringify(nieErreicht)}`)
    }
  }
}

const ENTWERTET_ZWEIG: { readonly [M in ZitatModus]?: Zweig } = {
  im: 'zitat.im.entwertet',
  vor: 'zitat.vor.entwertet',
  kuerzen: 'zitat.kuerzen.entwertet',
  weglassen: 'zitat.weglassen.entwertet',
}

export function zitatAendernAusfuehren(
  db: Tx,
  zustand: BelegZustand,
  aktion: AktionZitatAendern,
  zweige: Zweig[],
  aussageVorlauf: AussageVorlauf,
): void {
  const alleMitAnker = verknuepfungenMitAnker(db, zustand.aussageZitatVerknuepfungen)
  const mehrfach = ankerAnMehrfachZitaten(alleMitAnker)
  const bezugGewuenscht = aktion.bezugWahlRoh % 100 < 80
  const bezugFehlt = (bezugGewuenscht && alleMitAnker.length === 0) || (mehrfachGewuenscht(aktion) && mehrfach.length === 0)
  if (bezugFehlt && aktion.vorlauf !== undefined) {
    vorlauf(db, zustand, aktion.vorlauf, zweige, aussageVorlauf)
    return
  }
  const quelleId = ausListe(zustand.quelleIds, aktion.quelleZielRoh)
  if (quelleId === undefined) {
    return
  }
  let bezug: VerknuepfungMitAnker | undefined
  let zitatId: string
  const bezugGewaehlt = bezugGewuenscht
    ? ausListe(mehrfachGewuenscht(aktion) && mehrfach.length > 0 ? mehrfach : alleMitAnker, aktion.bezugZielRoh)
    : undefined
  if (bezugGewaehlt === undefined) {
    const frei = ausListe(zustand.zitatIds, aktion.zitatZielRoh)
    if (frei === undefined) {
      return
    }
    zitatId = frei
    bezug = alleMitAnker.find((e) => e.verknuepfung.zitatId === frei)
  } else {
    bezug = bezugGewaehlt
    zitatId = bezugGewaehlt.verknuepfung.zitatId
  }

  const alt = zitatLesen(db, zitatId)
  const ankerVorher = alleMitAnker.filter((e) => e.verknuepfung.zitatId === zitatId)
  // Bezug je Modus so, dass ein gemischter Ausgang (`zitat.gemischt`) möglich wird, wenn das Zitat
  // mehrere Anker trägt: `hinter` schneidet hinter dem Anker mit dem KLEINSTEN `bis` (er bleibt,
  // weiter reichende werden entwertet); `im`/`vor`/`kuerzen` wirken am Anker mit dem GRÖSSTEN `von`
  // (er wird entwertet, früher endende Anker können bleiben).
  for (const e of ankerVorher) {
    if (aktion.modus === 'hinter' && (bezug === undefined || e.anker.bis < bezug.anker.bis)) {
      bezug = e
    }
    if (
      (aktion.modus === 'im' || aktion.modus === 'vor' || aktion.modus === 'kuerzen') &&
      (bezug === undefined || e.anker.von > bezug.anker.von)
    ) {
      bezug = e
    }
  }
  const neu = transkriptAbleiten(aktion, alt.transkript, bezug?.anker)
  const seite = aktion.modus === 'gleich' ? `${alt.seite ?? ''}g` : aktion.seite
  befehl(zweige, db, 'zitat.aendern', {
    id: zitatId,
    quelleId,
    seite,
    konfidenz: aktion.konfidenz,
    ...(neu === undefined ? {} : { transkript: neu }),
  })

  const geaendert = zitatLesen(db, zitatId).transkript !== alt.transkript
  let bleibt = 0
  let entwertet = 0
  let bezugBleibt: boolean | undefined
  for (const e of ankerVorher) {
    const nachher = ankerVon(verknuepfungLesen(db, e.verknuepfung))
    const dieserBleibt = nachher !== null && nachher.von === e.anker.von && nachher.bis === e.anker.bis
    if (dieserBleibt) {
      bleibt += 1
    } else {
      entwertet += 1
    }
    if (bezug !== undefined && e.verknuepfung === bezug.verknuepfung) {
      bezugBleibt = dieserBleibt
    }
  }

  if (bezugBleibt === true && aktion.modus === 'gleich' && !geaendert) {
    zweige.push('zitat.gleich.bleibt')
  }
  if (bezugBleibt === true && aktion.modus === 'hinter' && geaendert) {
    zweige.push('zitat.hinter.bleibt')
  }
  const entwertetZweig = ENTWERTET_ZWEIG[aktion.modus]
  if (bezugBleibt === false && geaendert && entwertetZweig !== undefined) {
    zweige.push(entwertetZweig)
  }
  if (geaendert && bleibt > 0 && entwertet > 0) {
    zweige.push('zitat.gemischt')
  }
  if (entwertet > 0) {
    zweige.push('zitat.entwertet')
  }
}

// -----------------------------------------------------------------------------------------------
// Ablehnungs-Aktion (AP-1.34 PR-B2, Eigentümer-Entscheidung E-B2-2 (b))
// -----------------------------------------------------------------------------------------------

type AblehnungFehler = 'ankerAusserhalb' | 'ankerOhneTranskript' | 'ankerErsatzpaar' | 'feldNichtExistenz' | 'feldFalscherTyp'

/**
 * GRUNDSATZÄNDERUNG (E-B2-2): bis AP-1.34 PR-B2 erzeugte der Generator ausschließlich gültige
 * Eingaben (Kopfkommentar `_befehlsfolge-generator.ts`). Diese Aktion ist die bewusste Ausnahme:
 * sie schickt einen UNGÜLTIGEN Anker (außerhalb des Transkripts, ohne Transkript, Grenze mitten in
 * einem Ersatzpaar — F4) bzw. ein UNGÜLTIGES `feld` (an einer Nicht-Existenz-Aussage, nicht zum
 * Subjekttyp passend) über `aussage_zitat.anlegen` oder `.aendern` und verlangt die Ablehnung:
 * `WurzelFehler('VALIDIERUNG_WERTEBEREICH')` und KEINE neue Transaktion; alles andere wirft. Grund:
 * die Invarianten prüfen nur, was in der Datenbank steht — ohne diese Aktion bliebe ein entfernter
 * Handler-Schutz (`belegAnkerPruefen`/`belegFeldPruefen`) unbemerkt, solange der Generator ihn nie
 * herausfordert (Mutationsprobe M8). Die Eingaben bleiben SCHEMA-konform (Zod lässt sie durch),
 * damit genau die Handlerprüfung greift. Ein Ablehnen erzeugt keinen Undo-Schritt: `undo-bitgleich`
 * ersetzt dann den letzten Schnappschuss durch einen identischen (Fall „gleiche oberste Transaktion").
 * Kein passendes Ziel → No-op.
 */
export interface AktionBelegAblehnen {
  readonly art: 'belegAblehnen'
  readonly befehl: 'anlegen' | 'aendern'
  readonly fehler: AblehnungFehler
  readonly zielRoh: number
  readonly zweitRoh: number
  readonly feldRoh: number
}

export function belegAblehnenAktionArbitrary(): fc.Arbitrary<AktionBelegAblehnen> {
  return fc
    .record({
      befehl: fc.constantFrom<AktionBelegAblehnen['befehl']>('anlegen', 'aendern'),
      fehler: fc.constantFrom<AblehnungFehler>('ankerAusserhalb', 'ankerOhneTranskript', 'ankerErsatzpaar', 'feldNichtExistenz', 'feldFalscherTyp'),
      zielRoh: fc.nat(),
      zweitRoh: fc.nat(),
      feldRoh: fc.nat(),
    })
    .map((r): AktionBelegAblehnen => ({ art: 'belegAblehnen', ...r }))
}

/** `liste` ab Index `roh % länge` rundum — deterministische Kandidatenfolge in Einfügereihenfolge. */
function rundum<T>(liste: readonly T[], roh: number): readonly T[] {
  if (liste.length === 0) {
    return []
  }
  const start = roh % liste.length
  return [...liste.slice(start), ...liste.slice(0, start)]
}

/** Ein für `fehler` ungültiger, aber schema-konformer Anker gegen `transkript` — oder `undefined`,
 * wenn dieses Transkript den Fehler nicht hergibt. */
function ungueltigerAnker(fehler: AblehnungFehler, transkript: string | null, seiteRoh: number): Textanker | undefined {
  switch (fehler) {
    case 'ankerAusserhalb':
      return transkript === null ? undefined : { von: transkript.length, bis: transkript.length + 1 }
    case 'ankerOhneTranskript':
      return transkript === null ? { von: 0, bis: 1 } : undefined
    case 'ankerErsatzpaar': {
      if (transkript === null) {
        return undefined
      }
      // `seiteRoh` gerade: `von` teilt das Paar, sonst `bis` (hueter PR #119, H5 — beide Grenzen der
      // F4-Prüfung werden herausgefordert). `{ i - 1, i }` ist gültig bis auf `bis`: an `i - 1` steht
      // das High-Surrogate, dort beginnt das Paar, `von` teilt also nichts.
      for (let i = 1; i < transkript.length; i += 1) {
        if (teiltPaar(transkript, i)) {
          return ersatzpaarSeite(seiteRoh) === 'Von' ? { von: i, bis: i + 1 } : { von: i - 1, bis: i }
        }
      }
      return undefined
    }
    default:
      return undefined
  }
}

/** Ein für `fehler` ungültiges, aber in `BelegFeldEnum` enthaltenes `feld` für die Aussage — oder
 * `undefined`, wenn diese Aussage den Fehler nicht hergibt. Jeder Fehler verletzt GENAU EINE Regel:
 * `feldNichtExistenz` nimmt ein Feld, das zum Subjekttyp PASST (sonst lehnte schon die Typprüfung
 * ab und eine fehlende Existenz-Regel fiele nicht auf — Mutationsprobe M8c, AP-1.34 PR-B2);
 * `feldFalscherTyp` eins, das nicht passt, an einer Existenz-Aussage. */
function ungueltigesFeld(fehler: AblehnungFehler, kopf: AussageKopfZeile, roh: number): BelegFeld | undefined {
  if (fehler === 'feldNichtExistenz') {
    return kopf.praedikat === 'existenz' ? undefined : ausListe(BELEG_FELDER_JE_SUBJEKT[AussageSubjektTypEnum.parse(kopf.subjekt_typ)], roh)
  }
  if (fehler === 'feldFalscherTyp' && kopf.praedikat === 'existenz') {
    const passend = BELEG_FELDER_JE_SUBJEKT[AussageSubjektTypEnum.parse(kopf.subjekt_typ)]
    return ausListe(
      BelegFeldEnum.options.filter((f) => !passend.includes(f)),
      roh,
    )
  }
  return undefined
}

function ersatzpaarSeite(seiteRoh: number): 'Von' | 'Bis' {
  return seiteRoh % 2 === 0 ? 'Von' : 'Bis'
}

function istAnkerFehler(fehler: AblehnungFehler): boolean {
  return fehler === 'ankerAusserhalb' || fehler === 'ankerOhneTranskript' || fehler === 'ankerErsatzpaar'
}

type AblehnungNutzlast =
  | { readonly befehl: 'anlegen'; readonly ein: BefehlEin<'aussage_zitat.anlegen'> }
  | { readonly befehl: 'aendern'; readonly ein: BefehlEin<'aussage_zitat.aendern'> }

function ablehnungAnlegenFinden(db: Tx, zustand: BelegZustand, aktion: AktionBelegAblehnen): AblehnungNutzlast | undefined {
  const verknuepft = (aussageId: string, zitatId: string): boolean =>
    zustand.aussageZitatVerknuepfungen.some((v) => v.aussageId === aussageId && v.zitatId === zitatId)
  if (istAnkerFehler(aktion.fehler)) {
    for (const zitatId of rundum(zustand.zitatIds, aktion.zweitRoh)) {
      const anker = ungueltigerAnker(aktion.fehler, zitatLesen(db, zitatId).transkript, aktion.zweitRoh)
      const aussage = anker === undefined ? undefined : rundum(zustand.aussagen, aktion.zielRoh).find((a) => !verknuepft(a.id, zitatId))
      if (anker !== undefined && aussage !== undefined) {
        return { befehl: 'anlegen', ein: { aussageId: aussage.id, zitatId, textanker: anker } }
      }
    }
    return undefined
  }
  for (const aussage of rundum(zustand.aussagen, aktion.zielRoh)) {
    const feld = ungueltigesFeld(aktion.fehler, aussageKopfLesen(db, aussage.id), aktion.feldRoh)
    const zitatId = feld === undefined ? undefined : rundum(zustand.zitatIds, aktion.zweitRoh).find((z) => !verknuepft(aussage.id, z))
    if (feld !== undefined && zitatId !== undefined) {
      return { befehl: 'anlegen', ein: { aussageId: aussage.id, zitatId, feld } }
    }
  }
  return undefined
}

function ablehnungAendernFinden(db: Tx, zustand: BelegZustand, aktion: AktionBelegAblehnen): AblehnungNutzlast | undefined {
  for (const v of rundum(zustand.aussageZitatVerknuepfungen, aktion.zielRoh)) {
    const zeile = verknuepfungLesen(db, v)
    const altFeld = BelegFeldEnum.nullable().parse(zeile.feld)
    if (istAnkerFehler(aktion.fehler)) {
      const anker = ungueltigerAnker(aktion.fehler, zitatLesen(db, v.zitatId).transkript, aktion.zweitRoh)
      if (anker !== undefined) {
        return { befehl: 'aendern', ein: { aussageId: v.aussageId, zitatId: v.zitatId, feld: altFeld, textanker: anker } }
      }
    } else {
      const feld = ungueltigesFeld(aktion.fehler, aussageKopfLesen(db, v.aussageId), aktion.feldRoh)
      if (feld !== undefined) {
        return { befehl: 'aendern', ein: { aussageId: v.aussageId, zitatId: v.zitatId, feld, textanker: ankerVon(zeile) } }
      }
    }
  }
  return undefined
}

export function belegAblehnenAusfuehren(db: Tx, zustand: BelegZustand, aktion: AktionBelegAblehnen, zweige: Zweig[]): void {
  const nutzlast =
    aktion.befehl === 'anlegen' ? ablehnungAnlegenFinden(db, zustand, aktion) : ablehnungAendernFinden(db, zustand, aktion)
  if (nutzlast === undefined) {
    return
  }
  const txVorher = txFingerabdruck(db)
  let fehler: unknown
  try {
    if (nutzlast.befehl === 'anlegen') {
      befehl(zweige, db, 'aussage_zitat.anlegen', nutzlast.ein)
    } else {
      befehl(zweige, db, 'aussage_zitat.aendern', nutzlast.ein)
    }
  } catch (e) {
    fehler = e
  }
  if (!(fehler instanceof WurzelFehler) || fehler.code !== 'VALIDIERUNG_WERTEBEREICH') {
    throw new Error(
      `Ablehnung erwartet (${aktion.fehler} über aussage_zitat.${aktion.befehl}, VALIDIERUNG_WERTEBEREICH), erhalten: ${fehler === undefined ? 'kein Fehler' : String(fehler)}`,
    )
  }
  if (txFingerabdruck(db) !== txVorher) {
    throw new Error(`Abgelehnter Befehl aussage_zitat.${aktion.befehl} hat eine Transaktion hinterlassen.`)
  }
  const art = istAnkerFehler(aktion.fehler) ? 'anker' : 'feld'
  zweige.push(`ablehnung.${art}.${aktion.befehl}`, `ablehnung.${aktion.fehler}`)
  if (aktion.fehler === 'ankerErsatzpaar') {
    zweige.push(`ablehnung.ankerErsatzpaar${ersatzpaarSeite(aktion.zweitRoh)}`)
  }
}
