// AP-1.6 Stufe 3 (C-16): reine Umschaltlogik für die sortierbaren Kopfzellen der `Datentabelle`
// (docs/71_Designsystem.md §2.3, S-05: „Sortierung über Suchnormalform"). Klick auf dieselbe Spalte
// dreht die Richtung um, Klick auf eine andere Spalte setzt sie auf `auf` zurück — dasselbe
// Verhalten, das jede gängige Tabellenkopfzeile zeigt, hier als geprüfte reine Funktion statt als
// Klick-Handler-Inline-Logik.
import type { z } from 'zod'
import type { PersonListeRichtungEnum, PersonListeSortierungEnum } from '../../shared/schemata/person-liste'

export type PersonListeSortierungWert = z.infer<typeof PersonListeSortierungEnum>
export type PersonListeRichtungWert = z.infer<typeof PersonListeRichtungEnum>

export interface Sortierzustand {
  readonly sortierung: PersonListeSortierungWert
  readonly richtung: PersonListeRichtungWert
}

/** Ergibt den nächsten Sortierzustand nach einem Klick auf die Kopfzelle `geklickt`. */
export function sortierungUmschalten(aktuell: Sortierzustand, geklickt: PersonListeSortierungWert): Sortierzustand {
  if (aktuell.sortierung === geklickt) {
    return { sortierung: geklickt, richtung: aktuell.richtung === 'auf' ? 'ab' : 'auf' }
  }
  return { sortierung: geklickt, richtung: 'auf' }
}

/** `aria-sort` für eine Kopfzelle: nur die aktive Sortierspalte trägt `ascending`/`descending`. */
export function ariaSortWert(aktuell: Sortierzustand, spalte: PersonListeSortierungWert): 'ascending' | 'descending' | 'none' {
  if (aktuell.sortierung !== spalte) return 'none'
  return aktuell.richtung === 'auf' ? 'ascending' : 'descending'
}
