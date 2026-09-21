// AP-1.17 PR-C1 (docs/71_Designsystem.md §3.2-Muster, docs/80_Offene_Fragen.md §29): reine
// Umrechnungen für die Quelle/Zitat/Archiv-Pflege-Ansicht (`quelle-bearbeiten.tsx`) — Muster
// `ort-bearbeiten-logik.ts`/`profil-bearbeiten-logik.ts`. Kein React/DOM, kein Node/Electron/SQL
// (`src/renderer` bleibt frei davon, CLAUDE.md §2).
//
// `gespraechsdatum` (§2.15, mündlich-Block) läuft über dieselbe Textinterpretation wie ein
// Ereignisdatum (`parse()`/`formatiere()`, `src/core/datum`) — KEINE zweite Parselogik, Muster
// `ereignisDatumwertAusEntwurf` (`profil-bearbeiten-logik.ts`).
//
// Zitat-Felder außerhalb dieses Formulars (`band`/`jahr`/`zugriffsdatum_*`/`zeitmarke_sekunden`/
// `uebersetzung`/`medium_id`): NICHT im Formular editierbar (Auftragsumfang: nur `seite`/
// `eintragsnummer`/`transkript`/`digitalisat_url`/`konfidenz`), aber beim Bearbeiten eines
// bestehenden Zitats unverändert durchgereicht (`ZitatVerborgeneFelder`) — sonst würde
// `befehl:zitat.aendern` (patcht ALLE editierbaren Spalten in einem Schritt, kein Teil-Patch) eine
// z. B. beim Import gesetzte `band`/`zugriffsdatum`-Angabe stillschweigend löschen, exakt dieselbe
// Gefahr, die `OrtsnameEntwurfWerte.sprache`/`.originalText` (`ort-bearbeiten-logik.ts`) vermeidet.
import type { z } from 'zod'
import { parse } from '../../../core/datum/parser'
import type { Kalender } from '../../../core/datum/typen'
import type {
  QuelleAendernEin,
  QuelleAnlegenEin,
  ZitatAendernEin,
  ZitatAnlegenEin,
} from '../../../shared/schemata/befehle'
import type { Datumswert as VertragsDatumswert } from '../../../shared/schemata/import-v1'
import { InformationsartEnum, QuelleArtEnum, QuelleFormEnum, QuelleTypEnum, UnmittelbarkeitEnum } from '../../../shared/schemata/quelle'
import type { QuelleDetailKopf, QuelleDetailZitat } from '../../../shared/schemata/quelle-detail'
import type { KonfidenzStufe } from '../../bausteine/konfidenz-punkt'

function textOderUndefined(wert: string): string | undefined {
  const getrimmt = wert.trim()
  return getrimmt === '' ? undefined : wert
}

/** `true` bei leerem Text (kein Datum, erlaubt) oder von `parse()` auflösbarem Text — dieselbe
 * Zusicherung wie `ereignisEntwurfDatumIstGueltig`/`gueltigkeitTextIstGueltig`. */
export function datumTextIstGueltig(text: string): boolean {
  return text.trim() === '' || parse(text).ok
}

/** Baut den Vertrags-`Datumswert` aus roher Texteingabe (Muster `ereignisDatumwertAusEntwurf`,
 * `profil-bearbeiten-logik.ts`) — hier für `quelle.gespraechsdatum` (§2.15). `undefined` bei
 * leerem/nicht auflösbarem Text. */
export function gespraechsdatumAusEntwurf(text: string, kalender: Kalender): VertragsDatumswert | undefined {
  if (text.trim() === '') return undefined
  const ergebnis = parse(text)
  if (!ergebnis.ok) return undefined
  return {
    kalender,
    modifikator: ergebnis.wert.modifikator,
    praezision: ergebnis.wert.praezision,
    wert1: ergebnis.wert.wert1,
    wert2: ergebnis.wert.wert2,
    original_text: ergebnis.wert.originaltext,
    doppeljahr: ergebnis.wert.doppeljahr,
  }
}

// -----------------------------------------------------------------------------------------------
// Quelle-Stammfelder (§2.7 + §2.15 mündlich-Block) — `befehl:quelle.anlegen`/`befehl:quelle.aendern`
// -----------------------------------------------------------------------------------------------

/** `''` = „nicht angegeben" (kein Enum-Wert), analog `SchriftAuswahlWert`
 * (`profil-bearbeiten-logik.ts`) — die drei optionalen Enum-Felder von `quelle` kennen keinen
 * Vorgabewert. */
export type QuelleArtAuswahlWert = '' | z.infer<typeof QuelleArtEnum>
export type InformationsartAuswahlWert = '' | z.infer<typeof InformationsartEnum>
export type QuelleFormAuswahlWert = '' | z.infer<typeof QuelleFormEnum>
export type UnmittelbarkeitAuswahlWert = '' | z.infer<typeof UnmittelbarkeitEnum>

export interface QuelleKopfEntwurfWerte {
  readonly typ: z.infer<typeof QuelleTypEnum>
  readonly titel: string
  readonly autor: string
  readonly verlag: string
  readonly jahrText: string
  readonly art: QuelleArtAuswahlWert
  readonly informationsart: InformationsartAuswahlWert
  readonly signatur: string
  readonly notiz: string
  /** Archiv-Auswahl (`Archivfeld`) — NUR die fachliche Auswahl. Die angezeigte Sucheingabe/der
   * gewählte Name bleibt bewusst AUSSERHALB dieses debounce-committeten Objekts (eigener lokaler
   * `useState` in der Komponente, Muster `ZugehoerigkeitNeuFormular.ortSuchtext`) — sonst würde
   * jeder Tastendruck während der Archivsuche nach 600 ms einen inhaltlich unveränderten
   * `quelle.aendern`-Aufruf auslösen und die Undo-Historie mit No-op-Schritten füllen. */
  readonly archivId: string | null
  /** Mündlich-Block (§2.15) — bewusst NICHT auf `typ === 'muendlich'` beschränkt (derselbe
   * Vertrag wie `QuelleAnlegenEin`), die Ansicht zeigt den Block trotzdem nur dann (§14: sonst
   * Formularfelder ohne Bedeutung für jeden anderen Typ). `audioMediumId` FEHLT hier bewusst —
   * es gibt noch keinen Medien-Baustein/-Kanal (§14-Vermerk, docs/80_Offene_Fragen.md §29). Der
   * Informant-Anzeigename bleibt aus demselben Grund wie `archivId` oben AUSSERHALB dieses Objekts. */
  readonly informantPersonId: string | null
  readonly gespraechsdatumText: string
  readonly gespraechsdatumKalender: Kalender
  readonly gespraechsdatumKalenderErweitert: boolean
  readonly form: QuelleFormAuswahlWert
  readonly unmittelbarkeit: UnmittelbarkeitAuswahlWert
}

export function quelleKopfEntwurfAusDetail(kopf: QuelleDetailKopf): QuelleKopfEntwurfWerte {
  return {
    typ: kopf.typ,
    titel: kopf.titel ?? '',
    autor: kopf.autor ?? '',
    verlag: kopf.verlag ?? '',
    jahrText: kopf.jahr === null ? '' : String(kopf.jahr),
    art: kopf.art ?? '',
    informationsart: kopf.informationsart ?? '',
    signatur: kopf.signatur ?? '',
    notiz: kopf.notiz ?? '',
    archivId: kopf.archiv_id,
    informantPersonId: kopf.informant_person_id,
    // `originaltext` gewinnt immer (dieselbe Regel wie `formatiere()`, s. Kopfkommentar
    // `datumsfeld-logik.ts`) — fehlt er, ist `wert1` bereits re-parsebares ISO-artiges Rohdatum
    // (Kopfkommentar `src/core/datum/typen.ts`).
    gespraechsdatumText: kopf.gespraechsdatum_originaltext ?? kopf.gespraechsdatum_wert1 ?? '',
    gespraechsdatumKalender: kopf.gespraechsdatum_kalender ?? 'gregorian',
    gespraechsdatumKalenderErweitert: false,
    form: kopf.form ?? '',
    unmittelbarkeit: kopf.unmittelbarkeit ?? '',
  }
}

/** `''` = „unbestimmt/Sonstiges", die Startvorgabe eines frisch angelegten Entwurfs. */
export const QUELLE_KOPF_ENTWURF_LEER: QuelleKopfEntwurfWerte = {
  typ: 'sonstiges',
  titel: '',
  autor: '',
  verlag: '',
  jahrText: '',
  art: '',
  informationsart: '',
  signatur: '',
  notiz: '',
  archivId: null,
  informantPersonId: null,
  gespraechsdatumText: '',
  gespraechsdatumKalender: 'gregorian',
  gespraechsdatumKalenderErweitert: false,
  form: '',
  unmittelbarkeit: '',
}

/** `true` bei leerem Text (kein Jahr angegeben) oder einer reinen (optional negativen)
 * Ganzzahl — `quelle.jahr` kennt keine Nachkommastelle. */
export function jahrTextIstGueltig(text: string): boolean {
  return text.trim() === '' || /^-?\d+$/.test(text.trim())
}

function jahrAusText(text: string): number | undefined {
  if (!jahrTextIstGueltig(text)) return undefined
  const getrimmt = text.trim()
  return getrimmt === '' ? undefined : Number(getrimmt)
}

export function quelleAendernEinAusEntwurf(id: string, entwurf: QuelleKopfEntwurfWerte): QuelleAendernEin {
  return {
    id,
    typ: entwurf.typ,
    titel: textOderUndefined(entwurf.titel),
    autor: textOderUndefined(entwurf.autor),
    verlag: textOderUndefined(entwurf.verlag),
    jahr: jahrAusText(entwurf.jahrText),
    art: entwurf.art === '' ? undefined : entwurf.art,
    informationsart: entwurf.informationsart === '' ? undefined : entwurf.informationsart,
    archivId: entwurf.archivId ?? undefined,
    signatur: textOderUndefined(entwurf.signatur),
    notiz: textOderUndefined(entwurf.notiz),
    informantPersonId: entwurf.informantPersonId ?? undefined,
    gespraechsdatum: gespraechsdatumAusEntwurf(entwurf.gespraechsdatumText, entwurf.gespraechsdatumKalender),
    form: entwurf.form === '' ? undefined : entwurf.form,
    unmittelbarkeit: entwurf.unmittelbarkeit === '' ? undefined : entwurf.unmittelbarkeit,
  }
}

/** Nutzlast für „Quelle anlegen" (Einstiegspunkt am Belegapparat des Profils, `beleg-liste.tsx`)
 * — NUR `typ` (Pflichtfeld, CHECK-Klausel), analog `ortsfeldNeuAnlegenEin`/`personenwaehlerNeuAnlegenEin`:
 * minimal anlegen, der Nutzer füllt den Rest sofort in der geöffneten Pflege-Ansicht aus. */
export function quelleNeuAnlegenEin(): QuelleAnlegenEin {
  return { typ: 'sonstiges' }
}

// -----------------------------------------------------------------------------------------------
// Zitate (dreistufige Liste, §3 Designsystem) — `befehl:zitat.anlegen`/`aendern`/`loeschen`
// -----------------------------------------------------------------------------------------------

/** Felder EINES Zitats, die dieses Formular NICHT zeigt (Auftragsumfang: nur `seite`/
 * `eintragsnummer`/`transkript`/`digitalisat_url`/`konfidenz`) — unverändert durchgereicht, s.
 * Modulkommentar oben. */
export type ZitatVerborgeneFelder = Omit<QuelleDetailZitat, 'id' | 'seite' | 'eintragsnummer' | 'transkript' | 'digitalisat_url' | 'konfidenz'>

const ZITAT_VERBORGEN_LEER: ZitatVerborgeneFelder = {
  band: null,
  jahr: null,
  zugriffsdatum_kalender: null,
  zugriffsdatum_modifikator: null,
  zugriffsdatum_praezision: null,
  zugriffsdatum_wert1: null,
  zugriffsdatum_wert2: null,
  zugriffsdatum_originaltext: null,
  zugriffsdatum_zweitkalender: null,
  zugriffsdatum_zweitwert: null,
  zugriffsdatum_doppeljahr: null,
  zeitmarke_sekunden: null,
  uebersetzung: null,
  medium_id: null,
}

export interface ZitatEntwurfWerte {
  readonly seite: string
  readonly eintragsnummer: string
  readonly transkript: string
  readonly digitalisatUrl: string
  /** `null` = kein Vorgabewert (§3.4, wie `Konfidenzwaehler` selbst dokumentiert). */
  readonly konfidenz: KonfidenzStufe | null
  readonly verborgen: ZitatVerborgeneFelder
}

export const ZITAT_ENTWURF_LEER: ZitatEntwurfWerte = {
  seite: '',
  eintragsnummer: '',
  transkript: '',
  digitalisatUrl: '',
  konfidenz: null,
  verborgen: ZITAT_VERBORGEN_LEER,
}

/** Gate für „Zitat hinzufügen" (Leerzustand-Falle, analog `namenEintragHatInhalt`
 * `profil-bearbeiten-logik.ts`): mindestens EINES der sichtbaren Textfelder trägt Inhalt, sonst
 * legt ein Klick eine vollständig leere `zitat`-Zeile an. */
export function zitatEntwurfHatInhalt(entwurf: ZitatEntwurfWerte): boolean {
  return [entwurf.seite, entwurf.eintragsnummer, entwurf.transkript, entwurf.digitalisatUrl].some((wert) => wert.trim() !== '')
}

/** `quelle.detail`s rohe `konfidenz: number | null` → `KonfidenzStufe | null` — bewusst dupliziert
 * aus `feld-konfidenz.tsx`/`personenwaehler.tsx` (dieselbe dokumentierte Dopplung dort). */
function konfidenzStufeAusWert(wert: number | null): KonfidenzStufe | null {
  switch (wert) {
    case 1:
    case 2:
    case 3:
    case 4:
      return wert
    default:
      return null
  }
}

export function zitatEntwurfAusZeile(zeile: QuelleDetailZitat): ZitatEntwurfWerte {
  return {
    seite: zeile.seite ?? '',
    eintragsnummer: zeile.eintragsnummer ?? '',
    transkript: zeile.transkript ?? '',
    digitalisatUrl: zeile.digitalisat_url ?? '',
    konfidenz: konfidenzStufeAusWert(zeile.konfidenz),
    verborgen: {
      band: zeile.band,
      jahr: zeile.jahr,
      zugriffsdatum_kalender: zeile.zugriffsdatum_kalender,
      zugriffsdatum_modifikator: zeile.zugriffsdatum_modifikator,
      zugriffsdatum_praezision: zeile.zugriffsdatum_praezision,
      zugriffsdatum_wert1: zeile.zugriffsdatum_wert1,
      zugriffsdatum_wert2: zeile.zugriffsdatum_wert2,
      zugriffsdatum_originaltext: zeile.zugriffsdatum_originaltext,
      zugriffsdatum_zweitkalender: zeile.zugriffsdatum_zweitkalender,
      zugriffsdatum_zweitwert: zeile.zugriffsdatum_zweitwert,
      zugriffsdatum_doppeljahr: zeile.zugriffsdatum_doppeljahr,
      zeitmarke_sekunden: zeile.zeitmarke_sekunden,
      uebersetzung: zeile.uebersetzung,
      medium_id: zeile.medium_id,
    },
  }
}

/** Rekonstruiert den Vertrags-`Datumswert` aus den durchgereichten Rohspalten — `undefined`, wenn
 * kein Zugriffsdatum gepflegt war (kein `modifikator`/`praezision`, CHECK-Konsequenz aus
 * `docs/schema/0002_kern.sql` §2.4: beide stehen immer zusammen mit `wert1` oder gar nicht). */
function zugriffsdatumAusVerborgen(verborgen: ZitatVerborgeneFelder): VertragsDatumswert | undefined {
  if (verborgen.zugriffsdatum_modifikator === null || verborgen.zugriffsdatum_praezision === null) return undefined
  return {
    kalender: verborgen.zugriffsdatum_kalender ?? undefined,
    modifikator: verborgen.zugriffsdatum_modifikator,
    praezision: verborgen.zugriffsdatum_praezision,
    wert1: verborgen.zugriffsdatum_wert1 ?? undefined,
    wert2: verborgen.zugriffsdatum_wert2 ?? undefined,
    original_text: verborgen.zugriffsdatum_originaltext ?? undefined,
    zweitkalender: verborgen.zugriffsdatum_zweitkalender ?? undefined,
    zweitwert: verborgen.zugriffsdatum_zweitwert ?? undefined,
    doppeljahr: verborgen.zugriffsdatum_doppeljahr ?? undefined,
  }
}

export function zitatAnlegenEinAusEntwurf(quelleId: string, entwurf: ZitatEntwurfWerte): ZitatAnlegenEin {
  return {
    quelleId,
    seite: textOderUndefined(entwurf.seite),
    eintragsnummer: textOderUndefined(entwurf.eintragsnummer),
    band: entwurf.verborgen.band ?? undefined,
    jahr: entwurf.verborgen.jahr ?? undefined,
    zugriffsdatum: zugriffsdatumAusVerborgen(entwurf.verborgen),
    zeitmarkeSekunden: entwurf.verborgen.zeitmarke_sekunden ?? undefined,
    digitalisatUrl: textOderUndefined(entwurf.digitalisatUrl),
    transkript: textOderUndefined(entwurf.transkript),
    uebersetzung: entwurf.verborgen.uebersetzung ?? undefined,
    konfidenz: entwurf.konfidenz ?? undefined,
    mediumId: entwurf.verborgen.medium_id ?? undefined,
  }
}

export function zitatAendernEinAusEntwurf(id: string, quelleId: string, entwurf: ZitatEntwurfWerte): ZitatAendernEin {
  return {
    id,
    quelleId,
    seite: textOderUndefined(entwurf.seite),
    eintragsnummer: textOderUndefined(entwurf.eintragsnummer),
    band: entwurf.verborgen.band ?? undefined,
    jahr: entwurf.verborgen.jahr ?? undefined,
    zugriffsdatum: zugriffsdatumAusVerborgen(entwurf.verborgen),
    zeitmarkeSekunden: entwurf.verborgen.zeitmarke_sekunden ?? undefined,
    digitalisatUrl: textOderUndefined(entwurf.digitalisatUrl),
    transkript: textOderUndefined(entwurf.transkript),
    uebersetzung: entwurf.verborgen.uebersetzung ?? undefined,
    konfidenz: entwurf.konfidenz ?? undefined,
    mediumId: entwurf.verborgen.medium_id ?? undefined,
  }
}
