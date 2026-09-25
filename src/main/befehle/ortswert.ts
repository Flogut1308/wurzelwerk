// Vorarbeiten AP-1.30, PR 5 (docs/80 §31 U-1.34-D-ortspraedikat-wertzahl, §32 V-5-*): gemeinsame
// Prüfung für `aussage.anlegen` und `aussage.aendern` — ein Orts-Prädikat (`geburtsort`, `todesort`,
// `wohnort`, `ORTS_PRAEDIKATE` in src/core/person/ort-wert.ts) trägt einen Ortsverweis oder freien
// Ortstext, nie eine Zahl. Ursache statt Symptom: `traegtOrt` wertet eine Zahl ohnehin als „kein Ort".
// Eigenes Modul, damit kein Befehl vom anderen abhängt (hueter #130, Befund 8).
import { istOrtsPraedikat } from '../../core/person/ort-wert'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'

/** Wirft `VALIDIERUNG_ORTSWERT`, wenn an einem Orts-Prädikat ein Zahlwert gesetzt werden soll. Die
 * Meldung nennt nur das Prädikat (festes Schema-Vokabular), nie den Wert (CLAUDE.md §7). */
export function ortswertPruefen(praedikat: string, wertZahl: number | undefined): void {
  if (wertZahl !== undefined && istOrtsPraedikat(praedikat)) {
    throw new WurzelFehler('VALIDIERUNG_ORTSWERT', `Prädikat "${praedikat}" erwartet einen Ort, keine Zahl.`)
  }
}
