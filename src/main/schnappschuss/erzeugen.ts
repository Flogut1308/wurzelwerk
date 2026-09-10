// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): einen einzelnen Schnappschuss erzeugen -
// zusammengenommen `VACUUM INTO` (schnappschuss-repo.ts) + Integritätsprüfung + Dateinamensbildung
// (dateiname.ts). Ersetzt den Platzhalter `schnappschussVacuumInto()` aus
// `src/main/projekt/projekt-dienst.ts` (AP-0.5).
import type Database from 'better-sqlite3'
import { mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { SchnappschussEintrag } from '../../shared/ipc/vertrag'
import { schnappschussIntegritaetPruefen, vacuumInto } from '../repositories/schnappschuss-repo'
import { kolonfreieZeit, SCHNAPPSCHUSS_ENDUNG } from './dateiname'

/** Nur die eine Pfadangabe, die diese Funktion braucht - vermeidet einen Importkreis zu `src/main/projekt/ordnerformat.ts`. */
export interface SchnappschussZielOrdner {
  readonly snapshotsPfad: string
}

/**
 * Erzeugt einen Schnappschuss von `db` unter `pfade.snapshotsPfad` (55_Architektur.md §6.2).
 * `jetzt` ist injizierbar (Standard `Date.now`) — Test-Seam für `test/einheit/schnappschuss.test.ts`
 * und `test/einheit/aufbewahrung.test.ts` (deterministische Dateinamen/Zeitpunkte). `integritaetPruefen`
 * ist ebenfalls injizierbar (Standard `schnappschussIntegritaetPruefen`) — Test-Seam für einen
 * erzwungenen Fehlschlag (hueter-Auflage C1, AP-0.11): schlägt die Prüfung fehl, wird die gerade
 * erzeugte, beschädigte Kopie SOFORT gelöscht, bevor der Fehler weitergereicht wird - ohne diesen
 * Aufräumschritt bliebe eine korrupte Datei mit gültigem Schnappschuss-Dateinamen in
 * `snapshots/` liegen und würde von `schnappschussListeLesen()` als Wiederherstellungs-Kandidat
 * gelistet.
 */
export function schnappschussErzeugen(
  db: Database.Database,
  pfade: SchnappschussZielOrdner,
  jetzt: () => number = Date.now,
  integritaetPruefen: (pfad: string) => void = schnappschussIntegritaetPruefen,
): SchnappschussEintrag {
  mkdirSync(pfade.snapshotsPfad, { recursive: true })
  const zeitpunktMs = jetzt()
  const basisname = kolonfreieZeit(zeitpunktMs)
  const pfad = join(pfade.snapshotsPfad, `${basisname}${SCHNAPPSCHUSS_ENDUNG}`)

  vacuumInto(db, pfad)
  try {
    integritaetPruefen(pfad)
  } catch (fehler) {
    unlinkSync(pfad) // C1: kein korrupter Wiederherstellungs-Kandidat in snapshots/ liegen lassen
    throw fehler
  }

  return { id: basisname, pfad, zeitpunktMs, groesseBytes: statSync(pfad).size }
}
