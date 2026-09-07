import { aufrufen } from '../brücke/aufrufen'

/**
 * `window.onerror` und `unhandledrejection` senden an den Hauptprozess (§10.3), damit alles in
 * einer Protokolldatei landet. Einmal beim Start aufrufen (`main.tsx`).
 */
export function fehlerweiterleitungEinrichten(): void {
  window.addEventListener('error', (ereignis: ErrorEvent) => {
    const fehler = ereignis.error
    const stack = fehler instanceof Error ? fehler.stack : undefined
    void aufrufen('befehl:protokoll.melden', {
      quelle: 'fenster',
      nachricht: ereignis.message,
      ...(stack !== undefined ? { stack } : {}),
    })
  })

  window.addEventListener('unhandledrejection', (ereignis: PromiseRejectionEvent) => {
    const grund: unknown = ereignis.reason
    const istFehler = grund instanceof Error
    void aufrufen('befehl:protokoll.melden', {
      quelle: 'fenster',
      nachricht: istFehler ? grund.message : 'Unbehandelte Ablehnung',
      ...(istFehler && grund.stack !== undefined ? { stack: grund.stack } : {}),
    })
  })
}
