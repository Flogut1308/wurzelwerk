import { Menu, type MenuItemConstructorOptions } from 'electron'
import i18next from 'i18next'
import menue from '../../shared/i18n/de/menue.json'
import { TASTENKUERZEL } from './tastenkuerzel'

/**
 * Eigene i18next-Instanz für den Hauptprozess (ADR-011, AP-0.3) — react-i18next ist
 * Renderer-only (§2). `initAsync: false`, weil die Ressourcen gebündelt sind: `init()` muss
 * abgeschlossen sein, bevor `menueErzeugen()` zum ersten Mal `t(...)` aufruft, und dieser Aufruf
 * passiert synchron in `app.whenReady()` (siehe `src/main/index.ts`).
 */
const menueI18n = i18next.createInstance()
void menueI18n.init({
  lng: 'de',
  fallbackLng: false,
  ns: ['menue'],
  defaultNS: 'menue',
  resources: { de: { menue } },
  initAsync: false,
})

export function menueErzeugen(): Menu {
  const t = menueI18n.t.bind(menueI18n)
  const vorlage: MenuItemConstructorOptions[] = [
    {
      label: t('wurzelwerk'),
      submenu: [{ label: t('beenden'), accelerator: TASTENKUERZEL.beenden, role: 'quit' }],
    },
    {
      label: t('bearbeiten'),
      submenu: [
        { label: t('rueckgaengig'), accelerator: TASTENKUERZEL.rueckgaengig, role: 'undo' },
        { label: t('wiederholen'), accelerator: TASTENKUERZEL.wiederholen, role: 'redo' },
        { type: 'separator' },
        { label: t('ausschneiden'), role: 'cut' },
        { label: t('kopieren'), role: 'copy' },
        { label: t('einfuegen'), role: 'paste' },
      ],
    },
  ]

  return Menu.buildFromTemplate(vorlage)
}
