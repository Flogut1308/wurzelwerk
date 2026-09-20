import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SchaltflaecheSymbol } from './schaltflaeche-symbol'
import { Schaltflaeche } from './schaltflaeche'
import { Text } from './text'
import './vorschlagskarte.css'

export type VorschlagskarteZustand = 'vorschlag' | 'bestaetigt' | 'verworfen'

export interface VorschlagskarteProps {
  readonly zustand: VorschlagskarteZustand
  /** Der Originalwortlaut aus dem Freitextfeld, aus dem der Vorschlag erkannt wurde (70_UX §12) —
   * bleibt in JEDEM sichtbaren Zustand mit dabei, in `--wz-familie-original` (§3.5). */
  readonly originalwortlaut: string
  /** Die erkannte Struktur/der Vorschlagsinhalt selbst (§2.2: „Inhalt + Bestätigen + Verwerfen"). */
  readonly children: ReactNode
  /** Nur wirksam im Zustand `vorschlag`. */
  readonly aufBestaetigen?: () => void
  /** Nur wirksam im Zustand `vorschlag`. */
  readonly aufVerwerfen?: () => void
  /** Nur wirksam im Zustand `verworfen`. */
  readonly aufWiederherstellen?: () => void
}

/**
 * `Vorschlagskarte` — Molekül (docs/71_Designsystem.md §2.2/§3.5, Grundlage für AP-1.21, 70_UX
 * §12 Regel 1: „nichts wird ohne Bestätigung geschrieben"). Drei Zustände, klar unterscheidbar
 * über eine eigene Modifikatorklasse — nicht nur eine Farbnuance (§3.5: „darf nie wie ein
 * Datensatz aussehen"). „Bestätigen mit einer Taste, ohne Maus, ohne Dialog" ist hier wörtlich
 * ein natives `<button>`: Tab dorthin, EIN Tastendruck (Enter/Leertaste) löst sofort aus, kein
 * Bestätigungsdialog dazwischen — das erfüllt die Regel, ohne eine eigene globale
 * Tastaturkürzel-Logik zu erfinden (die in dieser rein präsentativen Stufe noch nicht verdrahtet
 * werden kann, AP-1.13 PR-A hat keinen Interview-Kontext).
 */
export function Vorschlagskarte({ zustand, originalwortlaut, children, aufBestaetigen, aufVerwerfen, aufWiederherstellen }: VorschlagskarteProps) {
  const { t } = useTranslation('felder')

  if (zustand === 'verworfen') {
    return (
      <div className="wz-vorschlagskarte wz-vorschlagskarte--verworfen">
        <Text rolle="hilfe" farbe="tertiaer" als="span">
          {t('vorschlagskarte_verworfen')}
        </Text>
        {aufWiederherstellen !== undefined ? (
          <Schaltflaeche variante="unauffaellig" aufKlick={aufWiederherstellen}>
            {t('vorschlagskarte_wiederherstellen')}
          </Schaltflaeche>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`wz-vorschlagskarte wz-vorschlagskarte--${zustand}`}>
      <div className="wz-vorschlagskarte__inhalt">{children}</div>
      <Text rolle="original" als="p">
        {originalwortlaut}
      </Text>
      {zustand === 'vorschlag' ? (
        <div className="wz-vorschlagskarte__aktionen">
          <SchaltflaecheSymbol
            name="check"
            variante="primaer"
            beschriftung={t('vorschlagskarte_bestaetigen')}
            {...(aufBestaetigen !== undefined ? { aufKlick: aufBestaetigen } : {})}
          />
          <SchaltflaecheSymbol
            name="x"
            variante="unauffaellig"
            beschriftung={t('vorschlagskarte_verwerfen')}
            {...(aufVerwerfen !== undefined ? { aufKlick: aufVerwerfen } : {})}
          />
        </div>
      ) : null}
    </div>
  )
}
