// AP-1.30 PR 9b (Reiter „Person", Artboard 1a, Vorgaben §3.1; docs/80 §33 V-130-9-entscheidungen,
// V-E5-erhalt): reine Logik des Reiters — kein React, kein i18n (CLAUDE.md §2, Muster
// `profil-lebensdaten-logik.ts`). Die Ansicht (`reiter-person.tsx`) übersetzt und verdrahtet.
//
// - Lebensstatus: `person.feldSetzen lebend_status`. „nicht erfasst" (NULL) lässt sich anzeigen, aber
//   nicht zurücksetzen — der Befehl kennt kein NULL; die Option steht darum nur, solange nichts
//   erfasst ist.
// - Tod-Gruppe (D5): offen bei „verstorben"/„vermutet verstorben", eingeklappt bei „nicht erfasst",
//   ausgeblendet bei „lebend". Kein Löschbefehl — die Werte bleiben gespeichert.
// - Feldzustand je Lebensdatum: die führende Aussage (bearbeitbar), sonst der Wert des Ereignisses
//   (gesperrt, D3: „als Angabe übernehmen"/„Ereignis bearbeiten"), sonst leer. Woher der Wert kommt,
//   entscheidet allein der Kern über `person.detail.lebensdaten` (`lebensdatumAufloesen`).
// - Feldwarnungen (D7): am Feld; ist die Tod-Gruppe nicht sichtbar, am Lebensstatus.
// - Befehle: Änderungen über `aussageAendernEinAus` (profil-aussage-logik.ts, verlustfreie Rundreise);
//   Datum mit Koaleszenzfeld (Autosave), Ort und Sicherheit als Einzelschritte ohne Koaleszenz
//   (Auswahl wie Umschalter, V-130-4-autosave). Ein leeres Feld legt beim ersten Schreiben an (K).
import { formatiere } from '../../../core/datum/formatierer'
import type { Formatergebnis, Kalender } from '../../../core/datum/typen'
import { LEBENSDATUM_ANGABEN, lebensdatumArt, type LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { BestandHinweisCode } from '../../../core/plausibilitaet/regeln'
import type { AussageAendernEin, AussageAnlegenEin, PersonFeldSetzenEin } from '../../../shared/schemata/befehle'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from '../../../shared/schemata/gemeinsam'
import type { Datumswert as VertragsDatumswert } from '../../../shared/schemata/import-v1'
import type {
  PersonDetailAussage,
  PersonDetailAussageDatum,
  PersonDetailGrunddatenFeld,
  PersonDetailKopf,
  PersonDetailLebensdatum,
  PersonDetailWarnung,
} from '../../../shared/schemata/person-detail'
import type { AussageAenderung } from './profil-aussage-logik'
import { ereignisWert, herkunftSchluesselFuer, type EreignisWert, type HerkunftSchluessel } from './profil-lebensdaten-logik'

// ── Lebensstatus ──────────────────────────────────────────────────────────────────────────────

type LebendStatus = NonNullable<PersonDetailKopf['lebend_status']>

/** Wert des Auswahlfelds: die drei Statuswerte plus „nicht erfasst" für NULL. */
export type LebendStatusAuswahl = LebendStatus | 'nicht_erfasst'

const STATUS_WERTE: readonly LebendStatus[] = ['lebend', 'verstorben', 'vermutet_verstorben']

export function lebendStatusAuswahl(status: PersonDetailKopf['lebend_status']): LebendStatusAuswahl {
  return status ?? 'nicht_erfasst'
}

/** „nicht erfasst" nur, solange nichts erfasst ist: `person.feldSetzen` setzt kein NULL zurück. */
export function lebendStatusOptionen(status: PersonDetailKopf['lebend_status']): readonly LebendStatusAuswahl[] {
  return status === null ? [...STATUS_WERTE, 'nicht_erfasst'] : STATUS_WERTE
}

/** Alle Werte des Auswahlfelds (für die i18n-Vollständigkeit). */
export const LEBEND_STATUS_AUSWAHLEN: readonly LebendStatusAuswahl[] = [...STATUS_WERTE, 'nicht_erfasst']

/** i18n-Schlüssel (profil.json) je Auswahl — geschlossener `switch` wie `geschlechtSchluessel`. */
export function lebendStatusSchluessel(auswahl: LebendStatusAuswahl): string {
  switch (auswahl) {
    case 'lebend':
      return 'lebend_status_lebend'
    case 'verstorben':
      return 'lebend_status_verstorben'
    case 'vermutet_verstorben':
      return 'lebend_status_vermutet_verstorben'
    case 'nicht_erfasst':
      return 'lebend_status_nicht_erfasst'
  }
}

/** Alle Schlüssel von `todGruppeGrundSchluessel` (für die i18n-Vollständigkeit). */
export const TOD_GRUPPE_GRUND_SCHLUESSEL = [
  'tod_gruppe_grund_verstorben',
  'tod_gruppe_grund_vermutet_verstorben',
  'tod_gruppe_grund_nicht_erfasst',
  'tod_gruppe_grund_von_hand',
] as const

/** Beschriftung neben „Tod", warum die Gruppe zu sehen bzw. eingeklappt ist (Entwurf: „erscheint,
 * weil der Lebensstatus ‚verstorben' ist"). `null` bei ausgeblendeter Gruppe (keine Überschrift). */
export function todGruppeGrundSchluessel(
  status: PersonDetailKopf['lebend_status'],
  zustand: TodGruppeZustand,
): (typeof TOD_GRUPPE_GRUND_SCHLUESSEL)[number] | null {
  if (status === 'verstorben') return 'tod_gruppe_grund_verstorben'
  if (status === 'vermutet_verstorben') return 'tod_gruppe_grund_vermutet_verstorben'
  switch (zustand) {
    case 'offen':
      return 'tod_gruppe_grund_von_hand'
    case 'eingeklappt':
      return 'tod_gruppe_grund_nicht_erfasst'
    case 'ausgeblendet':
      return null
  }
}

/** `null` für „nicht erfasst" — dafür gibt es keinen Befehl. */
export function personFeldLebendStatusEin(id: string, auswahl: LebendStatusAuswahl): PersonFeldSetzenEin | null {
  return auswahl === 'nicht_erfasst' ? null : { id, feld: 'lebend_status', wert: auswahl }
}

// ── Tod-Gruppe (D5) ────────────────────────────────────────────────────────────────────────────

export type TodGruppeZustand = 'offen' | 'eingeklappt' | 'ausgeblendet'

/**
 * `geoeffnetBei` = der Status, bei dem die Gruppe von Hand eingeblendet wurde („Tod-Angaben
 * einblenden"); das gilt nur, solange der Status gleich bleibt — ein Statuswechsel setzt die Regel
 * wieder in Kraft (auf „lebend" gestellt verschwindet die Gruppe, auch wenn sie vorher aufgeklappt war).
 */
export function todGruppeZustand(status: PersonDetailKopf['lebend_status'], geoeffnetBei: LebendStatusAuswahl | null): TodGruppeZustand {
  if (status === 'verstorben' || status === 'vermutet_verstorben') return 'offen'
  if (geoeffnetBei === lebendStatusAuswahl(status)) return 'offen'
  return status === null ? 'eingeklappt' : 'ausgeblendet'
}

// ── Feldzustand je Lebensdatum ────────────────────────────────────────────────────────────────

export type LebensdatumFeld =
  | { readonly art: 'leer'; readonly angabe: LebensdatumAngabe }
  | { readonly art: 'aussage'; readonly angabe: LebensdatumAngabe; readonly feld: PersonDetailGrunddatenFeld; readonly aussage: PersonDetailAussage }
  | {
      readonly art: 'ereignis'
      readonly angabe: LebensdatumAngabe
      readonly lebensdatum: PersonDetailLebensdatum
      readonly ereignisId: string
      readonly herkunftSchluessel: HerkunftSchluessel
      readonly wert: EreignisWert
    }

/** Bevorzugte, sonst erste Aussage (Ladereihenfolge `ORDER BY praedikat, id`). */
function vorrangigeAussage(feld: PersonDetailGrunddatenFeld): PersonDetailAussage | undefined {
  return feld.aussagen.find((aussage) => aussage.ist_bevorzugt) ?? feld.aussagen[0]
}

/**
 * Welcher Wert steht im Feld dieser Angabe? Führt eine Aussage (`herkunft = 'aussage'`), ist es genau
 * diese; führt ein Ereignis, sein Wert (gesperrt). Ohne Herkunft, aber mit einer Aussage ohne
 * tragenden Wert (Altbestand, z. B. eine Orts-Aussage nur mit Zahl, V-5-altbestand) bleibt diese
 * Aussage bearbeitbar — so lässt sie sich reparieren, statt unerreichbar zu werden.
 */
export function lebensdatumFeld(
  angabe: LebensdatumAngabe,
  grunddaten: readonly PersonDetailGrunddatenFeld[],
  lebensdaten: readonly PersonDetailLebensdatum[],
): LebensdatumFeld {
  const feld = grunddaten.find((kandidat) => kandidat.praedikat === angabe)
  const eintrag = lebensdaten.find((kandidat) => kandidat.angabe === angabe)
  if (eintrag?.herkunft === 'aussage' && feld !== undefined) {
    const aussage = feld.aussagen.find((kandidat) => kandidat.aussage_id === eintrag.aussage_id)
    if (aussage !== undefined) return { art: 'aussage', angabe, feld, aussage }
  }
  if (eintrag?.herkunft === 'ereignis' && eintrag.ereignis_id !== null) {
    return { art: 'ereignis', angabe, lebensdatum: eintrag, ereignisId: eintrag.ereignis_id, herkunftSchluessel: herkunftSchluesselFuer(angabe), wert: ereignisWert(eintrag) }
  }
  const altbestand = feld === undefined ? undefined : vorrangigeAussage(feld)
  if (feld !== undefined && altbestand !== undefined) return { art: 'aussage', angabe, feld, aussage: altbestand }
  return { art: 'leer', angabe }
}

// ── Feldwarnungen (D7) ─────────────────────────────────────────────────────────────────────────

/** Wo eine Warnung im Reiter erscheint: an einem Lebensdatum, am Lebensstatus (Tod-Gruppe nicht
 * sichtbar) oder oben im Reiter (ein Feld, das der Reiter nicht zeigt — nie still verworfen). */
export type WarnungsZiel = LebensdatumAngabe | 'lebend_status' | 'reiter'

export type WarnungsZuordnung = { readonly [Z in WarnungsZiel]: readonly BestandHinweisCode[] }

function istLebensdatumAngabe(feld: string): feld is LebensdatumAngabe {
  return LEBENSDATUM_ANGABEN.some((angabe) => angabe === feld)
}

/** Nur Warnungen des Reiters „person", in der gelieferten Reihenfolge; Mehrfachfunde bleiben. */
export function warnungenZuordnen(warnungen: readonly PersonDetailWarnung[], todSichtbar: boolean): WarnungsZuordnung {
  const ziele: Record<WarnungsZiel, BestandHinweisCode[]> = { geburtsdatum: [], geburtsort: [], todesdatum: [], todesort: [], lebend_status: [], reiter: [] }
  for (const warnung of warnungen) {
    if (warnung.reiter !== 'person') continue
    const feld = warnung.feld
    if (!istLebensdatumAngabe(feld)) {
      ziele.reiter.push(warnung.code)
    } else if (lebensdatumArt(feld) === 'tod' && !todSichtbar) {
      ziele.lebend_status.push(warnung.code)
    } else {
      ziele[feld].push(warnung.code)
    }
  }
  return ziele
}

// ── Datum (D10) ────────────────────────────────────────────────────────────────────────────────

export type DatumAnzeige = { readonly art: 'formatiert'; readonly ergebnis: Formatergebnis } | { readonly art: 'text'; readonly text: string } | { readonly art: 'leer' }

/** Die gespeicherte Datumsgruppe über den Formatierer (der Originaltext gewinnt, `formatiere`).
 * Eine Gruppe, die sich nicht als Datum lesen lässt (unbekannte Enum-Werte, fehlende Sortierwerte —
 * Altbestand), zeigt ihren Originaltext bzw. `wert1` roh statt zu raten. */
export function datumsgruppeAnzeige(gruppe: PersonDetailAussageDatum): DatumAnzeige {
  const kalender = KalenderEnum.safeParse(gruppe.kalender)
  const modifikator = DatumModifikatorEnum.safeParse(gruppe.modifikator)
  const praezision = DatumPraezisionEnum.safeParse(gruppe.praezision)
  if (kalender.success && modifikator.success && praezision.success && gruppe.wert1 !== null && gruppe.sort_von !== null && gruppe.sort_bis !== null) {
    return {
      art: 'formatiert',
      ergebnis: formatiere({
        kalender: kalender.data,
        modifikator: modifikator.data,
        praezision: praezision.data,
        wert1: gruppe.wert1,
        sortVon: gruppe.sort_von,
        sortBis: gruppe.sort_bis,
        ...(gruppe.wert2 === null ? {} : { wert2: gruppe.wert2 }),
        ...(gruppe.originaltext === null ? {} : { originaltext: gruppe.originaltext }),
      }),
    }
  }
  const roh = gruppe.originaltext ?? gruppe.wert1
  return roh === null ? { art: 'leer' } : { art: 'text', text: roh }
}

/** Anzeige einer Datums-Aussage: die Datumsgruppe; ohne sie (Altbestand „nur Text") der Wert selbst. */
export function aussageDatumAnzeige(aussage: PersonDetailAussage): DatumAnzeige {
  if (aussage.datum !== null) return datumsgruppeAnzeige(aussage.datum)
  return aussage.wert === null ? { art: 'leer' } : { art: 'text', text: aussage.wert }
}

export function aussageKalender(aussage: PersonDetailAussage): Kalender {
  const kalender = KalenderEnum.safeParse(aussage.datum?.kalender)
  return kalender.success ? kalender.data : 'gregorian'
}

// Freitext → Vertrags-Datumswert: `datumswertAusText` (src/renderer/bausteine/datumsfeld-logik.ts),
// die eine gemeinsame Regel für Reiter Person, Ereignisformular und Gesprächsdatum (U-130-9b).

/** Neues Datum an einer Datums-Aussage. Die Datumsgruppe IST der Wert (D1): ein Altbestands-Wert
 * (`wertText '1900'`, Zahl) wird mit entfernt, sonst stünden zwei Wahrheiten nebeneinander. */
export function datumAenderung(aussage: PersonDetailAussage, datum: VertragsDatumswert): AussageAenderung {
  return {
    datum,
    ...(aussage.wert_text === null ? {} : { wertText: null }),
    ...(aussage.wert_zahl === null ? {} : { wertZahl: null }),
  }
}

// ── Ort (Ortsverweis, E5) ──────────────────────────────────────────────────────────────────────

/** Text im Ortsfeld: Ortsname (Verweis) oder freier Ortstext; eine Zahl ist kein Ort (V-130-1-altbestand). */
export function ortAnzeigeText(aussage: PersonDetailAussage): string {
  if (aussage.wert_ref_id === null && aussage.wert_text === null) return ''
  return aussage.wert ?? ''
}

/** Gewählter Ort. Das Datum bleibt unangetastet (E5-Vorgabe: `datumBeibehalten`, weil die Änderung
 * `datum` nicht nennt); freier Text oder Zahl weichen dem Verweis (genau ein Wert). */
export function ortAenderung(aussage: PersonDetailAussage, ortId: string): AussageAenderung {
  return {
    wertRefId: ortId,
    ...(aussage.wert_text === null ? {} : { wertText: null }),
    ...(aussage.wert_zahl === null ? {} : { wertZahl: null }),
  }
}

// ── Befehle ────────────────────────────────────────────────────────────────────────────────────

/** Einzelschritt ohne Koaleszenz (Sicherheit, Ortswahl, „Datum entfernen"): ohne `feld` fasst der Bus
 * nie mit einem vorigen Aufruf zusammen (V-130-4-autosave: Auswahlen bleiben Einzelschritte). */
export function ohneKoaleszenz(ein: AussageAendernEin): AussageAendernEin {
  // Eine veränderbare Kopie, damit der Schlüssel wirklich fehlt (nicht `feld: undefined`) und jedes
  // andere — auch ein künftiges — Vertragsfeld unverändert mitgeht.
  const kopie: { -readonly [K in keyof AussageAendernEin]: AussageAendernEin[K] } = { ...ein }
  delete kopie.feld
  return kopie
}

/** Sicherheit einer neu angelegten Angabe, solange es keine Vorgaben-Einstellung gibt (S-18
 * „Konfidenz-Vorgaben je Quellenart", später): „unsicher" — eine unbelegte Direkteingabe. Sichtbar
 * und sofort änderbar im Wähler daneben. */
export const KONFIDENZ_VORGABE = 2

export type AnlegeWert = { readonly datum: VertragsDatumswert } | { readonly wertRefId: string } | { readonly wertText: string }

export function aussageAnlegenEinFuer(personId: string, praedikat: LebensdatumAngabe, wert: AnlegeWert, konfidenz: number): AussageAnlegenEin {
  return { subjektTyp: 'person', subjektId: personId, praedikat, ...wert, konfidenz }
}

/** Lesestand einer eben angelegten Aussage, solange das Lesemodell sie noch nicht liefert — damit
 * eine Folgeänderung DIESE Aussage ändert statt eine zweite anzulegen (K). Enthält genau, was
 * `aussage.anlegen` geschrieben hat; die Datumsgruppe bleibt leer, weil `aussageAendernEinAus` sie
 * nur für `datumBeibehalten` bräuchte und der Server sie dann selbst behält. */
export function aussageAusAngelegt(id: string, ein: AussageAnlegenEin): PersonDetailAussage {
  return {
    aussage_id: id,
    wert: ein.wertText ?? null,
    wert_text: ein.wertText ?? null,
    wert_zahl: ein.wertZahl ?? null,
    wert_ref_id: ein.wertRefId ?? null,
    datum: null,
    konfidenz: ein.konfidenz,
    ist_bevorzugt: false,
    begruendung: ein.begruendung ?? null,
    unsicherheit: ein.unsicherheit ?? null,
    gueltig_von: ein.gueltigVon ?? null,
    gueltig_bis: ein.gueltigBis ?? null,
    belege: [],
  }
}

/**
 * „als Angabe übernehmen" (D3): der Wert des Ereignisses als eigene Aussage, die dann führt. Datum:
 * die Datumsgruppe des Ereignisses; nur ein Originaltext → als Text (an Datumsprädikaten ein Wert, D1).
 * Ort: der Ortsverweis. `null`, wenn nichts Übernehmbares da ist (dann erscheint die Aktion nicht).
 * Sicherheit und Belege des Ereignisses liefert das Lesemodell nicht (U-130-1-ereignis-konfidenz) —
 * die Aussage bekommt die Vorgabe.
 */
export function uebernahmeAusEreignis(personId: string, lebensdatum: PersonDetailLebensdatum): AussageAnlegenEin | null {
  const angabe = lebensdatum.angabe
  if (angabe === 'geburtsort' || angabe === 'todesort') {
    return lebensdatum.ort_id === null ? null : aussageAnlegenEinFuer(personId, angabe, { wertRefId: lebensdatum.ort_id }, KONFIDENZ_VORGABE)
  }
  const gruppe = lebensdatum.datum
  if (gruppe !== null) {
    if (gruppe.modifikator !== 'exakt' && gruppe.originaltext === null) return null
    const datum: VertragsDatumswert = {
      kalender: gruppe.kalender,
      modifikator: gruppe.modifikator,
      praezision: gruppe.praezision,
      wert1: gruppe.wert1,
      ...(gruppe.wert2 === null ? {} : { wert2: gruppe.wert2 }),
      ...(gruppe.originaltext === null ? {} : { original_text: gruppe.originaltext }),
    }
    return aussageAnlegenEinFuer(personId, angabe, { datum }, KONFIDENZ_VORGABE)
  }
  return lebensdatum.datum_originaltext === null ? null : aussageAnlegenEinFuer(personId, angabe, { wertText: lebensdatum.datum_originaltext }, KONFIDENZ_VORGABE)
}
