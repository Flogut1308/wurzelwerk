// AP-1.12: gemeinsamer Helfer für die Existenz-Aussage (ADR-026), die `elternschaft.anlegen`,
// `partnerschaft.anlegen` und `ereignis.anlegen` beim Anlegen ihrer Kante/ihres Ereignisses
// schreiben — Muster `merkeExistenzAussage()` aus `src/main/import/schreiben.ts`, hier synchron
// statt gesammelt: jeder Befehl betrifft immer nur EINE neue Zeile statt eines ganzen
// Importlaufs. Läuft in der bereits offenen, armierten Transaktion des Aufrufers — kein
// `BEGIN`/`COMMIT` hier (CLAUDE.md §2).
import { neueId } from '../id'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import { datumSpalten } from '../import/datum-spalten'

/** `belege` sind bestehende `zitat.id`-Werte (AP-1.12: keine `quelle`/`zitat`-Anlage in diesem
 * Arbeitspaket) — anders als `src/main/import/schreiben.ts::AussageAufgabe`, das volle
 * `Beleg`-Objekte trägt und dabei selbst neue `zitat`-Zeilen anlegt. */
export interface ExistenzAussageEin {
  readonly subjektTyp: 'elternschaft' | 'partnerschaft' | 'ereignis'
  readonly subjektId: string
  readonly konfidenz: number
  readonly belege?: readonly string[] | undefined
  readonly erstelltAm: number
}

/** Schreibt eine Existenz-Aussage (`praedikat: 'existenz'`, `wert_text: 'ja'` — FESTGENAGELT wie
 * im Import-Pfad, ADR-026) + eine `aussage_zitat`-Verknüpfung je Eintrag in `ein.belege`. */
export function existenzAussageSchreiben(tx: Tx, ein: ExistenzAussageEin): void {
  const aussageId = neueId()
  aussageRepo.einfuegen(tx, {
    id: aussageId,
    subjektTyp: ein.subjektTyp,
    subjektId: ein.subjektId,
    praedikat: 'existenz',
    wertText: 'ja',
    wertZahl: null,
    wertRefId: null,
    datum: datumSpalten(undefined),
    konfidenz: ein.konfidenz,
    istBevorzugt: null,
    begruendung: null,
    unsicherheit: null,
    gueltigVon: null,
    gueltigBis: null,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.erstelltAm,
  })
  ein.belege?.forEach((zitatId) => {
    aussageRepo.zitatVerknuepfen(tx, { aussageId, zitatId, erstelltAm: ein.erstelltAm, geaendertAm: ein.erstelltAm })
  })
}
