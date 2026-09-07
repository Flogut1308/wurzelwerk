import { useEffect, useState } from 'react'
import { aufrufen } from './brücke/aufrufen'
import { Fehlergrenze } from './fehler/fehlergrenze'
import type { VersionInfo } from '../shared/ipc/vertrag'

export function App() {
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
      <div>
        Wurzelwerk
        {version !== null ? ` — Schema ${version.schema}` : null}
      </div>
    </Fehlergrenze>
  )
}
