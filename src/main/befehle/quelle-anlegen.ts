// AP-1.17 PR-A2 (docs/schema/0002_kern.sql §2.7 + §2.15): Handler für `quelle.anlegen` — legt
// EINE `quelle`-Zeile an. Läuft in der vom Befehlsbus bereits geöffneten und armierten
// Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier), kein Journalcode nötig (die
// `jrn_quelle_a{i,u,d}`-Trigger schreiben die `aenderung`-Zeilen automatisch, solange das Journal
// armiert ist, s. `person-repo.ts`-Kopf).
import type { QuelleAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as belegRepo from '../repositories/beleg-repo'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'

export function quelleAnlegen(tx: Tx, ein: QuelleAnlegenEin): { readonly id: string } {
  if (ein.archivId !== undefined && !datensatzExistiert(tx, 'archiv', ein.archivId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ARCHIV')
  }

  const id = neueId()
  const jetzt = Date.now()

  belegRepo.quelleEinfuegen(tx, {
    id,
    typ: ein.typ,
    titel: ein.titel ?? null,
    autor: ein.autor ?? null,
    verlag: ein.verlag ?? null,
    jahr: ein.jahr ?? null,
    art: ein.art ?? null,
    informationsart: ein.informationsart ?? null,
    archivId: ein.archivId ?? null,
    signatur: ein.signatur ?? null,
    notiz: ein.notiz ?? null,
    informantPersonId: ein.informantPersonId ?? null,
    gespraechsdatum: datumSpalten(ein.gespraechsdatum),
    form: ein.form ?? null,
    unmittelbarkeit: ein.unmittelbarkeit ?? null,
    audioMediumId: ein.audioMediumId ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  return { id }
}
