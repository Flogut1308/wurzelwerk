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

/** Gemeinsame Zusatzoptionen der beiden Abfrage-Hooks unten — bisher nur `enabled`, das
 * TanStack Query direkt durchreicht (AP-1.6 Stufe 4, erster echter Konsument: die Listenansicht
 * ruft immer genau eine der beiden Abfragen ab, `usePersonListe` bei leerem Suchtext, `useSuche`
 * sonst — die jeweils andere bleibt über `enabled: false` inaktiv, statt einen Kanal unnötig gegen
 * den Hauptprozess zu rufen). */
export interface AbfrageOptionen {
  readonly enabled?: boolean
}

/**
 * `abfrage:person.liste` (55_Architektur.md §5, AP-1.6). Der Query-Key trägt `ein` vollständig —
 * TanStack Query hasht Objekte in Query-Keys strukturell (Schlüsselreihenfolge-unabhängig), ein
 * neues `ein`-Objekt mit gleichem Inhalt bei jedem Render erzeugt darum trotzdem einen stabilen
 * Cache-Treffer. **Keine optimistischen Aktualisierungen** (CLAUDE.md §10): die Invalidierung
 * läuft ausschließlich über `useDatenGeaendertAbo()` (`befehl-hooks.ts`), das nach jedem
 * `ereignis:datenGeaendert` pauschal den gesamten Cache invalidiert — diese Abfrage eingeschlossen.
 */
export function usePersonListe(ein: Ein<'abfrage:person.liste'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:person.liste'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:person.liste', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:person.liste', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:suche` (55_Architektur.md §5, AP-1.6) — Volltext, Umschrift und Suchnormalform
 * gleichzeitig sowie Kölner Phonetik als zweite Quelle (`src/main/abfragen/suche.ts`). Dieselbe
 * Key-Strategie und Invalidierung wie `usePersonListe`.
 */
export function useSuche(ein: Ein<'abfrage:suche'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:suche'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:suche', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:suche', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:person.detail` (55_Architektur.md §5, AP-1.7 PR-B) — die Profilseite. Dieselbe Key-
 * Strategie und Invalidierung wie `usePersonListe`/`useSuche` oben (ein neues `ereignis:
 * datenGeaendert` invalidiert pauschal auch diese Abfrage, `useDatenGeaendertAbo()`).
 */
export function usePersonDetail(ein: Ein<'abfrage:person.detail'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:person.detail'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:person.detail', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:person.detail', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:pruefhinweise` (AP-1.8, F-07, 70_UX_Konzept.md §2 Fußzeile). Kein `ein` (der Kanal
 * prüft immer den gesamten Bestand) — der Query-Key ist darum eine feste Zeichenkette statt eines
 * `ein`-Objekts, analog wie es ein Kanal ohne Nutzlast nahelegt. Dieselbe Invalidierung wie die
 * übrigen Abfrage-Hooks (`useDatenGeaendertAbo()`, `befehl-hooks.ts`).
 */
export function usePruefhinweise(optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:pruefhinweise'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:pruefhinweise'] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:pruefhinweise', null)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:ort.suche` (55_Architektur.md §5, AP-1.13 PR-C) — Tippsuche fürs `Ortsfeld`. Dieselbe
 * Key-Strategie und Invalidierung wie `useSuche`.
 */
export function useOrtSuche(ein: Ein<'abfrage:ort.suche'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:ort.suche'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:ort.suche', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:ort.suche', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:ort.detail` (55_Architektur.md §5, AP-1.16 PR-C) — die Orte-Pflege-Ansicht
 * (`src/renderer/ansichten/orte/ort-bearbeiten.tsx`). Dieselbe Key-Strategie und Invalidierung wie
 * `usePersonDetail`.
 */
export function useOrtDetail(ein: Ein<'abfrage:ort.detail'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:ort.detail'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:ort.detail', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:ort.detail', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:archiv.suche` (55_Architektur.md §5, AP-1.17 PR-A1) — Tippsuche fürs `Archivfeld`
 * (AP-1.17 PR-C1). Dieselbe Key-Strategie und Invalidierung wie `useOrtSuche`.
 */
export function useArchivSuche(ein: Ein<'abfrage:archiv.suche'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:archiv.suche'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:archiv.suche', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:archiv.suche', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:quelle.detail` (55_Architektur.md §5, AP-1.17 PR-A2) — die Quelle/Zitat-Pflege-Ansicht
 * (`src/renderer/ansichten/quellen/quelle-bearbeiten.tsx`, AP-1.17 PR-C1). Dieselbe Key-Strategie
 * und Invalidierung wie `usePersonDetail`/`useOrtDetail`.
 */
export function useQuelleDetail(ein: Ein<'abfrage:quelle.detail'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:quelle.detail'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:quelle.detail', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:quelle.detail', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:negativbefund.liste` (55_Architektur.md §5, AP-1.17 PR-A4/PR-C2) — der Negativbefund-
 * Abschnitt des Profils (`src/renderer/ansichten/profil/negativbefund-abschnitt.tsx`). Dieselbe
 * Key-Strategie und Invalidierung wie `usePersonDetail`/`useOrtDetail`/`useQuelleDetail`.
 */
export function useNegativbefundListe(
  ein: Ein<'abfrage:negativbefund.liste'>,
  optionen?: AbfrageOptionen,
): UseQueryResult<Aus<'abfrage:negativbefund.liste'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:negativbefund.liste', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:negativbefund.liste', ein)),
    enabled: optionen?.enabled ?? true,
  })
}

/**
 * `abfrage:journal.verlauf` (AP-0.10; Filter `personId` seit AP-1.30 PR 5) — „Zuletzt geändert" in
 * der rechten Spalte des Editors (AP-1.30 PR 8). Dieselbe Key-Strategie und Invalidierung wie die
 * übrigen Hooks: jedes `ereignis:datenGeaendert` (also jeder Autosave) lädt den Verlauf neu.
 */
export function useJournalVerlauf(ein: Ein<'abfrage:journal.verlauf'>, optionen?: AbfrageOptionen): UseQueryResult<Aus<'abfrage:journal.verlauf'>, AppFehler> {
  return useQuery({
    queryKey: ['abfrage:journal.verlauf', ein] as const,
    queryFn: () => ergebnisEntpacken(aufrufen('abfrage:journal.verlauf', ein)),
    enabled: optionen?.enabled ?? true,
  })
}
