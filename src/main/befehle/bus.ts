// AP-0.9, 55_Architektur.md §4.5-Vorlage: der echte Befehlsbus. Die einzige Stelle in
// `src/main/`, die `db.transaction(...)` aufruft (CLAUDE.md §2: nur `src/main/befehle/` öffnet
// Transaktionen) - Repositories und Handler bekommen ein bereits offenes `Tx`-Handle.
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { armieren, entwaffnen } from '../journal/kontext'
import { sendeEreignis } from '../ipc/ereignisse'
import { neueId } from '../ipc/huelle'
import type { Tx } from '../repositories/basis'
import { betroffene, naechsteLfd, redoStapelVerwerfen, status, transaktionAnlegen, transaktionVerwerfen } from '../repositories/journal-repo'
import { REGISTRIERUNG, type BefehlAus, type BefehlDef, type BefehlEin, type BefehlName } from './registrierung'

interface BusLauf<Aus> {
  readonly ergebnis: Aus
  readonly anzahl: number
  readonly txId: string
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
      transaktionAnlegen(db, {
        id: txId,
        zeitpunkt: Date.now(),
        bearbeiter: 'lokal',
        art: def.art,
        beschreibung: def.beschreibung(nutzlast),
        lfd: naechsteLfd(db),
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
      return { ergebnis, anzahl, txId }
    })
    .immediate()

  if (lauf.anzahl > 0) {
    sendeEreignis('ereignis:datenGeaendert', { transaktionId: lauf.txId, ursache: name })
    sendeEreignis('ereignis:journalStatus', status(db))
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
