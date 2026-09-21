// AP-1.17 PR-A1 (B-07): Handler für `archiv.anlegen` — legt EINEN `archiv`-Stammsatz an. Läuft in
// der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein
// `BEGIN`/`COMMIT` hier), kein Journalcode nötig (die `jrn_archiv_a{i,u,d}`-Trigger schreiben die
// `aenderung`-Zeilen automatisch, solange das Journal armiert ist, s. `person-repo.ts`-Kopf).
import type { ArchivAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as archivRepo from '../repositories/archiv-repo'
import { neueId } from '../id'

export function archivAnlegen(tx: Tx, ein: ArchivAnlegenEin): { readonly id: string } {
  if (ein.ortId !== undefined && !datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }

  const id = neueId()
  const jetzt = Date.now()

  archivRepo.archivEinfuegen(tx, {
    id,
    name: ein.name,
    ortId: ein.ortId ?? null,
    kontakt: ein.kontakt ?? null,
    url: ein.url ?? null,
    notiz: ein.notiz ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  return { id }
}
