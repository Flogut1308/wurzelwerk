// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): die Schnappschuss-Rotation beim Öffnen. Liest
// den `snapshots/`-Ordner, ermittelt über die reine Auswahlfunktion aus `src/core/` die zu
// löschenden Kandidaten und entfernt genau die.
import { unlinkSync } from 'node:fs'
import { zuLoeschendeSchnappschuesse } from '../../core/aufbewahrung/schnappschuss-auswahl'
import { schnappschussListeLesen } from './liste'

/**
 * Räumt `snapshotsPfad` auf (55_Architektur.md §6.2): behält die letzten 10, einen pro UTC-Tag der
 * letzten 7 Tage und einen pro UTC-Woche der letzten 4 Wochen, löscht den Rest. `ersetzt-*.sqlite`
 * ist über `schnappschussListeLesen()` ohnehin nie ein Kandidat (§6.4). `jetzt` ist injizierbar
 * (Standard `Date.now`) — Test-Seam.
 */
export function schnappschussAufbewahrung(snapshotsPfad: string, jetzt: () => number = Date.now): void {
  const liste = schnappschussListeLesen(snapshotsPfad)
  const zuLoeschenIds = new Set(zuLoeschendeSchnappschuesse(liste, jetzt()))
  for (const eintrag of liste) {
    if (zuLoeschenIds.has(eintrag.id)) {
      unlinkSync(eintrag.pfad)
    }
  }
}
