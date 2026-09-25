// AP-1.29 PR-A: Handler für `aussage.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (nur die editierbaren Spalten — `subjekt_typ`/
// `subjekt_id`/`praedikat`/`ist_bevorzugt` ändert dieser Befehl bewusst NICHT, s. Vertragskommentar
// `src/shared/schemata/befehle.ts`); bei Gleichheit ein No-op.
// Vorarbeiten AP-1.30 Teil 3, PR 4b (E5, docs/80 §32 V-E5-erhalt): `datumBeibehalten` übernimmt die
// gespeicherte Datumsgruppe unverändert — auch an Orts-Prädikaten, deren Altbestand noch ein Datum
// trägt. Die Orts-Prüfung sieht dann keinen NEUEN Datumswert; ein Datum neu setzen bleibt verboten.
import type { AussageAendernEin } from '../../shared/schemata/befehle'
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

export function aussageAendern(tx: Tx, ein: AussageAendernEin): null {
  const vorher = aussageRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  ortswertPruefen(vorher.praedikat, { wertZahl: ein.wertZahl, datum: ein.datum })

  const neuesDatum = ein.datumBeibehalten === true ? gespeichertesDatum(vorher) : datumSpalten(ein.datum)
  const neuerWertText = ein.wertText ?? null
  const neuerWertZahl = ein.wertZahl ?? null
  const neuerWertRefId = ein.wertRefId ?? null
  const neueBegruendung = ein.begruendung ?? null
  const neueUnsicherheit = ein.unsicherheit ?? null
  const neuerGueltigVon = ein.gueltigVon ?? null
  const neuerGueltigBis = ein.gueltigBis ?? null

  if (
    vorher.wert_text === neuerWertText &&
    vorher.wert_zahl === neuerWertZahl &&
    vorher.wert_ref_id === neuerWertRefId &&
    datumUnveraendert(vorher, neuesDatum) &&
    vorher.konfidenz === ein.konfidenz &&
    vorher.begruendung === neueBegruendung &&
    vorher.unsicherheit === neueUnsicherheit &&
    vorher.gueltig_von === neuerGueltigVon &&
    vorher.gueltig_bis === neuerGueltigBis
  ) {
    return null
  }

  aussageRepo.aktualisieren(tx, {
    id: ein.id,
    wertText: neuerWertText,
    wertZahl: neuerWertZahl,
    wertRefId: neuerWertRefId,
    datum: neuesDatum,
    konfidenz: ein.konfidenz,
    begruendung: neueBegruendung,
    unsicherheit: neueUnsicherheit,
    gueltigVon: neuerGueltigVon,
    gueltigBis: neuerGueltigBis,
    geaendertAm: Date.now(),
  })
  return null
}
