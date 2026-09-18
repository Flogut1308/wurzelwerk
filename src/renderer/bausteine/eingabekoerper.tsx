import type { ChangeEvent } from 'react'
import './eingabekoerper.css'

export type EingabekoerperTyp = 'text' | 'search' | 'number'

export interface EingabekoerperProps {
  readonly wert: string
  readonly aufAenderung: (wert: string) => void
  readonly typ?: EingabekoerperTyp
  /** Platzhaltertext — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly platzhalter?: string
  /** Zustand „ungültig" (§2.1). */
  readonly ungueltig?: boolean
  /** Zustand „gesperrt" (§2.1). */
  readonly gesperrt?: boolean
  /** Zustand „nur-lesen" (§2.1). */
  readonly nurLesen?: boolean
  readonly name?: string
  readonly id?: string
  /** Zugänglicher Name, wenn keine sichtbare Beschriftung danebensteht (vom Aufrufer über i18n). */
  readonly ariaLabel?: string
}

/**
 * `Eingabekoerper` — Atom (§2.1): der Rahmen, den `Suchfeld`, `Textfeld`, `Zahlfeld` u. a.
 * (§2.2, spätere Stufe) wiederverwenden. „Gefüllt" ist kein eigener Zustand hier — es ergibt sich
 * aus `wert !== ''` und dem nativen `::placeholder`-Verschwinden, keine zusätzliche Klasse nötig.
 */
export function Eingabekoerper({
  wert,
  aufAenderung,
  typ = 'text',
  platzhalter,
  ungueltig = false,
  gesperrt = false,
  nurLesen = false,
  name,
  id,
  ariaLabel,
}: EingabekoerperProps) {
  return (
    <input
      type={typ}
      className="wz-eingabekoerper"
      value={wert}
      onChange={(ereignis: ChangeEvent<HTMLInputElement>) => aufAenderung(ereignis.target.value)}
      placeholder={platzhalter}
      disabled={gesperrt}
      readOnly={nurLesen}
      aria-invalid={ungueltig}
      name={name}
      id={id}
      aria-label={ariaLabel}
    />
  )
}
