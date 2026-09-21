// @vitest-environment jsdom
//
// Bugfix (entdeckt über AP-1.15 PR-A e2e, `test/e2e/ablauf-05-ereignis-erfassen.spec.ts`):
// `NamenFelder` (`profil-bearbeiten-namen.tsx`) reicht `namenEintragAusPersonDetailName(name)` —
// ein bei JEDEM Render frisch gebautes Objekt, KEINE stabile Referenz — direkt als `wert` in
// `useEntwurfMitVerzoegertemCommit`. Dessen Sync-Zweig vergleicht `wert` bewusst über
// Referenzgleichheit (Kopfkommentar `profil-bearbeiten-debounce.ts`) — ein Aufrufer, der bei
// jedem Aufruf ein neues, aber inhaltlich gleiches Objekt liefert, verletzt diesen Vertrag: JEDER
// zweite Render von `NamenFelder` (aus JEDEM Grund — hier durch einen erneuten Render mit einer
// frischen, aber inhaltsgleichen `namen`-Liste simuliert, wie ihn `ereignis:datenGeaendert` nach
// EINEM unabhängigen Schreibvorgang auslöst) erzeugt einen neuen `wert`, den der Sync-Zweig als
// „von außen geändert" liest und per `setEntwurf` übernimmt — was den nächsten Render mit
// wiederum einem neuen `wert` auslöst: eine sich selbst tragende Render-Schleife
// („Maximum update depth exceeded"), sobald eine Person mit bestehendem Namen im Bearbeiten-
// Zustand geöffnet ist und IRGENDEIN weiterer Schreibvorgang (z. B. `ereignis.anlegen`) die
// Profildaten neu lädt.
//
// Eiserne Regel §5: dieser Test ist ROT gegen den unveränderten `NamenFelder` (kein `useMemo`) und
// GRÜN nach dem Fix. Braucht eine echte Mehrfach-Render-Lebensdauer — das kann
// `renderToStaticMarkup` (Einzeldurchlauf) NICHT leisten, darum `// @vitest-environment jsdom` +
// `react-dom/client` + `act`, Muster `profil-bearbeiten-debounce.test.tsx`.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// React 19 erkennt eine `act(...)`-taugliche Umgebung an diesem globalen Schalter (Muster
// `profil-bearbeiten-debounce.test.tsx`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const nameAendernMutate = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useNameAnlegen: () => ({ mutate: vi.fn() }),
  useNameAendern: () => ({ mutate: nameAendernMutate }),
  useNameLoeschen: () => ({ mutate: vi.fn() }),
}))

import '../../src/renderer/i18n/einrichten'
import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

/** EIN `PersonDetailName` mit denselben Werten, aber — wie bei jedem frischen `abfrage:person.detail`-
 * Ergebnis — einer NEUEN Objektreferenz (kein `Object.is`-gleiches Objekt trotz gleichen Inhalts). */
function frischesNameObjekt(): PersonDetailName {
  return {
    id: 'name-1',
    typ: 'geburtsname',
    schrift: null,
    vornamen: 'August',
    nachname: 'Wruck',
    praefix: null,
    titel_vor: null,
    zusatz_nach: null,
    rufname_text: null,
  }
}

describe('NamenFelder — Render-Stabilität bei unabhängig ausgelöstem Rerender (Bugfix, AP-1.15 PR-A)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  it('ein zweiter Render mit einer NEUEN, aber inhaltsgleichen namen-Liste löst KEINE Render-Schleife aus', () => {
    act(() => {
      root.render(<NamenBearbeitenAbschnitt personId="person-1" namen={[frischesNameObjekt()]} />)
    })
    expect(container.querySelector('input[value="August"]')).not.toBeNull()

    // Simuliert exakt das, was `ereignis:datenGeaendert` nach einem UNABHÄNGIGEN Schreibvorgang
    // auslöst (z. B. `befehl:ereignis.anlegen`): ein Refetch von `abfrage:person.detail` liefert
    // eine NEUE `namen`-Liste mit denselben Werten, aber frischen Objektreferenzen. OHNE den Fix
    // wirft dieser `act(...)`-Aufruf "Maximum update depth exceeded" (React-Fehler #185/#301).
    expect(() => {
      act(() => {
        root.render(<NamenBearbeitenAbschnitt personId="person-1" namen={[frischesNameObjekt()]} />)
      })
    }).not.toThrow()

    // Der Wert bleibt korrekt (kein stiller Datenverlust durch die Render-Schleife).
    expect(container.querySelector('input[value="August"]')).not.toBeNull()
    expect(container.querySelector('input[value="Wruck"]')).not.toBeNull()
    // Kein Phantom-Commit ausgelöst — nur die reine Anzeige hat sich synchronisiert, kein Nutzer-
    // Tippen hat stattgefunden.
    expect(nameAendernMutate).not.toHaveBeenCalled()
  })
})
