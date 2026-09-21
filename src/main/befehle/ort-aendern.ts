// AP-1.16 PR-A: Handler für `ort.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich; stimmen ALLE Felder bereits mit `ein`
// überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer
// `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { OrtAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'
import type { OrtZeile } from '../repositories/ort-repo'

function unveraendert(vorher: OrtZeile, ein: OrtAendernEin): boolean {
  return (
    vorher.typ === (ein.typ ?? null) &&
    vorher.koordinaten_lat === (ein.koordinatenLat ?? null) &&
    vorher.koordinaten_lon === (ein.koordinatenLon ?? null) &&
    vorher.existiert_von === (ein.existiertVon ?? null) &&
    vorher.existiert_bis === (ein.existiertBis ?? null) &&
    vorher.notiz === (ein.notiz ?? null)
  )
}

export function ortAendern(tx: Tx, ein: OrtAendernEin): null {
  const vorher = ortRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  ortRepo.aktualisieren(tx, {
    id: ein.id,
    typ: ein.typ ?? null,
    koordinatenLat: ein.koordinatenLat ?? null,
    koordinatenLon: ein.koordinatenLon ?? null,
    existiertVon: ein.existiertVon ?? null,
    existiertBis: ein.existiertBis ?? null,
    notiz: ein.notiz ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
