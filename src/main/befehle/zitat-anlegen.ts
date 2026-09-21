// AP-1.17 PR-A3 (docs/schema/0002_kern.sql §2.7): Handler für `zitat.anlegen` — legt EIN
// `zitat` an. Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion
// (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier), kein Journalcode nötig (die `jrn_zitat_a{i,u,d}`-
// Trigger schreiben die `aenderung`-Zeilen automatisch, solange das Journal armiert ist, s.
// `person-repo.ts`-Kopf).
import type { ZitatAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as belegRepo from '../repositories/beleg-repo'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'

export function zitatAnlegen(tx: Tx, ein: ZitatAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'quelle', ein.quelleId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }

  const id = neueId()
  const jetzt = Date.now()

  belegRepo.zitatEinfuegen(tx, {
    id,
    quelleId: ein.quelleId,
    seite: ein.seite ?? null,
    eintragsnummer: ein.eintragsnummer ?? null,
    band: ein.band ?? null,
    jahr: ein.jahr ?? null,
    zugriffsdatum: datumSpalten(ein.zugriffsdatum),
    zeitmarkeSekunden: ein.zeitmarkeSekunden ?? null,
    digitalisatUrl: ein.digitalisatUrl ?? null,
    transkript: ein.transkript ?? null,
    uebersetzung: ein.uebersetzung ?? null,
    konfidenz: ein.konfidenz ?? null,
    mediumId: ein.mediumId ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  return { id }
}
