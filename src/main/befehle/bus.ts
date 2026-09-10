// AP-0.9, 55_Architektur.md §4.5-Vorlage: der echte Befehlsbus. Die einzige Stelle in
// `src/main/`, die `db.transaction(...)` aufruft (CLAUDE.md §2: nur `src/main/befehle/` öffnet
// Transaktionen) - Repositories und Handler bekommen ein bereits offenes `Tx`-Handle.
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { armieren, entwaffnen } from '../journal/kontext'
import { journalStatusMelden } from '../journal/journal-status-melder'
import { sendeEreignis } from '../ipc/ereignisse'
import { neueId } from '../ipc/huelle'
import { protokollFehler } from '../protokoll/logger'
import type { Tx } from '../repositories/basis'
import { betroffene, naechsteLfd, redoStapelVerwerfen, transaktionAnlegen, transaktionVerwerfen } from '../repositories/journal-repo'
import { REGISTRIERUNG, type BefehlAus, type BefehlDef, type BefehlEin, type BefehlName } from './registrierung'

interface BusLauf<Aus> {
  readonly ergebnis: Aus
  readonly anzahl: number
  readonly txId: string
  readonly lfd: number
}

/** Anzahl der Transaktionen zwischen zwei automatischen Schnappschüssen (55_Architektur.md §6.2: "alle 200 Transaktionen"). */
const SCHNAPPSCHUSS_ALLE_N_TRANSAKTIONEN = 200

let schnappschussAusloeser: (db: Tx) => void = () => {
  // Standard: no-op (AP-0.11) - ohne diesen Default würde jeder bestehende Bus-Test (`test/
  // einheit/befehl-bus.test.ts` u. a.) bei jeder 200. Transaktion einen echten
  // Dateisystem-Schnappschuss auslösen wollen.
}

/**
 * Registriert den Auslöser für "alle 200 Transaktionen" (55_Architektur.md §6.2, AP-0.11) - Default
 * ist ein No-op (s. oben). `src/main/projekt/projekt-dienst.ts` registriert hier beim Öffnen eines
 * Projekts den echten Aufruf, analog zu `journalStatusBeobachterSetzen()`
 * (`src/main/journal/journal-status-melder.ts`): Ein zweiter Aufruf ersetzt den ersten - es gibt in
 * diesem Prozess nie mehr als ein offenes Projekt.
 */
export function schnappschussBeiTransaktionSetzen(fn: (db: Tx) => void): void {
  schnappschussAusloeser = fn
}

/**
 * Die eigentliche Bus-Mechanik, unabhängig von einem konkreten Befehlsnamen: öffnet eine
 * `IMMEDIATE`-Transaktion, legt die `transaktion`-Zeile an, armiert das Journal, ruft den Handler,
 * entwaffnet wieder und verwirft die Transaktionszeile, falls der Handler keine einzige
 * `aenderung`-Zeile erzeugt hat - alles innerhalb derselben Transaktionsklammer, vor `COMMIT`. Erst
 * nach dem erfolgreichen `COMMIT` gehen die beiden Ereignisse raus, und auch nur, wenn wirklich
 * etwas geändert wurde. `name` ist nur die `ursache` im Ereignis, keine Nachschlage-Schlüssel — die
 * Auflösung `Name → BefehlDef` übernimmt ausschließlich `fuehreAus()` unten über `REGISTRIERUNG`.
 *
 * Bewusst von `fuehreAus()` getrennt exportiert: `test/einheit/befehl-bus.test.ts` prüft die
 * Mechanik selbst (leere Transaktion verwerfen, werfender Handler, Verschachtelung, Ereignisse) mit
 * einem kleinen Test-Befehl, ohne eine zweite Registrierungs-API im Produktivcode zu brauchen.
 */
export function fuehreAusDef<Ein, Aus>(db: Tx, name: string, def: BefehlDef<Ein, Aus>, ein: Ein): Aus {
  if (db.inTransaction) {
    throw new WurzelFehler('BEFEHL_VERSCHACHTELT')
  }

  const nutzlast = def.schema.parse(ein)
  const txId = neueId()

  const lauf: BusLauf<Aus> = db
    .transaction((): BusLauf<Aus> => {
      const lfd = naechsteLfd(db)
      transaktionAnlegen(db, {
        id: txId,
        zeitpunkt: Date.now(),
        bearbeiter: 'lokal',
        art: def.art,
        beschreibung: def.beschreibung(nutzlast),
        lfd,
      })
      armieren(db, txId)
      let ergebnis: Aus
      try {
        ergebnis = def.handler(db, nutzlast)
      } finally {
        entwaffnen(db)
      }
      const anzahl = betroffene(db, txId)
      if (anzahl === 0) {
        transaktionVerwerfen(db, txId)
      } else {
        redoStapelVerwerfen(db) // §4.7: ein neuer Befehl verwirft den Redo-Stapel (lineares Undo-Modell) - NICHT bei einer leeren, gleich wieder verworfenen Transaktion
        // SEAM AP-0.15: koaleszenz
      }
      return { ergebnis, anzahl, txId, lfd }
    })
    .immediate()

  if (lauf.anzahl > 0) {
    sendeEreignis('ereignis:datenGeaendert', { transaktionId: lauf.txId, ursache: name })
    journalStatusMelden(db)

    // 55_Architektur.md §6.2 ("alle 200 Transaktionen") - LÄUFT NACH dem COMMIT: `VACUUM INTO`
    // ist innerhalb einer offenen Transaktion nicht erlaubt (SQLite-Einschränkung). Ein
    // fehlschlagender Schnappschuss darf eine bereits erfolgreich committete Transaktion nicht
    // nachträglich als Fehler an den Aufrufer melden - darum abgesichert und nur protokolliert.
    if (lauf.lfd % SCHNAPPSCHUSS_ALLE_N_TRANSAKTIONEN === 0) {
      try {
        schnappschussAusloeser(db)
      } catch (fehler) {
        protokollFehler({ befehlsname: name, code: fehler instanceof WurzelFehler ? fehler.code : 'INTERN_UNERWARTET' })
      }
    }
  }

  return lauf.ergebnis
}

/**
 * Führt einen registrierten Befehl aus (55_Architektur.md §4.5). `db` wird injiziert
 * (D-DB-Injektion): die IPC-Bindung (`src/main/ipc/registrierung.ts`) beschafft sie über
 * `offenesProjektDatenbank()`, Tests übergeben eine eigene `:memory:`-Datenbank.
 */
export function fuehreAus<N extends BefehlName>(db: Tx, name: N, ein: BefehlEin<N>): BefehlAus<N> {
  return fuehreAusDef(db, name, REGISTRIERUNG[name], ein)
}
