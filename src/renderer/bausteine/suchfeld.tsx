import { useTranslation } from 'react-i18next'
import { Eingabekoerper } from './eingabekoerper'
import './suchfeld.css'

export interface SuchfeldProps {
  readonly wert: string
  readonly aufAenderung: (wert: string) => void
  /** Trefferzahl der aktuellen Eingabe; `null` = noch keine Suche ausgeführt (leeres Feld). */
  readonly treffer: number | null
  readonly gesperrt?: boolean
}

/**
 * `Suchfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper + Löschknopf + Trefferzähler".
 *
 * Hueter-Auflage aus dem Stufe-2-Review: `Eingabekoerper` erzwingt selbst keinen zugänglichen
 * Namen (das Atom kennt nur ein optionales `ariaLabel`) — dieses Molekül MUSS eines mitgeben,
 * sonst wäre das Feld für einen Screenreader ein unbeschriftetes Textfeld. `suchfeld_beschriftung`
 * ist deshalb kein optionaler Prop, sondern fest verdrahtet über i18n (ADR-011).
 */
export function Suchfeld({ wert, aufAenderung, treffer, gesperrt = false }: SuchfeldProps) {
  const { t } = useTranslation('liste')
  return (
    <div className="wz-suchfeld">
      <div className="wz-suchfeld__feld">
        <Eingabekoerper
          typ="search"
          wert={wert}
          aufAenderung={aufAenderung}
          platzhalter={t('suchfeld_platzhalter')}
          ariaLabel={t('suchfeld_beschriftung')}
          gesperrt={gesperrt}
        />
        {wert !== '' ? (
          <button
            type="button"
            className="wz-suchfeld__loeschen"
            aria-label={t('suchfeld_loeschen')}
            onClick={() => aufAenderung('')}
          />
        ) : null}
      </div>
      {treffer !== null ? (
        <span className="wz-suchfeld__treffer" role="status">
          {t('suchfeld_treffer', { anzahl: treffer })}
        </span>
      ) : null}
    </div>
  )
}
