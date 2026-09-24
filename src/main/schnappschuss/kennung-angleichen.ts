// AP-1.34 (E12, A2): Kennungen nach einer Datei-Wiederherstellung angleichen.
//   `wiederhergestellteDateiAngleichen` (A2b): migriert die wiederhergestellte Datei vor dem
//   Öffnen und übernimmt bei einem Schnappschuss <v7 im Migrations-Hook die Kennungen der
//   ersetzten Datei (H6b, O-1/O-2) — genutzt von `schnappschussWiederherstellen()` und seit A2c
//   (H6) auch von `importZuruecknehmen()` (`src/main/journal/undo.ts`). Das reine
//   Zähler-Nachziehen (`zaehlerNachziehen`, A2a) ist darin aufgegangen und entfallen.
// Kein eigenes SQL (CLAUDE.md §2: das steht in `src/main/repositories/kennung-repo.ts`) und keine
// eigene Transaktion: die Übernahme läuft in der Transaktion des Migrationslaufs
// (`src/main/datenbank/migration/laeufer.ts`), das Zähler-Nachziehen ist je Bereich ein einzelnes
// UPDATE auf die NICHT_JOURNALISIERTE Tabelle `kennung_zaehler`.
import type { KennungZaehler } from '../../shared/schemata/kennung-zaehler'
import { integritaetPruefen } from '../datenbank/integritaet'
import { migrieren } from '../datenbank/migration/laeufer'
import { oeffnen } from '../datenbank/verbindung'
import { personKennungenUebernehmen, zaehlerMindestensSetzen } from '../repositories/kennung-repo'

/** Die Migration, die `person.kennung` und `kennung_zaehler` einführt (`docs/schema/0007_kennung_textanker.sql`). */
const KENNUNG_MIGRATION_VERSION = 7

/** Kennungsstand der ersetzten Datei, vor dem Schließen gesichert (E12/H6b). */
export interface ErsetzterKennungsstand {
  readonly zaehler: readonly KennungZaehler[]
  /** `person.id → person.kennung` der ersetzten Datei (`personKennungenLesen`, ohne NULL). */
  readonly kennungen: ReadonlyMap<string, number>
}

/** Was der Migrationslauf aus dem laufenden Prozess braucht (wie `projektOeffnen`). */
export interface AngleichenOptionen {
  readonly schemaBasis: string
  readonly appVersion: string
}

/**
 * Bringt eine gerade zurückkopierte Datei auf den aktuellen Stand, bevor das Projekt sie öffnet
 * (A2b, `docs/architektur.md` §6.4): `quick_check` → Migration → Zähler je Bereich mindestens auf
 * den gesicherten Stand. Liegt der Schnappschuss vor Migration 0007, übernimmt der Migrations-Hook
 * bei Version 7 die Kennungen der ersetzten Datei (H6b) und nummeriert Personen ohne Treffer ab dem
 * gesicherten Zählerstand (O-2) — atomar mit 0007: wirft die Übernahme, bleibt die Datei auf v6.
 * Ein Schnappschuss ≥v7 behält seine Kennungen, nur die Zähler werden nachgezogen (O-3).
 *
 * Bewusst **ohne** `schnappschussVor`: der Vor-Migrations-Stand ist die unveränderte Quelldatei in
 * `snapshots/`, der ersetzte Stand liegt als `ersetzt-…` daneben. Eine weitere Kopie trüge den
 * heutigen Zeitstempel für einen alten Inhalt und verdrängte in der Rotation („letzte 10") einen
 * echten Stand.
 *
 * Der Handle ist beim Rücksprung — auch bei einem Wurf — geschlossen (Windows: der Aufrufer
 * benennt die Datei danach ggf. um).
 */
export function wiederhergestellteDateiAngleichen(dbPfad: string, stand: ErsetzterKennungsstand, optionen: AngleichenOptionen): void {
  const personZaehler = stand.zaehler.find((zaehler) => zaehler.bereich === 'person')
  const db = oeffnen(dbPfad)
  try {
    integritaetPruefen(db)
    migrieren(db, {
      schemaBasis: optionen.schemaBasis,
      appVersion: optionen.appVersion,
      nachMigrationsSql: (hookDb, version) => {
        if (version === KENNUNG_MIGRATION_VERSION && personZaehler !== undefined) {
          personKennungenUebernehmen(hookDb, stand.kennungen, personZaehler.naechste)
        }
      },
    })
    for (const zaehler of stand.zaehler) {
      zaehlerMindestensSetzen(db, zaehler.bereich, zaehler.naechste)
    }
  } finally {
    db.close()
  }
}
