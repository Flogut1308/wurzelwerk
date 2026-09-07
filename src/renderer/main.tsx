import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { fehlerweiterleitungEinrichten } from './fehler/fehlerweiterleitung'

fehlerweiterleitungEinrichten()

const wurzelKnoten = document.getElementById('wurzel')
if (wurzelKnoten === null) {
  throw new Error('Wurzelelement #wurzel fehlt in index.html')
}

createRoot(wurzelKnoten).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
