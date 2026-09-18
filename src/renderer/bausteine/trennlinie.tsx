import './trennlinie.css'

/** Zwei Ausrichtungen aus docs/71_Designsystem.md §2.1. */
export type TrennlinieAusrichtung = 'waagerecht' | 'senkrecht'

export interface TrennlinieProps {
  readonly ausrichtung?: TrennlinieAusrichtung
}

/**
 * `Trennlinie` — Atom (§2.1). `role="separator"` statt `<hr>`: das native `<hr>` ist immer
 * horizontal und lässt sich nicht als senkrechte Trennung ausgeben.
 */
export function Trennlinie({ ausrichtung = 'waagerecht' }: TrennlinieProps) {
  return (
    <div
      role="separator"
      aria-orientation={ausrichtung === 'waagerecht' ? 'horizontal' : 'vertical'}
      className={`wz-trennlinie wz-trennlinie--${ausrichtung}`}
    />
  )
}
