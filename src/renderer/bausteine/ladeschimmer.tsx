import './ladeschimmer.css'

export type LadeschimmerForm = 'zeile' | 'block' | 'kreis'

export interface LadeschimmerProps {
  readonly form: LadeschimmerForm
}

/**
 * `Ladeschimmer` — Atom (§2.1), rein dekorativ (`aria-hidden`): eine einzelne Platzhalterfläche
 * für den „lädt"-Zustand (S-05). Mehrere Instanzen (z. B. eine Tabellenzeile pro Spalte) sollen
 * nicht einzeln vorgelesen werden — der künftige Container (Organismus `Datentabelle`) trägt die
 * EINE zugängliche Statusmeldung „Lädt" für den ganzen Bereich (`aria-live`/`role="status"`),
 * nicht dieses Atom. Siehe `ladeschimmer.css` zur bewussten Abweichung vom Namen (§14 Fall 2).
 */
export function Ladeschimmer({ form }: LadeschimmerProps) {
  return <span className={`wz-ladeschimmer wz-ladeschimmer--${form}`} aria-hidden="true" />
}
