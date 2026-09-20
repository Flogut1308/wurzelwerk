// AP-1.12: Handler für `partnerschaft.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { PartnerschaftAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'
import { existenzAussageSchreiben } from './existenz-aussage'

export function partnerschaftAnlegen(tx: Tx, ein: PartnerschaftAnlegenEin): { readonly id: string } {
  for (const beteiligter of ein.beteiligte) {
    if (!datensatzExistiert(tx, 'person', beteiligter.personId)) {
      throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
    }
  }

  const id = neueId()
  const jetzt = Date.now()
  beziehungRepo.partnerschaftEinfuegen(tx, {
    id,
    typ: ein.typ,
    beginn: datumSpalten(ein.beginn),
    ende: datumSpalten(ein.ende),
    endeGrund: ein.endeGrund ?? null,
    reihenfolge: ein.reihenfolge ?? null,
    notiz: ein.notiz ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  ein.beteiligte.forEach((beteiligter) => {
    beziehungRepo.partnerschaftPersonEinfuegen(tx, {
      partnerschaftId: id,
      personId: beteiligter.personId,
      rolle: beteiligter.rolle ?? null,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    })
  })

  existenzAussageSchreiben(tx, {
    subjektTyp: 'partnerschaft',
    subjektId: id,
    konfidenz: ein.konfidenz,
    belege: ein.belege,
    erstelltAm: jetzt,
  })
  return { id }
}
