import { app, BrowserWindow } from 'electron'
import { hauptfensterErzeugen } from './fenster/hauptfenster'
import { ipcRegistrierung } from './ipc/registrierung'
import { appLebenszyklusVerdrahten } from './lebenszyklus'
import { menueInitialisieren } from './menue/menue'
import { projektSchliessen } from './projekt/projekt-dienst'
import { protokollEinrichten } from './protokoll/logger'

let hauptfenster: BrowserWindow | undefined

// AP-0.18: Einzelinstanz-Sperre + before-quit VOR whenReady verdrahten. `darfStarten === false`
// heißt: Zweitinstanz, `app.quit()` ist bereits ausgelöst — der Rest darf nicht mehr booten.
const darfStarten = appLebenszyklusVerdrahten(app, {
  projektGeordnetSchliessen: projektSchliessen,
  hauptfensterHolen: () => hauptfenster,
})

if (darfStarten) {
  void app.whenReady().then(() => {
    protokollEinrichten()
    ipcRegistrierung()
    menueInitialisieren()
    hauptfenster = hauptfensterErzeugen()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        hauptfenster = hauptfensterErzeugen()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
