// AP-1.30 PR 7c (docs/80 §33 V-130-7-tasten, hueter #161): der Hauptprozess meldet eine erkannte
// Kontexttaste NUR an das Fenster, in dem sie gedrückt wurde — nicht an alle offenen Fenster.
// Zwei Fenster-Attrappen; `BrowserWindow.getAllWindows` liefert beide, damit ein Rückfall auf das
// Senden an alle Fenster (`sendeEreignis`) hier rot wird.
import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { KontexttastenEingabe } from '../../src/main/menue/tastenkuerzel'

type Hoerer = (ereignis: unknown, eingabe: KontexttastenEingabe) => void

interface Attrappe {
  readonly webContents: WebContents
  readonly gesendet: unknown[][]
  druecken: (eingabe: KontexttastenEingabe) => void
}

const fenster: Attrappe[] = []

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => fenster.map((eintrag) => ({ webContents: eintrag.webContents })) },
}))

const { kontexttastenBeobachten } = await import('../../src/main/menue/kontexttasten-beobachter')

function attrappe(): Attrappe {
  const hoerer: Hoerer[] = []
  const gesendet: unknown[][] = []
  const teil = {
    on: (kanal: string, bei: Hoerer) => {
      if (kanal === 'before-input-event') hoerer.push(bei)
    },
    send: (...argumente: unknown[]) => {
      gesendet.push(argumente)
    },
  }
  const eintrag: Attrappe = {
    webContents: teil as unknown as WebContents, // Attrappe: nur `on`/`send` werden vom Beobachter genutzt
    gesendet,
    druecken: (eingabe) => {
      for (const bei of hoerer) bei({}, eingabe)
    },
  }
  fenster.push(eintrag)
  return eintrag
}

function taste(code: string): KontexttastenEingabe {
  return { type: 'keyDown', code, isAutoRepeat: false, isComposing: false, shift: false, control: false, alt: false, meta: false }
}

describe('kontexttastenBeobachten (zwei Fenster)', () => {
  it('sendet die Taste nur an das Fenster, in dem sie gedrückt wurde', () => {
    const a = attrappe()
    const b = attrappe()
    kontexttastenBeobachten(a.webContents)
    kontexttastenBeobachten(b.webContents)

    a.druecken(taste('Digit3'))
    expect(a.gesendet).toEqual([['ereignis:kontexttaste', { aktion: 'reiterWaehlen', reiterIndex: 2 }]])
    expect(b.gesendet).toEqual([])

    b.druecken(taste('Digit1'))
    expect(a.gesendet).toHaveLength(1)
    expect(b.gesendet).toEqual([['ereignis:kontexttaste', { aktion: 'reiterWaehlen', reiterIndex: 0 }]])
  })

  it('eine Nicht-Kontexttaste sendet an kein Fenster', () => {
    const c = attrappe()
    kontexttastenBeobachten(c.webContents)
    c.druecken(taste('KeyA'))
    expect(c.gesendet).toEqual([])
  })
})
