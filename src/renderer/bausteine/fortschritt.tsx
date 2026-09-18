import './fortschritt.css'

export type FortschrittArt = 'bestimmt' | 'unbestimmt'

export interface FortschrittProps {
  readonly art: FortschrittArt
  /** Nur bei `art: 'bestimmt'` gelesen, 0–100 (außerhalb dieser Spanne wird geklemmt). */
  readonly prozent?: number
  /** Zugänglicher Name — vom Aufrufer über i18n befüllt. */
  readonly bezeichnung: string
}

/**
 * `Fortschritt` — Atom (docs/71_Designsystem.md §2.1). KEIN natives `<progress>` ohne `value`: das
 * würde vom Browser einen unkontrollierbaren, endlos laufenden Ladebalken rendern —
 * `docs/71_Designsystem.md` §1.5/CLAUDE.md §13 verbieten „einen Ladebalken, der sich bewegt, ohne
 * Fortschritt zu kennen", dieselbe Sperre wie bei `Ladeschimmer` (`ladeschimmer.css`). „unbestimmt"
 * zeigt darum eine ruhige, statische Füllung statt einer Animation.
 */
export function Fortschritt({ art, prozent, bezeichnung }: FortschrittProps) {
  const wert = art === 'bestimmt' ? Math.min(100, Math.max(0, prozent ?? 0)) : undefined
  return (
    <div
      role="progressbar"
      aria-label={bezeichnung}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={wert}
      className={`wz-fortschritt wz-fortschritt--${art}`}
    >
      <div className="wz-fortschritt__fuellung" style={art === 'bestimmt' ? { width: `${String(wert ?? 0)}%` } : undefined} />
    </div>
  )
}
