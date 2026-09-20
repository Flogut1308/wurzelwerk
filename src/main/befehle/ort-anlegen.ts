// AP-1.13 PR-C (docs/71_Designsystem.md §3.2): Handler für `ort.anlegen` — legt EINEN
// `ort`-Stammsatz + EINEN primären (bevorzugten) `ortsname` an. Läuft in der vom Befehlsbus
// bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier), kein
// Journalcode nötig (die `jrn_ort_a{i,u,d}`/`jrn_ortsname_a{i,u,d}`-Trigger schreiben die
// `aenderung`-Zeilen automatisch, solange das Journal armiert ist, s. `person-repo.ts`-Kopf).
//
// SCOPE (CLAUDE.md §10, nicht vorgreifen): minimale Ortsverwaltung fürs `Ortsfeld` — EIN Ort, EIN
// Name, kein `typ`-Zwang, KEINE Zugehörigkeitskette. Die volle Ortsverwaltung (mehrere
// zeitabhängige Namen pflegen, politisch/kirchlich getrennte `ortszugehoerigkeit`-Ketten
// anlegen/bearbeiten) bleibt AP-1.16 (docs/80_Offene_Fragen.md) — ebenso KEINE Existenz-Aussage
// (analog `name-anlegen.ts`: ein Ort selbst ist kein belegbares Fachprädikat wie Geburtsdatum
// o. Ä., sondern ein Stammdatensatz).
import type { OrtAnlegenEin } from '../../shared/schemata/befehle'
import type { Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'
import { neueId } from '../id'

export function ortAnlegen(tx: Tx, ein: OrtAnlegenEin): { readonly id: string } {
  const id = neueId()
  const jetzt = Date.now()

  ortRepo.einfuegen(tx, {
    id,
    typ: ein.typ ?? null,
    koordinatenLat: null,
    koordinatenLon: null,
    existiertVon: null,
    existiertBis: null,
    notiz: ein.notiz ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  ortRepo.ortsnameEinfuegen(tx, {
    id: neueId(),
    ortId: id,
    name: ein.name,
    sprache: null,
    gueltigVon: null,
    gueltigBis: null,
    istBevorzugt: 1,
    originalText: null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  return { id }
}
