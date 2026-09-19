import { useTranslation } from 'react-i18next'
import type { PersonDetailGrunddatenFeld } from '../../../shared/schemata/person-detail'
import { konfidenzStufe } from '../../bausteine/feld-konfidenz'
import { KonfidenzPunkt } from '../../bausteine/konfidenz-punkt'
import { Text } from '../../bausteine/text'
import { BelegEintrag } from './beleg-liste'
import './widerspruchsblock.css'

export interface WiderspruchsblockProps {
  readonly feld: PersonDetailGrunddatenFeld
}

/**
 * `Widerspruchsblock` — Organismus (docs/71_Designsystem.md §2.3, B-04, E21, S-09): ALLE
 * konkurrierenden Aussagen zum Prädikat nebeneinander (hier: untereinander, `Seitenschublade` ist
 * eine Spalte). Je Aussage Wert, Konfidenz, Beleg, Begründung — die bevorzugte hervorgehoben und
 * trägt ihre `begruendung` als Fließtext (`72_Screens_und_Flows.md` S-09). Zeigt explizit ALLE
 * Aussagen des Felds, nicht nur die als „konkurrierend" erkannten zwei — Leitprinzip 1: keine
 * Aussage wird gelöscht oder ausgeblendet, nur weil eine andere bevorzugt ist.
 */
export function Widerspruchsblock({ feld }: WiderspruchsblockProps) {
  const { t } = useTranslation('profil')

  return (
    <ul className="wz-widerspruchsblock">
      {feld.aussagen.map((aussage) => {
        const stufe = konfidenzStufe(aussage.konfidenz)
        const klasse = `wz-widerspruchsblock__aussage${aussage.ist_bevorzugt ? ' wz-widerspruchsblock__aussage--bevorzugt' : ''}`
        return (
          <li key={aussage.aussage_id} className={klasse}>
            <div className="wz-widerspruchsblock__kopf">
              <Text rolle="koerper" als="span">
                {aussage.wert ?? t('wert_unbekannt')}
              </Text>
              {stufe !== null ? <KonfidenzPunkt stufe={stufe} /> : null}
              {aussage.ist_bevorzugt ? (
                <Text rolle="beschriftung" farbe="akzent" als="span">
                  {t('widerspruch_bevorzugt')}
                </Text>
              ) : null}
            </div>

            {aussage.begruendung !== null ? (
              <Text rolle="koerper-klein" als="p">
                {aussage.begruendung}
              </Text>
            ) : aussage.ist_bevorzugt ? (
              <Text rolle="hilfe" als="p">
                {t('widerspruch_keine_begruendung')}
              </Text>
            ) : null}

            {aussage.belege.length === 0 ? null : (
              <ul className="wz-widerspruchsblock__belege">
                {aussage.belege.map((beleg, index) => (
                  <li key={index}>
                    <BelegEintrag beleg={beleg} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
