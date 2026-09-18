import { BelegAbzeichen } from './beleg-abzeichen'
import { KonfidenzPunkt, type KonfidenzStufe } from './konfidenz-punkt'
import { WiderspruchZeichen } from './widerspruch-zeichen'
import './feld-konfidenz.css'

/** `konfidenz_min`/`konfidenz` kommen aus der Datenbank als `number | null` — hier auf die
 * geschlossene `KonfidenzStufe`-Union geprüft, statt sie ungeprüft weiterzureichen (kein `as`,
 * CLAUDE.md §4). Dieselbe Funktion wie in `tabellenzeile.tsx` (kein gemeinsames Modul dafür bisher
 * — jede Verbraucherdatei hat ihre eigene kleine, geschlossene Prüfung, analog `spaltenSchluessel`
 * u. Ä.). */
export function konfidenzStufe(wert: number | null): KonfidenzStufe | null {
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

export interface FeldKonfidenzProps {
  readonly konfidenz: number | null
  readonly belegzahl: number
  /** E21, hueter-Auflage 1 (PR #65): das kanonische „es gibt konkurrierende Angaben"-Signal —
   * bleibt `true`, auch wenn `hatWiderspruch` durch eine Bevorzugung bereits aufgelöst ist. */
  readonly hatKonkurrierende: boolean
  /** UNAUFGELÖSTER Konflikt — verstärkt `WiderspruchZeichen` nur optisch, erzeugt kein zweites
   * Zeichen (E21: „der unaufgelöste Widerspruch darf zusätzlich sichtbar hervorgehoben werden"). */
  readonly hatWiderspruch: boolean
  /** Öffnet das Belegdetail (S-08) für dieses Feld. */
  readonly aufBelegKlick: () => void
  /** Öffnet die Widerspruchsansicht (S-09) für dieses Feld — nur erreichbar, wenn
   * `hatKonkurrierende` überhaupt ein `WiderspruchZeichen` rendert. */
  readonly aufWiderspruchKlick: () => void
}

/**
 * `FeldKonfidenz` — Molekül (docs/71_Designsystem.md §2.2, AP-1.7 PR-B, E21): die ZWEI Zeichen je
 * Grunddaten-Feld aus dem Auftrag — (1) `KonfidenzPunkt` + `BelegAbzeichen` (Konfidenz MIT
 * Belegzahl) und (2) `WiderspruchZeichen`, das unabhängig davon „es gibt konkurrierende Angaben"
 * zeigt (`hatKonkurrierende`), optional verstärkt für einen unaufgelösten Widerspruch
 * (`hatWiderspruch`). Rein präsentationsgetrieben — holt keine Daten selbst.
 */
export function FeldKonfidenz({ konfidenz, belegzahl, hatKonkurrierende, hatWiderspruch, aufBelegKlick, aufWiderspruchKlick }: FeldKonfidenzProps) {
  const stufe = konfidenzStufe(konfidenz)
  return (
    <span className="wz-feld-konfidenz">
      {stufe !== null ? <KonfidenzPunkt stufe={stufe} /> : null}
      <BelegAbzeichen anzahl={belegzahl} aufKlick={aufBelegKlick} />
      {hatKonkurrierende ? <WiderspruchZeichen ungeloest={hatWiderspruch} aufKlick={aufWiderspruchKlick} /> : null}
    </span>
  )
}
