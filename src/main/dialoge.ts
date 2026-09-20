// AP-1.4b PR-A: die beiden nativen Dialoge des Import-Assistenten. Beide sind dünne,
// NICHT unit-getestete Electron-Hüllen (analog zu `src/main/wartung/datenbestand-pruefen.ts`):
// `dialog.showOpenDialog`/`showSaveDialog` und `writeFileSync` lassen sich ohne echte
// Electron-/Dateisystemumgebung nicht sinnvoll ausführen. Die getestete Logik (Berichts-Textform)
// liegt in `import/bericht.ts::alsText()` und wird hier nur aufgerufen.
//
// Datei-Endung: nur `.json` im Öffnen-Dialog (der Import-Vertrag ist JSON, Entscheidung Nutzer
// 18.09.2026). `alsText` bleibt in `import/bericht.ts` — der Renderer bildet den Text nie selbst (§2).
//
// AP-1.26: verallgemeinert aus `src/main/import/dialog.ts` — dieselbe Kapselung bedient jetzt auch
// die Ordnerwahl für „Neues Projekt"/„Projekt öffnen" (S-01), nicht mehr nur den Import-Assistenten.
// Der Importweg (`importDateiWaehlen`/`berichtSpeichern`) bleibt dabei signaturgleich.
import { writeFileSync } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import i18next from 'i18next'
import type { ImportBerichtSpeichernAus, ImportBerichtSpeichernEin, ImportDateiWaehlenAus } from '../shared/ipc/vertrag'
import dialogeI18n from '../shared/i18n/de/dialoge.json'
import { alsText } from './import/bericht'

/**
 * Eigene, schmale i18next-Instanz (ADR-011) — dieselbe Begründung wie `datenbestandI18n` in
 * `datenbestand-pruefen.ts`: die nativen Dialoge liegen im Hauptprozess, nicht im Renderer, und
 * brauchen ihre Beschriftungen ohne den React-`useTranslation`-Hook.
 */
const dialogI18n = i18next.createInstance()
void dialogI18n.init({
  lng: 'de',
  fallbackLng: false,
  ns: ['dialoge'],
  defaultNS: 'dialoge',
  resources: { de: { dialoge: dialogeI18n } },
  initAsync: false,
})

/** Das Fenster, an dem der Dialog modal hängt (das fokussierte, sonst keins — wie ein loser Dialog). */
function elternFenster(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

/**
 * Öffnet den nativen Datei-Öffnen-Dialog (S-10). Liefert den gewählten Pfad oder `null`, wenn der
 * Nutzer abbricht — ein Abbruch ist kein Fehler, der Assistent bleibt im Schritt „Datei wählen".
 */
export async function importDateiWaehlen(): Promise<ImportDateiWaehlenAus> {
  const fenster = elternFenster()
  const optionen = {
    title: dialogI18n.t('oeffnen_titel'),
    properties: ['openFile' as const],
    filters: [{ name: dialogI18n.t('oeffnen_filter'), extensions: ['json'] }],
  }
  const antwort = fenster === undefined ? await dialog.showOpenDialog(optionen) : await dialog.showOpenDialog(fenster, optionen)
  if (antwort.canceled) {
    return { pfad: null }
  }
  const pfad = antwort.filePaths[0]
  return { pfad: pfad ?? null }
}

/**
 * Öffnet den nativen Speicherdialog (S-11/S-13, F-03) und schreibt den bereits gehaltenen Bericht
 * als Text (`alsText`). Liefert den Zielpfad oder `null` bei Abbruch.
 */
export async function berichtSpeichern(ein: ImportBerichtSpeichernEin): Promise<ImportBerichtSpeichernAus> {
  const fenster = elternFenster()
  const optionen = {
    title: dialogI18n.t('speichern_titel'),
    defaultPath: dialogI18n.t('speichern_standardname'),
    filters: [{ name: dialogI18n.t('speichern_filter'), extensions: ['txt'] }],
  }
  const antwort = fenster === undefined ? await dialog.showSaveDialog(optionen) : await dialog.showSaveDialog(fenster, optionen)
  if (antwort.canceled || antwort.filePath === undefined) {
    return { gespeichertNach: null }
  }
  writeFileSync(antwort.filePath, alsText(ein.bericht), 'utf8')
  return { gespeichertNach: antwort.filePath }
}
