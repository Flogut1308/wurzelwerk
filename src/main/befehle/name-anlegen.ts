// AP-1.12: Handler für `name.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Schreibt bewusst KEINE
// Existenz-Aussage (ADR-026) — der Import-Orchestrator (`src/main/import/schreiben.ts`) ruft
// `merkeExistenzAussage()` für `name` ebenfalls nicht auf.
import type { NameAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as nameRepo from '../repositories/name-repo'
import * as nameFormRepo from '../repositories/name-form-repo'
import { neueId } from '../id'

export function nameAnlegen(tx: Tx, ein: NameAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'person', ein.personId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  // Konsistent zum sonstigen Muster (z. B. `elternschaft-anlegen.ts`): eine referenzierte, nicht
  // existierende `name`-Zeile (Selbstverweis `umschrift_von`, docs/schema/0002_kern.sql §2.1) wird
  // VOR dem Schreiben geprüft, statt den `INSERT` erst an `DATENBANK_FREMDSCHLUESSEL` scheitern zu
  // lassen (generischer Code, keine Handlungsanweisung).
  // AP-1.33: `umschrift_von` referenziert jetzt eine `name_form` (0006_namensformen.sql), nicht mehr
  // die flache `name`-Zeile.
  if (ein.umschriftVon !== undefined && !datensatzExistiert(tx, 'name_form', ein.umschriftVon)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }

  const id = neueId()
  const jetzt = Date.now()
  // „Genau ein Hauptname je Person" (0006): die ERSTE Form einer Person wird bevorzugt; jede weitere
  // ist per Vorgabe nicht bevorzugt. Ein explizit gewünschtes `istBevorzugt` wird nur akzeptiert,
  // wenn es keine bevorzugte Form verdrängen würde (der Wechsel läuft sonst über `hauptname.wechseln`).
  const hatFormen = nameFormRepo.anzahlFormen(tx, ein.personId) > 0
  const istBevorzugt: 0 | 1 = hatFormen ? (ein.istBevorzugt === 1 && !hatBevorzugte(tx, ein.personId) ? 1 : 0) : 1
  nameRepo.einfuegen(
    tx,
    {
      id,
      personId: ein.personId,
      typ: ein.typ,
      schrift: ein.schrift ?? null,
      umschriftVon: ein.umschriftVon ?? null,
      umschriftNorm: ein.umschriftNorm ?? null,
      vornamen: ein.vornamen ?? null,
      rufnameIndex: ein.rufnameIndex ?? null,
      rufnameText: ein.rufnameText ?? null,
      nachname: ein.nachname ?? null,
      praefix: ein.praefix ?? null,
      titelVor: ein.titelVor ?? null,
      zusatzNach: ein.zusatzNach ?? null,
      vatersname: null,
      originalText: ein.originalText ?? null,
      sprache: ein.sprache ?? null,
      istBevorzugt,
      gueltigVon: ein.gueltigVon ?? null,
      gueltigBis: ein.gueltigBis ?? null,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    },
    neueId,
  )
  return { id }
}

/** `true`, wenn die Person bereits eine bevorzugte Form hat. */
function hatBevorzugte(tx: Tx, personId: string): boolean {
  return nameFormRepo.formenFuerPerson(tx, personId).some((form) => form.ist_bevorzugt === 1)
}
