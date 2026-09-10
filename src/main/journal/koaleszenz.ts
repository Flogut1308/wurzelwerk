// AP-0.15, 55_Architektur.md §4.8 (Koaleszenz von Änderungen), F-03: fasst eine neue Transaktion
// mit der unmittelbar vorangegangenen zusammen, wenn beide innerhalb eines gleitenden 2-Sekunden-
// Fensters denselben Koaleszenz-Schlüssel tragen (z. B. mehrere Notiz-Tastenanschläge auf dieselbe
// Person) - so entsteht EIN Undo-Schritt statt vieler. Läuft INNERHALB der bereits offenen
// Bus-Transaktion (`src/main/befehle/bus.ts`, CLAUDE.md §2: kein eigenes `BEGIN` hier) und schreibt
// KEIN eigenes SQL (kein `db.prepare`/`db.exec` - ESLint no-restricted-syntax, CLAUDE.md §2 Regel
// 4) - jeder Zugriff läuft über `src/main/repositories/journal-repo.ts`.
import { neueId } from '../ipc/huelle'
import {
  aenderungEinfuegen,
  aenderungenLoeschen,
  aenderungenRoh,
  koaleszenzKandidat,
  transaktionVerwerfen,
  transaktionZeitpunktSetzen,
  type TransaktionArt,
} from '../repositories/journal-repo'
import type { Tx } from '../repositories/basis'
import { verdichteAenderungen, type AenderungEintrag, type JournalOperation } from '../../core/journal/koaleszenz-verdichtung'

/** Das Koaleszenz-Fenster (55_Architektur.md §4.8): zwei Transaktionen mit demselben Schlüssel innerhalb von 2000ms werden zusammengefasst. */
const KOALESZENZ_FENSTER_MS = 2000

/** Eingabe für `versucheZusammenfassen()` - die soeben (innerhalb der laufenden Bus-Transaktion) committete neue Transaktion. */
export interface KoaleszenzNeu {
  readonly txId: string
  readonly lfd: number
  readonly zeitpunktMs: number
  readonly art: TransaktionArt
  readonly koaleszenzSchluessel: string | null
}

/**
 * Verengt die rohe `operation`-Spalte (DB-`CHECK` beschränkt sie bereits auf diese drei Werte,
 * bleibt aber typseitig `string`) auf `JournalOperation`, ohne ein unbegründetes `as` (CLAUDE.md
 * §4) - ein unbekannter Wert wäre eine Dateninkonsistenz und wirft.
 */
function alsOperation(wert: string): JournalOperation {
  if (wert === 'insert' || wert === 'update' || wert === 'delete') {
    return wert
  }
  throw new Error(`alsOperation(): unbekannte aenderung.operation "${wert}" (55_Architektur.md §4.8).`)
}

/**
 * Versucht, `neu` mit der unmittelbar vorangegangenen Transaktion zusammenzufassen
 * (55_Architektur.md §4.8). Gibt die effektive Transaktions-ID zurück: bei einem Merge die des
 * Kandidaten (dessen Zeile bleibt bestehen, `neu.txId` wird verworfen), sonst unverändert
 * `neu.txId`.
 *
 * Gibt `null` zurück, wenn der Merge NICHTS übrig lässt (insert+delete verdichtet zu `[]`,
 * Verdichtungstabelle §4.8) - dann sind BEIDE Transaktionszeilen bereits gelöscht (auch die des
 * Kandidaten). `null` ist das Signal an den Aufrufer (`src/main/befehle/bus.ts`), dass netto keine
 * Änderung übrig geblieben ist - der Bus behandelt das wie eine leere Transaktion (kein
 * `ereignis:datenGeaendert`, s. dortiger `anzahl === 0`-Zweig): ohne dieses Signal würde der Bus
 * fälschlich ein Ereignis mit einer bereits gelöschten `transaktionId` melden. Mit dem heutigen
 * Befehlsvorrat unerreichbar (nur `person.feldSetzen(notiz)` trägt einen Koaleszenz-Schlüssel, und
 * `notiz`-Änderungen sind nie `insert`/`delete`) - bleibt aber ein correctness-Signal für jeden
 * künftigen Befehl, der einen Schlüssel auf insert/delete-fähigen Zeilen registriert.
 */
export function versucheZusammenfassen(db: Tx, neu: KoaleszenzNeu): string | null {
  if (neu.koaleszenzSchluessel === null || neu.art !== 'nutzer') {
    return neu.txId
  }

  const kandidat = koaleszenzKandidat(db, neu.lfd)
  if (kandidat === undefined) {
    return neu.txId
  }

  const passtZusammen =
    kandidat.status === 'angewendet' &&
    kandidat.art === 'nutzer' &&
    kandidat.koaleszenzSchluessel === neu.koaleszenzSchluessel &&
    neu.zeitpunktMs - kandidat.zeitpunktMs < KOALESZENZ_FENSTER_MS
  if (!passtZusammen) {
    return neu.txId
  }

  const alt: readonly AenderungEintrag[] = aenderungenRoh(db, kandidat.id).map((zeile) => ({
    tabelle: zeile.tabelle,
    datensatzId: zeile.datensatzId,
    operation: alsOperation(zeile.operation),
    wertAltJson: zeile.wertAltJson,
    wertNeuJson: zeile.wertNeuJson,
  }))
  const neuZeilen: readonly AenderungEintrag[] = aenderungenRoh(db, neu.txId).map((zeile) => ({
    tabelle: zeile.tabelle,
    datensatzId: zeile.datensatzId,
    operation: alsOperation(zeile.operation),
    wertAltJson: zeile.wertAltJson,
    wertNeuJson: zeile.wertNeuJson,
  }))

  const merged = verdichteAenderungen(alt, neuZeilen)

  aenderungenLoeschen(db, [kandidat.id, neu.txId])
  merged.forEach((zeile, index) => {
    aenderungEinfuegen(db, {
      id: neueId(),
      transaktionId: kandidat.id,
      reihenfolge: index + 1,
      tabelle: zeile.tabelle,
      datensatzId: zeile.datensatzId,
      feld: null,
      wertAltJson: zeile.wertAltJson,
      wertNeuJson: zeile.wertNeuJson,
      operation: zeile.operation,
    })
  })

  transaktionVerwerfen(db, neu.txId)

  if (merged.length === 0) {
    // insert+delete: beide entfallen - auch die Kandidaten-Transaktionszeile bleibt nicht übrig.
    // `null` signalisiert dem Bus, dass netto nichts übrig ist (s. Funktionskommentar).
    transaktionVerwerfen(db, kandidat.id)
    return null
  }

  // Gleitendes Fenster (Default laut Plan, s. docs/80_Offene_Fragen.md U-AP15a): der Zeitpunkt der
  // zusammengefassten Transaktion rückt auf den der jüngsten Änderung nach - jede weitere schnelle
  // Änderung bekommt dadurch wieder das volle 2-Sekunden-Fenster.
  transaktionZeitpunktSetzen(db, kandidat.id, neu.zeitpunktMs)
  return kandidat.id
}
