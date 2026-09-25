import type { ChangeEvent } from 'react'
import './langtextfeld.css'

export interface LangtextfeldProps {
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
  /** Sichtbare Anfangszeilen (`rows`) — wächst darüber hinaus mit dem Inhalt bis `--wz-abstand-96`
   * (Höhenbegrenzung, §2.2), danach scrollt der Nutzer innerhalb des Felds statt der Seite. */
  readonly zeilen?: number
  /** Das Feld wird verlassen (Blur) — AP-1.30: der Autosave schreibt dann sofort. */
  readonly aufVerlassen?: () => void
}

/**
 * `Langtextfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", wächst mit,
 * Höhenbegrenzung. `Eingabekoerper` (Atom, §2.1) kennt nur `<input>` — ein `<textarea>` ist ein
 * eigenes Element, teilt sich aber bewusst dieselbe visuelle Klasse `.wz-eingabekoerper`
 * (Rahmen/Radius/Zustände aus `eingabekoerper.css`), damit ein Textfeld und ein Langtextfeld
 * nebeneinander wie ein Feldsystem wirken (derselbe Grund wie bei `Auswahlfeld`).
 */
export function Langtextfeld({
  wert,
  aufAenderung,
  platzhalter,
  ungueltig = false,
  gesperrt = false,
  nurLesen = false,
  name,
  id,
  ariaLabel,
  zeilen = 3,
  aufVerlassen,
}: LangtextfeldProps) {
  return (
    <textarea
      className="wz-eingabekoerper wz-langtextfeld"
      value={wert}
      onChange={(ereignis: ChangeEvent<HTMLTextAreaElement>) => aufAenderung(ereignis.target.value)}
      placeholder={platzhalter}
      disabled={gesperrt}
      readOnly={nurLesen}
      aria-invalid={ungueltig}
      name={name}
      id={id}
      aria-label={ariaLabel}
      rows={zeilen}
      onBlur={aufVerlassen}
    />
  )
}
