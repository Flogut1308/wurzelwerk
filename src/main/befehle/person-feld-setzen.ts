// AP-0.9: Handler für `person.feldSetzen`. Läuft innerhalb der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: kein Journaleintrag ohne echte Änderung - `lesen()` liefert den Altwert MIT der
// Existenzprüfung in einem Zugriff (statt eines separaten `datensatzExistiert()`); stimmt der
// Altwert bereits mit `ein.wert` überein, bleibt der Aufruf ein No-op (kein `feldSetzen()`, kein
// neuer `geaendert_am`-Zeitstempel) - der Befehlsbus (`anzahl === 0`-Zweig in
// `src/main/befehle/bus.ts`) verwirft die dadurch leere Transaktion vollständig, inklusive
// Redo-Stapel-Erhalt.
import type { PersonFeldSetzenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import { feldSetzen, lesen, type PersonZeile } from '../repositories/person-repo'

/**
 * Vergleicht den gespeicherten Altwert mit `ein.wert` (JS `===`, NULL-sicher: `null === null` ist
 * `true`). Diskriminierte Union über `ein.feld` (D-FELD, wie `feldSetzen()` im Repo) - der
 * `never`-Zweig zwingt einen Compile-Fehler, sobald `PersonFeldSetzenEin` um eine hier nicht
 * behandelte Variante wächst.
 */
function unveraendert(vorher: PersonZeile, ein: PersonFeldSetzenEin): boolean {
  switch (ein.feld) {
    case 'geschlecht':
      return vorher.geschlecht === ein.wert
    case 'lebend_status':
      return vorher.lebend_status === ein.wert
    case 'privat':
      return vorher.privat === ein.wert
    case 'notiz':
      return vorher.notiz === ein.wert
    case 'gesperrt_bis':
      return vorher.gesperrt_bis === ein.wert
    case 'ist_platzhalter':
      return vorher.ist_platzhalter === ein.wert
    case 'platzhalter_grund':
      return vorher.platzhalter_grund === ein.wert
    default: {
      const nieErreicht: never = ein
      throw new Error(`unveraendert(): unbehandeltes Feld ${JSON.stringify(nieErreicht)}`)
    }
  }
}

/** `geaendert_am` kommt vom Handler (D-3); `erstellt_am` bleibt unverändert (nur dieses eine Repo-Update rührt es nicht an). */
export function personFeldSetzen(tx: Tx, ein: PersonFeldSetzenEin): null {
  const vorher = lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  feldSetzen(tx, { ...ein, geaendertAm: Date.now() })
  return null
}
