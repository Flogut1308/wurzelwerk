/**
 * Verdrahtung für Einzelinstanz + geordnetes Beenden (AP-0.18). Bisher fehlte in
 * `src/main/index.ts` ein `before-quit`-Hörer: `projekt.lock` blieb beim normalen Beenden liegen,
 * `db.close()` lief nie — jeder Neustart erkannte den Vorlauf fälschlich als unsauber (Sperre
 * `verwaist`, AP-0.13-Absturzerkennung damit funktional wirkungslos). Diese Datei bündelt die
 * Verdrahtung in einer reinen, mit Attrappen testbaren Funktion (F-01, F-04, G-03,
 * 55_Architektur.md §9.3).
 *
 * Die Parameter sind bewusst schmale, strukturelle Interfaces statt `Electron.App` /
 * `Electron.BrowserWindow` direkt — so erfüllt sowohl die echte Electron-`app` als auch eine
 * Test-Attrappe (`test/einheit/lebenszyklus.test.ts`) den Vertrag, ohne einen `as`-Cast zu
 * brauchen.
 */
interface AppLebenszyklus {
  requestSingleInstanceLock(): boolean
  on(ereignis: 'before-quit' | 'second-instance', hoerer: (...args: readonly unknown[]) => void): unknown
  quit(): void
}

interface FokussierbaresFenster {
  isMinimized(): boolean
  restore(): void
  focus(): void
}

interface LebenszyklusAbhaengigkeiten {
  readonly projektGeordnetSchliessen: () => void
  readonly hauptfensterHolen: () => FokussierbaresFenster | undefined
}

/**
 * Verdrahtet Einzelinstanz-Sperre und geordnetes Beenden. Rückgabe `false` bedeutet: dieser
 * Prozess ist eine Zweitinstanz und muss sofort beenden (`app.quit()` ist bereits ausgelöst) —
 * der Aufrufer darf in diesem Fall `app.whenReady()` gar nicht erst starten. Rückgabe `true`
 * heißt: die Hörer für `before-quit` und `second-instance` sind verdrahtet, normal weiterbooten.
 */
export function appLebenszyklusVerdrahten(app: AppLebenszyklus, deps: LebenszyklusAbhaengigkeiten): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    const fenster = deps.hauptfensterHolen()
    if (fenster !== undefined) {
      if (fenster.isMinimized()) {
        fenster.restore()
      }
      fenster.focus()
    }
  })

  // Synchron, kein preventDefault, kein await — before-quit blockiert das Beenden nicht,
  // projektSchliessen() selbst ist synchron (db.close() + Sperre entfernen, s. projekt-dienst.ts).
  app.on('before-quit', () => {
    deps.projektGeordnetSchliessen()
  })

  return true
}
