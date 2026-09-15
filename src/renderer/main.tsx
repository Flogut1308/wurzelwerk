// Gestaltung zuerst: über den Modulgraph importiert (nicht per <link> in index.html), damit Vite
// bündelt, die Ladereihenfolge deterministisch ist (Tokens vor Grundstilen) und HMR greift.
import './gestaltung/tokens.css'
import './gestaltung/basis.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { App } from './app'
import { fehlerweiterleitungEinrichten } from './fehler/fehlerweiterleitung'
import { i18n } from './i18n/einrichten'

fehlerweiterleitungEinrichten()

const wurzelKnoten = document.getElementById('wurzel')
if (wurzelKnoten === null) {
  throw new Error('Wurzelelement #wurzel fehlt in index.html')
}

createRoot(wurzelKnoten).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
)
