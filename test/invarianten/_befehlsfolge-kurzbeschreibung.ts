// AP-1.30 PR 9c-b (Prüfpfad-Folge zu #170, docs/80 §33 V-130-9c-b) — geschützter Prüfpfad
// (CLAUDE.md §5/§13, ADR-025). Kurzbeschreibungs-Teil des Befehlsfolge-Generators
// (`_befehlsfolge-generator.ts`): Aussagen am Prädikat `KURZBESCHREIBUNG_PRAEDIKAT`
// (src/core/person/praedikate.ts) mit Textwert, geschrieben auf den Wegen des Reiters „Person"
// (V-130-9c E5, `useAngabeSchreiben`): erstes Tippen legt an, Folgetippen ändert mit
// `feld: 'wertText'` (Autosave, koaleszierend), leer verlassen löscht. Ausgelagert wie
// `_befehlsfolge-datumswert.ts`: dieses Modul importiert den Generator NICHT; was es vom
// Generatorzustand braucht, beschreibt `KurzbeschreibungZustand` strukturell.
//
// WEGE (eine Aktion `kurzbeschreibung`, der Weg ist Teil der Aktion):
// - `anlegen`: `aussage.anlegen` an einer Person, nur `wertText` und `konfidenz`.
// - `aendern`: 1–4 Aufrufe `aussage.aendern` auf DIESELBE Kurzbeschreibung, je mit neuem `wertText`,
//   `feld: 'wertText'` und allen übrigen Feldern aus der gespeicherten Zeile (sonst vergibt der Bus
//   keinen Schlüssel). Zwischen den Aufrufen rückt die Testuhr um die generierten Abstände vor
//   (`_befehlsfolge-koaleszenz.ts`, Modul-Kommentar UHR) — teils im 2-s-Fenster (fasst zusammen),
//   teils darüber (neuer Undo-Schritt). Nach jedem Aufruf außer dem letzten `zwischenSchritt()`.
// - `loeschen`: `aussage.loeschen` der Kurzbeschreibung (leer verlassen) — samt Belegen, falls eine
//   Hauptfolgen-Aktion ihr einen angehängt hat (`aussage_zitat` CASCADE; mit dem Seed von
//   `undo-bitgleich` gemessen 0 Mal, darum kein eigener Deckungszweig — das Orakel prüft es trotzdem).
//
// VORLAUF: `aendern`/`loeschen` brauchen eine Kurzbeschreibung in DERSELBEN Folge. Gibt es keine oder
// ist `neuesZiel` gesetzt, legen sie zuerst eine an (zwei Befehle, zwei Undo-Schritte — nach dem
// Vorlauf `zwischenSchritt()`, Muster `_befehlsfolge-datumswert.ts`).
//
// ORAKEL (nicht nur Deckung), am Datenbankergebnis: nach `anlegen`/jedem `aendern`-Aufruf trägt die
// Zeile Prädikat, Subjekt und genau den gesendeten `wertText` (keine andere Wertspalte), und
// `aendern` hat keine andere Spalte verändert; nach `loeschen` ist die Zeile samt Belegverknüpfungen
// weg. Für `aendern` zusätzlich das Koaleszenz-Orakel aus `_befehlsfolge-koaleszenz.ts` (a)/(b):
// zusammengefasst NUR bei Schlüssel `aussage.aendern:<id>:wertText` der obersten Transaktion im
// Fenster, und umgekehrt MUSS ein solcher Aufruf zusammengefasst werden.
import fc from 'fast-check'
import type { Tx } from '../../src/main/repositories/basis'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import type { AussageZeile } from '../../src/main/repositories/aussage-repo'
import { KURZBESCHREIBUNG_PRAEDIKAT } from '../../src/core/person/praedikate'
import { KonfidenzSchema } from '../../src/shared/schemata/gemeinsam'
import type { AussageAendernEin } from '../../src/shared/schemata/befehle'
import { befehl, type Zweig } from './_befehlsfolge-beleg'
import { befehlBeobachtet, KOALESZENZ_FENSTER_MS, uhrVorruecken, type Testuhr } from './_befehlsfolge-koaleszenz'

/** Was dieses Modul vom Generatorzustand braucht (strukturell, s. Modul-Kommentar). */
export interface KurzbeschreibungZustand extends Testuhr {
  readonly personIds: readonly string[]
  readonly aussagen: readonly { readonly id: string }[]
  /** Nach jedem Befehl außer dem letzten einer Aktion (s. Modul-Kommentar VORLAUF/WEGE). */
  readonly zwischenSchritt: () => void
}

export type KurzbeschreibungWeg = 'anlegen' | 'aendern' | 'loeschen'

export interface AktionKurzbeschreibung {
  readonly art: 'kurzbeschreibung'
  readonly weg: KurzbeschreibungWeg
  readonly zielRoh: number
  readonly konfidenz: number
  readonly neuesZiel: boolean
  /** `anlegen` (und der Vorlauf) schreibt `texte[0]`; `aendern` schreibt je Aufruf einen Text. */
  readonly texte: readonly string[]
  /** Uhrvorschub VOR `aendern`-Aufruf i + 1 (Länge `texte.length - 1`). */
  readonly abstaendeMs: readonly number[]
}

/** Was die Aktion am Zustand bewirkt hat — der Generator trägt es in `zustand.aussagen` nach. */
export interface KurzbeschreibungWirkung {
  readonly angelegt: { readonly id: string; readonly subjektId: string } | undefined
  readonly geloescht: string | undefined
}

/** Kleine Wertemenge (Wiederholungen → auch inhaltsgleiche Aufrufe mitten im Tippen) plus freie
 * Texte; Apostroph, Umlaut, Kyrillisch, Emoji und Leerraum am Rand wie im Reiter. */
function textArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom('Schmied', 'Schmied in Hagen', "Wirt (lt. O'Brien)", 'Bäuerin', 'Учитель', 'Seemann 🚢', ' Küster ') },
    { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 16 }) },
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

/** Gewichte: `aendern` am höchsten (Koaleszenz-Zweige), `loeschen` doppelt (der neue Löschweg). */
export function kurzbeschreibungAktionArbitrary(): fc.Arbitrary<AktionKurzbeschreibung> {
  return fc
    .record({
      weg: fc.oneof(
        { weight: 1, arbitrary: fc.constant<KurzbeschreibungWeg>('anlegen') },
        { weight: 3, arbitrary: fc.constant<KurzbeschreibungWeg>('aendern') },
        { weight: 2, arbitrary: fc.constant<KurzbeschreibungWeg>('loeschen') },
      ),
      zielRoh: fc.nat(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      neuesZiel: fc.boolean(),
      anzahl: fc.integer({ min: 1, max: 4 }),
      texte: fc.array(textArbitrary(), { minLength: 4, maxLength: 4 }),
      abstaendeMs: fc.array(abstandArbitrary(), { minLength: 3, maxLength: 3 }),
    })
    .map(
      (r): AktionKurzbeschreibung => ({
        art: 'kurzbeschreibung',
        weg: r.weg,
        zielRoh: r.zielRoh,
        konfidenz: r.konfidenz,
        neuesZiel: r.neuesZiel,
        texte: r.texte.slice(0, r.anzahl),
        abstaendeMs: r.abstaendeMs.slice(0, r.anzahl - 1),
      }),
    )
}

function zielAus<T>(liste: readonly T[], roh: number): T | undefined {
  return liste.length === 0 ? undefined : liste[roh % liste.length]
}

function zeileLesen(db: Tx, id: string): AussageZeile {
  const zeile = aussageRepo.lesen(db, id)
  if (zeile === undefined) {
    throw new Error(`kurzbeschreibung: getrackte Aussage ${id} fehlt in der Datenbank.`)
  }
  return zeile
}

/** Getrackte Kurzbeschreibungen — Reihenfolge des Zustands (deterministisch). */
function kurzbeschreibungen(db: Tx, zustand: KurzbeschreibungZustand): readonly string[] {
  return zustand.aussagen.map((a) => a.id).filter((id) => zeileLesen(db, id).praedikat === KURZBESCHREIBUNG_PRAEDIKAT)
}

function textPruefen(zeile: AussageZeile, text: string, weg: KurzbeschreibungWeg): void {
  if (zeile.praedikat !== KURZBESCHREIBUNG_PRAEDIKAT || zeile.subjekt_typ !== 'person') {
    throw new Error(`kurzbeschreibung (${weg}): Prädikat oder Subjekttyp danach verändert.`)
  }
  if (zeile.wert_text !== text || zeile.wert_zahl !== null || zeile.wert_ref_id !== null) {
    throw new Error(`kurzbeschreibung (${weg}): die Zeile trägt danach nicht genau den gesendeten Text.`)
  }
}

/** Alle Spalten außer `wert_*` — `aendern` darf nur den Wert ersetzen. */
function ohneWert(zeile: AussageZeile): string {
  return JSON.stringify(
    Object.entries(zeile)
      .filter(([spalte]) => spalte !== 'wert_text' && spalte !== 'wert_zahl' && spalte !== 'wert_ref_id')
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

function anzahlBelege(db: Tx, aussageId: string): number {
  const zeile = db
    .prepare<{ readonly aussageId: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE aussage_id = @aussageId')
    .get({ aussageId })
  return zeile?.anzahl ?? 0
}

function anlegen(db: Tx, zweige: Zweig[], subjektId: string, text: string, konfidenz: number): string {
  const { id } = befehl(zweige, db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId,
    praedikat: KURZBESCHREIBUNG_PRAEDIKAT,
    wertText: text,
    konfidenz,
  })
  textPruefen(zeileLesen(db, id), text, 'anlegen')
  return id
}

/** Das Ziel von `aendern`/`loeschen`: eine bestehende Kurzbeschreibung oder (Vorlauf) eine neu angelegte. */
function ziel(
  db: Tx,
  zustand: KurzbeschreibungZustand,
  aktion: AktionKurzbeschreibung,
  zweige: Zweig[],
): { readonly id: string; readonly angelegt: KurzbeschreibungWirkung['angelegt'] } | undefined {
  const bestehend = zielAus(kurzbeschreibungen(db, zustand), aktion.zielRoh)
  if (bestehend !== undefined && !aktion.neuesZiel) {
    return { id: bestehend, angelegt: undefined }
  }
  const subjektId = zielAus(zustand.personIds, aktion.zielRoh)
  if (subjektId === undefined) {
    return undefined
  }
  const id = anlegen(db, zweige, subjektId, aktion.texte[0] ?? 'Schmied', aktion.konfidenz)
  zweige.push('kurzbeschreibung.anlegen')
  zustand.zwischenSchritt()
  return { id, angelegt: { id, subjektId } }
}

function ohneNull<T>(wert: T | null): T | undefined {
  return wert === null ? undefined : wert
}

/** Die Nutzlast des Reiters: neuer Text, alles andere aus der gespeicherten Zeile (s. `kurzbeschreibungAenderung`
 * in src/renderer/ansichten/profil/reiter-person-logik.ts — dort gehen die übrigen Felder über das Lesemodell
 * mit). `undefined`, wenn die Zeile keine Konfidenz trägt (der Vertrag verlangt eine; eine erfundene würde
 * mehr als den Text ändern). */
function aendernEin(zeile: AussageZeile, text: string): AussageAendernEin | undefined {
  if (zeile.konfidenz === null) {
    return undefined
  }
  return {
    id: zeile.id,
    wertText: text,
    konfidenz: KonfidenzSchema.parse(zeile.konfidenz),
    begruendung: ohneNull(zeile.begruendung),
    unsicherheit: ohneNull(zeile.unsicherheit),
    gueltigVon: ohneNull(zeile.gueltig_von),
    gueltigBis: ohneNull(zeile.gueltig_bis),
    ...(zeile.datum_modifikator !== null ? { datumBeibehalten: true as const } : {}), // Literal für `datumBeibehalten?: true`
    feld: 'wertText',
  }
}

/** Führt die Aktion aus (s. Modul-Kommentar); liefert, was der Generator nachtragen muss. */
export function kurzbeschreibungAusfuehren(db: Tx, zustand: KurzbeschreibungZustand, aktion: AktionKurzbeschreibung, zweige: Zweig[]): KurzbeschreibungWirkung {
  switch (aktion.weg) {
    case 'anlegen': {
      const subjektId = zielAus(zustand.personIds, aktion.zielRoh)
      if (subjektId === undefined) {
        return { angelegt: undefined, geloescht: undefined }
      }
      const id = anlegen(db, zweige, subjektId, aktion.texte[0] ?? 'Schmied', aktion.konfidenz)
      zweige.push('kurzbeschreibung.anlegen')
      return { angelegt: { id, subjektId }, geloescht: undefined }
    }

    case 'aendern': {
      const z = ziel(db, zustand, aktion, zweige)
      if (z === undefined) {
        return { angelegt: undefined, geloescht: undefined }
      }
      const erwarteterSchluessel = `aussage.aendern:${z.id}:wertText`
      for (let i = 0; i < aktion.texte.length; i += 1) {
        if (i > 0) {
          zustand.zwischenSchritt()
          uhrVorruecken(zustand, aktion.abstaendeMs[i - 1] ?? 0)
        }
        const text = aktion.texte[i] ?? ''
        const vorher = zeileLesen(db, z.id)
        const ein = aendernEin(vorher, text)
        if (ein === undefined) {
          return { angelegt: z.angelegt, geloescht: undefined }
        }
        // Eigene Zweigliste: `befehlBeobachtet` meldet auch `koaleszenz.*` — die zählen die Serie der
        // Hauptfolge (`undo-bitgleich`), und Kurzbeschreibungs-Treffer sollen deren Schwellen nicht auffüllen.
        const lokal: Zweig[] = []
        const beobachtet = befehlBeobachtet(lokal, db, 'aussage.aendern', ein)
        zweige.push(...lokal.filter((zweig) => zweig.startsWith('befehl:')))
        const nachher = zeileLesen(db, z.id)
        textPruefen(nachher, text, 'aendern')
        if (ohneWert(nachher) !== ohneWert(vorher)) {
          throw new Error('kurzbeschreibung (aendern): außer dem Wert hat sich eine Spalte verändert.')
        }
        const oberste = beobachtet.vorher.oberste
        const kandidatPasst =
          oberste !== undefined && zustand.uhrMs - oberste.zeitpunkt < KOALESZENZ_FENSTER_MS && oberste.koaleszenz_schluessel === erwarteterSchluessel
        // Koaleszenz-Orakel (a)/(b) wie `serieAusfuehren()` in `_befehlsfolge-koaleszenz.ts`.
        if (beobachtet.landung === 'zusammengefasst' && !kandidatPasst) {
          throw new Error(`kurzbeschreibung (aendern): zusammengefasst ohne Anlass (Schlüssel vorher ${String(oberste?.koaleszenz_schluessel)}).`)
        }
        if (beobachtet.landung === 'neu' && kandidatPasst && beobachtet.nachher.oberste?.koaleszenz_schluessel === erwarteterSchluessel) {
          throw new Error('kurzbeschreibung (aendern): keine Koaleszenz trotz gleichem Schlüssel im Fenster.')
        }
        if (beobachtet.landung === 'zusammengefasst') {
          zweige.push('kurzbeschreibung.aendern.zusammengefasst')
        } else if (beobachtet.landung === 'neu') {
          zweige.push('kurzbeschreibung.aendern.neuerSchritt')
        }
      }
      return { angelegt: z.angelegt, geloescht: undefined }
    }

    case 'loeschen': {
      const z = ziel(db, zustand, aktion, zweige)
      if (z === undefined) {
        return { angelegt: undefined, geloescht: undefined }
      }
      befehl(zweige, db, 'aussage.loeschen', { id: z.id })
      if (aussageRepo.lesen(db, z.id) !== undefined || anzahlBelege(db, z.id) !== 0) {
        throw new Error('kurzbeschreibung (loeschen): die Zeile oder ihre Belegverknüpfungen bestehen danach noch.')
      }
      zweige.push('kurzbeschreibung.loeschen')
      return { angelegt: z.angelegt, geloescht: z.id }
    }
  }
}
