import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { appLebenszyklusVerdrahten } from '../../src/main/lebenszyklus'

/**
 * AP-0.18, Rot-Beleg: `src/main/index.ts` registrierte bislang kein `before-quit` — beim
 * normalen Beenden blieb `projekt.lock` liegen, `db.close()` lief nie, und jeder Neustart erkannte
 * den Vorlauf fälschlich als unsauber (Sperre `verwaist`, AP-0.13-Absturzerkennung damit
 * funktional wirkungslos). Diese Tests decken die reine Verdrahtungsfunktion ab, ohne echtes
 * Electron zu brauchen — die Attrappe unten erfüllt den schmalen `AppLebenszyklus`-Vertrag über
 * einen echten `node:events`-`EventEmitter`, dessen `emit()` registrierte Hörer synchron aufruft.
 */
class AppAttrappe extends EventEmitter {
  public readonly quit = vi.fn()
  private readonly lockErgebnis: boolean

  public constructor(lockErgebnis: boolean) {
    super()
    this.lockErgebnis = lockErgebnis
  }

  public requestSingleInstanceLock(): boolean {
    return this.lockErgebnis
  }
}

function fensterAttrappe(minimiert: boolean) {
  return { isMinimized: () => minimiert, restore: vi.fn<() => void>(), focus: vi.fn<() => void>() }
}

describe('main/lebenszyklus', () => {
  it('verdrahtet before-quit und ruft projektGeordnetSchliessen bei Erhalt der Sperre auf', () => {
    const app = new AppAttrappe(true)
    const projektGeordnetSchliessen = vi.fn()

    const darfStarten = appLebenszyklusVerdrahten(app, {
      projektGeordnetSchliessen,
      hauptfensterHolen: () => undefined,
    })

    expect(darfStarten).toBe(true)
    app.emit('before-quit')
    expect(projektGeordnetSchliessen).toHaveBeenCalledTimes(1)
  })

  it('beendet ohne Sperre sofort und verdrahtet keine Hörer', () => {
    const app = new AppAttrappe(false)
    const projektGeordnetSchliessen = vi.fn()
    const hauptfensterHolen = vi.fn(() => undefined)

    const darfStarten = appLebenszyklusVerdrahten(app, { projektGeordnetSchliessen, hauptfensterHolen })

    expect(darfStarten).toBe(false)
    expect(app.quit).toHaveBeenCalledTimes(1)

    app.emit('before-quit')
    app.emit('second-instance')
    expect(projektGeordnetSchliessen).not.toHaveBeenCalled()
    expect(hauptfensterHolen).not.toHaveBeenCalled()
  })

  it('second-instance holt ein minimiertes Fenster nach vorn (restore + focus)', () => {
    const app = new AppAttrappe(true)
    const fenster = fensterAttrappe(true)

    const darfStarten = appLebenszyklusVerdrahten(app, {
      projektGeordnetSchliessen: vi.fn(),
      hauptfensterHolen: () => fenster,
    })

    expect(darfStarten).toBe(true)
    app.emit('second-instance')
    expect(fenster.restore).toHaveBeenCalledTimes(1)
    expect(fenster.focus).toHaveBeenCalledTimes(1)
  })

  it('second-instance fokussiert ein nicht minimiertes Fenster ohne restore', () => {
    const app = new AppAttrappe(true)
    const fenster = fensterAttrappe(false)

    appLebenszyklusVerdrahten(app, {
      projektGeordnetSchliessen: vi.fn(),
      hauptfensterHolen: () => fenster,
    })

    app.emit('second-instance')
    expect(fenster.restore).not.toHaveBeenCalled()
    expect(fenster.focus).toHaveBeenCalledTimes(1)
  })

  it('second-instance ohne Hauptfenster wirft nicht', () => {
    const app = new AppAttrappe(true)

    appLebenszyklusVerdrahten(app, {
      projektGeordnetSchliessen: vi.fn(),
      hauptfensterHolen: () => undefined,
    })

    expect(() => {
      app.emit('second-instance')
    }).not.toThrow()
  })
})
