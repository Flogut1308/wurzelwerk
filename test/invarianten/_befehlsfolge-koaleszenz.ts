// AP-1.30 (PR 4b, Prüfpfad-Folge zu #156) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Koaleszenz-Teil des Befehlsfolge-Generators (`_befehlsfolge-generator.ts`): feste Testuhr, die
// Aktion „Serie" (2–5 schnelle Aufrufe desselben Autosave-Befehls auf dasselbe Subjekt+Feld) und
// die Beobachtung, ob der Bus zusammengefasst hat — gemessen am Datenbankergebnis. Ausgelagert wie
// `_befehlsfolge-beleg.ts`: dieses Modul importiert den Generator NICHT; was es vom Generatorzustand
// braucht, beschreibt `KoaleszenzZustand` strukturell.
//
// UHR: der Bus liest die Zeit genau einmal je Aufruf über `Date.now()` (`src/main/befehle/bus.ts`,
// `zeitpunktMs`) — es gibt keine injizierbare Uhr, und eine einzuführen wäre eine Änderung am
// Produktivcode (nicht in einem Prüfpfad-PR). Der Generator stellt darum `Date` über
// `vi.setSystemTime()` (Vitest mockt dabei nur `Date`, keine Timer) vor JEDER Aktion auf einen festen
// Wert: Startwert `UHR_START_MS` je Lauf (`neuerZustand()`), dann `UHR_SCHRITT_MS` je Aktion.
// Vorher lief die echte Uhr — zwei unmittelbar aufeinanderfolgende `feldSetzen('notiz', …)` lagen
// praktisch immer im 2-s-Fenster und wurden zusammengefasst, aber eben nur „praktisch immer". Der
// Schritt von 250 ms bildet genau dieses Verhalten nach (schnelle Folgeaufrufe liegen im Fenster),
// jetzt deterministisch (CLAUDE.md §13). Innerhalb einer Serie rückt die Uhr um die generierten
// Abstände vor — teils < 2000 ms (fasst zusammen), teils ≥ 2000 ms (neuer Undo-Schritt), die Grenze
// 1999/2000 ausdrücklich eingeschlossen.
//
// SERIE UND UNDO-SCHRITTE: eine Serie ist die einzige Aktion, die MEHR als einen erfolgreichen
// `fuehreAus()` auslöst — und damit, je nach Abständen, mehrere Undo-Schritte. Nach jedem Aufruf
// außer dem letzten ruft sie `zwischenSchritt()` (vom Aufrufer, s. `undo-bitgleich.test.ts`), damit
// ein Test, der Undo-Schritte mitschreibt, jeden Zwischenstand sieht; den letzten erfasst er wie bei
// jeder Aktion danach.
//
// ORAKEL (nicht nur Deckung): nach jedem Serienaufruf ab dem zweiten prüft `serieAusfuehren()` am
// Journal, dass
//   (a) ein Zusammenfassen NUR stattfand, wenn der Aufruf ein passendes `feld` trug, die oberste
//       Transaktion vorher denselben erwarteten Schlüssel `Befehl:Subjekt:Feld` hatte und der Abstand
//       zu ihrem Zeitpunkt < 2000 ms war, und
//   (b) umgekehrt eine NEUE Transaktion mit genau diesem Schlüssel unter denselben Bedingungen ein
//       Fehler ist (sie hätte zusammengefasst werden müssen).
// `undo-bitgleich` allein sähe (a) nicht: ein zu großzügig vergebener Schlüssel fasst mehr zusammen,
// die Rücknahme bleibt trotzdem bitgleich — nur der Undo-Schritt ist zu groß.
import fc from 'fast-check'
import { vi } from 'vitest'
import type { BefehlEin, BefehlName } from '../../src/main/befehle/registrierung'
import type { Tx } from '../../src/main/repositories/basis'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import * as beziehungRepo from '../../src/main/repositories/beziehung-repo'
import * as ereignisRepo from '../../src/main/repositories/ereignis-repo'
import * as nameRepo from '../../src/main/repositories/name-repo'
import { montiereOriginalText } from '../../src/core/name/zerlegung'
import {
  AussageAendernFeldEnum,
  ElternschaftAendernFeldEnum,
  EreignisAendernFeldEnum,
  NameAendernFeldEnum,
  PartnerschaftAendernFeldEnum,
  type AussageAendernEin,
  type ElternschaftAendernEin,
  type EreignisAendernEin,
  type NameAendernEin,
  type PartnerschaftAendernEin,
} from '../../src/shared/schemata/befehle'
import { NameTypEnum, SchriftEnum, UmschriftNormEnum } from '../../src/shared/schemata/name'
import { ElternschaftTypEnum } from '../../src/shared/schemata/elternschaft'
import { EndeGrundEnum, PartnerschaftTypEnum } from '../../src/shared/schemata/partnerschaft'
import { EreignisTypEnum } from '../../src/shared/schemata/ereignis'
import { KonfidenzSchema } from '../../src/shared/schemata/gemeinsam'
import { befehl, type Zweig } from './_befehlsfolge-beleg'

/** Koaleszenzfenster aus `src/main/journal/koaleszenz.ts` (dort nicht exportiert) — bewusst hier
 * noch einmal als Zahl: das Orakel prüft den Produktivcode gegen die Vorgabe aus
 * docs/architektur.md §4.8, nicht gegen sich selbst. */
export const KOALESZENZ_FENSTER_MS = 2000

/** Fester Startwert der Testuhr je Lauf (25.09.2026, 00:00 UTC). */
export const UHR_START_MS = Date.UTC(2026, 8, 25)

/** Uhrvorschub je Aktion — s. Modul-Kommentar UHR. */
export const UHR_SCHRITT_MS = 250

export interface Testuhr {
  uhrMs: number
}

/** Rückt die Testuhr vor und stellt `Date` darauf (s. Modul-Kommentar UHR). */
export function uhrVorruecken(uhr: Testuhr, ms: number): void {
  uhr.uhrMs += ms
  vi.setSystemTime(uhr.uhrMs)
}

// -----------------------------------------------------------------------------------------------
// Journal-Blick (am Datenbankergebnis)
// -----------------------------------------------------------------------------------------------

interface ObersteTransaktion {
  readonly id: string
  readonly zeitpunkt: number
  readonly koaleszenz_schluessel: string | null
}

interface JournalBlick {
  readonly anzahl: number
  readonly oberste: ObersteTransaktion | undefined
  /** `tabelle datensatz_id` aller `insert`-Zeilen der obersten Transaktion. */
  readonly einfuegungen: readonly string[]
  /** Die `aenderung.id`s der obersten Transaktion, sortiert — `versucheZusammenfassen()` schreibt
   * die verdichteten Zeilen mit neuen ids neu, ein Zusammenfassen ändert diesen Abdruck also immer
   * (auch bei Abstand 0 ms, wo der Zeitpunkt gleich bliebe). */
  readonly aenderungsAbdruck: string
}

function journalBlick(db: Tx): JournalBlick {
  const zaehlung = db
    .prepare<[], { readonly anzahl: number }>("SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'")
    .get()
  const oberste = db
    .prepare<[], ObersteTransaktion>(
      "SELECT id, zeitpunkt, koaleszenz_schluessel FROM transaktion WHERE status = 'angewendet' ORDER BY lfd DESC LIMIT 1",
    )
    .get()
  const einfuegungen =
    oberste === undefined
      ? []
      : db
          .prepare<{ readonly id: string }, { readonly schluessel: string }>(
            "SELECT tabelle || ' ' || datensatz_id AS schluessel FROM aenderung WHERE transaktion_id = @id AND operation = 'insert'",
          )
          .all({ id: oberste.id })
          .map((z) => z.schluessel)
  const aenderungsAbdruck =
    oberste === undefined
      ? ''
      : db
          .prepare<{ readonly id: string }, { readonly id: string }>('SELECT id FROM aenderung WHERE transaktion_id = @id ORDER BY id')
          .all({ id: oberste.id })
          .map((z) => z.id)
          .join(',')
  return { anzahl: zaehlung?.anzahl ?? 0, oberste, einfuegungen, aenderungsAbdruck }
}

function datensaetzeDerTransaktion(db: Tx, id: string): ReadonlySet<string> {
  return new Set(
    db
      .prepare<{ readonly id: string }, { readonly schluessel: string }>(
        "SELECT tabelle || ' ' || datensatz_id AS schluessel FROM aenderung WHERE transaktion_id = @id",
      )
      .all({ id })
      .map((z) => z.schluessel),
  )
}

/** Wie ist ein Aufruf im Journal gelandet? */
type Landung = 'zusammengefasst' | 'neu' | 'leer'

/**
 * Führt einen Befehl aus und meldet am Journal, wie er gelandet ist, samt Deckungszweigen:
 * `koaleszenz.zusammengefasst` — die Anzahl angewendeter Transaktionen stieg nicht, die oberste
 * blieb dieselbe, aber ihre `aenderung`-Zeilen wurden neu geschrieben (s. `aenderungsAbdruck`); das
 * gleitende Fenster wird mitgeprüft: ihr Zeitpunkt muss danach der jetzige sein;
 * `koaleszenz.verdichtet` — zusätzlich verschwand ein `insert` der obersten Transaktion ganz aus ihr
 * (ein insert+delete-Paar hob sich auf, z. B. die neu angelegten Bestandteile bei `name.aendern`).
 */
export function befehlBeobachtet<N extends BefehlName>(
  zweige: Zweig[],
  db: Tx,
  name: N,
  ein: BefehlEin<N>,
): { readonly landung: Landung; readonly vorher: JournalBlick; readonly nachher: JournalBlick } {
  const vorher = journalBlick(db)
  befehl(zweige, db, name, ein)
  const nachher = journalBlick(db)
  let landung: Landung
  if (nachher.anzahl > vorher.anzahl) {
    landung = 'neu'
  } else if (
    vorher.oberste !== undefined &&
    nachher.oberste !== undefined &&
    nachher.oberste.id === vorher.oberste.id &&
    nachher.aenderungsAbdruck !== vorher.aenderungsAbdruck
  ) {
    landung = 'zusammengefasst'
    zweige.push('koaleszenz.zusammengefasst')
    if (nachher.oberste.zeitpunkt !== Date.now()) {
      throw new Error('Koaleszenz ohne gleitendes Fenster: der Zeitpunkt der zusammengefassten Transaktion ist nicht der jüngste (docs/architektur.md §4.8).')
    }
    const jetzt = datensaetzeDerTransaktion(db, nachher.oberste.id)
    if (vorher.einfuegungen.some((s) => !jetzt.has(s))) {
      zweige.push('koaleszenz.verdichtet')
    }
  } else {
    landung = 'leer'
  }
  return { landung, vorher, nachher }
}

// -----------------------------------------------------------------------------------------------
// `feld` an den gewöhnlichen `*.aendern`-Aktionen
// -----------------------------------------------------------------------------------------------

/**
 * `feld` für eine gewöhnliche `*.aendern`-Aktion aus einem Rohindex: `undefined` bleibt ohne `feld`
 * (kein Schlüssel, wie bisher). Sonst zuerst die Felder, die die Aktion wirklich schickt (`gesendet`,
 * doppelt gewichtet — passt, wenn sich genau dieses eine ändert), dann jedes Vertragsfeld (auch
 * absichtlich unpassende — dann vergibt der Bus keinen Schlüssel).
 */
export function feldAusRoh<F extends string>(roh: number | undefined, gesendet: readonly NoInfer<F>[], alle: readonly F[]): F | undefined {
  if (roh === undefined) {
    return undefined
  }
  const auswahl = [...gesendet, ...gesendet, ...alle]
  return auswahl[roh % auswahl.length]
}

// -----------------------------------------------------------------------------------------------
// Aktion „Serie"
// -----------------------------------------------------------------------------------------------

type SerieBefehl = 'personNotiz' | 'nameAendern' | 'ereignisAendern' | 'partnerschaftAendern' | 'elternschaftAendern' | 'aussageAendern'

/** Die Textfelder, die eine Serie je Befehl schreibt (Autosave-Freitext). */
const SERIE_FELDER: Readonly<Record<SerieBefehl, readonly string[]>> = {
  personNotiz: ['notiz'],
  nameAendern: ['nachname', 'vornamen', 'vatersname'],
  ereignisAendern: ['beschreibung', 'notiz'],
  partnerschaftAendern: ['notiz'],
  elternschaftAendern: ['notiz'],
  aussageAendern: ['begruendung', 'unsicherheit'],
}

/** Ein absichtlich unpassendes `feld` je Befehl (ein anderes Vertragsfeld als das geschriebene). */
function unpassendesFeld(befehlArt: SerieBefehl, feld: string): string {
  const kandidaten: Readonly<Record<SerieBefehl, readonly string[]>> = {
    personNotiz: ['notiz'],
    nameAendern: ['praefix', 'titelVor', 'nachname'],
    ereignisAendern: ['typ', 'notiz', 'beschreibung'],
    partnerschaftAendern: ['typ'],
    elternschaftAendern: ['typ'],
    aussageAendern: ['konfidenz', 'begruendung', 'unsicherheit'],
  }
  const anders = kandidaten[befehlArt].find((k) => k !== feld)
  return anders ?? feld
}

export interface AktionSerie {
  readonly art: 'serie'
  readonly befehl: SerieBefehl
  readonly zielRoh: number
  readonly feldRoh: number
  /** Je Aufruf ein Wert (2–5 Aufrufe). */
  readonly werte: readonly string[]
  /** Uhrvorschub VOR Aufruf i + 1 (Länge `werte.length - 1`). */
  readonly abstaendeMs: readonly number[]
  /** Je Aufruf: `feld` passend (true) oder absichtlich unpassend (false). `personNotiz` ignoriert
   * das (dort bestimmt `feld` die Spalte). */
  readonly feldPassend: readonly boolean[]
}

/** Kleine Wertemenge (Wiederholungen → auch No-op-Aufrufe mitten in der Serie) plus freie Texte. */
function serieWertArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom('Müller', "O'Brien", 'Ольга', 'Anna Maria', 'Tippfehle', 'Tippfehler', '') },
    { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  )
}

/** Abstände: überwiegend im Fenster, die Grenze 1999/2000 ausdrücklich, sonst darüber. */
function abstandArbitrary(): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0, max: KOALESZENZ_FENSTER_MS - 1 }) },
    { weight: 1, arbitrary: fc.constantFrom(KOALESZENZ_FENSTER_MS - 1, KOALESZENZ_FENSTER_MS) },
    { weight: 1, arbitrary: fc.integer({ min: KOALESZENZ_FENSTER_MS, max: 3 * KOALESZENZ_FENSTER_MS }) },
  )
}

export function serieAktionArbitrary(): fc.Arbitrary<AktionSerie> {
  return fc
    .record({
      befehl: fc.constantFrom<SerieBefehl>('personNotiz', 'personNotiz', 'nameAendern', 'nameAendern', 'ereignisAendern', 'partnerschaftAendern', 'elternschaftAendern', 'aussageAendern'),
      zielRoh: fc.nat(),
      feldRoh: fc.nat(),
      anzahl: fc.integer({ min: 2, max: 5 }),
      werte: fc.array(serieWertArbitrary(), { minLength: 5, maxLength: 5 }),
      abstaendeMs: fc.array(abstandArbitrary(), { minLength: 4, maxLength: 4 }),
      feldPassend: fc.array(fc.constantFrom(true, true, true, true, false), { minLength: 5, maxLength: 5 }),
    })
    .map(
      (r): AktionSerie => ({
        art: 'serie',
        befehl: r.befehl,
        zielRoh: r.zielRoh,
        feldRoh: r.feldRoh,
        werte: r.werte.slice(0, r.anzahl),
        abstaendeMs: r.abstaendeMs.slice(0, r.anzahl - 1),
        feldPassend: r.feldPassend.slice(0, r.anzahl),
      }),
    )
}

/** Was eine Serie vom Generatorzustand braucht (strukturell, s. Modul-Kommentar). */
export interface KoaleszenzZustand extends Testuhr {
  readonly personIds: readonly string[]
  readonly namen: readonly { readonly id: string }[]
  readonly ereignisse: readonly { readonly id: string }[]
  readonly partnerschaften: readonly { readonly id: string }[]
  readonly elternschaften: readonly { readonly id: string }[]
  readonly aussagen: readonly { readonly id: string }[]
}

function ausListe<T>(liste: readonly T[], roh: number): T | undefined {
  return liste.length === 0 ? undefined : liste[roh % liste.length]
}

function ohneNull<T>(wert: T | null): T | undefined {
  return wert === null ? undefined : wert
}

/** Ein Serienaufruf: Befehlsname + Nutzlast, die gegenüber dem GESPEICHERTEN Stand nur `feld`
 * (Vertragsfeld) auf `wert` setzt — alle anderen Felder aus der Zeile übernommen, damit der Bus den
 * Schlüssel vergeben kann. `undefined`: Subjekt passt nicht (z. B. Datum gesetzt, das der
 * Generator nie schreibt) — die Serie wird dann zum No-op. */
type SerienAufruf =
  | { readonly name: 'person.feldSetzen'; readonly ein: { readonly id: string; readonly feld: 'notiz'; readonly wert: string } }
  | { readonly name: 'name.aendern'; readonly ein: NameAendernEin }
  | { readonly name: 'ereignis.aendern'; readonly ein: EreignisAendernEin }
  | { readonly name: 'partnerschaft.aendern'; readonly ein: PartnerschaftAendernEin }
  | { readonly name: 'elternschaft.aendern'; readonly ein: ElternschaftAendernEin }
  | { readonly name: 'aussage.aendern'; readonly ein: AussageAendernEin }

function serienAufrufBauen(db: Tx, befehlArt: SerieBefehl, id: string, feld: string, gesendetesFeld: string, wert: string): SerienAufruf | undefined {
  switch (befehlArt) {
    case 'personNotiz':
      return { name: 'person.feldSetzen', ein: { id, feld: 'notiz', wert } }
    case 'nameAendern': {
      const z = nameRepo.lesen(db, id)
      if (z === undefined) return undefined
      const flach = {
        vornamen: z.vornamen,
        rufnameIndex: z.rufname_index,
        rufnameText: z.rufname_text,
        nachname: z.nachname,
        praefix: z.praefix,
        titelVor: z.titel_vor,
        zusatzNach: z.zusatz_nach,
        vatersname: z.vatersname,
      }
      // `original_text` folgt den Teilen, wenn er ihre automatische Montage war (dann weglassen);
      // eine wortgetreue Schreibung wird mitgeschickt (s. `nameGeaenderteFelder`).
      const originalText = z.original_text === montiereOriginalText(flach) ? undefined : ohneNull(z.original_text)
      const basis: NameAendernEin = {
        id,
        typ: NameTypEnum.parse(z.typ),
        schrift: z.schrift === null ? undefined : SchriftEnum.parse(z.schrift),
        umschriftVon: ohneNull(z.umschrift_von),
        umschriftNorm: z.umschrift_norm === null ? undefined : UmschriftNormEnum.parse(z.umschrift_norm),
        vornamen: ohneNull(z.vornamen),
        rufnameIndex: ohneNull(z.rufname_index),
        rufnameText: ohneNull(z.rufname_text),
        nachname: ohneNull(z.nachname),
        praefix: ohneNull(z.praefix),
        titelVor: ohneNull(z.titel_vor),
        zusatzNach: ohneNull(z.zusatz_nach),
        vatersname: ohneNull(z.vatersname),
        originalText,
        sprache: ohneNull(z.sprache),
        gueltigVon: ohneNull(z.gueltig_von),
        gueltigBis: ohneNull(z.gueltig_bis),
        feld: NameAendernFeldEnum.parse(feld),
      }
      if (gesendetesFeld === 'nachname') return { name: 'name.aendern', ein: { ...basis, nachname: wert } }
      if (gesendetesFeld === 'vornamen') return { name: 'name.aendern', ein: { ...basis, vornamen: wert, rufnameIndex: undefined, rufnameText: undefined } }
      return { name: 'name.aendern', ein: { ...basis, vatersname: wert } }
    }
    case 'ereignisAendern': {
      const z = ereignisRepo.lesen(db, id)
      if (z === undefined || z.datum_modifikator !== null) return undefined
      const basis: EreignisAendernEin = {
        id,
        typ: EreignisTypEnum.parse(z.typ),
        ortId: ohneNull(z.ort_id),
        beschreibung: ohneNull(z.beschreibung),
        notiz: ohneNull(z.notiz),
        feld: EreignisAendernFeldEnum.parse(feld),
      }
      return { name: 'ereignis.aendern', ein: gesendetesFeld === 'beschreibung' ? { ...basis, beschreibung: wert } : { ...basis, notiz: wert } }
    }
    case 'partnerschaftAendern': {
      const z = beziehungRepo.partnerschaftLesen(db, id)
      if (z === undefined || z.beginn_modifikator !== null || z.ende_modifikator !== null) return undefined
      return {
        name: 'partnerschaft.aendern',
        ein: {
          id,
          typ: PartnerschaftTypEnum.parse(z.typ),
          endeGrund: z.ende_grund === null ? undefined : EndeGrundEnum.parse(z.ende_grund),
          reihenfolge: ohneNull(z.reihenfolge),
          notiz: wert,
          feld: PartnerschaftAendernFeldEnum.parse(feld),
        },
      }
    }
    case 'elternschaftAendern': {
      const z = beziehungRepo.elternschaftLesen(db, id)
      if (z === undefined) return undefined
      return { name: 'elternschaft.aendern', ein: { id, typ: ElternschaftTypEnum.parse(z.typ), notiz: wert, feld: ElternschaftAendernFeldEnum.parse(feld) } }
    }
    case 'aussageAendern': {
      const z = aussageRepo.lesen(db, id)
      // Nur Aussagen mit Text- oder Zahlwert und Konfidenz (der Vertrag verlangt genau einen Wert).
      if (z === undefined || z.konfidenz === null || z.wert_ref_id !== null || (z.wert_text === null) === (z.wert_zahl === null)) return undefined
      const basis: AussageAendernEin = {
        id,
        ...(z.wert_text !== null ? { wertText: z.wert_text } : {}),
        ...(z.wert_zahl !== null ? { wertZahl: z.wert_zahl } : {}),
        konfidenz: KonfidenzSchema.parse(z.konfidenz),
        begruendung: ohneNull(z.begruendung),
        unsicherheit: ohneNull(z.unsicherheit),
        gueltigVon: ohneNull(z.gueltig_von),
        gueltigBis: ohneNull(z.gueltig_bis),
        ...(z.datum_modifikator !== null ? { datumBeibehalten: true as const } : {}),
        feld: AussageAendernFeldEnum.parse(feld),
      }
      return { name: 'aussage.aendern', ein: gesendetesFeld === 'begruendung' ? { ...basis, begruendung: wert } : { ...basis, unsicherheit: wert } }
    }
    default: {
      const nieErreicht: never = befehlArt
      throw new Error(`serienAufrufBauen(): unbehandelter Befehl ${String(nieErreicht)}`)
    }
  }
}

function serieZiel(zustand: KoaleszenzZustand, befehlArt: SerieBefehl, roh: number): string | undefined {
  switch (befehlArt) {
    case 'personNotiz':
      return ausListe(zustand.personIds, roh)
    case 'nameAendern':
      return ausListe(zustand.namen, roh)?.id
    case 'ereignisAendern':
      return ausListe(zustand.ereignisse, roh)?.id
    case 'partnerschaftAendern':
      return ausListe(zustand.partnerschaften, roh)?.id
    case 'elternschaftAendern':
      return ausListe(zustand.elternschaften, roh)?.id
    case 'aussageAendern':
      return ausListe(zustand.aussagen, roh)?.id
    default: {
      const nieErreicht: never = befehlArt
      throw new Error(`serieZiel(): unbehandelter Befehl ${String(nieErreicht)}`)
    }
  }
}

const BEFEHL_ZU_NAME: Readonly<Record<SerieBefehl, BefehlName>> = {
  personNotiz: 'person.feldSetzen',
  nameAendern: 'name.aendern',
  ereignisAendern: 'ereignis.aendern',
  partnerschaftAendern: 'partnerschaft.aendern',
  elternschaftAendern: 'elternschaft.aendern',
  aussageAendern: 'aussage.aendern',
}

/**
 * Führt eine Serie aus (s. Modul-Kommentar): 2–5 Aufrufe desselben Befehls auf dasselbe Subjekt und
 * dasselbe geschriebene Feld, zwischen den Aufrufen die Testuhr um die generierten Abstände
 * vorgerückt, nach jedem Aufruf außer dem letzten `zwischenSchritt()`. Prüft das Orakel (a)/(b).
 */
export function serieAusfuehren(db: Tx, zustand: KoaleszenzZustand, aktion: AktionSerie, zweige: Zweig[], zwischenSchritt: () => void): void {
  const id = serieZiel(zustand, aktion.befehl, aktion.zielRoh)
  if (id === undefined) {
    return
  }
  const felder = SERIE_FELDER[aktion.befehl]
  const gesendetesFeld = felder[aktion.feldRoh % felder.length]
  if (gesendetesFeld === undefined) {
    throw new Error('serieAusfuehren(): SERIE_FELDER ist je Befehl nichtleer — unerreichbar.')
  }
  const erwarteterSchluessel = `${BEFEHL_ZU_NAME[aktion.befehl]}:${id}:${gesendetesFeld}`

  for (let i = 0; i < aktion.werte.length; i += 1) {
    if (i > 0) {
      zwischenSchritt()
      uhrVorruecken(zustand, aktion.abstaendeMs[i - 1] ?? 0)
    }
    const wert = aktion.werte[i] ?? ''
    const passend = aktion.befehl === 'personNotiz' || aktion.feldPassend[i] !== false
    const feld = passend ? gesendetesFeld : unpassendesFeld(aktion.befehl, gesendetesFeld)
    const aufruf = serienAufrufBauen(db, aktion.befehl, id, feld, gesendetesFeld, wert)
    if (aufruf === undefined) {
      return
    }
    const { landung, vorher, nachher } = serienAufrufAusfuehren(zweige, db, aufruf)
    if (!passend && landung === 'neu' && nachher.oberste?.koaleszenz_schluessel === null) {
      zweige.push('koaleszenz.feldUnpassend')
    }

    const imFenster =
      vorher.oberste !== undefined && zustand.uhrMs - vorher.oberste.zeitpunkt < KOALESZENZ_FENSTER_MS
    const kandidatPasst = passend && imFenster && vorher.oberste?.koaleszenz_schluessel === erwarteterSchluessel
    // Orakel (a): zusammengefasst nur, wenn Feld, Fenster und Schlüssel der obersten Transaktion passen.
    if (landung === 'zusammengefasst' && !kandidatPasst) {
      throw new Error(
        `Koaleszenz ohne Anlass (${aktion.befehl}, feld passend=${String(passend)}, im Fenster=${String(imFenster)}, ` +
          `Schlüssel vorher=${String(vorher.oberste?.koaleszenz_schluessel)}).`,
      )
    }
    // Orakel (b): eine neue Transaktion mit genau dem Schlüssel der obersten im Fenster hätte zusammengefasst werden müssen.
    if (landung === 'neu' && kandidatPasst && nachher.oberste?.koaleszenz_schluessel === erwarteterSchluessel) {
      throw new Error(`Keine Koaleszenz trotz gleichem Schlüssel im Fenster (${aktion.befehl}).`)
    }
    if (landung === 'neu' && vorher.oberste?.koaleszenz_schluessel === erwarteterSchluessel && nachher.oberste?.koaleszenz_schluessel === erwarteterSchluessel && !imFenster) {
      zweige.push('koaleszenz.fensterAbgelaufen')
    }
  }
}

function serienAufrufAusfuehren(zweige: Zweig[], db: Tx, aufruf: SerienAufruf): ReturnType<typeof befehlBeobachtet> {
  switch (aufruf.name) {
    case 'person.feldSetzen':
      return befehlBeobachtet(zweige, db, 'person.feldSetzen', aufruf.ein)
    case 'name.aendern':
      return befehlBeobachtet(zweige, db, 'name.aendern', aufruf.ein)
    case 'ereignis.aendern':
      return befehlBeobachtet(zweige, db, 'ereignis.aendern', aufruf.ein)
    case 'partnerschaft.aendern':
      return befehlBeobachtet(zweige, db, 'partnerschaft.aendern', aufruf.ein)
    case 'elternschaft.aendern':
      return befehlBeobachtet(zweige, db, 'elternschaft.aendern', aufruf.ein)
    case 'aussage.aendern':
      return befehlBeobachtet(zweige, db, 'aussage.aendern', aufruf.ein)
    default: {
      const nieErreicht: never = aufruf
      throw new Error(`serienAufrufAusfuehren(): unbehandelt ${JSON.stringify(nieErreicht)}`)
    }
  }
}
