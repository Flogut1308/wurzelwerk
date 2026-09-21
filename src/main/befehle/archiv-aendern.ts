// AP-1.17 PR-A1 (B-07): Handler für `archiv.aendern`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich; stimmen ALLE Felder bereits mit `ein`
// überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer
// `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { ArchivAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as archivRepo from '../repositories/archiv-repo'
import type { ArchivZeile } from '../repositories/archiv-repo'

function unveraendert(vorher: ArchivZeile, ein: ArchivAendernEin): boolean {
  return (
    vorher.name === ein.name &&
    vorher.ort_id === (ein.ortId ?? null) &&
    vorher.kontakt === (ein.kontakt ?? null) &&
    vorher.url === (ein.url ?? null) &&
    vorher.notiz === (ein.notiz ?? null)
  )
}

export function archivAendern(tx: Tx, ein: ArchivAendernEin): null {
  const vorher = archivRepo.archivLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ARCHIV')
  }
  if (ein.ortId !== undefined && !datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  archivRepo.archivAktualisieren(tx, {
    id: ein.id,
    name: ein.name,
    ortId: ein.ortId ?? null,
    kontakt: ein.kontakt ?? null,
    url: ein.url ?? null,
    notiz: ein.notiz ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
