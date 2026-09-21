// AP-1.17 PR-A4: Handler für `negativbefund.aendern`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich (analog `zitat-aendern.ts`); stimmen ALLE
// Felder bereits mit `ein` überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein
// neuer `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion
// vollständig.
import type { NegativbefundAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as negativbefundRepo from '../repositories/negativbefund-repo'
import type { NegativbefundZeile } from '../repositories/negativbefund-repo'

function unveraendert(vorher: NegativbefundZeile, ein: NegativbefundAendernEin): boolean {
  return (
    vorher.gesuchte_person_id === ein.gesuchtePersonId &&
    vorher.quelle_id === (ein.quelleId ?? null) &&
    vorher.gesuchtes_praedikat === (ein.gesuchtesPraedikat ?? null) &&
    vorher.zeitraum_von === (ein.zeitraumVon ?? null) &&
    vorher.zeitraum_bis === (ein.zeitraumBis ?? null) &&
    vorher.beschreibung === (ein.beschreibung ?? null) &&
    vorher.datum_der_pruefung === (ein.datumDerPruefung ?? null)
  )
}

export function negativbefundAendern(tx: Tx, ein: NegativbefundAendernEin): null {
  const vorher = negativbefundRepo.negativbefundLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NEGATIVBEFUND')
  }
  if (!datensatzExistiert(tx, 'person', ein.gesuchtePersonId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  if (ein.quelleId !== undefined && !datensatzExistiert(tx, 'quelle', ein.quelleId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }

  if (unveraendert(vorher, ein)) {
    return null
  }

  negativbefundRepo.negativbefundAktualisieren(tx, {
    id: ein.id,
    quelleId: ein.quelleId ?? null,
    gesuchtePersonId: ein.gesuchtePersonId,
    gesuchtesPraedikat: ein.gesuchtesPraedikat ?? null,
    zeitraumVon: ein.zeitraumVon ?? null,
    zeitraumBis: ein.zeitraumBis ?? null,
    beschreibung: ein.beschreibung ?? null,
    datumDerPruefung: ein.datumDerPruefung ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
