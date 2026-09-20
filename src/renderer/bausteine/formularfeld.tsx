import type { ReactNode } from 'react'
import { Text } from './text'
import './formularfeld.css'

export interface FormularfeldProps {
  /** Sichtbare Beschriftung — immer über i18n vom Aufrufer befüllt (ADR-011). */
  readonly beschriftung: string
  /** Hilfetext unter dem Feld — verschwindet, sobald `fehlertext` gesetzt ist. */
  readonly hilfetext?: string
  /** Fehlermeldung unter dem Feld — gewinnt gegen `hilfetext` (§10 Prinzip: eine Zeile, kein
   * gleichzeitiges Nennen beider). */
  readonly fehlertext?: string
  /** Dimmt die Beschriftung, wenn das enthaltene Feld selbst gesperrt ist — rein visuell, das
   * `disabled` am eigentlichen Steuerelement bleibt Sache des Kindfelds. */
  readonly gesperrt?: boolean
  /** Slot für den `Konfidenzwaehler` dieses Feldes — „immer erreichbar und nie im Weg" (§2.2). */
  readonly konfidenzwaehler?: ReactNode
  /** Slot für das `BelegAbzeichen` dieses Feldes. */
  readonly belegabzeichen?: ReactNode
  /** Das eigentliche Eingabefeld (Textfeld/Zahlfeld/Langtextfeld/Datumsfeld/…). */
  readonly children: ReactNode
}

/**
 * `Formularfeld` — Molekül (docs/71_Designsystem.md §2.2): „Beschriftung + Feld + Hilfetext +
 * Fehlermeldung + Konfidenzwähler + Belegabzeichen" — die Hülle, die JEDES Datenfeld trägt. Ein
 * einziges `<label>` umschließt Beschriftung, Slots und Feld (wie `Filterleiste`s Gruppen,
 * `filterleiste.tsx`): das native Label-Verhalten übernimmt die Tastatur-/Klick-Weiterleitung an
 * das erste fokussierbare Kindfeld, ohne dass diese Hülle eine `id`/`htmlFor`-Kopplung verwalten
 * muss. Die Metazeile (Hilfetext ODER Fehlertext) wird immer gerendert — auch leer — damit ein
 * später erscheinender Fehler das Feld darüber nicht nach oben schiebt (Entwurfsprüfstein §3.1).
 */
export function Formularfeld({ beschriftung, hilfetext, fehlertext, gesperrt = false, konfidenzwaehler, belegabzeichen, children }: FormularfeldProps) {
  const hatSlots = konfidenzwaehler !== undefined || belegabzeichen !== undefined
  return (
    <label className="wz-formularfeld">
      <span className="wz-formularfeld__kopf">
        <Text rolle="beschriftung" als="span" {...(gesperrt ? { farbe: 'gesperrt' as const } : {})}>
          {beschriftung}
        </Text>
        {hatSlots ? (
          <span className="wz-formularfeld__slots">
            {konfidenzwaehler}
            {belegabzeichen}
          </span>
        ) : null}
      </span>
      <span className="wz-formularfeld__feld">{children}</span>
      <span className="wz-formularfeld__meta" aria-live="polite">
        {fehlertext !== undefined ? (
          <Text rolle="hilfe" als="p" farbe="akzent">
            {fehlertext}
          </Text>
        ) : hilfetext !== undefined ? (
          <Text rolle="hilfe" als="p">
            {hilfetext}
          </Text>
        ) : null}
      </span>
    </label>
  )
}
