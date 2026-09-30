// AP-1.30 PR 10-1 (A-02, A-19; docs/80 §33 V-130-10-1): Handler für `namensform.anlegen` — legt den
// KOPF einer Namensform (`name_form`, docs/schema/0006_namensformen.sql) OHNE Bestandteile an. Läuft in
// der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT`
// hier). Schreibt wie `name.anlegen` KEINE Existenz-Aussage (ADR-026).
//
// Abgeleitete Tabellen: `person_flach`/`suche_fts` pflegen die `abl_*`-Trigger auf `name_form`; eine
// Form ohne Teile hat keinen Nachnamens-Teil und darum keine `name_phonetik`-Zeile. Der Neuaufbau-
// Vergleich steht in test/einheit/befehl-namensform.test.ts.
import type { NamensformAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import { neueId } from '../id'

/**
 * Prüft den Umschrift-Bezug einer Form `formId` (bei `namensform.anlegen` die künftige ID) der Person
 * `personId` auf die Ursprungsform `umschriftVon`:
 * - die Ursprungsform existiert (sonst `NICHT_GEFUNDEN_NAME`, wie `name.anlegen` — vor dem Schreiben,
 *   statt erst am Fremdschlüssel zu scheitern);
 * - sie gehört DERSELBEN Person (eine Umschrift gibt einen Namen dieser Person in anderer Schrift
 *   wieder, A-19) und die Kette der Ursprungsformen führt nicht auf `formId` zurück (keine Form ist
 *   ihre eigene Umschrift, auch nicht über Zwischenformen) — sonst `VALIDIERUNG_UMSCHRIFT_BEZUG`.
 */
export function umschriftBezugPruefen(tx: Tx, personId: string, formId: string, umschriftVon: string): void {
  const ursprung = nameFormRepo.lesen(tx, umschriftVon)
  if (ursprung === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  if (ursprung.person_id !== personId) {
    throw new WurzelFehler('VALIDIERUNG_UMSCHRIFT_BEZUG', 'Ursprungsform gehört zu einer anderen Person.')
  }
  const besucht = new Set<string>()
  let aktuell: string | null = umschriftVon
  while (aktuell !== null && !besucht.has(aktuell)) {
    if (aktuell === formId) {
      throw new WurzelFehler('VALIDIERUNG_UMSCHRIFT_BEZUG', 'Die Kette der Ursprungsformen führt auf die Form selbst zurück.')
    }
    besucht.add(aktuell)
    aktuell = nameFormRepo.lesen(tx, aktuell)?.umschrift_von ?? null
  }
}

export function namensformAnlegen(tx: Tx, ein: NamensformAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'person', ein.personId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  const id = neueId()
  if (ein.umschriftVon !== undefined) {
    umschriftBezugPruefen(tx, ein.personId, id, ein.umschriftVon)
  }
  const jetzt = Date.now()
  // „Genau ein Hauptname je Person" (0006): die ERSTE Form einer Person wird bevorzugt, jede weitere
  // nicht (wie `name.anlegen`). Umgestellt wird über `hauptname.wechseln` (E5).
  const istBevorzugt: 0 | 1 = nameFormRepo.anzahlFormen(tx, ein.personId) === 0 ? 1 : 0
  nameFormRepo.einfuegen(tx, {
    id,
    personId: ein.personId,
    sprache: ein.sprache ?? null,
    schrift: ein.schrift ?? null,
    reihenfolge: ein.reihenfolge ?? null,
    rolle: ein.rolle,
    rollenNotiz: ein.rollenNotiz ?? null,
    istBevorzugt,
    umschriftVon: ein.umschriftVon ?? null,
    umschriftNorm: ein.umschriftNorm ?? null,
    konfidenz: ein.konfidenz ?? null,
    sortierIndex: null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    originalText: ein.originalText ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return { id }
}
