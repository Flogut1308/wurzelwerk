import { useCallback, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProjektInfo } from '../shared/ipc/vertrag'
import { useDatenGeaendertAbo, useProjektGeschlossenAbo, useZustandsbibliothekOeffnenAbo } from './brücke/befehl-hooks'
import { ListenAnsicht } from './ansichten/liste/listen-ansicht'
import { StartAnsicht } from './ansichten/start/start-ansicht'
import { Zustandsbibliothek } from './ansichten/zustandsbibliothek/zustandsbibliothek'
import { Fehlergrenze } from './fehler/fehlergrenze'

/**
 * Ein Query-Client für die Lebensdauer des Fensters (AP-1.6 Stufe 2, Nachzug aus dem
 * Codereview: „der fehlende `QueryClientProvider` im Renderer", `docs/arbeitspakete.md` §Phase-0-
 * Nachzug). Konservative Defaults: kein aggressives Retry — ein IPC-Aufruf gegen den Hauptprozess
 * liefert entweder Daten oder einen `AppFehler`, den ein erneuter Versuch nicht behebt — und ein
 * kurzer `staleTime`. Die eigentliche Frischhaltung läuft ohnehin ereignisgetrieben über
 * `ereignis:datenGeaendert` (`useDatenGeaendertAbo()` unten), nicht über Zeitablauf; `staleTime`
 * verhindert nur unnötige Doppel-Abfragen bei schnell aufeinanderfolgenden Re-Renders derselben
 * Ansicht.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Der erste echte Consumer von `useDatenGeaendertAbo()` (bisher nur vorausschauend angelegt,
 * AP-0.9-Kommentar in `befehl-hooks.ts`). Sitzt innerhalb von `QueryClientProvider`, aber
 * außerhalb jeder einzelnen Ansicht, damit **jede** künftige `abfrage:*`-Abfrage im Baum von der
 * pauschalen Invalidierung profitiert, ohne dass jede Ansicht das Abonnement einzeln aufsetzen
 * muss. Rendert nichts.
 */
function DatenGeaendertBruecke(): null {
  useDatenGeaendertAbo()
  return null
}

/**
 * Start ↔ Liste ↔ Zustandsbibliothek (AP-1.6 Stufe 4, AP-1.11): kein Router, ein einfacher
 * Zustand — „ist ein Projekt offen?" entscheidet zwischen Start und Liste, ein zweiter,
 * unabhängiger Zustand schaltet die Zustandsbibliothek darüber (S-19: „ein eigenes Artboard").
 * `App` ist der einzige Ort, der alle drei Ansichten kennt; die `ereignis:projektGeschlossen`-Abo
 * läuft hier statt in `StartAnsicht`, damit ein Schließen hinter dem Rücken der aktuell
 * sichtbaren Ansicht (egal welcher) auf den Startzustand zurückfällt (vormals ein Sonderfall nur
 * der Start-Ansicht, AP-0.20-Kommentar dort).
 *
 * Die Zustandsbibliothek ersetzt Start/Liste vollständig, statt sich darüberzulegen (kein Modal,
 * kein zweiter Layer) — sie ist ein reines Entwicklungswerkzeug (nur `!app.isPackaged`-Menüpunkt,
 * `src/main/menue/menue.ts::entwicklungMenueEintrag`) und braucht keinen Kontext der darunterliegenden
 * Ansicht, anders als z. B. `ProfilAnsicht` (T-Vollseite über der Liste, AP-1.7).
 */
export function App() {
  const [projekt, setProjekt] = useState<ProjektInfo | null>(null)
  const [zustandsbibliothekOffen, setZustandsbibliothekOffen] = useState(false)

  useProjektGeschlossenAbo(
    useCallback(() => {
      setProjekt(null)
    }, []),
  )
  useZustandsbibliothekOeffnenAbo(
    useCallback(() => {
      setZustandsbibliothekOffen(true)
    }, []),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <DatenGeaendertBruecke />
      <Fehlergrenze>
        {zustandsbibliothekOffen ? (
          <Zustandsbibliothek aufSchliessen={() => setZustandsbibliothekOffen(false)} />
        ) : projekt === null ? (
          <StartAnsicht aufProjektGeoeffnet={setProjekt} />
        ) : (
          <ListenAnsicht projekt={projekt} aufProjektGeschlossen={() => setProjekt(null)} />
        )}
      </Fehlergrenze>
    </QueryClientProvider>
  )
}
