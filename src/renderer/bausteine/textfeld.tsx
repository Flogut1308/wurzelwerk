import { Eingabekoerper } from './eingabekoerper'
import './textfeld.css'

export interface TextfeldProps {
  readonly wert: string
  readonly aufAenderung: (wert: string) => void
  /** Platzhaltertext — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly platzhalter?: string
  readonly ungueltig?: boolean
  readonly gesperrt?: boolean
  readonly nurLesen?: boolean
  readonly name?: string
  readonly id?: string
  /** Zugänglicher Name, wenn keine sichtbare Beschriftung danebensteht (vom Aufrufer über i18n) —
   * im Regelfall trägt stattdessen `Formularfeld` die sichtbare Beschriftung. */
  readonly ariaLabel?: string
  /** Das Feld wird verlassen (Blur) — AP-1.30: der Autosave schreibt dann sofort. */
  readonly aufVerlassen?: () => void
}

/**
 * `Textfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", einzeilig. Ein dünner
 * Wrapper um `Eingabekoerper` (Atom, §2.1) mit `typ` fest auf `"text"` — eigenständig benannt und
 * registriert, weil §2.2 `Textfeld` als eigenes Feld im Vertrag der fünf tragenden Eingabefelder
 * (§3) führt, nicht weil die Umsetzung eigene Logik bräuchte.
 */
export function Textfeld(props: TextfeldProps) {
  return (
    <span className="wz-textfeld">
      <Eingabekoerper typ="text" {...props} />
    </span>
  )
}
