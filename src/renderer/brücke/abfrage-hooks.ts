// AP-1.6 Stufe 2 (C-16/C-17/A-19): die Abfrage-Seite der TanStack-Query-Brücke, Gegenstück zu
// `befehl-hooks.ts` (AP-0.9) für lesende Kanäle (`abfrage:person.liste`, `abfrage:suche`). Analog
// zu `befehl-hooks.ts` bewusst KEIN Unit-Test im Node-Testlauf: die Hooks hängen an
// `@tanstack/react-query` (Hook-Regeln, brauchen eine React-Render-Umgebung) und an
// `window.wurzelwerk` (nur im echten Renderer über den Preload vorhanden). `pnpm typen` prüft
// diese Datei trotzdem mit.
//
// Architekturgrenzen (CLAUDE.md §2): kein direkter Zugriff auf `main`/better-sqlite3/Node — nur
// `./aufrufen` (die typisierte IPC-Brücke).
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AppFehler } from '../../shared/fehler/app-fehler'
import type { Aus, Ein } from '../../shared/ipc/vertrag'
import { aufrufen } from './aufrufen'
import { ergebnisEntpacken } from './befehl-hooks'

/**
 * `abfrage:person.liste` (55_Architektur.md §5, AP-1.6). Der Query-Key trägt `ein` vollständig —
 * TanStack Query hasht Objekte in Query-Keys strukturell (Schlüsselreihenfolge-unabhängig), ein
 * neues `ein`-Objekt mit gleichem Inhalt bei jedem Render erzeugt darum trotzdem einen stabilen
 * Cache-Treffer. **Keine optimistischen Aktualisierungen** (CLAUDE.md §10): die Invalidierung
 * läuft ausschließlich über `useDatenGeaendertAbo()` (`befehl-hooks.ts`), das nach jedem
 * `ereignis:datenGeaendert` pauschal den gesamten Cache invalidiert — diese Abfrage eingeschlossen.
 */
export function usePersonListe(ein: Ein<'abfrage:person.liste'>): UseQueryResult<Aus<'abfrage:person.liste'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:person.liste', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:person.liste', ein)),
  })
}

/**
 * `abfrage:suche` (55_Architektur.md §5, AP-1.6) — Volltext, Umschrift und Suchnormalform
 * gleichzeitig sowie Kölner Phonetik als zweite Quelle (`src/main/abfragen/suche.ts`). Dieselbe
 * Key-Strategie und Invalidierung wie `usePersonListe`.
 */
export function useSuche(ein: Ein<'abfrage:suche'>): UseQueryResult<Aus<'abfrage:suche'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:suche', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:suche', ein)),
  })
}
