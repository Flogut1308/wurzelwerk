import type { Ergebnis } from '../../shared/ipc/ergebnis'

export {}

declare global {
  interface Window {
    /** Vom Preload über `contextBridge` offengelegt (§2.1). Nie direkt aufrufen, siehe `aufrufen.ts`. */
    readonly wurzelwerk: {
      aufrufen(kanal: string, nutzlast: unknown): Promise<Ergebnis<unknown>>
      abonnieren(kanal: string, hoerer: (nutzlast: unknown) => void): () => void
    }
  }
}
