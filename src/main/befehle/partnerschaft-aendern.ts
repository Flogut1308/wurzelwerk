// AP-1.12: Handler für `partnerschaft.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `partnerschaftLesen()`, Feld-für-Feld-Vergleich (Zeile selbst — die Beteiligten
// ändert dieser Befehl nicht, s. Vertragskommentar); bei Gleichheit ein No-op.
// AP-1.30 PR 4: der Vergleich steht als `partnerschaftGeaenderteFelder()` für sich — derselbe
// Vergleich entscheidet über den No-op UND über den Koaleszenzschlüssel (`koaleszenz-schluessel.ts`).
import type { PartnerschaftAendernEin, PartnerschaftAendernFeld } from '../../shared/schemata/befehle'
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

/** Die Vertragsfelder, deren Wert `ein` gegenüber dem gespeicherten Stand ändern würde (eine
 * Datumsgruppe zählt als EIN Feld). */
export function partnerschaftGeaenderteFelder(vorher: PartnerschaftZeile, ein: PartnerschaftAendernEin): readonly PartnerschaftAendernFeld[] {
  const felder: PartnerschaftAendernFeld[] = []
  if (vorher.typ !== ein.typ) felder.push('typ')
  if (!datumUnveraendert(vorher, 'beginn', datumSpalten(ein.beginn))) felder.push('beginn')
  if (!datumUnveraendert(vorher, 'ende', datumSpalten(ein.ende))) felder.push('ende')
  if (vorher.ende_grund !== (ein.endeGrund ?? null)) felder.push('endeGrund')
  if (vorher.reihenfolge !== (ein.reihenfolge ?? null)) felder.push('reihenfolge')
  if (vorher.notiz !== (ein.notiz ?? null)) felder.push('notiz')
  return felder
}

export function partnerschaftAendern(tx: Tx, ein: PartnerschaftAendernEin): null {
  const vorher = beziehungRepo.partnerschaftLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PARTNERSCHAFT')
  }

  if (partnerschaftGeaenderteFelder(vorher, ein).length === 0) {
    return null
  }

  beziehungRepo.partnerschaftAktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    beginn: datumSpalten(ein.beginn),
    ende: datumSpalten(ein.ende),
    endeGrund: ein.endeGrund ?? null,
    reihenfolge: ein.reihenfolge ?? null,
    notiz: ein.notiz ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
