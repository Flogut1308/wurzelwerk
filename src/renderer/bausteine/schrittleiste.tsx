import { Text } from './text'
import './schrittleiste.css'

export interface SchrittleisteSchritt {
  /** Sichtbarer Name des Schritts — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly beschriftung: string
}

export interface SchrittleisteProps {
  readonly schritte: readonly SchrittleisteSchritt[]
  /** Null-basierter Index des aktiven Schritts. */
  readonly aktiv: number
}

/**
 * `Schrittleiste` — Molekül für den Kopf des Import-Assistenten (T-Assistent, 72 §S-10/S-11/S-13:
 * „Schritt 1 von 3"). Es gibt keinen T-Assistent-Baustein und keinen Symbolsatz (Phase-0-Asset,
 * noch nicht ausgeliefert, wie in `leerzustand-block.tsx` vermerkt) — die Leiste trägt die Position
 * darum rein textlich und über `aria-current`, ohne ein erfundenes Icon (CLAUDE.md §14). Die
 * numerische Position ist Teil der Beschriftung des Aufrufers, damit hier kein Zahlenliteral im JSX
 * steht (§4).
 */
export function Schrittleiste({ schritte, aktiv }: SchrittleisteProps) {
  return (
    <ol className="wz-schrittleiste">
      {schritte.map((schritt, index) => {
        const zustand = index < aktiv ? 'erledigt' : index === aktiv ? 'aktiv' : 'offen'
        return (
          <li key={schritt.beschriftung} className={`wz-schrittleiste__schritt wz-schrittleiste__schritt--${zustand}`} aria-current={index === aktiv ? 'step' : undefined}>
            <Text rolle="beschriftung" farbe={index === aktiv ? 'akzent' : 'sekundaer'} als="span">
              {schritt.beschriftung}
            </Text>
          </li>
        )
      })}
    </ol>
  )
}
