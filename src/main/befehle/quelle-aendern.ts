// AP-1.17 PR-A2: Handler für `quelle.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (inklusive des „mündlich"-Datumsblocks,
// analog `ereignis-aendern.ts::datumUnveraendert`); stimmen ALLE Felder bereits mit `ein`
// überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer
// `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { QuelleAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as belegRepo from '../repositories/beleg-repo'
import type { QuelleZeile } from '../repositories/beleg-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'

function gespraechsdatumUnveraendert(vorher: QuelleZeile, neu: DatumSpaltengruppe): boolean {
  return (
    vorher.gespraechsdatum_kalender === neu.kalender &&
    vorher.gespraechsdatum_modifikator === neu.modifikator &&
    vorher.gespraechsdatum_praezision === neu.praezision &&
    vorher.gespraechsdatum_wert1 === neu.wert1 &&
    vorher.gespraechsdatum_wert2 === neu.wert2 &&
    vorher.gespraechsdatum_originaltext === neu.originaltext &&
    vorher.gespraechsdatum_sort_von === neu.sortVon &&
    vorher.gespraechsdatum_sort_bis === neu.sortBis &&
    vorher.gespraechsdatum_zweitkalender === neu.zweitkalender &&
    vorher.gespraechsdatum_zweitwert === neu.zweitwert &&
    vorher.gespraechsdatum_doppeljahr === neu.doppeljahr
  )
}

function unveraendert(vorher: QuelleZeile, ein: QuelleAendernEin, neuesGespraechsdatum: DatumSpaltengruppe): boolean {
  return (
    vorher.typ === ein.typ &&
    vorher.titel === (ein.titel ?? null) &&
    vorher.autor === (ein.autor ?? null) &&
    vorher.verlag === (ein.verlag ?? null) &&
    vorher.jahr === (ein.jahr ?? null) &&
    vorher.art === (ein.art ?? null) &&
    vorher.informationsart === (ein.informationsart ?? null) &&
    vorher.archiv_id === (ein.archivId ?? null) &&
    vorher.signatur === (ein.signatur ?? null) &&
    vorher.notiz === (ein.notiz ?? null) &&
    vorher.informant_person_id === (ein.informantPersonId ?? null) &&
    gespraechsdatumUnveraendert(vorher, neuesGespraechsdatum) &&
    vorher.form === (ein.form ?? null) &&
    vorher.unmittelbarkeit === (ein.unmittelbarkeit ?? null) &&
    vorher.audio_medium_id === (ein.audioMediumId ?? null)
  )
}

export function quelleAendern(tx: Tx, ein: QuelleAendernEin): null {
  const vorher = belegRepo.quelleLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }
  if (ein.archivId !== undefined && !datensatzExistiert(tx, 'archiv', ein.archivId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ARCHIV')
  }

  const neuesGespraechsdatum = datumSpalten(ein.gespraechsdatum)
  if (unveraendert(vorher, ein, neuesGespraechsdatum)) {
    return null
  }

  belegRepo.quelleAktualisieren(tx, {
    id: ein.id,
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
    gespraechsdatum: neuesGespraechsdatum,
    form: ein.form ?? null,
    unmittelbarkeit: ein.unmittelbarkeit ?? null,
    audioMediumId: ein.audioMediumId ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
