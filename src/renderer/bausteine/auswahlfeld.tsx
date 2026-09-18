import type { ChangeEvent } from 'react'
import './auswahlfeld.css'

export interface AuswahlfeldOption<Wert extends string> {
  readonly wert: Wert
  /** Sichtbarer Optionstext — immer über i18n vom Aufrufer befüllt (ADR-011), nie hier. */
  readonly beschriftung: string
}

export interface AuswahlfeldProps<Wert extends string> {
  readonly wert: Wert
  readonly optionen: readonly AuswahlfeldOption<Wert>[]
  readonly aufAenderung: (wert: Wert) => void
  readonly gesperrt?: boolean
  readonly name?: string
  readonly id?: string
  /** Zugänglicher Name, wenn keine sichtbare Beschriftung danebensteht. */
  readonly ariaLabel?: string
}

/**
 * `Auswahlfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper + Liste, einfach". Anders
 * als `Textfeld`/`Zahlfeld` (die den `Eingabekoerper`-Rahmen auf einem `<input>` wiederverwenden)
 * braucht eine echte Auswahl aus einer festen Liste ein `<select>` — der native Bedienkomfort
 * (Tastatur, Screenreader, Systemmenü) wiegt hier schwerer als ein zweites `Eingabekoerper`-Layout
 * über einem unsichtbaren `<select>`. `auswahlfeld.css` spiegelt trotzdem bewusst denselben
 * Rahmen/Radius/Innenabstand wie `eingabekoerper.css`, damit beide nebeneinander (Filterleiste) wie
 * ein zusammengehöriges Feldsystem wirken.
 */
export function Auswahlfeld<Wert extends string>({
  wert,
  optionen,
  aufAenderung,
  gesperrt = false,
  name,
  id,
  ariaLabel,
}: AuswahlfeldProps<Wert>) {
  return (
    <select
      className="wz-auswahlfeld"
      value={wert}
      disabled={gesperrt}
      name={name}
      id={id}
      aria-label={ariaLabel}
      onChange={(ereignis: ChangeEvent<HTMLSelectElement>) =>
        aufAenderung(ereignis.target.value as Wert) // <select> liefert nur Werte aus `optionen` zurück (CLAUDE.md §4)
      }
    >
      {optionen.map((option) => (
        <option key={option.wert} value={option.wert}>
          {option.beschriftung}
        </option>
      ))}
    </select>
  )
}
