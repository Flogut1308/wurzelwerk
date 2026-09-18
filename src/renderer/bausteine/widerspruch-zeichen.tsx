import { useTranslation } from 'react-i18next'
import './widerspruch-zeichen.css'

export interface WiderspruchZeichenProps {
  /** AP-1.7 PR-B (E21): zusätzliche optische Hervorhebung für einen UNAUFGELÖSTEN Widerspruch
   * (`PersonDetailGrunddatenFeld.hat_widerspruch`) — das Zeichen selbst bleibt „es gibt
   * konkurrierende Angaben" (`hatKonkurrierende`, das unabhängig von einer Bevorzugung bestehen
   * bleibt); diese Prop verstärkt nur Beschriftung und Darstellung, erzeugt keine fünfte
   * Konfidenzstufe und kein zweites Zeichen. Ohne Angabe unverändert wie bisher (Listenansicht,
   * AP-1.6). */
  readonly ungeloest?: boolean
  /** AP-1.7 PR-B: S-09-Auslöser „Klick auf `WiderspruchZeichen`" öffnet die Widerspruchsansicht.
   * Ohne Angabe bleibt das Zeichen wie bisher ein reines `role="img"` (Listenansicht, kein
   * Klickziel dort). */
  readonly aufKlick?: () => void
}

/**
 * `WiderspruchZeichen` — Atom (§2.1): entweder sichtbar (es gibt konkurrierende Aussagen) oder gar
 * nicht gerendert — der Aufrufer entscheidet das über `hatKonkurrierende`/`hat_widerspruch`,
 * dieses Atom kennt keine Daten.
 */
export function WiderspruchZeichen({ ungeloest = false, aufKlick }: WiderspruchZeichenProps) {
  const { t } = useTranslation('liste')
  const beschriftung = t(ungeloest ? 'widerspruch_ungeloest' : 'widerspruch')
  const klasse = `wz-widerspruchzeichen${ungeloest ? ' wz-widerspruchzeichen--ungeloest' : ''}`

  if (aufKlick === undefined) {
    return <span className={klasse} role="img" aria-label={beschriftung} title={beschriftung} />
  }
  return <button type="button" className={`${klasse} wz-widerspruchzeichen--klickbar`} onClick={aufKlick} aria-label={beschriftung} title={beschriftung} />
}
