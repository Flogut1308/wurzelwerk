// AP-1.30 (PR 8), Artboard 1a „rechte Spalte" (docs/design/Entwicklungsvorgaben Person bearbeiten
// & Medien.md §3.1): reine Aufbereitung für Vollständigkeit, offene Punkte und Verlauf — React- und
// DOM-frei (Muster `editor-speicherstatus-logik.ts`), die Darstellung liegt in `editor-rechte-spalte.tsx`.
//
// Grenzen:
// - Vollständigkeit wird NICHT berechnet (ADR-031): Prozent, erfüllt, anwendbar und die
//   Aufschlüsselung kommen aus `person.detail.kernangaben`; hier wird nur gezählt, wie viele der
//   gelieferten Zustände `belegt` lauten, und jedem Zustand sein Wort zugeordnet.
// - Verlauf: nie der Dateipfad eines Imports (steht in `transaktion.beschreibung`, „Import <pfad>"),
//   nie ein Benutzername (ADR-001), reine Gesundheitseinträge ohne Inhalt (M-08, `beschreibung = null`).
import type { KernangabeId, KernangabeZustand } from '../../../core/person/kernangaben'
import type { EditorFeld, OffenerPunktSchluessel } from '../../../core/person/offene-punkte'
import type { ReiterId } from '../../../core/person/reiter'
import { transaktionsBeschreibungUebersetzen, transaktionsBeschreibungZerlegen, type BeschreibungUebersetzer } from '../../../shared/i18n/transaktions-beschreibung'
import type { TransaktionArt, VerlaufEintrag } from '../../../shared/ipc/vertrag'
import type { PersonDetailBeziehung, PersonDetailKernangaben, PersonDetailOffenerPunkt } from '../../../shared/schemata/person-detail'
import { relativeSpeicherzeit, type RelativeSpeicherzeit } from '../../bausteine/speicherstatus-logik'

// ------------------------------------------------------------------------------------------------
// Vollständigkeit
// ------------------------------------------------------------------------------------------------

export interface VollstaendigkeitZeile {
  readonly id: KernangabeId
  readonly zustand: KernangabeZustand
  /** `profil.json`-Schlüssel des Namens der Kernangabe. */
  readonly nameSchluessel: string
  /** `profil.json`-Schlüssel des Zustandsworts. */
  readonly zustandSchluessel: string
}

export interface VollstaendigkeitAnzeige {
  readonly prozent: number
  readonly erfuellt: number
  readonly anwendbar: number
  /** Anzahl der Zeilen mit Zustand `belegt` (reine Zählung der gelieferten Zustände). */
  readonly belegt: number
  /** Gleiche Reihenfolge wie `kernangaben.aufschluesselung` (`elternteil` ggf. zweimal). */
  readonly zeilen: readonly VollstaendigkeitZeile[]
}

export function kernangabeNameSchluessel(id: KernangabeId): string {
  switch (id) {
    case 'name':
      return 'kernangabe_name'
    case 'geschlecht':
      return 'kernangabe_geschlecht'
    case 'geburtsdatum':
      return 'kernangabe_geburtsdatum'
    case 'geburtsort':
      return 'kernangabe_geburtsort'
    case 'todesdatum':
      return 'kernangabe_todesdatum'
    case 'todesort':
      return 'kernangabe_todesort'
    case 'vater':
      return 'kernangabe_vater'
    case 'mutter':
      return 'kernangabe_mutter'
    case 'elternteil':
      return 'kernangabe_elternteil'
  }
}

/** `belegt` → „belegt", `vorhanden` → „erfasst", `unbelegt` → „Beleg fehlt", `fehlt` → „fehlt". */
export function kernangabeZustandSchluessel(zustand: KernangabeZustand): string {
  switch (zustand) {
    case 'belegt':
      return 'kernangabe_zustand_belegt'
    case 'vorhanden':
      return 'kernangabe_zustand_vorhanden'
    case 'unbelegt':
      return 'kernangabe_zustand_unbelegt'
    case 'fehlt':
      return 'kernangabe_zustand_fehlt'
  }
}

/** `null` = Platzhalter (A-17: keine Vollständigkeit, kein 0 %). */
export function vollstaendigkeitAnzeige(kernangaben: PersonDetailKernangaben | null): VollstaendigkeitAnzeige | null {
  if (kernangaben === null) return null
  return {
    prozent: kernangaben.prozent,
    erfuellt: kernangaben.erfuellt,
    anwendbar: kernangaben.anwendbar,
    belegt: kernangaben.aufschluesselung.filter((eintrag) => eintrag.zustand === 'belegt').length,
    zeilen: kernangaben.aufschluesselung.map((eintrag) => ({
      id: eintrag.id,
      zustand: eintrag.zustand,
      nameSchluessel: kernangabeNameSchluessel(eintrag.id),
      zustandSchluessel: kernangabeZustandSchluessel(eintrag.zustand),
    })),
  }
}

// ------------------------------------------------------------------------------------------------
// Offene Punkte
// ------------------------------------------------------------------------------------------------

export interface OffenerPunktZeile {
  readonly meldungsschluessel: OffenerPunktSchluessel
  readonly reiter: ReiterId
  readonly feld: EditorFeld
  /** Name der betroffenen Person (z. B. das Kind bei „Kind ohne Partnerschaft"), sonst `null`. */
  readonly bezugName: string | null
}

/**
 * Offene Punkte in der gelieferten Reihenfolge (Regelreihenfolge). Mehrfachpunkte einer Regel
 * bleiben einzeln; zeigt `bezug_id` auf eine Person in `beziehungen` mit Anzeigenamen, wird der
 * Name ergänzt — sonst steht der Punkt ohne Zusatz (auch mehrfach).
 */
export function offenePunkteZeilen(punkte: readonly PersonDetailOffenerPunkt[], beziehungen: readonly PersonDetailBeziehung[]): readonly OffenerPunktZeile[] {
  return punkte.map((punkt) => {
    const bezug = punkt.bezug_id === null ? undefined : beziehungen.find((beziehung) => beziehung.person_id === punkt.bezug_id)
    const name = bezug === undefined ? '' : bezug.anzeigename.trim()
    return {
      meldungsschluessel: punkt.meldungsschluessel,
      reiter: punkt.reiter,
      feld: punkt.feld,
      bezugName: name === '' ? null : name,
    }
  })
}

/**
 * Sprungziel eines offenen Punkts: das Feld mit `feldElementId` (`editorFeldId`), wenn der Reiter
 * es rendert, sonst der Inhaltsbereich des Reiters (Reiter ohne dieses Feld zeigen ihren Inhalt
 * bzw. Leerzustand; der Fokus landet dann auf dem `tabpanel`).
 */
export function sprungzielElement<T>(feldElementId: string, panelElementId: string, finde: (id: string) => T | null): T | null {
  return finde(feldElementId) ?? finde(panelElementId)
}

// ------------------------------------------------------------------------------------------------
// Verlauf
// ------------------------------------------------------------------------------------------------

/** So viele Einträge zeigt die Spalte (Artboard 1a: „3 Einträge"). */
export const VERLAUF_ANZEIGE_ANZAHL = 3

/**
 * So viele Einträge werden abgefragt: `abfrage:journal.verlauf` liefert auch zurückgenommene und
 * verworfene Transaktionen (Status unverändert), die Spalte zeigt nur angewendete. Mit etwas
 * Vorrat bleiben nach einigen Rücknahmen trotzdem drei übrig; die Kosten der Abfrage hängen an der
 * Journalgröße (ein Durchlauf über `aenderung`), kaum an der Grenze (docs/80 §33 V-130-5-verlauf).
 */
export const VERLAUF_ABFRAGE_GRENZE = 10

export type VerlaufText =
  | { readonly art: 'import'; readonly anzahl: number }
  | { readonly art: 'geschuetzt' }
  | { readonly art: 'beschreibung'; readonly beschreibung: string }
  | { readonly art: 'ohne_beschreibung'; readonly transaktionArt: TransaktionArt }

export type VerlaufZeit =
  | { readonly art: 'relativ'; readonly relativ: RelativeSpeicherzeit }
  | { readonly art: 'absolut'; readonly zeitpunkt: number }

export interface VerlaufZeile {
  readonly id: string
  readonly text: VerlaufText
  readonly zeit: VerlaufZeit
}

const TAG_MS = 24 * 60 * 60 * 1000

/** Bis 24 Stunden relativ (Formen des Speicherstatus), danach absolut. */
export function verlaufZeit(zeitpunkt: number, jetzt: number): VerlaufZeit {
  if (jetzt - zeitpunkt >= TAG_MS) return { art: 'absolut', zeitpunkt }
  return { art: 'relativ', relativ: relativeSpeicherzeit(zeitpunkt, jetzt) }
}

/**
 * Welcher Text zu einem Eintrag gehört. Ein Import ist immer „Import · n Änderungen" — seine
 * Beschreibung trägt den Dateipfad und wird nie gelesen. `beschreibung = null` (nur
 * Gesundheitsdaten, M-08) → „Geschützte Angaben geändert". Sonst nur ein `journal.*`-Schlüssel;
 * jeder andere Wert (freier Text, fremder Namensraum) wird nicht gezeigt, stattdessen die Art.
 */
export function verlaufText(eintrag: VerlaufEintrag): VerlaufText {
  if (eintrag.art === 'import') return { art: 'import', anzahl: eintrag.anzahl }
  if (eintrag.beschreibung === null) return { art: 'geschuetzt' }
  const teile = transaktionsBeschreibungZerlegen(eintrag.beschreibung)
  if (teile === null || teile.namensraum !== 'journal') return { art: 'ohne_beschreibung', transaktionArt: eintrag.art }
  return { art: 'beschreibung', beschreibung: eintrag.beschreibung }
}

/** Nur angewendete Einträge (zurückgenommene/verworfene nicht), neueste zuerst wie geliefert, gekürzt. */
export function verlaufZeilen(eintraege: readonly VerlaufEintrag[], jetzt: number, anzahl: number = VERLAUF_ANZEIGE_ANZAHL): readonly VerlaufZeile[] {
  return eintraege
    .filter((eintrag) => eintrag.status === 'angewendet')
    .slice(0, anzahl)
    .map((eintrag) => ({ id: eintrag.id, text: verlaufText(eintrag), zeit: verlaufZeit(eintrag.zeitpunkt, jetzt) }))
}

function transaktionArtSchluessel(art: TransaktionArt): string {
  switch (art) {
    case 'nutzer':
      return 'verlauf_art_nutzer'
    case 'import':
      return 'verlauf_art_import'
    case 'merge':
      return 'verlauf_art_merge'
    case 'migration':
      return 'verlauf_art_migration'
    case 'wartung':
      return 'verlauf_art_wartung'
    case 'platzhalter_aufgeloest':
      return 'verlauf_art_platzhalter_aufgeloest'
  }
}

export function verlaufTextUebersetzen(text: VerlaufText, t: BeschreibungUebersetzer): string {
  switch (text.art) {
    case 'import':
      return text.anzahl === 0 ? t('verlauf_import_ohne_anzahl', { ns: 'profil' }) : t('verlauf_import', { ns: 'profil', count: text.anzahl })
    case 'geschuetzt':
      return t('verlauf_geschuetzt', { ns: 'profil' })
    case 'beschreibung':
      return transaktionsBeschreibungUebersetzen(t, text.beschreibung)
    case 'ohne_beschreibung':
      return t(transaktionArtSchluessel(text.transaktionArt), { ns: 'profil' })
  }
}

function zweistellig(zahl: number): string {
  return String(zahl).padStart(2, '0')
}

/** Relative Zeit mit den Formen des Speicherstatus (`allgemein.json`), absolute als Datum + Uhrzeit
 * in Ortszeit (`profil.json` `verlauf_zeit_absolut`). */
export function verlaufZeitUebersetzen(zeit: VerlaufZeit, t: BeschreibungUebersetzer): string {
  if (zeit.art === 'absolut') {
    const datum = new Date(zeit.zeitpunkt)
    return t('verlauf_zeit_absolut', {
      ns: 'profil',
      tag: zweistellig(datum.getDate()),
      monat: zweistellig(datum.getMonth() + 1),
      jahr: String(datum.getFullYear()),
      stunde: zweistellig(datum.getHours()),
      minute: zweistellig(datum.getMinutes()),
    })
  }
  switch (zeit.relativ.art) {
    case 'gerade_eben':
      return t('speicherstatus_zeit_gerade_eben', { ns: 'allgemein' })
    case 'minuten':
      return t('speicherstatus_zeit_minuten', { ns: 'allgemein', count: zeit.relativ.anzahl })
    case 'stunden':
      return t('speicherstatus_zeit_stunden', { ns: 'allgemein', count: zeit.relativ.anzahl })
  }
}
