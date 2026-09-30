// AP-1.30 PR 10-3 (A-02, A-19; docs/80 §33 V-130-10-3): Handler für `namensteil.verschieben` — bewegt EINEN
// Bestandteil (`name_part`) an eine andere Stelle unter den Teilen DERSELBEN (Form, Art). Läuft in der vom
// Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// Kein Koaleszenzschlüssel: jedes Verschieben ist ein eigener Undo-Schritt.
//
// Stellen: die bisherigen `sortier_index`-Werte der Art (aufsteigend, „Slots") bleiben dieselben, nur ihre
// Belegung ändert sich — der Teil auf Rang k nach dem Verschieben bekommt den k-ten Slot. Teile außerhalb
// des Bereichs zwischen alter und neuer Stelle bleiben unberührt; eine Lücke aus Altbestand bleibt erhalten.
//
// E1 (U-130-10-sortierindex-constraint): der bewegte Teil wandert an den Teilen dazwischen VORBEI — anders
// als beim Einfügen/Löschen (PR 10-2) gibt es keine Reihenfolge der Einzelschritte, in der jede Zielstelle
// ohne Zwischenablage frei wäre. Darum ein Parkwert:
//   1. der bewegte Teil geht auf PARK = MAX(sortier_index der Art) + 1 — garantiert frei, und nicht
//      negativ (ein künftiges CHECK `sortier_index >= 0`, hueter #193 H3 / 10b, bleibt möglich);
//   2. die Teile dazwischen rücken EINZELN in Laufrichtung des frei gewordenen Slots um einen Slot nach
//      (nach hinten verschoben: von vorn nach hinten je einen Slot nach vorn; nach vorn verschoben: von
//      hinten nach vorn je einen Slot nach hinten) — jede Zielstelle hat der Vorgänger in der Schleife bzw.
//      der geparkte Teil gerade geräumt;
//   3. der bewegte Teil geht vom Parkplatz auf den Zielslot, den der letzte Nachrücker geräumt hat.
// Undo spielt das Journal rückwärts: der bewegte Teil vom Zielslot zurück auf PARK (frei — dort stand nur er),
// die Nachrücker in umgekehrter Reihenfolge je auf ihren alten Slot (den jeweils der Teil davor gerade
// geräumt hat, der erste den Zielslot), zuletzt der bewegte Teil auf seinen alten Slot (vom letzten
// Nachrücker geräumt). Redo spielt die Folge vorwärts wie der Befehl. Alle drei Folgen sind doppelfrei.
// Keine Koaleszenz — eine Verdichtung (zwei UPDATEs am bewegten Teil zu einem) würde das Parken aufheben.
//
// E3: ein montierter `original_text` folgt der neuen Reihenfolge, ein wortgetreuer bleibt
// (`mitOriginalTextNachfuehrung`). Die Rufname-Markierung wandert mit dem Teil (sie hängt an der Zeile).
import type { NamensteilVerschiebenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import type { NamePartZeile } from '../repositories/name-part-repo'
import { mitOriginalTextNachfuehrung } from './namensteil-hilfen'

/** Liest ein Element, das per Konstruktion existiert (Index innerhalb der Liste); sonst interner Fehler. */
function an<T>(liste: readonly T[], index: number): T {
  const element = liste[index]
  if (element === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `namensteil.verschieben: Index ${String(index)} außerhalb der Teile.`)
  }
  return element
}

export function namensteilVerschieben(tx: Tx, ein: NamensteilVerschiebenEin): null {
  const teil = namePartRepo.lesen(tx, ein.id)
  if (teil === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAMENSTEIL')
  }
  const vorhanden: readonly NamePartZeile[] = namePartRepo.teileDerArt(tx, teil.name_form_id, teil.art)
  if (ein.position >= vorhanden.length) {
    throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', 'namensteil.verschieben: position liegt hinter dem letzten Teil dieser Art.')
  }
  const alt = vorhanden.findIndex((kandidat) => kandidat.id === teil.id)
  if (alt < 0) {
    // Unerreichbar: `teileDerArt` liest dieselbe Form und Art, aus der der Teil gerade gelesen wurde.
    throw new WurzelFehler('INTERN_UNERWARTET', 'namensteil.verschieben: Teil fehlt unter den Teilen seiner Art.')
  }
  const neu = ein.position
  if (neu === alt) {
    return null
  }
  const form = nameFormRepo.lesen(tx, teil.name_form_id)
  if (form === undefined) {
    // Unerreichbar: `name_part.name_form_id` ist ein Fremdschlüssel mit ON DELETE CASCADE (0006).
    throw new WurzelFehler('INTERN_UNERWARTET', 'namensteil.verschieben: Namensteil ohne Namensform.')
  }
  const slots = vorhanden.map((kandidat) => kandidat.sortier_index)
  const park = an(slots, slots.length - 1) + 1
  const jetzt = Date.now()
  const setze = (id: string, sortierIndex: number): void => {
    namePartRepo.sortierIndexSetzen(tx, { id, sortierIndex, geaendertAm: jetzt })
  }
  mitOriginalTextNachfuehrung(tx, form, jetzt, () => {
    setze(teil.id, park)
    if (alt < neu) {
      for (let rang = alt + 1; rang <= neu; rang += 1) setze(an(vorhanden, rang).id, an(slots, rang - 1))
    } else {
      for (let rang = alt - 1; rang >= neu; rang -= 1) setze(an(vorhanden, rang).id, an(slots, rang + 1))
    }
    setze(teil.id, an(slots, neu))
  })
  return null
}
