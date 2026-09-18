import { useTranslation } from 'react-i18next'
import './widerspruch-zeichen.css'

/**
 * `WiderspruchZeichen` — Atom (§2.1), ohne Varianten oder Zustände: entweder sichtbar (es gibt
 * konkurrierende Aussagen) oder gar nicht gerendert — der Aufrufer entscheidet das über
 * `PersonListeZeile.hat_widerspruch`, dieses Atom kennt keine Daten.
 */
export function WiderspruchZeichen() {
  const { t } = useTranslation('liste')
  const beschriftung = t('widerspruch')
  return <span className="wz-widerspruchzeichen" role="img" aria-label={beschriftung} title={beschriftung} />
}
