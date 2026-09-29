// U-130-nachladen-undo-vor-echo (AP-1.30 / AP-0.15, docs/80 §33): ein Signal „der Speicher wurde
// von außen zurückgesetzt, und der Cache ist danach frisch", unabhängig davon, ob sich ein
// geladener Wert dabei ändert.
//
// Warum ein eigenes Signal: `useEntwurfMitVerzoegertemCommit` erkennt fremde Änderungen daran, dass
// sich sein `wert` ändert. Kommt ein Undo an, BEVOR das Nachladen des eigenen Schreibens den Cache
// erreicht hat, liefert der Speicher wieder den Stand von vor dem Schreiben — denselben, den der
// Cache noch hält. `wert` ändert sich nicht, der Hook sieht nichts: das Feld zeigt den geschriebenen
// Entwurf, gespeichert ist der alte Stand, oder ein ausstehender Entwurf überschreibt das Undo.
//
// Der Stand zählt zwei Nummern: `fremdNr` steigt mit jedem `ereignis:datenGeaendert`, dessen
// Ursache eine Rücknahme ist (Undo/Redo); `geladenNr` zieht auf `fremdNr` nach, sobald ALLE bis
// dahin angestoßenen Invalidierungen abgeschlossen sind (auch eine, die eine andere abgebrochen hat
// — TanStack bricht beim erneuten Invalidieren den laufenden Abruf ab, dessen Versprechen löst sich
// dann vorzeitig). `fremdNr !== geladenNr` heißt: eine Rücknahme ist bekannt, ihr Stand aber noch
// nicht im Cache. Das Nachziehen läuft über `planen` (im Renderer `notifyManager.schedule` von
// TanStack), damit es NACH den Beobachter-Benachrichtigungen des Abrufs ankommt, die TanStack
// selbst über denselben Planer verschickt: wer die neue `geladenNr` sieht, sieht auch die neuen Daten.
//
// Nur Rücknahmen, nicht jedes Ereignis: nach dem EIGENEN Schreiben kann das Nachladen einen Stand
// liefern, der älter ist als ein inzwischen gesendeter zweiter Entwurf (docs/80 S3). Ein Vergleich
// „frisch geladen ≠ zuletzt gesendet ⇒ fremd" wäre dort falsch; nach einer Rücknahme ist er richtig,
// weil der Hook bis zum Nachladen nicht schreibt.
//
// Architektur (CLAUDE.md §2): reines Renderer-Modul, keine Node-/Electron-Abhängigkeit, kein IPC —
// gespeist wird der Stand von `useDatenGeaendertAbo()` (`befehl-hooks.ts`), dem einzigen Abonnenten
// von `ereignis:datenGeaendert`. Ohne Anbieter liefert `NachladenKontext` einen ruhenden Stand, der
// sich nie ändert (Einheitstests des Hooks ohne App-Rahmen, Lesesicht).
import { createContext } from 'react'

export interface NachladenStand {
  /** Anzahl der bisher gemeldeten Rücknahmen (Undo/Redo). */
  readonly fremdNr: number
  /** Die höchste `fremdNr`, nach der alle Invalidierungen abgeschlossen waren. */
  readonly geladenNr: number
}

/** Lesende Sicht für `useSyncExternalStore`: `lesen` liefert bei gleichem Stand dieselbe Referenz. */
export interface NachladenQuelle {
  readonly lesen: () => NachladenStand
  readonly abonnieren: (bei: () => void) => () => void
}

export interface NachladenMelder extends NachladenQuelle {
  /**
   * Meldet den Beginn einer Invalidierung nach `ereignis:datenGeaendert`. `ruecknahme` zählt
   * `fremdNr` hoch. Die zurückgegebene Funktion ist nach Abschluss der Invalidierung genau einmal
   * aufzurufen (Erfolg wie Fehlschlag).
   */
  readonly invalidierungBegonnen: (ruecknahme: boolean) => () => void
}

const RUHEND: NachladenStand = { fremdNr: 0, geladenNr: 0 }

const RUHENDE_QUELLE: NachladenQuelle = {
  lesen: () => RUHEND,
  abonnieren: () => () => {},
}

export const NachladenKontext = createContext<NachladenQuelle>(RUHENDE_QUELLE)

/** Ursachen von `ereignis:datenGeaendert`, die den Speicher hinter dem Rücken der Ansicht zurücksetzen. */
export function istRuecknahme(ursache: string): boolean {
  return ursache === 'journal.undo' || ursache === 'journal.redo'
}

/** Eine Rücknahme ist gemeldet, ihr Stand aber noch nicht im Cache angekommen. */
export function wartetAufRuecknahme(stand: NachladenStand): boolean {
  return stand.fremdNr !== stand.geladenNr
}

export function nachladenMelderErzeugen(planen: (aufgabe: () => void) => void): NachladenMelder {
  let stand = RUHEND
  let laufend = 0
  const abonnenten = new Set<() => void>()

  function setzen(naechster: NachladenStand): void {
    if (naechster.fremdNr === stand.fremdNr && naechster.geladenNr === stand.geladenNr) return
    stand = naechster
    for (const bei of [...abonnenten]) bei()
  }

  return {
    lesen: () => stand,
    abonnieren: (bei) => {
      abonnenten.add(bei)
      return () => {
        abonnenten.delete(bei)
      }
    },
    invalidierungBegonnen: (ruecknahme) => {
      laufend += 1
      if (ruecknahme) setzen({ fremdNr: stand.fremdNr + 1, geladenNr: stand.geladenNr })
      let erledigt = false
      return () => {
        if (erledigt) return
        erledigt = true
        laufend -= 1
        planen(() => {
          // Erst nachziehen, wenn keine Invalidierung mehr läuft (auch keine später begonnene).
          if (laufend === 0) setzen({ fremdNr: stand.fremdNr, geladenNr: stand.fremdNr })
        })
      }
    },
  }
}
