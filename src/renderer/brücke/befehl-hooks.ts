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

/** `befehl:name.anlegen` (AP-1.12, AP-1.14a: erster Konsument — die Kernfelder-Schreibmaske). */
export function useNameAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:name.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:name.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:name.anlegen', ein)),
  })
}

/** `befehl:name.aendern` (AP-1.12, AP-1.14a). */
export function useNameAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:name.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:name.aendern'>) => ergebnisEntpacken(aufrufen('befehl:name.aendern', ein)),
  })
}

/** `befehl:name.loeschen` (AP-1.12, AP-1.14a). */
export function useNameLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:name.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:name.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:name.loeschen', ein)),
  })
}

/** `befehl:ort.anlegen` (AP-1.13 PR-C, docs/71 §3.2) — die feste Schlusszeile des `Ortsfeld`s. */
export function useOrtAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:ort.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ort.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:ort.anlegen', ein)),
  })
}

/** `befehl:ort.aendern` (AP-1.16 PR-C, Orte-Pflege-Ansicht). */
export function useOrtAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:ort.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ort.aendern'>) => ergebnisEntpacken(aufrufen('befehl:ort.aendern', ein)),
  })
}

/** `befehl:ortsname.anlegen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Namen hinzufügen"). */
export function useOrtsnameAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:ortsname.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortsname.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:ortsname.anlegen', ein)),
  })
}

/** `befehl:ortsname.aendern` (AP-1.16 PR-C, Orte-Pflege-Ansicht: Inline-Bearbeiten einer Namenszeile). */
export function useOrtsnameAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:ortsname.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortsname.aendern'>) => ergebnisEntpacken(aufrufen('befehl:ortsname.aendern', ein)),
  })
}

/** `befehl:ortsname.loeschen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Entfernen"). */
export function useOrtsnameLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:ortsname.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortsname.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:ortsname.loeschen', ein)),
  })
}

/** `befehl:ortszugehoerigkeit.anlegen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Zugehörigkeit hinzufügen"). */
export function useOrtszugehoerigkeitAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:ortszugehoerigkeit.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortszugehoerigkeit.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:ortszugehoerigkeit.anlegen', ein)),
  })
}

/** `befehl:ortszugehoerigkeit.aendern` (AP-1.16 PR-C, Orte-Pflege-Ansicht: Inline-Bearbeiten der Gültigkeit). */
export function useOrtszugehoerigkeitAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:ortszugehoerigkeit.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortszugehoerigkeit.aendern'>) => ergebnisEntpacken(aufrufen('befehl:ortszugehoerigkeit.aendern', ein)),
  })
}

/** `befehl:ortszugehoerigkeit.loeschen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Entfernen"). */
export function useOrtszugehoerigkeitLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:ortszugehoerigkeit.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ortszugehoerigkeit.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:ortszugehoerigkeit.loeschen', ein)),
  })
}

/** `befehl:ort-externe-id.anlegen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Externe Kennung hinzufügen"). */
export function useOrtExterneIdAnlegen(): UseMutationResult<null, AppFehler, Ein<'befehl:ort-externe-id.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ort-externe-id.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:ort-externe-id.anlegen', ein)),
  })
}

/** `befehl:ort-externe-id.loeschen` (AP-1.16 PR-C, Orte-Pflege-Ansicht: „Entfernen"). */
export function useOrtExterneIdLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:ort-externe-id.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ort-externe-id.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:ort-externe-id.loeschen', ein)),
  })
}

/** `befehl:archiv.anlegen` (AP-1.17 PR-A1, PR-C1) — die feste Schlusszeile des `Archivfeld`s. */
export function useArchivAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:archiv.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:archiv.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:archiv.anlegen', ein)),
  })
}

/** `befehl:archiv.aendern` (AP-1.17 PR-A1, PR-C1, Quelle-Pflege-Ansicht). */
export function useArchivAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:archiv.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:archiv.aendern'>) => ergebnisEntpacken(aufrufen('befehl:archiv.aendern', ein)),
  })
}

/** `befehl:quelle.anlegen` (AP-1.17 PR-A2, PR-C1) — Einstiegspunkt „Quelle anlegen" am
 * Belegapparat des Profils (`beleg-liste.tsx`). */
export function useQuelleAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:quelle.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:quelle.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:quelle.anlegen', ein)),
  })
}

/** `befehl:quelle.aendern` (AP-1.17 PR-A2, PR-C1, Quelle-Pflege-Ansicht). */
export function useQuelleAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:quelle.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:quelle.aendern'>) => ergebnisEntpacken(aufrufen('befehl:quelle.aendern', ein)),
  })
}

/** `befehl:zitat.anlegen` (AP-1.17 PR-A3, PR-C1, Quelle-Pflege-Ansicht: „Zitat hinzufügen"). */
export function useZitatAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:zitat.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:zitat.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:zitat.anlegen', ein)),
  })
}

/** `befehl:zitat.aendern` (AP-1.17 PR-A3, PR-C1, Quelle-Pflege-Ansicht: Inline-Bearbeiten eines Zitats). */
export function useZitatAendern(): UseMutationResult<null, AppFehler, Ein<'befehl:zitat.aendern'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:zitat.aendern'>) => ergebnisEntpacken(aufrufen('befehl:zitat.aendern', ein)),
  })
}

/** `befehl:zitat.loeschen` (AP-1.17 PR-A3, PR-C1, Quelle-Pflege-Ansicht: „Entfernen"). */
export function useZitatLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:zitat.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:zitat.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:zitat.loeschen', ein)),
  })
}

/** `befehl:ereignis.anlegen` (AP-1.12, AP-1.15 PR-A: erster Konsument — das Ereignis-Neu-Formular
 * der Profil-Bearbeitungsseite schreibt ALLE gesammelten Beteiligten in EINEM Aufruf, Variante A). */
export function useEreignisAnlegen(): UseMutationResult<{ readonly id: string }, AppFehler, Ein<'befehl:ereignis.anlegen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ereignis.anlegen'>) => ergebnisEntpacken(aufrufen('befehl:ereignis.anlegen', ein)),
  })
}

/** `befehl:ereignis.loeschen` (AP-1.12, AP-1.15 PR-A) — löscht das gesamte Ereignis (alle
 * Beteiligungen), anders als `useBeteiligungLoeschen` unten (nur die eigene Teilnahme). */
export function useEreignisLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:ereignis.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:ereignis.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:ereignis.loeschen', ein)),
  })
}

/** `befehl:beteiligung.loeschen` (AP-1.15 PR-A, Variante A) — entfernt NUR die Teilnahme EINER
 * Person an EINEM Ereignis; das Ereignis selbst bleibt bestehen. */
export function useBeteiligungLoeschen(): UseMutationResult<null, AppFehler, Ein<'befehl:beteiligung.loeschen'>> {
  return useMutation({
    mutationFn: (ein: Ein<'befehl:beteiligung.loeschen'>) => ergebnisEntpacken(aufrufen('befehl:beteiligung.loeschen', ein)),
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
