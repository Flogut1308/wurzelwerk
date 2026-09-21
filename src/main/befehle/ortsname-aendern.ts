// AP-1.16 PR-A: Handler für `ortsname.aendern`. Läuft in der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `ortsnameLesen()`, Feld-für-Feld-Vergleich; stimmen ALLE Felder bereits mit
// `ein` überein, bleibt der Aufruf ein No-op.
import type { OrtsnameAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'
import type { OrtsnameZeile } from '../repositories/ort-repo'

function unveraendert(vorher: OrtsnameZeile, ein: OrtsnameAendernEin): boolean {
  return (
    vorher.name === ein.name &&
    vorher.sprache === (ein.sprache ?? null) &&
    vorher.gueltig_von === (ein.gueltigVon ?? null) &&
    vorher.gueltig_bis === (ein.gueltigBis ?? null) &&
    vorher.ist_bevorzugt === (ein.istBevorzugt ?? null) &&
    vorher.original_text === (ein.originalText ?? null)
  )
}

export function ortsnameAendern(tx: Tx, ein: OrtsnameAendernEin): null {
  const vorher = ortRepo.ortsnameLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORTSNAME')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  ortRepo.ortsnameAktualisieren(tx, {
    id: ein.id,
    name: ein.name,
    sprache: ein.sprache ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    istBevorzugt: ein.istBevorzugt ?? null,
    originalText: ein.originalText ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
