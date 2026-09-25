// AP-1.29 PR-A: Handler für `aussage.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (nur die editierbaren Spalten — `subjekt_typ`/
// `subjekt_id`/`praedikat`/`ist_bevorzugt` ändert dieser Befehl bewusst NICHT, s. Vertragskommentar
// `src/shared/schemata/befehle.ts`); bei Gleichheit ein No-op.
import type { AussageAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import type { AussageZeile } from '../repositories/aussage-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'
import { ortswertPruefen } from './aussage-anlegen'

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
  ortswertPruefen(vorher.praedikat, ein.wertZahl)

  const neuesDatum = datumSpalten(ein.datum)
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
