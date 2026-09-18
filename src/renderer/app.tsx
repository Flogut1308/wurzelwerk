import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDatenGeaendertAbo } from './brücke/befehl-hooks'
import { StartAnsicht } from './ansichten/start/start-ansicht'
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DatenGeaendertBruecke />
      <Fehlergrenze>
        <StartAnsicht />
      </Fehlergrenze>
    </QueryClientProvider>
  )
}
