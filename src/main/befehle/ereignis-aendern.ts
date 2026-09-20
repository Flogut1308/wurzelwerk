// AP-1.12: Handler für `ereignis.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (Zeile selbst — die Beteiligungen ändert
// dieser Befehl nicht, s. Vertragskommentar); bei Gleichheit ein No-op.
import type { EreignisAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ereignisRepo from '../repositories/ereignis-repo'
import type { EreignisZeile } from '../repositories/ereignis-repo'
import { datumSpalten, type DatumSpaltengruppe } from '../import/datum-spalten'

function datumUnveraendert(vorher: EreignisZeile, neu: DatumSpaltengruppe): boolean {
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

export function ereignisAendern(tx: Tx, ein: EreignisAendernEin): null {
  if (ein.ortId !== undefined && !datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }

  const vorher = ereignisRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_EREIGNIS')
  }

  const neuesDatum = datumSpalten(ein.datum)
  const neuerOrtId = ein.ortId ?? null
  const neueBeschreibung = ein.beschreibung ?? null
  const neueNotiz = ein.notiz ?? null

  if (
    vorher.typ === ein.typ &&
    vorher.ort_id === neuerOrtId &&
    datumUnveraendert(vorher, neuesDatum) &&
    vorher.beschreibung === neueBeschreibung &&
    vorher.notiz === neueNotiz
  ) {
    return null
  }

  ereignisRepo.aktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    ortId: neuerOrtId,
    datum: neuesDatum,
    beschreibung: neueBeschreibung,
    notiz: neueNotiz,
    geaendertAm: Date.now(),
  })
  return null
}
