import { BrowserWindow } from 'electron'
import { EREIGNIS_KANAELE } from '../../shared/ipc/kanaele'

/**
 * Sendet ein `ereignis:`-Push an alle offenen Fenster (§2.5). `EREIGNIS_KANAELE` ist in AP-0.2
 * noch leer — Phase 1 ergänzt die ersten Kanäle (`ereignis:datenGeaendert` u.a.), diese Funktion
 * steht schon jetzt bereit, damit kein zweiter Weg für Pushes entsteht.
 */
export function sendeEreignis<T>(kanal: (typeof EREIGNIS_KANAELE)[number], nutzlast: T): void {
  for (const fenster of BrowserWindow.getAllWindows()) {
    fenster.webContents.send(kanal, nutzlast)
  }
}
