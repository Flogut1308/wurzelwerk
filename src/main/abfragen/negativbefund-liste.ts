// AP-1.17 PR-A4 (docs/schema/0002_kern.sql §2.7). `abfrage:negativbefund.liste` — read-only SQL
// gegen `negativbefund` (CLAUDE.md §2: SQL nur in src/main/repositories/, src/main/abfragen/ —
// hier über `negativbefund-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
import type Database from 'better-sqlite3'
import type { NegativbefundEintrag, NegativbefundListeAus, NegativbefundListeEin } from '../../shared/schemata/negativbefund-liste'
import * as negativbefundRepo from '../repositories/negativbefund-repo'

/** `abfrage:negativbefund.liste` (fürs Profil, AP-1.17 PR-C). Liefert eine leere Liste für eine
 * Person ohne Negativbefunde — kein `NICHT_GEFUNDEN_PERSON`, weil die Abfrage rein lesend ist und
 * eine unbekannte `gesuchtePersonId` schlicht keine Treffer hat (analog `quelle-detail.ts::
 * zitateLaden`). */
export function negativbefundListe(db: Database.Database, ein: NegativbefundListeEin): NegativbefundListeAus {
  const zeilen = negativbefundRepo.negativbefundListeFuerPerson(db, ein.gesuchtePersonId)

  const eintraege: readonly NegativbefundEintrag[] = zeilen.map((zeile) => ({
    id: zeile.id,
    quelleId: zeile.quelle_id,
    gesuchtePersonId: zeile.gesuchte_person_id,
    gesuchtesPraedikat: zeile.gesuchtes_praedikat,
    zeitraumVon: zeile.zeitraum_von,
    zeitraumBis: zeile.zeitraum_bis,
    beschreibung: zeile.beschreibung,
    datumDerPruefung: zeile.datum_der_pruefung,
  }))

  return { eintraege }
}
