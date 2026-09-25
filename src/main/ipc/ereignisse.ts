import { BrowserWindow, type WebContents } from 'electron'
import type { EreignisKanal, EreignisNutzlast } from '../../shared/ipc/vertrag'

/**
 * Sendet ein `ereignis:`-Push an alle offenen Fenster (§2.5). Der Kanal bindet die Nutzlast über
 * `EreignisNutzlast<K>` an `EreignisVertrag` (AP-0.20) — ein erfundener Kanalname oder eine
 * unvollständige Nutzlast sind damit ein Typfehler am Aufrufer, nicht erst eine Laufzeitüberraschung
 * beim `journalStatusNutzlastSchema.parse(...)` im Renderer.
 */
export function sendeEreignis<K extends EreignisKanal>(kanal: K, nutzlast: EreignisNutzlast<K>): void {
  for (const fenster of BrowserWindow.getAllWindows()) {
    fenster.webContents.send(kanal, nutzlast)
  }
}

/**
 * Wie `sendeEreignis`, aber an genau ein Fenster (AP-1.30 PR 7c): eine beobachtete Taste gehört dem
 * Fenster, in dem sie gedrückt wurde (`ereignis:kontexttaste`), nicht allen offenen Fenstern.
 */
export function sendeEreignisAn<K extends EreignisKanal>(ziel: WebContents, kanal: K, nutzlast: EreignisNutzlast<K>): void {
  ziel.send(kanal, nutzlast)
}
