import { useTranslation } from 'react-i18next'
import type { PersonDetailBeleg, PersonDetailGrunddatenFeld } from '../../../shared/schemata/person-detail'
import { Text } from '../../bausteine/text'
import { quelleTypSchluessel, unmittelbarkeitSchluessel } from './profil-schluessel'
import './beleg-liste.css'

export interface BelegListeProps {
  readonly feld: PersonDetailGrunddatenFeld
}

export interface BelegEintragProps {
  readonly beleg: PersonDetailBeleg
}

/**
 * `BelegEintrag` — DREISTUFIGE Anzeige eines einzelnen Belegs (S-08, U-1.7-belegliste-zweistufig,
 * AP-1.10 PR-B, löst die vorherige zweistufige `{ quelle: string, zitat: string | null }`-Anzeige
 * ab): Stufe 1 Quelle (Typ/Titel/Archiv/Signatur, plus `unmittelbarkeit` NUR bei `typ ===
 * 'muendlich'`, §2.15) → Stufe 2 Zitat (Seite/Eintragsnummer/Zugriffsdatum/Digitalisat-Link,
 * Zeile nur sichtbar, wenn mindestens eines davon gepflegt ist) → Stufe 3 Transkript (in
 * `--wz-familie-original` über `Text rolle="original"`, wie zuvor). Exportiert, weil
 * `Widerspruchsblock` (S-09) dieselbe Beleg-Anzeige braucht — ein Beleg sieht in beiden Schubladen
 * gleich aus.
 */
export function BelegEintrag({ beleg }: BelegEintragProps) {
  const { t } = useTranslation('profil')
  const { quelle, zitat, transkript } = beleg
  const zitatHatInhalt = zitat.seite !== null || zitat.eintragsnummer !== null || zitat.zugriffsdatum_wert1 !== null || zitat.digitalisat_url !== null

  return (
    <div className="wz-beleg-eintrag">
      <div className="wz-beleg-eintrag__quelle">
        <Text rolle="beschriftung" als="span">
          {quelle.titel ?? t(quelleTypSchluessel(quelle.typ))}
        </Text>
        {quelle.titel !== null ? (
          <Text rolle="hilfe" als="span">
            {t(quelleTypSchluessel(quelle.typ))}
          </Text>
        ) : null}
        {quelle.archiv_name !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t('beleg_archiv_label', { archiv: quelle.archiv_name })}
          </Text>
        ) : null}
        {quelle.signatur !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t('beleg_signatur_label', { signatur: quelle.signatur })}
          </Text>
        ) : null}
        {quelle.typ === 'muendlich' && quelle.unmittelbarkeit !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t(unmittelbarkeitSchluessel(quelle.unmittelbarkeit))}
          </Text>
        ) : null}
      </div>

      {zitatHatInhalt ? (
        <div className="wz-beleg-eintrag__zitatdetail">
          {zitat.seite !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_seite_label', { seite: zitat.seite })}
            </Text>
          ) : null}
          {zitat.eintragsnummer !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_eintragsnummer_label', { eintragsnummer: zitat.eintragsnummer })}
            </Text>
          ) : null}
          {zitat.zugriffsdatum_wert1 !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_zugriffsdatum_label', { datum: zitat.zugriffsdatum_wert1 })}
            </Text>
          ) : null}
          {zitat.digitalisat_url !== null ? (
            <a href={zitat.digitalisat_url} target="_blank" rel="noreferrer" className="wz-text wz-text--koerper-klein wz-text--farbe-akzent">
              {t('beleg_digitalisat_link')}
            </a>
          ) : null}
        </div>
      ) : null}

      {transkript !== null ? (
        <Text rolle="original" als="p">
          {transkript}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * `Belegliste` — Organismus (docs/71_Designsystem.md §2.3, B-01, S-08): Inhalt der
 * `Seitenschublade`, die `BelegAbzeichen` öffnet. Zeigt jede Aussage des Felds mit ihren Belegen
 * über `BelegEintrag` (s. o.).
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
                  <BelegEintrag beleg={beleg} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
