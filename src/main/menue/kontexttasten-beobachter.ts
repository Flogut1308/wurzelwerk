import type { WebContents } from 'electron'
import { sendeEreignisAn } from '../ipc/ereignisse'
import { kontexttasteErkennen } from './tastenkuerzel'

/**
 * Beobachtet die Tastatureingabe eines Fensters auf Kontexttasten (AP-1.30 PR 7c, docs/80 §33
 * V-130-7-tasten; Tabelle und Prüfung in `tastenkuerzel.ts`, CLAUDE.md §11). Bewusst OHNE
 * `event.preventDefault()`: die Taste erreicht den Renderer unverändert, eine Ziffer im Textfeld
 * wird also immer getippt. Erkannte Kontexttasten gehen zusätzlich als `ereignis:kontexttaste` an
 * genau dieses Fenster; der Renderer entscheidet am Fokus, ob sie wirken.
 */
export function kontexttastenBeobachten(webContents: WebContents): void {
  webContents.on('before-input-event', (_ereignis, eingabe) => {
    const taste = kontexttasteErkennen(eingabe)
    if (taste === null) return
    sendeEreignisAn(webContents, 'ereignis:kontexttaste', taste)
  })
}
