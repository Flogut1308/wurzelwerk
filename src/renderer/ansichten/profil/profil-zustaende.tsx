// AP-1.30 PR 7b: Lade- und Fehlerzustand von `abfrage:person.detail`, geteilt von Lesesicht
// (`profil-ansicht.tsx`) und Editor (`person-bearbeiten-ansicht.tsx`) — derselbe Abruf, darum
// dieselbe Darstellung. Aus `profil-ansicht.tsx` hierher verschoben, unverändert.
import { useTranslation } from 'react-i18next'
import type { FehlerCode } from '../../../shared/fehler/codes'
import { Ladeschimmer } from '../../bausteine/ladeschimmer'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import './profil-ansicht.css'

export function ProfilLaedt() {
  const { t } = useTranslation('profil')
  return (
    <div className="wz-profil-ansicht__laedt">
      <div role="status" aria-live="polite" className="wz-profil-ansicht__statusregion">
        {t('laedt')}
      </div>
      <Ladeschimmer form="block" />
      <Ladeschimmer form="block" />
      <Ladeschimmer form="block" />
    </div>
  )
}

export function ProfilFehler({ code }: { readonly code: FehlerCode }) {
  const { t } = useTranslation('profil')
  if (code === 'NICHT_GEFUNDEN_PERSON') {
    return <LeerzustandBlock titel={t('nicht_gefunden_titel')} text={t('nicht_gefunden_text')} />
  }
  return <LeerzustandBlock titel={t('fehler_titel')} text={t('fehler_text')} />
}
