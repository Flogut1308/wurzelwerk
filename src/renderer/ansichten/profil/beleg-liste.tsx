import { useTranslation } from 'react-i18next'
import type { PersonDetailGrunddatenFeld } from '../../../shared/schemata/person-detail'
import { Text } from '../../bausteine/text'
import './beleg-liste.css'

export interface BelegListeProps {
  readonly feld: PersonDetailGrunddatenFeld
}

/**
 * `Belegliste` — Organismus (docs/71_Designsystem.md §2.3, B-01, S-08): Inhalt der
 * `Seitenschublade`, die `BelegAbzeichen` öffnet. Zeigt jede Aussage des Felds mit ihren Belegen
 * (Quelle → Zitat, Zitat in `--wz-familie-original` über `Text rolle="original"`) — dreistufig,
 * wie `72_Screens_und_Flows.md` S-08 es beschreibt, ABWEICHUNG (CLAUDE.md §14 Fall 2): der
 * PR-A-Vertrag (`PersonDetailBeleg`) liefert `quelle`/`zitat` bereits flach (keine getrennten
 * Titel/Typ/Archiv/Signatur-Felder, keine `unmittelbarkeit`) — es gibt hier also zwei Stufen
 * (Quelle, Zitat), nicht drei, und keine mündliche Zusatzangabe. Vermerkt in
 * `docs/80_Offene_Fragen.md`.
 */
export function BelegListe({ feld }: BelegListeProps) {
  const { t } = useTranslation('profil')

  return (
    <ul className="wz-beleg-liste">
      {feld.aussagen.map((aussage) => (
        <li key={aussage.aussage_id} className="wz-beleg-liste__aussage">
          <Text rolle="koerper" als="p">
            {aussage.wert ?? t('wert_unbekannt')}
          </Text>
          {aussage.belege.length === 0 ? (
            <Text rolle="hilfe" als="p">
              {t('beleg_schublade_keine_belege')}
            </Text>
          ) : (
            <ul className="wz-beleg-liste__belege">
              {aussage.belege.map((beleg, index) => (
                <li key={index} className="wz-beleg-liste__beleg">
                  <Text rolle="beschriftung" als="span">
                    {beleg.quelle}
                  </Text>
                  {beleg.zitat !== null ? (
                    <Text rolle="original" als="p">
                      {beleg.zitat}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
