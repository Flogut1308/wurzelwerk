import './kontrollkaestchen.css'

/** Drei sichtbare Zustände (der vierte, „gesperrt", ist ein eigenes Bool — wie `Umschalter`). */
export type KontrollkaestchenZustand = 'ein' | 'aus' | 'unbestimmt'

export interface KontrollkaestchenProps {
  readonly zustand: KontrollkaestchenZustand
  /** Zugänglicher Name — vom Aufrufer über i18n befüllt. */
  readonly bezeichnung: string
  readonly gesperrt?: boolean
  readonly aufAenderung: (zustand: KontrollkaestchenZustand) => void
}

/**
 * `Kontrollkaestchen` — Atom (docs/71_Designsystem.md §2.1), `role="checkbox"` mit
 * `aria-checked="mixed"` für den unbestimmten Zustand (wie `Umschalter`). Anders als `Umschalter`
 * (ein echtes Tristate-FILTER-Element, das zyklisch durch alle drei Zustände klickt) ist
 * „unbestimmt" hier ein von außen berechneter Anzeigezustand (z. B. „einige, aber nicht alle
 * Kinder ausgewählt") — ein Klick löst ihn immer zu einem eindeutigen Zustand auf, wie ein
 * natives Kontrollkästchen.
 */
export function Kontrollkaestchen({ zustand, bezeichnung, gesperrt = false, aufAenderung }: KontrollkaestchenProps) {
  const ariaChecked = zustand === 'unbestimmt' ? 'mixed' : zustand === 'ein'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={bezeichnung}
      disabled={gesperrt}
      className={`wz-kontrollkaestchen wz-kontrollkaestchen--${zustand}`}
      onClick={() => aufAenderung(zustand === 'ein' ? 'aus' : 'ein')}
    >
      <span className="wz-kontrollkaestchen__haken" aria-hidden="true" />
    </button>
  )
}
