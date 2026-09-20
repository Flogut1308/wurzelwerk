// AP-1.12: Handler für `aussage.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). KEIN `aussage.aendern`
// (Nutzerentscheidung, AP-1.12) — "Fakt ändern" heißt: eine neue bevorzugte Aussage anlegen UND
// die zuvor bevorzugte Aussage zum selben (subjektTyp, subjektId, praedikat) demoten. Muster
// `bevorzugungAberkennen()` aus `src/main/import/schreiben.ts`, hier UNBEDINGT (nicht wie beim
// Import an eine `ueberschreiben`-Berechtigung geknüpft) — ein direkter Nutzerbefehl trägt seine
// Berechtigung bereits in sich, anders als eine automatisierte Import-Zusammenführung.
import type { AussageAnlegenEin } from '../../shared/schemata/befehle'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import { bevorzugteAussagen } from '../abfragen/import-kollision'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'

export function aussageAnlegen(tx: Tx, ein: AussageAnlegenEin): { readonly id: string } {
  const id = neueId()
  const jetzt = Date.now()

  if (ein.istBevorzugt === 1) {
    // Alle bisher bevorzugten Aussagen zu (subjektTyp, subjektId, praedikat) demoten — es gibt kein
    // Schema-`UNIQUE`, das "höchstens eine" erzwingt (s. Kommentar bei `bevorzugteAussagen()`), ein
    // unbedingtes Demoten ALLER Treffer ist darum strikt sicherer als ein Abbruch bei mehr als
    // einem Treffer (anders als die Leitentscheidung in `src/main/import/schreiben.ts` für den
    // Import-Pfad, der bei Uneindeutigkeit bewusst stoppt statt zu raten).
    const bisherBevorzugt = bevorzugteAussagen(tx, ein.subjektTyp, ein.subjektId, ein.praedikat)
    bisherBevorzugt.forEach((alte) => aussageRepo.bevorzugungAberkennen(tx, alte.id))
  }

  aussageRepo.einfuegen(tx, {
    id,
    subjektTyp: ein.subjektTyp,
    subjektId: ein.subjektId,
    praedikat: ein.praedikat,
    wertText: ein.wertText ?? null,
    wertZahl: ein.wertZahl ?? null,
    wertRefId: ein.wertRefId ?? null,
    datum: datumSpalten(ein.datum),
    konfidenz: ein.konfidenz,
    istBevorzugt: ein.istBevorzugt ?? null,
    begruendung: ein.begruendung ?? null,
    unsicherheit: ein.unsicherheit ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  ein.belege?.forEach((zitatId) => {
    aussageRepo.zitatVerknuepfen(tx, { aussageId: id, zitatId, erstelltAm: jetzt, geaendertAm: jetzt })
  })

  return { id }
}
