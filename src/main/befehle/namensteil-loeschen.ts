// AP-1.30 PR 10-2 (A-02, A-19; docs/80 §33 V-130-10-2): Handler für `namensteil.loeschen` — entfernt
// EINEN Bestandteil (`name_part`) und nummeriert die übrigen Teile derselben (Form, Art) lückenlos nach.
// Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein
// `BEGIN`/`COMMIT` hier). Kein Koaleszenzschlüssel: jedes Löschen ist ein eigener Undo-Schritt.
//
// Rufname: die Markierung hängt an der Zeile (`ist_rufname`); mit dem Teil entfällt sie, kein anderer
// Teil wird markiert. Der letzte Teil einer Form darf gelöscht werden, die Form bleibt (E8).
//
// E1 (U-130-10-sortierindex-constraint): erst DELETE, dann rücken die übrigen Teile EINZELN und VON VORN
// NACH HINTEN auf ihren Rang (0, 1, 2 …). Jede Zielstelle ist beim Schreiben frei: der Rang eines Teils
// ist nie größer als seine bisherige Stelle, die Teile davor stehen schon auf kleineren Rängen, die
// dahinter auf größeren bisherigen Stellen — so entsteht in keinem Zwischenzustand ein Doppel. Das
// Journal spielt die Schritte beim Undo rückwärts (von hinten nach vorn zurück, dann das Wiedereinfügen
// auf die frei gewordene Stelle) und beim Redo vorwärts — beide Folgen sind ebenfalls doppelfrei.
// Lückenlos heißt: auch eine Lücke aus Altbestand wird dabei geschlossen; geschrieben wird nur, wo sich
// die Stelle ändert.
//
// E3: ein montierter `original_text` folgt den Teilen, ein wortgetreuer bleibt (`mitOriginalTextNachfuehrung`).
import type { NamensteilLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import { mitOriginalTextNachfuehrung } from './namensteil-hilfen'

export function namensteilLoeschen(tx: Tx, ein: NamensteilLoeschenEin): null {
  const teil = namePartRepo.lesen(tx, ein.id)
  if (teil === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAMENSTEIL')
  }
  const form = nameFormRepo.lesen(tx, teil.name_form_id)
  if (form === undefined) {
    // Unerreichbar: `name_part.name_form_id` ist ein Fremdschlüssel mit ON DELETE CASCADE (0006).
    throw new WurzelFehler('INTERN_UNERWARTET', 'namensteil.loeschen: Namensteil ohne Namensform.')
  }
  const jetzt = Date.now()
  mitOriginalTextNachfuehrung(tx, form, jetzt, () => {
    namePartRepo.loeschen(tx, teil.id)
    namePartRepo.teileDerArt(tx, form.id, teil.art).forEach((rest, rang) => {
      if (rest.sortier_index !== rang) {
        namePartRepo.sortierIndexSetzen(tx, { id: rest.id, sortierIndex: rang, geaendertAm: jetzt })
      }
    })
  })
  return null
}
