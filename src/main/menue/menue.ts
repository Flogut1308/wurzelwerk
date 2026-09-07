import { Menu, type MenuItemConstructorOptions } from 'electron'
import { TASTENKUERZEL } from './tastenkuerzel'

/**
 * Provisorische deutsche Menü-Beschriftungen (i18n folgt AP-0.3, ADR-011). Tastenkürzel kommen
 * ausschließlich aus `tastenkuerzel.ts`.
 */
export function menueErzeugen(): Menu {
  const vorlage: MenuItemConstructorOptions[] = [
    {
      label: 'Wurzelwerk',
      submenu: [{ label: 'Beenden', accelerator: TASTENKUERZEL.beenden, role: 'quit' }],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', accelerator: TASTENKUERZEL.rueckgaengig, role: 'undo' },
        { label: 'Wiederholen', accelerator: TASTENKUERZEL.wiederholen, role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
      ],
    },
  ]

  return Menu.buildFromTemplate(vorlage)
}
