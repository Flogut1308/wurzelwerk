import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aufrufen } from './brücke/aufrufen'
import { Fehlergrenze } from './fehler/fehlergrenze'
import type { VersionInfo } from '../shared/ipc/vertrag'

export function App() {
  const { t } = useTranslation('allgemein')
  const [version, setVersion] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let abgebrochen = false
    void aufrufen('abfrage:version', null).then((ergebnis) => {
      if (!abgebrochen && ergebnis.ok) {
        setVersion(ergebnis.daten)
      }
    })
    return () => {
      abgebrochen = true
    }
  }, [])

  return (
    <Fehlergrenze>
      <div>{version !== null ? t('titel_mit_schema', { schema: version.schema }) : t('app_titel')}</div>
    </Fehlergrenze>
  )
}
