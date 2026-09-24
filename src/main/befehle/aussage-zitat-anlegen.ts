// AP-1.29 PR-A: Handler für `aussage_zitat.anlegen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Verknüpft EINEN
// bestehenden Beleg (`zitat`) mit einer bestehenden `aussage`, analog dem `belege`-Zweig von
// `aussage.anlegen` (`src/main/befehle/aussage-anlegen.ts`), hier als eigenständiger Befehl für
// eine bereits bestehende Aussage.
// AP-1.34 PR-C1a (B-01): optionaler Textanker [von, bis) — geprüft gegen das Transkript des Zitats
// (`ankerPruefen`, src/core/beleg/textanker.ts: Transkript vorhanden, innerhalb, kein geteiltes
// Ersatzpaar F4). Ein ungültiger Anker wirft VOR jedem Schreibvorgang.
// AP-1.34 PR-C1b (§31 U-1.34-F1): optionales `feld` — muss ein Attribut des `subjekt_typ` der
// Aussage sein (`belegFeldPasst`, src/shared/schemata/aussage-zitat.ts), sonst
// `VALIDIERUNG_WERTEBEREICH` VOR jedem Schreibvorgang. Zusätzlich (Eigentümer 24.09.2026, §31
// U-1.34-C1b-feld-praedikat): `feld` ≠ NULL nur an einer Existenz-Aussage (`praedikat='existenz'`,
// ADR-026) — an jeder anderen Aussage ist die Aussage selbst schon das belegte Attribut. Beide
// Prüfungen teilt `aussage_zitat.aendern`.
import type { AussageZitatAnlegenEin, Textanker } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { AussageSubjektTypEnum } from '../../shared/schemata/gemeinsam'
import { belegFeldPasst } from '../../shared/schemata/aussage-zitat'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import * as belegRepo from '../repositories/beleg-repo'
import { ankerPruefen } from '../../core/beleg/textanker'

/** Wirft `VALIDIERUNG_WERTEBEREICH`, wenn die Aussage keine Existenz-Aussage ist oder `feld` kein
 * Attribut ihres Subjekttyps ist. */
export function belegFeldPruefen(aussage: { readonly subjekt_typ: string; readonly praedikat: string }, feld: string): void {
  if (aussage.praedikat !== 'existenz') {
    throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', `Feld "${feld}" ist nur an einer Existenz-Aussage zulässig.`)
  }
  const subjektTyp = aussage.subjekt_typ
  const typ = AussageSubjektTypEnum.safeParse(subjektTyp)
  if (!typ.success || !belegFeldPasst(typ.data, feld)) {
    throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', `Feld "${feld}" passt nicht zum Subjekttyp "${subjektTyp}".`)
  }
}

/** Wirft `VALIDIERUNG_WERTEBEREICH`, wenn der Anker gegen das Transkript nicht `ok` ist (F4). */
export function belegAnkerPruefen(transkript: string | null, anker: Textanker): void {
  const pruefung = ankerPruefen(transkript, anker.von, anker.bis)
  if (pruefung !== 'ok') {
    throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', `Textanker ungültig: ${pruefung}.`)
  }
}

export function aussageZitatAnlegen(tx: Tx, ein: AussageZitatAnlegenEin): null {
  const aussage = aussageRepo.lesen(tx, ein.aussageId)
  if (aussage === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  const zitat = belegRepo.zitatLesen(tx, ein.zitatId)
  if (zitat === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
  }
  if (aussageRepo.verknuepfungExistiert(tx, ein.aussageId, ein.zitatId)) {
    throw new WurzelFehler('KONFLIKT_BEREITS_VORHANDEN')
  }

  if (ein.feld !== undefined) {
    belegFeldPruefen(aussage, ein.feld)
  }
  const anker = ein.textanker
  if (anker !== undefined) {
    belegAnkerPruefen(zitat.transkript, anker)
  }

  const jetzt = Date.now()
  aussageRepo.zitatVerknuepfen(tx, {
    aussageId: ein.aussageId,
    zitatId: ein.zitatId,
    feld: ein.feld,
    textankerVon: anker?.von,
    textankerBis: anker?.bis,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return null
}
