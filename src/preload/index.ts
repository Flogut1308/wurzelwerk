import { contextBridge, ipcRenderer } from 'electron'
import type { AppFehler } from '../shared/fehler/app-fehler'
import { ALLE_KANAELE, EREIGNIS_KANAELE } from '../shared/ipc/kanaele'
import type { Ergebnis } from '../shared/ipc/ergebnis'

/**
 * contextBridge legt genau ein gefrorenes Objekt offen (§2.1, ADR-016). Mehr gehört nicht in
 * diese Datei — jede Fachlogik, jede Fehlerbehandlung, jede Validierung passiert in
 * `src/main/ipc/huelle.ts` oder in `src/shared`.
 */

function unbekannterKanalFehler(): Ergebnis<never> {
  const fehler: AppFehler = {
    code: 'IPC_UNBEKANNTER_KANAL',
    textSchluessel: 'fehler.IPC_UNBEKANNTER_KANAL',
    vorgangsId: '',
  }
  return { ok: false, fehler }
}

function aufrufen(kanal: string, nutzlast: unknown): Promise<unknown> {
  if (!ALLE_KANAELE.includes(kanal)) {
    return Promise.resolve(unbekannterKanalFehler())
  }
  return ipcRenderer.invoke(kanal, nutzlast)
}

function abonnieren(kanal: string, hoerer: (nutzlast: unknown) => void): () => void {
  if (!EREIGNIS_KANAELE.includes(kanal)) {
    return () => {}
  }
  const umhuellt = (_ereignis: unknown, nutzlast: unknown): void => hoerer(nutzlast)
  ipcRenderer.on(kanal, umhuellt)
  return () => ipcRenderer.off(kanal, umhuellt)
}

contextBridge.exposeInMainWorld('wurzelwerk', Object.freeze({ aufrufen, abonnieren }))
