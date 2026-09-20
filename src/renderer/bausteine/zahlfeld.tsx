import { Eingabekoerper } from './eingabekoerper'
import './zahlfeld.css'

export interface ZahlfeldProps {
  readonly wert: string
  readonly aufAenderung: (wert: string) => void
  /** Platzhaltertext — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly platzhalter?: string
  readonly ungueltig?: boolean
  readonly gesperrt?: boolean
  readonly nurLesen?: boolean
  readonly name?: string
  readonly id?: string
  /** Zugänglicher Name, wenn keine sichtbare Beschriftung danebensteht (vom Aufrufer über i18n). */
  readonly ariaLabel?: string
}

/**
 * `Zahlfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", Ziffern gleicher Breite.
 * Wrapper um `Eingabekoerper` (`typ="number"`) mit der Modifikatorklasse `.wz-zahlfeld`, die
 * `font-variant-numeric: var(--wz-ziffern-tabelle)` (tabular-nums, dieselbe Rolle wie
 * `Text` rolle="zahl-tabelle") sowie rechtsbündige Ausrichtung ergänzt — Ziffern, keine
 * Fließtextspalte.
 */
export function Zahlfeld(props: ZahlfeldProps) {
  return (
    <span className="wz-zahlfeld">
      <Eingabekoerper typ="number" {...props} />
    </span>
  )
}
