// AP-1.12: Handler für `aussage.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). KEIN `aussage.aendern`
// (Nutzerentscheidung, AP-1.12) — "Fakt ändern" heißt: eine neue bevorzugte Aussage anlegen UND
// die zuvor bevorzugte Aussage zum selben (subjektTyp, subjektId, praedikat) demoten. Muster
// `bevorzugungAberkennen()` aus `src/main/import/schreiben.ts`, hier UNBEDINGT (nicht wie beim
// Import an eine `ueberschreiben`-Berechtigung geknüpft) — ein direkter Nutzerbefehl trägt seine
// Berechtigung bereits in sich, anders als eine automatisierte Import-Zusammenführung.
import type { AussageAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import { bevorzugteAussagen } from '../abfragen/import-kollision'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'

/**
 * `aussage.subjekt_id` ist polymorph OHNE Fremdschlüssel (E-7, docs/schema/0002_kern.sql §2.7 —
 * SQLite kennt keinen FK, der je nach `subjekt_typ` auf eine andere Tabelle zeigt). Ohne diese
 * Prüfung ließe sich eine Aussage über eine nicht existierende Entität still anlegen (verwaiste
 * Aussage, hueter-Auflage 3 zu PR #83) — die sechs `SubjektTypEnum`-Werte decken sich 1:1 mit
 * Tabellennamen aus `JOURNALISIERT` (`person`/`ereignis`/`elternschaft`/`partnerschaft`/`ort`/
 * `name`), darum hier ein einfacher, erschöpfender `switch` statt einer generischen Tabelle.
 */
function subjektExistenzPruefen(tx: Tx, ein: Pick<AussageAnlegenEin, 'subjektTyp' | 'subjektId'>): void {
  switch (ein.subjektTyp) {
    case 'person':
      if (!datensatzExistiert(tx, 'person', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
      return
    case 'ereignis':
      if (!datensatzExistiert(tx, 'ereignis', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_EREIGNIS')
      return
    case 'elternschaft':
      if (!datensatzExistiert(tx, 'elternschaft', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_ELTERNSCHAFT')
      return
    case 'partnerschaft':
      if (!datensatzExistiert(tx, 'partnerschaft', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_PARTNERSCHAFT')
      return
    case 'ort':
      if (!datensatzExistiert(tx, 'ort', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
      return
    case 'name':
      // AP-1.33: subjekt_typ='name' verweist polymorph auf eine `name_form` (name_form.id = alte
      // name.id, 0006_namensformen.sql).
      if (!datensatzExistiert(tx, 'name_form', ein.subjektId)) throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
      return
  }
}

export function aussageAnlegen(tx: Tx, ein: AussageAnlegenEin): { readonly id: string } {
  subjektExistenzPruefen(tx, ein)

  // Konsistent zum sonstigen Muster (z. B. `elternschaft-anlegen.ts`): eine referenzierte, nicht
  // existierende `zitat`-Zeile wird VOR dem Schreiben geprüft, statt den `INSERT INTO aussage_zitat`
  // erst an `DATENBANK_FREMDSCHLUESSEL` scheitern zu lassen (generischer Code, keine Handlungsanweisung).
  ein.belege?.forEach((zitatId) => {
    if (!datensatzExistiert(tx, 'zitat', zitatId)) {
      throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
    }
  })

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
