// AP-1.17 PR-A3: Handler für `zitat.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (inklusive des `zugriffsdatum`-Blocks, analog
// `quelle-aendern.ts::gespraechsdatumUnveraendert`); stimmen ALLE Felder bereits mit `ein` überein,
// bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer `geaendert_am`-Zeitstempel) —
// der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { ZitatAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as belegRepo from '../repositories/beleg-repo'
import type { ZitatZeile } from '../repositories/beleg-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'

function zugriffsdatumUnveraendert(vorher: ZitatZeile, neu: DatumSpaltengruppe): boolean {
  return (
    vorher.zugriffsdatum_kalender === neu.kalender &&
    vorher.zugriffsdatum_modifikator === neu.modifikator &&
    vorher.zugriffsdatum_praezision === neu.praezision &&
    vorher.zugriffsdatum_wert1 === neu.wert1 &&
    vorher.zugriffsdatum_wert2 === neu.wert2 &&
    vorher.zugriffsdatum_originaltext === neu.originaltext &&
    vorher.zugriffsdatum_sort_von === neu.sortVon &&
    vorher.zugriffsdatum_sort_bis === neu.sortBis &&
    vorher.zugriffsdatum_zweitkalender === neu.zweitkalender &&
    vorher.zugriffsdatum_zweitwert === neu.zweitwert &&
    vorher.zugriffsdatum_doppeljahr === neu.doppeljahr
  )
}

function unveraendert(vorher: ZitatZeile, ein: ZitatAendernEin, neuesZugriffsdatum: DatumSpaltengruppe): boolean {
  return (
    vorher.quelle_id === ein.quelleId &&
    vorher.seite === (ein.seite ?? null) &&
    vorher.eintragsnummer === (ein.eintragsnummer ?? null) &&
    vorher.band === (ein.band ?? null) &&
    vorher.jahr === (ein.jahr ?? null) &&
    zugriffsdatumUnveraendert(vorher, neuesZugriffsdatum) &&
    vorher.zeitmarke_sekunden === (ein.zeitmarkeSekunden ?? null) &&
    vorher.digitalisat_url === (ein.digitalisatUrl ?? null) &&
    vorher.transkript === (ein.transkript ?? null) &&
    vorher.uebersetzung === (ein.uebersetzung ?? null) &&
    vorher.konfidenz === (ein.konfidenz ?? null) &&
    vorher.medium_id === (ein.mediumId ?? null)
  )
}

export function zitatAendern(tx: Tx, ein: ZitatAendernEin): null {
  const vorher = belegRepo.zitatLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
  }
  if (!datensatzExistiert(tx, 'quelle', ein.quelleId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }

  const neuesZugriffsdatum = datumSpalten(ein.zugriffsdatum)
  if (unveraendert(vorher, ein, neuesZugriffsdatum)) {
    return null
  }

  belegRepo.zitatAktualisieren(tx, {
    id: ein.id,
    quelleId: ein.quelleId,
    seite: ein.seite ?? null,
    eintragsnummer: ein.eintragsnummer ?? null,
    band: ein.band ?? null,
    jahr: ein.jahr ?? null,
    zugriffsdatum: neuesZugriffsdatum,
    zeitmarkeSekunden: ein.zeitmarkeSekunden ?? null,
    digitalisatUrl: ein.digitalisatUrl ?? null,
    transkript: ein.transkript ?? null,
    uebersetzung: ein.uebersetzung ?? null,
    konfidenz: ein.konfidenz ?? null,
    mediumId: ein.mediumId ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
