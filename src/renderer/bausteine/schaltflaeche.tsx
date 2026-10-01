import type { ReactNode } from 'react'
import './schaltflaeche.css'

/** Vier Varianten aus docs/71_Designsystem.md §2.1. */
export type SchaltflaecheVariante = 'primaer' | 'sekundaer' | 'unauffaellig' | 'gefaehrlich'

export interface SchaltflaecheProps {
  readonly variante?: SchaltflaecheVariante
  readonly typ?: 'button' | 'submit'
  /** Zustand „gesperrt" (§2.1). */
  readonly gesperrt?: boolean
  /** Zustand „ladend" (§2.1) — setzt `aria-busy` und sperrt die Fläche, ohne einen Ladebalken
   * zu zeigen (§1.5 verbietet einen Fortschritt, der keinen echten Fortschritt kennt). */
  readonly ladend?: boolean
  readonly aufKlick?: () => void
  /** Zugänglicher Name, wenn er mehr sagen muss als der sichtbare Text (z. B. „Trennen: Anna" in einer Liste
   * gleicher Knöpfe). Beginnt mit dem sichtbaren Text (WCAG 2.5.3 „Beschriftung im Namen"). */
  readonly ariaLabel?: string
  /** `id` eines Elements, das die Schaltfläche beschreibt (z. B. der Grund einer Sperre). */
  readonly ariaBeschriebenDurch?: string
  /** Sichtbarer Text — immer über i18n vom Aufrufer befüllt (ADR-011), nie hier. */
  readonly children: ReactNode
}

/**
 * `Schaltflaeche` — Atom (§2.1). „hover"/„aktiv"/„fokus" sind reine CSS-Pseudoklassen
 * (Fokusring global in `basis.css`), „gesperrt"/„ladend" steuern `disabled`/`aria-busy`.
 */
export function Schaltflaeche({ variante = 'sekundaer', typ = 'button', gesperrt = false, ladend = false, aufKlick, ariaLabel, ariaBeschriebenDurch, children }: SchaltflaecheProps) {
  return (
    <button
      type={typ}
      className={`wz-schaltflaeche wz-schaltflaeche--${variante}`}
      disabled={gesperrt || ladend}
      aria-busy={ladend}
      aria-label={ariaLabel}
      aria-describedby={ariaBeschriebenDurch}
      onClick={aufKlick}
    >
      {children}
    </button>
  )
}
