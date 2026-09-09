// AP-0.9: vorausschauende Renderer-Verdrahtung für den Befehlsbus. Es gibt in AP-0.9 noch KEINEN
// Consumer — die erste Ansicht, die diese Hooks nutzt, kommt mit AP-1.6 (Personenansicht). Analog
// zu `EREIGNIS_KANAELE`, das in AP-0.2 ebenfalls leer angelegt wurde, bevor Phase 1 die ersten
// Kanäle ergänzte (`src/shared/ipc/kanaele.ts`).
//
// Bewusst KEIN Unit-Test im Node-Testlauf: die Hooks hängen an `@tanstack/react-query` (Hook-
// Regeln, brauchen eine React-Render-Umgebung) und an `window.wurzelwerk` (nur im echten Renderer
// über den Preload vorhanden) — beides lässt sich ohne eine echte React-/Browser-Umgebung nicht
// sinnvoll ausführen. `pnpm typen` prüft diese Datei trotzdem mit, `tsconfig.json` schließt
// `src/renderer` ein.
//
// Architekturgrenzen (CLAUDE.md §2/§11): kein `metaKey`, keine Zeichenkettenliterale in JSX (hier
// ohnehin kein JSX), kein direkter Zugriff auf `main`/better-sqlite3/Node — nur `./aufrufen` (die
// typisierte IPC-Brücke) und `window.wurzelwerk.abonnieren` (vom Preload freigegeben).
import { useEffect } from 'react'
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { AppFehler } from '../../shared/fehler/app-fehler'
import type { Ergebnis } from '../../shared/ipc/ergebnis'
import type { Ein, JournalStatusNutzlast, UndoErgebnis } from '../../shared/ipc/vertrag'
import { journalStatusNutzlastSchema } from '../../shared/schemata/journal'
import { aufrufen } from './aufrufen'

/**
 * Entpackt ein `Ergebnis<T>` zu `T` oder wirft den enthaltenen `AppFehler` — TanStack Query fängt
 * einen geworfenen Fehler in einer `mutationFn` selbst und reicht ihn als `error` durch, das ist
 * hier der gewünschte Weg, ohne ein zweites Ergebnis-Protokoll im Renderer nachzubilden.
 */
async function ergebnisEntpacken<T>(versprechen: Promise<Ergebnis<T>>): Promise<T> {
  const ergebnis = await versprechen
  if (!ergebnis.ok) {
    throw ergebnis.fehler
  }
  return ergebnis.daten
}

export function usePersonAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:person.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:person.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:person.anlegen', ein)),
  })
}

export function usePersonFeldSetzen(): UseMutationResult<null, AppFehler, Ein<'befehl:person.feldSetzen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:person.feldSetzen'>) => ergebnisEntpacken(aufrufen('befehl:person.feldSetzen', ein)),
  })
}

export function usePersonLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:person.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:person.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:person.loeschen', ein)),
  })
}

/**
 * Invalidiert pauschal den gesamten `@tanstack/react-query`-Cache nach jedem `ereignis:
 * datenGeaendert`-Push (D-EREIGNIS: die Nutzlast trägt kein `betroffen`-Feld, es gibt also nichts
 * Selektives nachzuführen). Kein Consumer vor AP-1.6, siehe Modul-Kommentar.
 */
export function useDatenGeaendertAbo(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    return window.wurzelwerk.abonnieren('ereignis:datenGeaendert', () => {
      void queryClient.invalidateQueries()
    })
  }, [queryClient])
}

/**
 * Reicht jeden `ereignis:journalStatus`-Push an `setter` weiter (Grundlage für den Undo/Redo-
 * Menüzustand, AP-0.10). `nutzlast` kommt als `unknown` vom Preload (`global.d.ts`) — ein
 * `ereignis:`-Push durchläuft (anders als `befehl:`/`abfrage:`) nie `src/main/ipc/huelle.ts`,
 * darum prüft `journalStatusNutzlastSchema.parse(...)` hier selbst, statt einem unbegründeten
 * `as` zu vertrauen (CLAUDE.md §4, AP-0.9-Hüter-Auflage).
 */
export function useJournalStatusAbo(setter: (status: JournalStatusNutzlast) => void): void {
  useEffect(() => {
    return window.wurzelwerk.abonnieren('ereignis:journalStatus', (nutzlast) => {
      setter(journalStatusNutzlastSchema.parse(nutzlast))
    })
  }, [setter])
}

/** `befehl:journal.undo` (55_Architektur.md §4.7/§4.9, AP-0.10) — nimmt die neueste rücknehmbare Transaktion zurück. */
export function useJournalUndo(): UseMutationResult<UndoErgebnis, AppFehler, void> {
  return useMutation({
    mutationFn: () => ergebnisEntpacken(aufrufen('befehl:journal.undo', null)),
  })
}

/** `befehl:journal.redo` (55_Architektur.md §4.7/§4.9, AP-0.10) — wiederholt die älteste zurückgenommene Transaktion. */
export function useJournalRedo(): UseMutationResult<UndoErgebnis, AppFehler, void> {
  return useMutation({
    mutationFn: () => ergebnisEntpacken(aufrufen('befehl:journal.redo', null)),
  })
}
