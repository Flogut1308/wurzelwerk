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
