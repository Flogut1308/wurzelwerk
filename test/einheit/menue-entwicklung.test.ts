// AP-1.11 (72_Screens_und_Flows.md S-19): das Menü „Entwicklung" existiert nur bei
// `!app.isPackaged` — dasselbe Kennzeichen wie in `src/main/ipc/huelle.ts` und
// `src/main/protokoll/logger.ts`. Reine Entscheidungslogik, analog zu
// `test/einheit/menue-undo-beschriftung.test.ts` — kein Electron-Import nötig.
import { describe, expect, it, vi } from 'vitest'
import { entwicklungMenueEintrag } from '../../src/main/menue/menue'

function tStub(schluessel: string): string {
  return schluessel
}

describe('entwicklungMenueEintrag() (AP-1.11)', () => {
  it('liefert null, wenn die App gepackt ist (ausgelieferte App kennt kein Entwicklungsmenü)', () => {
    expect(entwicklungMenueEintrag(tStub, true, () => {})).toBeNull()
  })

  it('liefert einen Menüpunkt "Entwicklung" mit dem Untereintrag "Zustandsbibliothek", wenn ungepackt', () => {
    const eintrag = entwicklungMenueEintrag(tStub, false, () => {})
    expect(eintrag).not.toBeNull()
    expect(eintrag?.label).toBe('entwicklung')
    const untermenue = eintrag?.submenu
    expect(Array.isArray(untermenue)).toBe(true)
    const eintraege = untermenue as { readonly label?: string; readonly click?: () => void }[]
    expect(eintraege[0]?.label).toBe('entwicklung_zustandsbibliothek')
  })

  it('der Klick auf "Zustandsbibliothek" ruft die übergebene Funktion auf', () => {
    const auf = vi.fn()
    const eintrag = entwicklungMenueEintrag(tStub, false, auf)
    const untermenue = eintrag?.submenu as { readonly click?: () => void }[]
    untermenue[0]?.click?.()
    expect(auf).toHaveBeenCalledOnce()
  })
})
