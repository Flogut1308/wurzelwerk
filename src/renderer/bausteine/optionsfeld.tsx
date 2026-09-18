import './optionsfeld.css'

/** Dieselben drei sichtbaren Zustände wie `Kontrollkaestchen`/`Umschalter`. */
export type OptionsfeldZustand = 'ein' | 'aus' | 'unbestimmt'

export interface OptionsfeldProps {
  readonly zustand: OptionsfeldZustand
  /** Zugänglicher Name — vom Aufrufer über i18n befüllt. */
  readonly bezeichnung: string
  readonly gesperrt?: boolean
  readonly aufAenderung: () => void
}

/**
 * `Optionsfeld` — Atom (docs/71_Designsystem.md §2.1), `role="radio"` mit `aria-checked`. Ein
 * Klick auf ein Optionsfeld wählt es aus — welche der übrigen Optionen einer Gruppe daraufhin
 * abgewählt wird, entscheidet der Aufrufer (die Gruppe selbst ist kein Bestandteil dieses Atoms).
 */
export function Optionsfeld({ zustand, bezeichnung, gesperrt = false, aufAenderung }: OptionsfeldProps) {
  const ariaChecked = zustand === 'unbestimmt' ? 'mixed' : zustand === 'ein'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ariaChecked}
      aria-label={bezeichnung}
      disabled={gesperrt}
      className={`wz-optionsfeld wz-optionsfeld--${zustand}`}
      onClick={aufAenderung}
    >
      <span className="wz-optionsfeld__punkt" aria-hidden="true" />
    </button>
  )
}
