// AP-1.12: Handler für `partnerschaft.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `partnerschaftLesen()`, Feld-für-Feld-Vergleich (Zeile selbst — die Beteiligten
// ändert dieser Befehl nicht, s. Vertragskommentar); bei Gleichheit ein No-op.
import type { PartnerschaftAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import type { PartnerschaftZeile } from '../repositories/beziehung-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'

function datumUnveraendert(vorher: PartnerschaftZeile, praefix: 'beginn' | 'ende', neu: DatumSpaltengruppe): boolean {
  return (
    vorher[`${praefix}_kalender`] === neu.kalender &&
    vorher[`${praefix}_modifikator`] === neu.modifikator &&
    vorher[`${praefix}_praezision`] === neu.praezision &&
    vorher[`${praefix}_wert1`] === neu.wert1 &&
    vorher[`${praefix}_wert2`] === neu.wert2 &&
    vorher[`${praefix}_originaltext`] === neu.originaltext &&
    vorher[`${praefix}_sort_von`] === neu.sortVon &&
    vorher[`${praefix}_sort_bis`] === neu.sortBis &&
    vorher[`${praefix}_zweitkalender`] === neu.zweitkalender &&
    vorher[`${praefix}_zweitwert`] === neu.zweitwert &&
    vorher[`${praefix}_doppeljahr`] === neu.doppeljahr
  )
}

export function partnerschaftAendern(tx: Tx, ein: PartnerschaftAendernEin): null {
  const vorher = beziehungRepo.partnerschaftLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PARTNERSCHAFT')
  }

  const neuerBeginn = datumSpalten(ein.beginn)
  const neuesEnde = datumSpalten(ein.ende)
  const neuerEndeGrund = ein.endeGrund ?? null
  const neueReihenfolge = ein.reihenfolge ?? null
  const neueNotiz = ein.notiz ?? null

  if (
    vorher.typ === ein.typ &&
    datumUnveraendert(vorher, 'beginn', neuerBeginn) &&
    datumUnveraendert(vorher, 'ende', neuesEnde) &&
    vorher.ende_grund === neuerEndeGrund &&
    vorher.reihenfolge === neueReihenfolge &&
    vorher.notiz === neueNotiz
  ) {
    return null
  }

  beziehungRepo.partnerschaftAktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    beginn: neuerBeginn,
    ende: neuesEnde,
    endeGrund: neuerEndeGrund,
    reihenfolge: neueReihenfolge,
    notiz: neueNotiz,
    geaendertAm: Date.now(),
  })
  return null
}
