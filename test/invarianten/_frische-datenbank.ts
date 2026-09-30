// AP-1.30, Folgepunkt U-130-undo-bitgleich-laufzeit (docs/80 §33) — geschützter Prüfpfad (CLAUDE.md
// §5/§13, ADR-025). Frische, migrierte `:memory:`-Datenbank MIT eingeschaltetem Journal für die
// Invarianten, ohne je Lauf neu zu migrieren.
//
// `undo-bitgleich.test.ts` öffnete je fast-check-Lauf eine `:memory:`-Datenbank und migrierte sie
// vollständig (alle Migrationen, Trigger, abgeleitetes Schema) — gemessen rund ein Drittel seiner
// Laufzeit. Das Ergebnis dieser Migration hängt nur am Stand von `docs/schema/` (und an
// `angewendet_am`, s. u.), nicht am Lauf. Darum wird hier, nach dem Vorbild von
// `test/einheit/_hilfen-abgeleitet.ts` (AP-1.3c), die migrierte Vorlage EINMAL je Testprozess gebaut
// und per `db.serialize()` als Puffer gehalten; jeder Aufruf klont daraus eine neue Verbindung über
// `oeffnen(':memory:', { quelle })` — derselbe `oeffnen()`-Codepfad wie der Direktweg, Pragmas
// (`foreign_keys` u. a.) und SQL-Funktionen (`uuid7`, `suchnormalform`, `koelner_phonetik`) werden
// also identisch gesetzt. ANDERS als `_hilfen-abgeleitet.ts` bleibt das Journal EINGESCHALTET
// (`journal_kontext.aktiv = 1`, scharfer Ruhezustand nach der Migration): die Invarianten schreiben
// über den echten Befehlsbus und brauchen die Journal-Trigger.
//
// Beleg, dass der Klon sich in jeder geprüften Hinsicht wie der Direktweg verhält (Schema, Pragmas,
// Funktionen, Fremdschlüssel, Journal, gleiche Folge → gleicher Abzug):
// `test/invarianten/frische-datenbank-klon.test.ts`.
//
// Bekannter, gewollter Unterschied: `schema_migration.angewendet_am` trägt den Zeitpunkt, zu dem die
// Vorlage gebaut wurde, nicht den des einzelnen Laufs. Unkritisch für jede Invariante, die nur
// Zustände INNERHALB eines Laufs vergleicht (z. B. Undo gegen den Vorzustand derselben Verbindung).
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

let vorlagePuffer: Buffer | undefined

function vorlagePufferErzeugen(): Buffer {
  const vorlage = oeffnen(':memory:')
  try {
    migrieren(vorlage)
    return vorlage.serialize()
  } finally {
    vorlage.close()
  }
}

/**
 * Frische, vollständig migrierte (`SCHEMA_VERSION`) In-Memory-Datenbank mit eingeschaltetem Journal —
 * gleichwertig zu `oeffnen(':memory:')` + `migrieren(db)` (s. Modulkommentar). Die Vorlage entsteht
 * beim ersten Aufruf im Prozess; jeder Aufruf liefert eine eigene, unabhängige Verbindung, die der
 * Aufrufer selbst schließt (`db.close()`).
 */
export function frischeMigrierteDatenbank(): Database.Database {
  vorlagePuffer ??= vorlagePufferErzeugen()
  return oeffnen(':memory:', { quelle: vorlagePuffer })
}
