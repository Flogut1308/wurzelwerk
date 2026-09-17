// AP-1.4a, 56_Import_Vertrag.md §6.1: "Der Trockenlauf ist der echte Import in einer Transaktion,
// die zurückgerollt wird." Dies ist die EINZIGE Stelle, die für den Trockenlauf eine Transaktion
// öffnet (CLAUDE.md §2 Regel 3 — analog zu `src/main/befehle/bus.ts`, aber bewusst NICHT über
// `fuehreAusDef()`/den Befehlsbus: der Bus committet bei Erfolg, der Trockenlauf darf NIE
// committen). Ablauf exakt nach §6.1:
//   BEGIN IMMEDIATE
//     journal_kontext armieren mit einer Wegwerf-Transaktions-ID
//     Trockenlauf-Orchestrierung ausführen (`src/main/import/trockenlauf.ts`, derselbe Schreibweg
//       wie der echte Import — kein zweiter Codeweg)
//     Sentinel-Fehler werfen, um den ROLLBACK zu erzwingen
//   ROLLBACK (durch besser-sqlite3s `transaction()`-Wrapper, weil der Callback geworfen hat)
// Die Sentinel-Klasse wird NUR hier geworfen und NUR hier gefangen — jeder ANDERE Fehler (z. B. ein
// echter Schreibfehler in `schreibeImport()`) propagiert unverändert zum Aufrufer. KEIN
// `db.exec('ROLLBACK')`, KEIN `journalAus()` (CLAUDE.md §13: Determinismus/keine Sonderpfade).
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Trockenlaufbericht } from '../../shared/import/trockenlauf-bericht'
import { armieren } from '../journal/kontext'
import { neueId } from '../id'
import { naechsteLfd, transaktionAnlegen } from '../repositories/journal-repo'
import { fuehreTrockenlaufDurch } from '../import/trockenlauf'

/** Sentinel-Fehlerklasse: erzwingt den `ROLLBACK` der Trockenlauf-Transaktion (§6.1). Trägt den
 * bereits fertigen Bericht, damit er nach dem Rollback (außerhalb von `db.transaction()`) noch
 * verfügbar ist — der Rückgabewert des Transaktions-Callbacks selbst geht bei einem Wurf verloren. */
class TrockenlaufRueckrollen extends Error {
  public constructor(public readonly bericht: Trockenlaufbericht) {
    super('Trockenlauf: absichtlicher Rollback nach Berichterstellung (56_Import_Vertrag.md §6.1).')
    this.name = 'TrockenlaufRueckrollen'
  }
}

/**
 * Führt den Trockenlauf für die Datei unter `pfad` durch (`abfrage:import.trockenlauf` — s.
 * `src/shared/ipc/vertrag.ts` zur Kanalbenennung). Öffnet eine `IMMEDIATE`-Transaktion, armiert das
 * Journal mit einer Wegwerf-`transaktion`-Zeile, ruft die Orchestrierung und rollt danach IMMER
 * zurück — unabhängig davon, ob der Import akzeptiert wurde oder nicht. Die Datenbank ist nach
 * dieser Funktion in jedem Fall unverändert (`test/einheit/trockenlauf-ohne-wirkung.test.ts`).
 */
export function importTrockenlaufDurchfuehren(db: Database.Database, pfad: string): Trockenlaufbericht {
  if (db.inTransaction) {
    throw new WurzelFehler('BEFEHL_VERSCHACHTELT')
  }

  try {
    db.transaction((): void => {
      const lfd = naechsteLfd(db)
      const txId = neueId()
      transaktionAnlegen(db, {
        id: txId,
        zeitpunkt: Date.now(),
        art: 'import',
        beschreibung: `Trockenlauf ${pfad}`,
        lfd,
      })
      armieren(db, txId)

      const bericht = fuehreTrockenlaufDurch(db, pfad, { erstelltAm: Date.now(), transaktionId: txId })
      throw new TrockenlaufRueckrollen(bericht)
    }).immediate()
  } catch (u) {
    if (u instanceof TrockenlaufRueckrollen) {
      return u.bericht
    }
    throw u
  }

  // Unerreichbar: der Callback wirft IMMER (entweder die Sentinel oben oder einen echten Fehler,
  // der im `catch` erneut geworfen wird) — CLAUDE.md §4 verbietet `!`, dieser Zweig ist defensiv.
  throw new WurzelFehler('INTERN_UNERWARTET', 'importTrockenlaufDurchfuehren(): Transaktion endete ohne Sentinel-Rollback.')
}
