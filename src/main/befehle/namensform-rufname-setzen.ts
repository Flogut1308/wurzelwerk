// AP-1.30 PR 10-3 (A-02, A-19; docs/80 §33 V-130-10-3): Handler für `namensform.rufnameSetzen` — markiert
// EINEN Vorname-Teil einer Namensform als Rufname (`name_part.ist_rufname`) oder entfernt die Markierung
// (`namensteilId: null`). Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion
// (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Kein Koaleszenzschlüssel: ein Aufruf = ein Undo-Schritt.
//
// Der partielle UNIQUE-Index `idx_name_part_ein_rufname` (höchstens ein Rufname je Form, 0006) wird sofort
// geprüft. Darum ERST die alte Markierung entfernen, DANN die neue setzen — so sieht der Index nie zwei.
// Das Journal spielt Undo rückwärts (neue Markierung weg, dann alte zurück) und Redo vorwärts: beide Folgen
// halten den Index ebenfalls. Stelle (`sortier_index`), Wert und Art der Teile bleiben unberührt. Adressiert
// wird der Teil über seine ID, nicht über seinen Wert — bei gleichlautenden Vornamen („Maria Anna Maria“)
// ist so eindeutig, welche „Maria“ gemeint ist.
//
// Nur Vornamen tragen einen Rufnamen (CHECK in 0006, hier vorher als `VALIDIERUNG_RUFNAME_KEIN_VORNAME`
// gemeldet). Ein Teil einer anderen Form gilt als nicht gefunden (`NICHT_GEFUNDEN_NAMENSTEIL`). No-op nach
// AP-0.22, wenn die gewünschte Markierung schon so steht.
//
// E3: `montiereOriginalText` kennt die Markierung nicht (alle Vornamen in Reihenfolge), aber
// `istMontierterOriginalText` erkennt zusätzlich die Montage OHNE einen am Ende angehängten Rufnamen
// (`zerlegeName` Regel 3). War der Text genau diese Fassung, wird er über `mitOriginalTextNachfuehrung` auf
// die volle Montage der Teile gebracht — sonst hielte ihn nach dem Wechsel niemand mehr für automatisch, und
// er bliebe als vermeintlich wortgetreue Schreibung stehen. In allen anderen Fällen ändert sich der Text nicht.
import type { NamensformRufnameSetzenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import type { NamePartZeile } from '../repositories/name-part-repo'
import { mitOriginalTextNachfuehrung } from './namensteil-hilfen'

function markierungSetzen(tx: Tx, teil: NamePartZeile, istRufname: 0 | 1, jetzt: number): void {
  namePartRepo.aktualisieren(tx, {
    id: teil.id,
    art: teil.art,
    wert: teil.wert,
    istRufname,
    sortierIndex: teil.sortier_index,
    feminineVariante: teil.feminine_variante,
    geaendertAm: jetzt,
  })
}

export function namensformRufnameSetzen(tx: Tx, ein: NamensformRufnameSetzenEin): null {
  const form = nameFormRepo.lesen(tx, ein.namensformId)
  if (form === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  let neu: NamePartZeile | undefined
  if (ein.namensteilId !== null) {
    neu = namePartRepo.lesen(tx, ein.namensteilId)
    if (neu === undefined || neu.name_form_id !== form.id) {
      throw new WurzelFehler('NICHT_GEFUNDEN_NAMENSTEIL')
    }
    if (neu.art !== 'vorname') {
      throw new WurzelFehler('VALIDIERUNG_RUFNAME_KEIN_VORNAME')
    }
  }
  const alt = namePartRepo.teileDerArt(tx, form.id, 'vorname').find((teil) => teil.ist_rufname === 1)
  if (alt?.id === neu?.id) {
    return null
  }
  const jetzt = Date.now()
  mitOriginalTextNachfuehrung(tx, form, jetzt, () => {
    if (alt !== undefined) markierungSetzen(tx, alt, 0, jetzt)
    if (neu !== undefined) markierungSetzen(tx, neu, 1, jetzt)
  })
  return null
}
