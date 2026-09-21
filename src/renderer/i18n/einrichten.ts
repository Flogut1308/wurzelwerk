import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import allgemein from '../../shared/i18n/de/allgemein.json'
import datum from '../../shared/i18n/de/datum.json'
import felder from '../../shared/i18n/de/felder.json'
import fehler from '../../shared/i18n/de/fehler.json'
import importNs from '../../shared/i18n/de/import.json'
import journal from '../../shared/i18n/de/journal.json'
import liste from '../../shared/i18n/de/liste.json'
import menue from '../../shared/i18n/de/menue.json'
import orte from '../../shared/i18n/de/orte.json'
import profil from '../../shared/i18n/de/profil.json'
import pruefhinweise from '../../shared/i18n/de/pruefhinweise.json'
import quellen from '../../shared/i18n/de/quellen.json'
import zustandsbibliothek from '../../shared/i18n/de/zustandsbibliothek.json'

/**
 * Renderer-i18n (ADR-011, G-08). Ressourcen liegen in `src/shared/i18n/de/`, damit dieselben
 * Fehlertexte auch außerhalb des Renderers geprüft werden können (siehe
 * `test/einheit/i18n-vollstaendig.test.ts`). `fallbackLng: false`, weil es nur eine Sprache
 * gibt — eine stille Rückfalllogik würde einen fehlenden Schlüssel verschleiern statt ihn
 * auffallen zu lassen.
 *
 * Diese Datei wird als Seiteneffekt in `main.tsx` importiert und initialisiert die einzige
 * i18next-Instanz des Renderers. `i18n` wird benannt exportiert, damit auch Code außerhalb von
 * React-Komponenten (z. B. die Fehlergrenze) übersetzen kann, ohne den `useTranslation`-Hook zu
 * benötigen.
 */
export const i18n = i18next.createInstance()

// `initAsync: false`: alle Ressourcen sind gebündelt, es gibt kein Nachladen über ein Backend.
// Eine synchrone Initialisierung erspart einen ungewollten ersten Render mit unübersetzten
// Schlüsseln.
void i18n.use(initReactI18next).init({
  lng: 'de',
  fallbackLng: false,
  ns: ['allgemein', 'datum', 'felder', 'fehler', 'import', 'journal', 'liste', 'menue', 'orte', 'profil', 'pruefhinweise', 'quellen', 'zustandsbibliothek'],
  defaultNS: 'allgemein',
  resources: {
    de: { allgemein, datum, felder, fehler, import: importNs, journal, liste, menue, orte, profil, pruefhinweise, quellen, zustandsbibliothek },
  },
  interpolation: {
    escapeValue: false,
  },
  initAsync: false,
})
