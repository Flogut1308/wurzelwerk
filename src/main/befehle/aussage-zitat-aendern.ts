// AP-1.34 PR-C1b (B-01, docs/80_Offene_Fragen.md §31 U-1.34-F2): Handler für `aussage_zitat.aendern`.
// Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein
// `BEGIN`/`COMMIT` hier). Ersetzt `feld` UND Textanker einer bestehenden Verknüpfung vollständig
// (`null` = entfernen) — ein Befehl, ein Undo-Schritt (kein Koaleszenz-Schlüssel).
// - Fehlt die Verknüpfung: `NICHT_GEFUNDEN_AUSSAGE_ZITAT` (auch wenn Aussage und Zitat bestehen).
// - AP-0.22: stimmen `feld` und Anker schon überein, bleibt der Aufruf ein No-op (kein Schreib-
//   vorgang, kein neues `geaendert_am`) — der Befehlsbus verwirft die leere Transaktion.
// - Sonst dieselben Prüfungen wie `aussage_zitat.anlegen` VOR dem Schreiben: `feld` passt zum
//   `subjekt_typ` der Aussage, der Anker ist gegen das Transkript des Zitats `ok` (F4).
import type { AussageZitatAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import * as belegRepo from '../repositories/beleg-repo'
import { belegAnkerPruefen, belegFeldPruefen } from './aussage-zitat-anlegen'

export function aussageZitatAendern(tx: Tx, ein: AussageZitatAendernEin): null {
  const vorher = aussageRepo.verknuepfungLesen(tx, ein.aussageId, ein.zitatId)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE_ZITAT')
  }

  const neuVon = ein.textanker?.von ?? null
  const neuBis = ein.textanker?.bis ?? null
  if (vorher.feld === ein.feld && vorher.textanker_von === neuVon && vorher.textanker_bis === neuBis) {
    return null
  }

  if (ein.feld !== null) {
    const aussage = aussageRepo.lesen(tx, ein.aussageId)
    if (aussage === undefined) {
      // Defensiv (CLAUDE.md §4: kein `!`): die Verknüpfung hat einen FK auf `aussage` (CASCADE).
      throw new WurzelFehler('INTERN_UNERWARTET', `aussage fehlt für bestehende Verknüpfung "${ein.aussageId}".`)
    }
    belegFeldPruefen(aussage.subjekt_typ, ein.feld)
  }
  if (ein.textanker !== null) {
    const zitat = belegRepo.zitatLesen(tx, ein.zitatId)
    if (zitat === undefined) {
      // Defensiv: FK auf `zitat` (CASCADE), s. o.
      throw new WurzelFehler('INTERN_UNERWARTET', `zitat fehlt für bestehende Verknüpfung "${ein.zitatId}".`)
    }
    belegAnkerPruefen(zitat.transkript, ein.textanker)
  }

  aussageRepo.verknuepfungAktualisieren(tx, {
    aussageId: ein.aussageId,
    zitatId: ein.zitatId,
    feld: ein.feld,
    textankerVon: neuVon,
    textankerBis: neuBis,
    geaendertAm: Date.now(),
  })
  return null
}
