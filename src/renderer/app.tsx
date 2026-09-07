import { StartAnsicht } from './ansichten/start/start-ansicht'
import { Fehlergrenze } from './fehler/fehlergrenze'

export function App() {
  return (
    <Fehlergrenze>
      <StartAnsicht />
    </Fehlergrenze>
  )
}
