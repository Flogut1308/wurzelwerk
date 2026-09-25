// AP-1.29 PR-A: Handler für `aussage.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (nur die editierbaren Spalten — `subjekt_typ`/
// `subjekt_id`/`praedikat`/`ist_bevorzugt` ändert dieser Befehl bewusst NICHT, s. Vertragskommentar
// `src/shared/schemata/befehle.ts`); bei Gleichheit ein No-op.
// Vorarbeiten AP-1.30 Teil 3, PR 4b (E5, docs/80 §32 V-E5-erhalt): `datumBeibehalten` übernimmt die
// gespeicherte Datumsgruppe unverändert — auch an Orts-Prädikaten, deren Altbestand noch ein Datum
// trägt. Die Orts-Prüfung sieht dann keinen NEUEN Datumswert; ein Datum neu setzen bleibt verboten.
// AP-1.30 PR 4: der Vergleich steht als `aussageGeaenderteFelder()` für sich — derselbe Vergleich
// entscheidet über den No-op UND über den Koaleszenzschlüssel (`koaleszenz-schluessel.ts`).
import type { AussageAendernEin, AussageAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import type { AussageZeile } from '../repositories/aussage-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'
import { ortswertPruefen } from './ortswert'

function gespeichertesDatum(vorher: AussageZeile): DatumSpaltengruppe {
  return {
    kalender: vorher.datum_kalender,
    modifikator: vorher.datum_modifikator,
    praezision: vorher.datum_praezision,
    wert1: vorher.datum_wert1,
    wert2: vorher.datum_wert2,
    originaltext: vorher.datum_originaltext,
    sortVon: vorher.datum_sort_von,
    sortBis: vorher.datum_sort_bis,
    zweitkalender: vorher.datum_zweitkalender,
    zweitwert: vorher.datum_zweitwert,
    doppeljahr: vorher.datum_doppeljahr,
  }
}

function datumUnveraendert(vorher: AussageZeile, neu: DatumSpaltengruppe): boolean {
  return (
    vorher.datum_kalender === neu.kalender &&
    vorher.datum_modifikator === neu.modifikator &&
    vorher.datum_praezision === neu.praezision &&
    vorher.datum_wert1 === neu.wert1 &&
    vorher.datum_wert2 === neu.wert2 &&
    vorher.datum_originaltext === neu.originaltext &&
    vorher.datum_sort_von === neu.sortVon &&
    vorher.datum_sort_bis === neu.sortBis &&
    vorher.datum_zweitkalender === neu.zweitkalender &&
    vorher.datum_zweitwert === neu.zweitwert &&
    vorher.datum_doppeljahr === neu.doppeljahr
  )
}

/** Die Datumsgruppe, die `ein` schreiben würde (`datumBeibehalten` übernimmt die gespeicherte). */
function neuesDatumVon(vorher: AussageZeile, ein: AussageAendernEin): DatumSpaltengruppe {
  return ein.datumBeibehalten === true ? gespeichertesDatum(vorher) : datumSpalten(ein.datum)
}

/** Die Vertragsfelder, deren Wert `ein` gegenüber dem gespeicherten Stand ändern würde (die
 * Datumsgruppe zählt als EIN Feld). */
export function aussageGeaenderteFelder(vorher: AussageZeile, ein: AussageAendernEin): readonly AussageAendernFeld[] {
  const felder: AussageAendernFeld[] = []
  if (vorher.wert_text !== (ein.wertText ?? null)) felder.push('wertText')
  if (vorher.wert_zahl !== (ein.wertZahl ?? null)) felder.push('wertZahl')
  if (vorher.wert_ref_id !== (ein.wertRefId ?? null)) felder.push('wertRefId')
  if (!datumUnveraendert(vorher, neuesDatumVon(vorher, ein))) felder.push('datum')
  if (vorher.konfidenz !== ein.konfidenz) felder.push('konfidenz')
  if (vorher.begruendung !== (ein.begruendung ?? null)) felder.push('begruendung')
  if (vorher.unsicherheit !== (ein.unsicherheit ?? null)) felder.push('unsicherheit')
  if (vorher.gueltig_von !== (ein.gueltigVon ?? null)) felder.push('gueltigVon')
  if (vorher.gueltig_bis !== (ein.gueltigBis ?? null)) felder.push('gueltigBis')
  return felder
}

export function aussageAendern(tx: Tx, ein: AussageAendernEin): null {
  const vorher = aussageRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  ortswertPruefen(vorher.praedikat, { wertZahl: ein.wertZahl, datum: ein.datum })

  if (aussageGeaenderteFelder(vorher, ein).length === 0) {
    return null
  }

  aussageRepo.aktualisieren(tx, {
    id: ein.id,
    wertText: ein.wertText ?? null,
    wertZahl: ein.wertZahl ?? null,
    wertRefId: ein.wertRefId ?? null,
    datum: neuesDatumVon(vorher, ein),
    konfidenz: ein.konfidenz,
    begruendung: ein.begruendung ?? null,
    unsicherheit: ein.unsicherheit ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
