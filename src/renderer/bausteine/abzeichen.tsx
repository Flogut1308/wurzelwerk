import type { ReactNode } from 'react'
import './abzeichen.css'

/** Fünf Varianten aus docs/71_Designsystem.md §2.1. */
export type AbzeichenVariante = 'neutral' | 'info' | 'erfolg' | 'warnung' | 'fehler'

export interface AbzeichenProps {
  readonly variante?: AbzeichenVariante
  /** Sichtbarer Text — immer über i18n vom Aufrufer befüllt (ADR-011), nie hier. */
  readonly children: ReactNode
}

/**
 * `Abzeichen` — Atom (§2.1): eine kleine, gefüllte Statusfläche mit Text. Farbe kommt aus der
 * Status-Rollengruppe (`--wz-status-*-flaeche`/`-text`), nie aus einem Festwert.
 */
export function Abzeichen({ variante = 'neutral', children }: AbzeichenProps) {
  return <span className={`wz-abzeichen wz-abzeichen--${variante}`}>{children}</span>
}
