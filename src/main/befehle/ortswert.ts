// Vorarbeiten AP-1.30, PR 5 (docs/80 §31 U-1.34-D-ortspraedikat-wertzahl, §32 V-5-*) und Teil 2, PR 4
// (§32 V-5-datum): gemeinsame Prüfung für `aussage.anlegen` und `aussage.aendern` — ein Orts-Prädikat
// (`geburtsort`, `todesort`, `wohnort`, `ORTS_PRAEDIKATE` in src/core/person/ort-wert.ts) trägt einen
// Ortsverweis oder freien Ortstext, nie eine Zahl und nie ein Datum. Die Regel selbst steht im Kern
// (`ortswertVerletzung`); hier wird nur der Fehler geworfen. Eigenes Modul, damit kein Befehl vom
// anderen abhängt (hueter #130, Befund 8).
import { ortswertVerletzung } from '../../core/person/ort-wert'
import type { Datumswert } from '../../shared/schemata/import-v1'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'

/** Wirft `VALIDIERUNG_ORTSWERT`, wenn an einem Orts-Prädikat ein Zahl- oder Datumswert gesetzt werden
 * soll. Die Meldung nennt nur Prädikat und Wertart (festes Vokabular), nie den Wert (CLAUDE.md §7). */
export function ortswertPruefen(praedikat: string, werte: { readonly wertZahl: number | undefined; readonly datum: Datumswert | undefined }): void {
  const verletzung = ortswertVerletzung(praedikat, { hatZahl: werte.wertZahl !== undefined, hatDatum: werte.datum !== undefined })
  if (verletzung !== null) {
    throw new WurzelFehler('VALIDIERUNG_ORTSWERT', `Prädikat "${praedikat}" erwartet einen Ort, keine ${verletzung === 'zahl' ? 'Zahl' : 'Datumsangabe'}.`)
  }
}
