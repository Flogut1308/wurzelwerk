// @vitest-environment jsdom
//
// AP-1.30 PR 12c, hueter-Auflage (docs/80 §33 V-130-12-schreibwege): „Trennen" läuft NICHT über den
// SchreibBeobachter. Scheitert ein Löschen und bricht der Nutzer danach das Bestätigungs-Modal ab, darf der
// Kopf weder „erneut versuchen" anbieten noch ein Wiederholungsaufruf ohne Bestätigung löschen.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailBeziehung, PersonDetailKopf } from '../../src/shared/schemata/person-detail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const kanal: string[] = []
vi.mock('../../src/renderer/brücke/aufrufen', () => ({
  aufrufen: (name: string) => {
    kanal.push(name)
    return Promise.resolve({ ok: false, fehler: { code: 'NICHT_GEFUNDEN_ELTERNSCHAFT', textSchluessel: 'NICHT_GEFUNDEN_ELTERNSCHAFT', vorgangsId: 'v' } })
  },
}))

import { ReiterBeziehungen } from '../../src/renderer/ansichten/profil/reiter-beziehungen'
import { useEditorSpeicherstatus } from '../../src/renderer/ansichten/profil/editor-speicherstatus'
import { SchreibBeobachterKontext } from '../../src/renderer/brücke/schreib-beobachter'

const KOPF: PersonDetailKopf = { person_id: 'p', anzeigename: 'Paul', konfidenz_min: null, ist_platzhalter: false, privat: false, geschlecht: 'M', platzhalter_grund: null, kennung: 1, lebend_status: null }
const KIND: PersonDetailBeziehung = { person_id: 'k', anzeigename: 'Anna', richtung: 'kind', kantentyp: 'biologisch', ist_platzhalter: false, kante_id: 'e-k', kante_notiz: null, geschlecht: null }

let letzterStatus: ReturnType<typeof useEditorSpeicherstatus> | null = null

function Huelle() {
  const status = useEditorSpeicherstatus()
  letzterStatus = status
  return (
    <SchreibBeobachterKontext.Provider value={status.beobachter}>
      <ReiterBeziehungen kopf={KOPF} daten={{ beziehungen: [KIND], geschwister: [], partnerschaften: [], kinder_ohne_partnerschaft: ['k'] }} idPraefix="x" />
    </SchreibBeobachterKontext.Provider>
  )
}

async function jetzt(aktion: () => void): Promise<void> {
  await act(async () => {
    aktion()
    await new Promise((fertig) => setTimeout(fertig, 0))
  })
}

function knopf(name: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll('button')).find((k) => (k.getAttribute('aria-label') ?? k.textContent) === name)
  if (treffer === undefined) throw new Error(`Knopf fehlt: ${name}`)
  return treffer
}

describe('Trennen und Speicherstatus', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    kanal.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('gescheitertes Löschen, dann Abbrechen: kein offener Fehler im Kopf, kein Wiederholungsaufruf', async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <Huelle />
        </QueryClientProvider>,
      )
    })
    await jetzt(() => knopf('Trennen: Anna').click())
    await jetzt(() => knopf('Verbindung trennen').click())
    expect(kanal).toEqual(['befehl:elternschaft.loeschen'])
    // Der Fehler bleibt im Modal.
    expect(document.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull()
    await jetzt(() => knopf('Abbrechen').click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(letzterStatus?.anzeige.zustand).not.toBe('fehler')
    await jetzt(() => letzterStatus?.erneutVersuchen())
    expect(kanal).toEqual(['befehl:elternschaft.loeschen'])
  })
})
