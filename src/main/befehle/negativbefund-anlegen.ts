// AP-1.17 PR-A4 (docs/schema/0002_kern.sql §2.7): Handler für `negativbefund.anlegen` — legt EINE
// `negativbefund`-Zeile an. Läuft in der vom Befehlsbus bereits geöffneten und armierten
// Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier), kein Journalcode nötig (die
// `jrn_negativbefund_a{i,u,d}`-Trigger schreiben die `aenderung`-Zeilen automatisch, solange das
// Journal armiert ist, s. `person-repo.ts`-Kopf).
import type { NegativbefundAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as negativbefundRepo from '../repositories/negativbefund-repo'
import { neueId } from '../id'

export function negativbefundAnlegen(tx: Tx, ein: NegativbefundAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'person', ein.gesuchtePersonId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  if (ein.quelleId !== undefined && !datensatzExistiert(tx, 'quelle', ein.quelleId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }

  const id = neueId()
  const jetzt = Date.now()

  negativbefundRepo.negativbefundEinfuegen(tx, {
    id,
    quelleId: ein.quelleId ?? null,
    gesuchtePersonId: ein.gesuchtePersonId,
    gesuchtesPraedikat: ein.gesuchtesPraedikat ?? null,
    zeitraumVon: ein.zeitraumVon ?? null,
    zeitraumBis: ein.zeitraumBis ?? null,
    beschreibung: ein.beschreibung ?? null,
    datumDerPruefung: ein.datumDerPruefung ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  return { id }
}
