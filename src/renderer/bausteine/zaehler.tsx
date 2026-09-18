import './zaehler.css'

export interface ZaehlerProps {
  readonly anzahl: number
}

/**
 * `Zaehler` — Atom (docs/71_Designsystem.md §2.1): zeigt eine Anzahl. Bewusst auch bei `0` (analog
 * `BelegAbzeichen`, `beleg-abzeichen.tsx`) — „keine" ist selbst eine Aussage, kein Grund, das
 * Zeichen wegzulassen. Reine Ziffernanzeige ohne Tausendertrennzeichen, konsistent mit der
 * bestehenden Praxis in `BelegAbzeichen`; ein Aufrufer mit großen Zahlen formatiert selbst (analog
 * `blaetterleiste.tsx`, das ganze Sätze über i18n-Interpolation baut).
 */
export function Zaehler({ anzahl }: ZaehlerProps) {
  return <span className="wz-zaehler">{anzahl}</span>
}
