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
import { BELEG_FELDER_JE_SUBJEKT, type BelegFeld } from '../../src/shared/schemata/aussage-zitat'
import { AussageSubjektTypEnum } from '../../src/shared/schemata/gemeinsam'

/** Die Bausteine der Transkripte (s. Modul-Kommentar). */
const TRANSKRIPT_BAUSTEINE: readonly string[] = ['a', 'Z', ' ', "'", 'ä', 'ß', 'Ё', 'ł', 'é', '👶', '👨‍👩‍👧']

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
  | 'beleg.anlegen.ohneAnker'
  | 'beleg.anlegen.anker'
  /** Der Ausschnitt enthält eine Nicht-ASCII-Codeeinheit. */
  | 'beleg.anlegen.ankerNichtAscii'
  /** Eine Ankergrenze liegt unmittelbar vor oder hinter einem Ersatzpaar (nicht darin, F4). */
  | 'beleg.anlegen.grenzeNebenErsatzpaar'
  | 'beleg.anlegen.feld'
  | 'beleg.anlegen.ankerUndFeld'

/** Pflichtzweige, die über `{ seed, numRuns }` beider Invarianten-Tests nie 0 sein dürfen. */
export const PFLICHTZWEIGE: readonly Zweig[] = [
  'befehl:hauptname.wechseln',
  'nachruecken',
  'demote',
  'befehl:beteiligung.loeschen',
  'befehl:aussage_zitat.loeschen',
  'befehl:ort.anlegen',
  'befehl:ortszugehoerigkeit.anlegen',
  'befehl:ort-externe-id.loeschen',
  'befehl:quelle.aendern',
  'befehl:zitat.loeschen',
  'befehl:negativbefund.loeschen',
  'beleg.anlegen.ohneAnker',
  'beleg.anlegen.anker',
  'beleg.anlegen.ankerNichtAscii',
  'beleg.anlegen.grenzeNebenErsatzpaar',
  'beleg.anlegen.feld',
  'beleg.anlegen.ankerUndFeld',
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

/** Was `aussage_zitat.aendern` zuletzt angefordert hat — für I2 in `textanker-gueltig.test.ts`
 * (die bearbeitete Verknüpfung muss danach genau diese Werte tragen). */
export interface BelegAenderungInfo {
  readonly aussageId: string
  readonly zitatId: string
  readonly feld: string | null
  readonly von: number | null
  readonly bis: number | null
}

/** Der Teil des Generatorzustands, den dieses Modul liest/pflegt (strukturell, s. Modul-Kommentar). */
export interface BelegZustand {
  readonly aussagen: readonly BelegAussageInfo[]
  readonly zitatIds: readonly string[]
  aussageZitatVerknuepfungen: BelegVerknuepfungInfo[]
  belegAenderung: BelegAenderungInfo | undefined
}

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

/** Wählt eine Aussage — bei geradem `wahlRoh` bevorzugt eine Existenz-Aussage (~50 %), sonst aus
 * allen (Einfügereihenfolge des Zustands). */
function aussageWaehlen(aussagen: readonly BelegAussageInfo[], wahlRoh: number, zielRoh: number): BelegAussageInfo | undefined {
  if (wahlRoh % 2 === 0) {
    const existenz = aussagen.filter((a) => a.istExistenz)
    if (existenz.length > 0) {
      return ausListe(existenz, zielRoh)
    }
  }
  return ausListe(aussagen, zielRoh)
}

// -----------------------------------------------------------------------------------------------
// aussage_zitat.anlegen mit Textanker und feld
// -----------------------------------------------------------------------------------------------

/**
 * AP-1.29 PR-B, erweitert AP-1.34 PR-B2: `aussage_zitat.anlegen` — verknüpft eine BESTEHENDE
 * `aussage` mit einem BESTEHENDEN `zitat`; leere Listen oder eine schon vergebene Kombination
 * (zusammengesetzter Primärschlüssel) machen die Aktion zum No-op. `ankerRoh`/`feldRoh`: `undefined`
 * = weglassen. Der Anker wird gegen das gelesene Transkript berechnet (`ankerAusRoh()`), `feld` nur
 * an einer Existenz-Aussage gesetzt (`feldAusRoh()`) — immer gültige Eingaben; die ungültigen
 * erzeugt die Ablehnungs-Aktion.
 */
export interface AktionAussageZitatAnlegen {
  readonly art: 'aussageZitatAnlegen'
  readonly existenzWahlRoh: number
  readonly aussageZielRoh: number
  readonly zitatZielRoh: number
  readonly ankerRoh: AnkerRoh | undefined
  readonly feldRoh: number | undefined
}

export function aussageZitatAnlegenAktionArbitrary(): fc.Arbitrary<AktionAussageZitatAnlegen> {
  return fc
    .record({
      existenzWahlRoh: fc.nat(),
      aussageZielRoh: fc.nat(),
      zitatZielRoh: fc.nat(),
      ankerRoh: fc.option(ankerRohArbitrary(), { nil: undefined, freq: 2 }),
      feldRoh: fc.option(fc.nat(), { nil: undefined, freq: 2 }),
    })
    .map((r): AktionAussageZitatAnlegen => ({ art: 'aussageZitatAnlegen', ...r }))
}

export function aussageZitatAnlegenAusfuehren(db: Tx, zustand: BelegZustand, aktion: AktionAussageZitatAnlegen, zweige: Zweig[]): void {
  const aussage = aussageWaehlen(zustand.aussagen, aktion.existenzWahlRoh, aktion.aussageZielRoh)
  if (aussage === undefined) {
    return
  }
  const zitatId = ausListe(zustand.zitatIds, aktion.zitatZielRoh)
  if (zitatId === undefined) {
    return
  }
  if (zustand.aussageZitatVerknuepfungen.some((v) => v.aussageId === aussage.id && v.zitatId === zitatId)) {
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
  zustand.aussageZitatVerknuepfungen.push({ aussageId: aussage.id, zitatId })

  if (anker === undefined || transkript === null) {
    zweige.push('beleg.anlegen.ohneAnker')
  } else {
    zweige.push('beleg.anlegen.anker')
    if (ausschnittNichtAscii(transkript, anker)) {
      zweige.push('beleg.anlegen.ankerNichtAscii')
    }
    if (grenzeNebenPaar(transkript, anker.von) || grenzeNebenPaar(transkript, anker.bis)) {
      zweige.push('beleg.anlegen.grenzeNebenErsatzpaar')
    }
  }
  if (feld !== undefined) {
    zweige.push(anker === undefined ? 'beleg.anlegen.feld' : 'beleg.anlegen.ankerUndFeld')
  }
}
