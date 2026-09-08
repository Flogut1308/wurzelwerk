import { Menu, type MenuItemConstructorOptions } from 'electron'
import i18next from 'i18next'
import menue from '../../shared/i18n/de/menue.json'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { protokollFehler } from '../protokoll/logger'
import { wartungAbgeleiteteNeuAufbauen } from '../wartung/abgeleitete-neu-aufbauen'
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
    {
      label: t('wartung'),
      submenu: [
        {
          label: t('wartung_abgeleiteteNeuAufbauen'),
          click: () => {
            try {
              wartungAbgeleiteteNeuAufbauen()
            } catch (fehler) {
              // Menübefehle laufen nicht über die IPC-Hülle (§7) - die Ausnahme darf den
              // Hauptprozess trotzdem nie verlassen, darum wird sie hier selbst protokolliert.
              protokollFehler({
                befehlsname: 'wartung.abgeleiteteNeuAufbauen',
                code: fehler instanceof WurzelFehler ? fehler.code : 'INTERN_UNERWARTET',
              })
            }
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(vorlage)
}
