import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { geometrieLesen, geometrieSchreiben } from './geometrie-speicher'

export function hauptfensterErzeugen(): BrowserWindow {
  const geometrie = geometrieLesen()

  const hauptfenster = new BrowserWindow({
    width: geometrie.breite,
    height: geometrie.hoehe,
    ...(geometrie.x !== undefined && geometrie.y !== undefined ? { x: geometrie.x, y: geometrie.y } : {}),
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

  hauptfenster.on('close', () => {
    const grenzen = hauptfenster.getBounds()
    geometrieSchreiben({ breite: grenzen.width, hoehe: grenzen.height, x: grenzen.x, y: grenzen.y })
  })

  const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererDevServerUrl !== undefined) {
    void hauptfenster.loadURL(rendererDevServerUrl)
  } else {
    void hauptfenster.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return hauptfenster
}
