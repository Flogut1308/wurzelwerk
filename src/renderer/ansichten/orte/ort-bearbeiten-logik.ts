// AP-1.16 PR-C (S-20-Muster, docs/71_Designsystem.md §3.2): reine Umrechnungen für die
// Orte-Pflege-Ansicht (`ort-bearbeiten.tsx`) — Muster `profil-bearbeiten-logik.ts`.
//
// `gueltig_von`/`gueltig_bis` (`ortsname`/`ortszugehoerigkeit`) sind rohe JDN-Ganzzahlen
// (docs/schema/0002_kern.sql §2.4), KEIN `Datumswert`-Objekt wie ein Ereignisdatum. Eingabe/Anzeige
// laufen trotzdem über dieselbe Textinterpretation wie jedes andere Datumsfeld (`parse()`/
// `vonJdn()`, `src/core/datum`) — KEINE zweite Parselogik.
//
// §14-Vermerk (CLAUDE.md §14 Fall 2, docs/80_Offene_Fragen.md ergänzt): `parse()` berechnet
// `sortVon`/`sortBis` UNABHÄNGIG vom in `Datumsfeld` gewählten Kalender immer gregorianisch
// (STANDARDKALENDER, s. Kopfkommentar `src/core/datum/parser.ts`/`datumsfeld-logik.ts`) — eine
// volle `Datumsfeld`-Kalenderwahl-Chrome für die Gültigkeits-Grenzen wäre darum reine Staffage ohne
// Wirkung auf den gespeicherten Wert. Diese Datei bietet für `gueltigVon`/`gueltigBis` bewusst nur
// eine einfache Textinterpretation (kein Kalender-Umschalter) statt den vollen `Datumsfeld`-
// Baustein blind zu übernehmen.
//
// §14-Vermerk 2: Es gibt noch keinen `Checkbox`-Baustein für `istBevorzugt` (ein Boolean). Aus dem
// vorhandenen `Auswahlfeld` (ja/nein) zusammengesetzt statt eine neue visuelle Sprache zu erfinden
// — dieselbe Auswahlfeld-Form wie `schriftZuAuswahlWert`/`auswahlWertZuSchrift`
// (`profil-bearbeiten-logik.ts`).
import { vonJdn } from '../../../core/datum/kalender'
import { parse } from '../../../core/datum/parser'
import type {
  OrtExterneIdAnlegenEin,
  OrtsnameAendernEin,
  OrtsnameAnlegenEin,
  OrtszugehoerigkeitAendernEin,
  OrtszugehoerigkeitAnlegenEin,
} from '../../../shared/schemata/befehle'
import type { OrtDetailName } from '../../../shared/schemata/ort-detail'
import { ExterneIdSystemEnum } from '../../../shared/schemata/ort-externe-id'
import { OrtszugehoerigkeitArtEnum } from '../../../shared/schemata/ortszugehoerigkeit'

function zweistellig(zahl: number): string {
  return zahl < 10 ? `0${zahl}` : `${zahl}`
}

/** JDN → "YYYY-MM-DD" (gregorianisch, `vonJdn()`), re-parsebar über `parse()` (ISO-Tagesmuster) —
 * die Textform, die die Gültigkeits-Textfelder beim Bearbeiten einer bestehenden Zeile vorbefüllt. */
export function jdnZuIsoText(jdn: number | null): string {
  if (jdn === null) return ''
  const { jahr, monat, tag } = vonJdn(jdn, 'gregorian')
  return `${jahr}-${zweistellig(monat)}-${zweistellig(tag)}`
}

/** `true` bei leerem Text (kein Datum, erlaubt — beide Grenzen sind optional) oder auflösbarem
 * Text — dieselbe Zusicherung wie `ereignisEntwurfDatumIstGueltig` (`profil-bearbeiten-logik.ts`). */
export function gueltigkeitTextIstGueltig(text: string): boolean {
  return text.trim() === '' || parse(text).ok
}

function jdnVonAusText(text: string): number | undefined {
  if (text.trim() === '') return undefined
  const ergebnis = parse(text)
  return ergebnis.ok ? ergebnis.wert.sortVon : undefined
}

function jdnBisAusText(text: string): number | undefined {
  if (text.trim() === '') return undefined
  const ergebnis = parse(text)
  return ergebnis.ok ? ergebnis.wert.sortBis : undefined
}

export type JaNeinAuswahlWert = 'ja' | 'nein'

export function boolZuAuswahlWert(wert: boolean): JaNeinAuswahlWert {
  return wert ? 'ja' : 'nein'
}

export function auswahlWertZuBool(wert: JaNeinAuswahlWert): boolean {
  return wert === 'ja'
}

// ---------------------------------------------------------------------------------------------
// Namen ("Namen hinzufügen", Inline-Bearbeiten einer bestehenden Namenszeile)
// ---------------------------------------------------------------------------------------------

export interface OrtsnameEntwurfWerte {
  readonly name: string
  readonly gueltigVonText: string
  readonly gueltigBisText: string
  readonly istBevorzugt: boolean
  /** NICHT im Formular editierbar, aber beim Bearbeiten einer bestehenden Zeile unverändert
   * durchgereicht (`ortsnameAendernEinAusEntwurf`) — sonst würde ein Speichern der sichtbaren
   * Felder eine vorhandene `sprache`/`original_text`-Angabe stillschweigend löschen. */
  readonly sprache: string | null
  readonly originalText: string | null
}

export const ORTSNAME_ENTWURF_LEER: OrtsnameEntwurfWerte = {
  name: '',
  gueltigVonText: '',
  gueltigBisText: '',
  istBevorzugt: false,
  sprache: null,
  originalText: null,
}

export function ortsnameEntwurfAusZeile(zeile: OrtDetailName): OrtsnameEntwurfWerte {
  return {
    name: zeile.name ?? '',
    gueltigVonText: jdnZuIsoText(zeile.gueltig_von),
    gueltigBisText: jdnZuIsoText(zeile.gueltig_bis),
    istBevorzugt: zeile.ist_bevorzugt,
    sprache: zeile.sprache,
    originalText: zeile.original_text,
  }
}

/** Gate für „Namen hinzufügen": ein nicht-leerer Name UND beide Gültigkeitsfelder leer oder auflösbar. */
export function ortsnameEntwurfAbsendbar(entwurf: OrtsnameEntwurfWerte): boolean {
  return entwurf.name.trim() !== '' && gueltigkeitTextIstGueltig(entwurf.gueltigVonText) && gueltigkeitTextIstGueltig(entwurf.gueltigBisText)
}

export function ortsnameAnlegenEinAusEntwurf(ortId: string, entwurf: OrtsnameEntwurfWerte): OrtsnameAnlegenEin {
  return {
    ortId,
    name: entwurf.name.trim(),
    sprache: entwurf.sprache ?? undefined,
    gueltigVon: jdnVonAusText(entwurf.gueltigVonText),
    gueltigBis: jdnBisAusText(entwurf.gueltigBisText),
    istBevorzugt: entwurf.istBevorzugt ? 1 : undefined,
    originalText: entwurf.originalText ?? undefined,
  }
}

export function ortsnameAendernEinAusEntwurf(id: string, entwurf: OrtsnameEntwurfWerte): OrtsnameAendernEin {
  return {
    id,
    name: entwurf.name.trim(),
    sprache: entwurf.sprache ?? undefined,
    gueltigVon: jdnVonAusText(entwurf.gueltigVonText),
    gueltigBis: jdnBisAusText(entwurf.gueltigBisText),
    istBevorzugt: entwurf.istBevorzugt ? 1 : undefined,
    originalText: entwurf.originalText ?? undefined,
  }
}

// ---------------------------------------------------------------------------------------------
// Zugehörigkeit ("Zugehörigkeit hinzufügen", Inline-Bearbeiten der Gültigkeit einer bestehenden Kante)
// ---------------------------------------------------------------------------------------------

export type OrtszugehoerigkeitArtWert = (typeof OrtszugehoerigkeitArtEnum.options)[number]

export interface OrtszugehoerigkeitEntwurfWerte {
  readonly art: OrtszugehoerigkeitArtWert
  readonly uebergeordnetId: string | null
  readonly uebergeordnetText: string
  readonly gueltigVonText: string
  readonly gueltigBisText: string
}

export function ortszugehoerigkeitEntwurfLeer(art: OrtszugehoerigkeitArtWert): OrtszugehoerigkeitEntwurfWerte {
  return { art, uebergeordnetId: null, uebergeordnetText: '', gueltigVonText: '', gueltigBisText: '' }
}

/** Gate für „Zugehörigkeit hinzufügen": ein übergeordneter Ort ist GEWÄHLT (über das `Ortsfeld`,
 * nicht nur getippt) UND beide Gültigkeitsfelder leer oder auflösbar. */
export function ortszugehoerigkeitEntwurfAbsendbar(entwurf: OrtszugehoerigkeitEntwurfWerte): boolean {
  return entwurf.uebergeordnetId !== null && gueltigkeitTextIstGueltig(entwurf.gueltigVonText) && gueltigkeitTextIstGueltig(entwurf.gueltigBisText)
}

/** `null`, wenn kein übergeordneter Ort gewählt ist — der Aufrufer ruft diese Funktion nur, wenn
 * `ortszugehoerigkeitEntwurfAbsendbar` zutrifft (CLAUDE.md §4: defensiv trotzdem geprüft, kein `!`). */
export function ortszugehoerigkeitAnlegenEinAusEntwurf(ortId: string, entwurf: OrtszugehoerigkeitEntwurfWerte): OrtszugehoerigkeitAnlegenEin | null {
  if (entwurf.uebergeordnetId === null) return null
  return {
    ortId,
    uebergeordnetId: entwurf.uebergeordnetId,
    art: entwurf.art,
    gueltigVon: jdnVonAusText(entwurf.gueltigVonText),
    gueltigBis: jdnBisAusText(entwurf.gueltigBisText),
  }
}

export function ortszugehoerigkeitAendernEinAusText(id: string, gueltigVonText: string, gueltigBisText: string): OrtszugehoerigkeitAendernEin {
  return {
    id,
    gueltigVon: jdnVonAusText(gueltigVonText),
    gueltigBis: jdnBisAusText(gueltigBisText),
  }
}

// ---------------------------------------------------------------------------------------------
// Externe Kennung ("Externe Kennung hinzufügen") — kein `aendern` (s. `src/shared/schemata/befehle.ts`)
// ---------------------------------------------------------------------------------------------

export type ExterneIdSystemWert = (typeof ExterneIdSystemEnum.options)[number]

export interface ExterneIdEntwurfWerte {
  readonly system: ExterneIdSystemWert
  readonly wert: string
}

export const EXTERNE_ID_ENTWURF_LEER: ExterneIdEntwurfWerte = { system: 'gov', wert: '' }

export function externeIdEntwurfAbsendbar(entwurf: ExterneIdEntwurfWerte): boolean {
  return entwurf.wert.trim() !== ''
}

export function externeIdAnlegenEinAusEntwurf(ortId: string, entwurf: ExterneIdEntwurfWerte): OrtExterneIdAnlegenEin {
  return { ortId, system: entwurf.system, wert: entwurf.wert.trim() }
}
