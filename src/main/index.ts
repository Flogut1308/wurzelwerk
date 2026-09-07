import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function hauptfensterErzeugen(): void {
  const hauptfenster = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Wurzelwerk',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  hauptfenster.once('ready-to-show', () => {
    hauptfenster.show()
  })

  const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererDevServerUrl !== undefined) {
    void hauptfenster.loadURL(rendererDevServerUrl)
  } else {
    void hauptfenster.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
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
