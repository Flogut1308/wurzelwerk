// AP-0.11, 55_Architektur.md §4.6 (ADR-003): die Journalbegrenzung. Analog zum Kopfkommentar in
// `src/main/journal/undo.ts` öffnet `journalAufraeumen()` bewusst eine EIGENE
// `db.transaction(...)` (CLAUDE.md §2 gehört das Öffnen einer Transaktion eigentlich
// ausschließlich `src/main/befehle/`) — Aufräumen ist aber kein `befehl:`-Handler, sondern eine
// Wartungsoperation beim Öffnen des Projekts (`src/main/projekt/projekt-dienst.ts`), NICHT über
// den Befehlsbus erreichbar: Der Bus (`src/main/befehle/bus.ts`) würde die dabei entstehende
// `transaktion`-Zeile mit `art = 'wartung'` sofort wieder verwerfen, weil sie selbst keine
// `aenderung`-Zeilen erzeugt (55_Architektur.md §4.5 — "eine Transaktion ohne aenderung-Zeile wird
// verworfen"). Anders als `undo()`/`redo()` braucht `journalAufraeumen()` KEIN `journalAus()`:
// `transaktion`/`aenderung` sind selbst NICHT_JOURNALISIERT (kein `jrn_*`-Trigger reagiert auf
// Schreibvorgänge dort), das Schreiben hier erzeugt also ohnehin keine weiteren `aenderung`-Zeilen.
import type Database from 'better-sqlite3'
import { zuBegrenzendeTransaktionen } from '../../core/journal/begrenzung-auswahl'
import { neueId } from '../ipc/huelle'
import {
  aenderungenLoeschen,
  alteTransaktionenLesen,
  naechsteLfd,
  rueckgaengigMoeglichAberkennen,
  transaktionAnlegen,
} from '../repositories/journal-repo'

/**
 * Räumt das Änderungsjournal auf (55_Architektur.md §4.6): löscht die `aenderung`-Zeilen aller
 * Transaktionen, die weder unter den letzten 200 (nach `lfd`) stehen noch jünger als 30 Tage sind,
 * und setzt für diese `transaktion.rueckgaengig_moeglich = 0`. Die `transaktion`-Zeilen selbst
 * bleiben für immer (der Verlauf bleibt lesbar). Legt selbst eine `transaktion`-Zeile mit
 * `art = 'wartung'` an, ebenfalls `rueckgaengig_moeglich = 0` — auch das Aufräumen ist nicht
 * rücknehmbar. Ohne Kandidaten (z. B. ein frisches Projekt) ist der Aufruf ein No-op: keine neue
 * Wartungstransaktion. `jetzt` ist injizierbar (Standard `Date.now`) — Test-Seam.
 */
export function journalAufraeumen(db: Database.Database, jetzt: () => number = Date.now): void {
  db.transaction((): void => {
    const alle = alteTransaktionenLesen(db)
    const zeitpunktMs = jetzt()
    const zuBegrenzen = zuBegrenzendeTransaktionen(alle, zeitpunktMs)
    if (zuBegrenzen.length === 0) {
      return
    }

    aenderungenLoeschen(db, zuBegrenzen)
    rueckgaengigMoeglichAberkennen(db, zuBegrenzen)

    const wartungsId = neueId()
    transaktionAnlegen(db, {
      id: wartungsId,
      zeitpunkt: zeitpunktMs,
      art: 'wartung',
      lfd: naechsteLfd(db),
      beschreibung: 'journal.aufgeraeumt',
    })
    rueckgaengigMoeglichAberkennen(db, [wartungsId])
  }).immediate()
}
