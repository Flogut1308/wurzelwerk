import { app, BrowserWindow } from 'electron'
import { hauptfensterErzeugen } from './fenster/hauptfenster'
import { ipcRegistrierung } from './ipc/registrierung'
import { menueInitialisieren } from './menue/menue'
import { protokollEinrichten } from './protokoll/logger'

void app.whenReady().then(() => {
  protokollEinrichten()
  ipcRegistrierung()
  menueInitialisieren()
  hauptfensterErzeugen()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      hauptfensterErzeugen()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
