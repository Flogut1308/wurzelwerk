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
import type { Aus, Ein, JournalStatusNutzlast, ProjektGeschlossenNutzlast, UndoErgebnis } from '../../shared/ipc/vertrag'
import {
  datenGeaendertNutzlastSchema,
  journalStatusNutzlastSchema,
  projektGeschlossenNutzlastSchema,
  zustandsbibliothekOeffnenNutzlastSchema,
} from '../../shared/schemata/ereignisse'
import { aufrufen } from './aufrufen'

/**
 * Entpackt ein `Ergebnis<T>` zu `T` oder wirft den enthaltenen `AppFehler` — TanStack Query fängt
 * einen geworfenen Fehler sowohl in einer `mutationFn` (hier) als auch in einer `queryFn`
 * (`../brücke/abfrage-hooks.ts`) selbst und reicht ihn als `error` durch, das ist hier der
 * gewünschte Weg, ohne ein zweites Ergebnis-Protokoll im Renderer nachzubilden. Benannt exportiert,
 * damit `abfrage-hooks.ts` (AP-1.6) dieselbe Entpackung verwendet statt sie zu verdoppeln.
 */
export async function ergebnisEntpacken<T>(versprechen: Promise<Ergebnis<T>>): Promise<T> {
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
 * Selektives nachzuführen). Kein Consumer vor AP-1.6, siehe Modul-Kommentar. `nutzlast` kommt als
 * `unknown` vom Preload — `datenGeaendertNutzlastSchema.parse(...)` prüft sie, bevor invalidiert
 * wird (AP-0.20: dieselbe Härtung wie bei `useJournalStatusAbo` unten, jetzt für jeden
 * `ereignis:`-Hook Regel statt Ausnahme).
 */
export function useDatenGeaendertAbo(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    return window.wurzelwerk.abonnieren('ereignis:datenGeaendert', (nutzlast) => {
      datenGeaendertNutzlastSchema.parse(nutzlast)
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

/**
 * Reicht jeden `ereignis:projektGeschlossen`-Push an `bei` weiter (AP-0.20) — u. a. für die
 * Start-Ansicht, die dann auf den Startzustand zurückfällt, auch wenn `projektSchliessen()` nicht
 * über ihren eigenen Button, sondern hinter ihrem Rücken ausgelöst wurde (z. B. eine spätere
 * Wiederherstellung). `nutzlast` kommt als `unknown` vom Preload, `projektGeschlossenNutzlastSchema.parse`
 * prüft sie — dieselbe Begründung wie bei `useJournalStatusAbo` oben.
 */
export function useProjektGeschlossenAbo(bei: (nutzlast: ProjektGeschlossenNutzlast) => void): void {
  useEffect(() => {
    return window.wurzelwerk.abonnieren('ereignis:projektGeschlossen', (nutzlast) => {
      bei(projektGeschlossenNutzlastSchema.parse(nutzlast))
    })
  }, [bei])
}

/**
 * Reicht jeden `ereignis:zustandsbibliothekOeffnen`-Push an `bei` weiter (AP-1.11) — der
 * Menüpunkt „Entwicklung → Zustandsbibliothek" (nur `!app.isPackaged`) schaltet damit die Ansicht
 * im Renderer um, analog zu `useProjektGeschlossenAbo` oben. `nutzlast` ist immer `null`
 * (`ZustandsbibliothekOeffnenNutzlast`); `zustandsbibliothekOeffnenNutzlastSchema.parse` prüft das
 * trotzdem, aus derselben Begründung wie bei den anderen `ereignis:`-Hooks (kein `as`, CLAUDE.md §4).
 */
export function useZustandsbibliothekOeffnenAbo(bei: () => void): void {
  useEffect(() => {
    return window.wurzelwerk.abonnieren('ereignis:zustandsbibliothekOeffnen', (nutzlast) => {
      zustandsbibliothekOeffnenNutzlastSchema.parse(nutzlast)
      bei()
    })
  }, [bei])
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

/** `befehl:import.dateiWaehlen` (AP-1.4b, S-10) — öffnet den nativen Datei-Öffnen-Dialog, liefert den Pfad oder `null`. */
export function useImportDateiWaehlen(): UseMutationResult<Aus<'befehl:import.dateiWaehlen'>, AppFehler, void> {
  return useMutation({
    mutationFn: () => ergebnisEntpacken(aufrufen('befehl:import.dateiWaehlen', null)),
  })
}

/** `befehl:import.trockenlauf` (AP-1.4a/1.4b, S-11) — echter Import in einer zurückgerollten Transaktion, liefert den Bericht. */
export function useImportTrockenlauf(): UseMutationResult<Aus<'befehl:import.trockenlauf'>, AppFehler, Ein<'befehl:import.trockenlauf'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:import.trockenlauf'>) => ergebnisEntpacken(aufrufen('befehl:import.trockenlauf', ein)),
  })
}

/** `befehl:import.ausfuehren` (AP-1.5/1.4b, S-13) — schreibt den Import wirklich, liefert denselben Berichtstyp wie der Trockenlauf. */
export function useImportAusfuehren(): UseMutationResult<Aus<'befehl:import.ausfuehren'>, AppFehler, Ein<'befehl:import.ausfuehren'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:import.ausfuehren'>) => ergebnisEntpacken(aufrufen('befehl:import.ausfuehren', ein)),
  })
}

/** `befehl:import.berichtSpeichern` (AP-1.4b, S-11/S-13, F-03) — schreibt den gehaltenen Bericht als Text, liefert den Zielpfad oder `null`. */
export function useImportBerichtSpeichern(): UseMutationResult<Aus<'befehl:import.berichtSpeichern'>, AppFehler, Ein<'befehl:import.berichtSpeichern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:import.berichtSpeichern'>) => ergebnisEntpacken(aufrufen('befehl:import.berichtSpeichern', ein)),
  })
}
