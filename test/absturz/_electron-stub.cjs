// AP-0.13 — CJS-Preload für `test/absturz/kind-prozess.ts` (nie für Produktivcode gedacht).
//
// Der Kindprozess muss echte Befehle über den Befehlsbus ausführen (`fuehreAus`,
// `src/main/befehle/bus.ts`) — der Bus ruft nach jedem erfolgreichen Commit
// `journalStatusMelden()` (`src/main/journal/journal-status-melder.ts`) auf, das wiederum
// `sendeEreignis()` (`src/main/ipc/ereignisse.ts`, `import { BrowserWindow } from 'electron'`)
// aufruft. `src/main/protokoll/logger.ts` importiert zusätzlich `app` aus `electron` UND
// `electron-log/main`. Der Kindprozess läuft aber als PLAIN Node-Prozess (kein Electron-Fenster,
// keine `app.whenReady()`) — unter plain Node liefert `require('electron')` nur den Dateipfad zur
// Electron-Programmdatei (dokumentiertes Verhalten des npm-Pakets `electron` außerhalb eines
// Electron-Prozesses), NICHT die echte API. Ein direkter `node --import tsx kind-prozess.ts`-Aufruf
// scheitert deshalb an `BrowserWindow.getAllWindows()` ("Cannot read properties of undefined").
//
// Dieser Preload ersetzt `require('electron')` durch eine minimale Attrappe, BEVOR
// `kind-prozess.ts` (und alles, was es transitiv importiert) geladen wird — klassischer
// `Module._load`-Patch, funktioniert unabhängig davon, ob ein konkretes Modul intern über
// CJS-`require` oder (via tsx) transformiertes ESM-`import` geladen wird, weil tsx TypeScript-
// Einstiegsdateien ohne `"type": "module"` (wie dieses Repository) über die klassische
// CJS-Ladekette kompiliert (empirisch geprüft, s. AP-0.13-Auftragsbericht).
//
// Aufruf: `node --require ./_electron-stub.cjs --import tsx kind-prozess.ts <dbPfad> <seed>`
'use strict'

const Module = require('node:module')
const os = require('node:os')

const echterLoad = Module._load

Module._load = function elektronAttrappeLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getVersion: () => '0.0.0-absturztest',
        isPackaged: false,
        getPath: () => os.tmpdir(),
      },
      BrowserWindow: { getAllWindows: () => [] },
      ipcMain: { handle: () => {}, on: () => {}, removeHandler: () => {} },
    }
  }
  return echterLoad.apply(this, arguments)
}
