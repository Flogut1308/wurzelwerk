// AP-1.17 PR-C2 (S-23, docs/57_Phase0_Arbeitspakete.md AP-1.17): reine Umrechnungen für den
// Negativbefund-Abschnitt des Profils (`negativbefund-abschnitt.tsx`) — Muster
// `quelle-bearbeiten-logik.ts`/`profil-bearbeiten-logik.ts`. Kein React/DOM, kein Node/Electron/SQL
// (`src/renderer` bleibt frei davon, CLAUDE.md §2).
//
// `datum_der_pruefung` ist NICHT Teil der Datumsgruppen-Konvention (docs/schema/0002_kern.sql §2.7:
// „nicht in der Datumsgruppen-Liste der Konventionen - einfache Spalte") — anders als
// `quelle.gespraechsdatum` läuft dieses Feld darum NICHT über `parse()`/`formatiere()`
// (`src/core/datum`), sondern bleibt eine einfache, unvalidierte Textspalte (`string | undefined`
// im Vertrag, `NegativbefundAnlegenEin`/`NegativbefundAendernEin`).
//
// `quelleId` (§14, Auftrag AP-1.17 PR-C2): es gibt noch KEINEN Suche-/Auswahl-Kanal für `quelle`
// (nur `abfrage:quelle.detail` — Einzelabruf über eine bereits bekannte ID, kein `quelle.suche`
// analog `abfrage:archiv.suche`/`abfrage:ort.suche`). Das Formular „Negativbefund hinzufügen" bietet
// darum KEINE Quellen-Verknüpfung an (weggelassen, nicht nachgebaut) — ein neuer Abfrage-Kanal wäre
// Backend-Arbeit außerhalb dieses reinen UI-Auftrags. Beim Bearbeiten eines BESTEHENDEN
// Negativbefunds wird ein etwa beim Import gesetztes `quelleId` unverändert durchgereicht (dasselbe
// Muster wie `ZitatVerborgeneFelder`, `quelle-bearbeiten-logik.ts`) — sonst würde
// `befehl:negativbefund.aendern` (patcht ALLE editierbaren Spalten in einem Schritt, kein
// Teil-Patch, s. `negativbefund-repo.ts::negativbefundAktualisieren`) eine bestehende Verknüpfung
// stillschweigend löschen.
import type { NegativbefundAendernEin, NegativbefundAnlegenEin } from '../../../shared/schemata/befehle'
import type { NegativbefundEintrag } from '../../../shared/schemata/negativbefund-liste'

function textOderUndefined(wert: string): string | undefined {
  const getrimmt = wert.trim()
  return getrimmt === '' ? undefined : wert
}

/** `true` bei leerem Text (kein Zeitraumjahr angegeben) oder einer reinen (optional negativen)
 * Ganzzahl — `zeitraum_von`/`zeitraum_bis` kennen keine Nachkommastelle (E-8, dieselbe Regel wie
 * `quelle.jahr`, s. `jahrTextIstGueltig` in `quelle-bearbeiten-logik.ts`). Bewusst dupliziert statt
 * importiert — ein anderes Fachfeld, keine gemeinsame Bedeutung, die eine geteilte Funktion
 * rechtfertigt (dieselbe Begründung wie die dortige `konfidenzStufeAusWert`-Dopplung). */
export function ganzzahlTextIstGueltig(text: string): boolean {
  return text.trim() === '' || /^-?\d+$/.test(text.trim())
}

function ganzzahlAusText(text: string): number | undefined {
  if (!ganzzahlTextIstGueltig(text)) return undefined
  const getrimmt = text.trim()
  return getrimmt === '' ? undefined : Number(getrimmt)
}

export interface NegativbefundEntwurfWerte {
  readonly gesuchtesPraedikat: string
  readonly zeitraumVonText: string
  readonly zeitraumBisText: string
  readonly beschreibung: string
  readonly datumDerPruefung: string
  /** Unverändert durchgereichtes `quelle_id` einer bestehenden Zeile — s. Modulkommentar oben.
   * KEIN Formularfeld zeigt/ändert diesen Wert; `NEGATIVBEFUND_ENTWURF_LEER` trägt `null` (ein neu
   * angelegter Negativbefund beginnt ohne Quellen-Verknüpfung). */
  readonly quelleId: string | null
}

export const NEGATIVBEFUND_ENTWURF_LEER: NegativbefundEntwurfWerte = {
  gesuchtesPraedikat: '',
  zeitraumVonText: '',
  zeitraumBisText: '',
  beschreibung: '',
  datumDerPruefung: '',
  quelleId: null,
}

export function negativbefundEntwurfAusEintrag(eintrag: NegativbefundEintrag): NegativbefundEntwurfWerte {
  return {
    gesuchtesPraedikat: eintrag.gesuchtesPraedikat ?? '',
    zeitraumVonText: eintrag.zeitraumVon === null ? '' : String(eintrag.zeitraumVon),
    zeitraumBisText: eintrag.zeitraumBis === null ? '' : String(eintrag.zeitraumBis),
    beschreibung: eintrag.beschreibung ?? '',
    datumDerPruefung: eintrag.datumDerPruefung ?? '',
    quelleId: eintrag.quelleId,
  }
}

/** Gate für „Negativbefund hinzufügen" (Leerzustand-Falle, analog `zitatEntwurfHatInhalt`
 * `quelle-bearbeiten-logik.ts`): mindestens EINES der Felder trägt Inhalt, sonst legt ein Klick
 * eine vollständig leere `negativbefund`-Zeile an. */
export function negativbefundEntwurfHatInhalt(entwurf: NegativbefundEntwurfWerte): boolean {
  return (
    [entwurf.gesuchtesPraedikat, entwurf.beschreibung, entwurf.datumDerPruefung].some((wert) => wert.trim() !== '') ||
    entwurf.zeitraumVonText.trim() !== '' ||
    entwurf.zeitraumBisText.trim() !== ''
  )
}

/** Nutzlast für „Negativbefund anlegen" — bewusst OHNE `quelleId` (s. Modulkommentar oben, kein
 * Auswahlmuster in diesem Formular). */
export function negativbefundAnlegenEinAusEntwurf(gesuchtePersonId: string, entwurf: NegativbefundEntwurfWerte): NegativbefundAnlegenEin {
  return {
    gesuchtePersonId,
    gesuchtesPraedikat: textOderUndefined(entwurf.gesuchtesPraedikat),
    zeitraumVon: ganzzahlAusText(entwurf.zeitraumVonText),
    zeitraumBis: ganzzahlAusText(entwurf.zeitraumBisText),
    beschreibung: textOderUndefined(entwurf.beschreibung),
    datumDerPruefung: textOderUndefined(entwurf.datumDerPruefung),
  }
}

/** Nutzlast für „Negativbefund ändern" — `quelleId` wird aus `entwurf.quelleId` unverändert
 * durchgereicht (s. Modulkommentar oben), NICHT aus einem Formularfeld dieser Ansicht. */
export function negativbefundAendernEinAusEntwurf(id: string, gesuchtePersonId: string, entwurf: NegativbefundEntwurfWerte): NegativbefundAendernEin {
  return {
    id,
    gesuchtePersonId,
    quelleId: entwurf.quelleId ?? undefined,
    gesuchtesPraedikat: textOderUndefined(entwurf.gesuchtesPraedikat),
    zeitraumVon: ganzzahlAusText(entwurf.zeitraumVonText),
    zeitraumBis: ganzzahlAusText(entwurf.zeitraumBisText),
    beschreibung: textOderUndefined(entwurf.beschreibung),
    datumDerPruefung: textOderUndefined(entwurf.datumDerPruefung),
  }
}
