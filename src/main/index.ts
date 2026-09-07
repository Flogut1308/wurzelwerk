import { app, BrowserWindow, Menu } from 'electron'
import { hauptfensterErzeugen } from './fenster/hauptfenster'
import { ipcRegistrierung } from './ipc/registrierung'
import { menueErzeugen } from './menue/menue'
import { protokollEinrichten } from './protokoll/logger'

void app.whenReady().then(() => {
  protokollEinrichten()
  ipcRegistrierung()
  Menu.setApplicationMenu(menueErzeugen())
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
