// Geschützter Prüfpfad (ADR-025, Reward-Hacking-Schutz): test/invarianten, test/golden und
// test/schema sind der Maßstab, nicht das Werkstück. Ändert ein Push/PR einen dieser Pfade
// zusammen mit Produktivcode unter src/, ist das kein automatisches Fehlverhalten — aber es
// läuft nie unbemerkt durch. Dieses Skript macht den Fall sichtbar (CI schlägt fehl).
//
// ADR-025-Nachtrag (AP-0.7): test/invarianten und test/golden bleiben AUSNAHMSLOS geschützt - sie
// sind reines Prüfmaterial, keine Spiegelung von etwas maschinell Nachvollziehbarem. test/schema
// ist ein Sonderfall: es spiegelt `docs/schema/*.sql` (die Migrationswahrheit) im Wesentlichen
// 1:1 - eine neue Migrationsdatei MUSS zwangsläufig neue/geänderte Erwartungen in test/schema nach
// sich ziehen (neue Tabellen/Spalten in ERWARTETES_SCHEMA, neue Ausnahmen in
// ERLAUBTE_INTEGER_PK_AUSNAHMEN usw.) - das ist eine additive, gegen die neue SQL-Datei
// nachvollziehbare Spiegeländerung, kein "die Prüfung dem Code anpassen". Enthält derselbe
// Vergleich also mindestens eine neue/geänderte Datei unter `docs/schema/00NN_*.sql`, darf
// test/schema mit Produktivcode zusammen im selben Vergleich auftauchen - test/invarianten und
// test/golden lösen die Sperre trotzdem weiterhin aus.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const IMMER_GESCHUETZTE_PFADE = [/^test\/invarianten\//, /^test\/golden\//]
const SCHEMA_GESCHUETZTER_PFAD = /^test\/schema\//
const MIGRATIONS_DATEI_MUSTER = /^docs\/schema\/\d{4}_[^/]+\.sql$/
const PRODUKTIV_PFAD = /^src\//

export interface PruefpfadErgebnis {
  /** `true`, wenn geschützter Pfad und Produktivcode unzulässig im selben Vergleich auftreten. */
  readonly unzulaessigeVermischung: boolean
  /** `true`, wenn der Vergleich mindestens eine neue/geänderte Migrationsdatei enthält. */
  readonly enthaeltMigrationsAenderung: boolean
  /** `true`, wenn test/schema sich ändert (unabhängig davon, ob das hier zulässig ist). */
  readonly schemaTestsGeaendert: boolean
  readonly geaenderteGeschuetzte: readonly string[]
  readonly geaenderteProduktivDateien: readonly string[]
}

/**
 * Reine Entscheidungsfunktion (testbar ohne `git`/Prozessumgebung): nimmt die Liste der im
 * Vergleich geänderten Dateipfade entgegen und wendet die ADR-025-Regel + den AP-0.7-Nachtrag an.
 */
export function pruefpfadAuswerten(dateien: readonly string[]): PruefpfadErgebnis {
  const enthaeltMigrationsAenderung = dateien.some((datei) => MIGRATIONS_DATEI_MUSTER.test(datei))
  const schemaTestsGeaendert = dateien.some((datei) => SCHEMA_GESCHUETZTER_PFAD.test(datei))

  const geschuetztePfade = enthaeltMigrationsAenderung
    ? IMMER_GESCHUETZTE_PFADE
    : [...IMMER_GESCHUETZTE_PFADE, SCHEMA_GESCHUETZTER_PFAD]

  const geaenderteGeschuetzte = dateien.filter((datei) => geschuetztePfade.some((muster) => muster.test(datei)))
  const geaenderteProduktivDateien = dateien.filter((datei) => PRODUKTIV_PFAD.test(datei))

  return {
    unzulaessigeVermischung: geaenderteGeschuetzte.length > 0 && geaenderteProduktivDateien.length > 0,
    enthaeltMigrationsAenderung,
    schemaTestsGeaendert,
    geaenderteGeschuetzte,
    geaenderteProduktivDateien,
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function geaenderteDateien(basis: string, kopf: string): string[] {
  const ausgabe = git(['diff', '--name-only', basis, kopf])
  return ausgabe === '' ? [] : ausgabe.split('\n')
}

/** CLI-Kern: liest den Vergleichspunkt aus der Umgebung, wertet aus, gibt den Prozess-Exitcode zurück. */
export function pruefpfadPruefen(): number {
  const basis = process.env['PRUEFPFAD_BASE_SHA']
  const kopf = process.env['PRUEFPFAD_HEAD_SHA'] ?? 'HEAD'

  if (basis === undefined || basis === '' || /^0+$/.test(basis)) {
    console.log('Kein Vergleichspunkt (erster Push oder leere Basis) — Prüfung übersprungen.')
    return 0
  }

  const dateien = geaenderteDateien(basis, kopf)
  const ergebnis = pruefpfadAuswerten(dateien)

  if (ergebnis.unzulaessigeVermischung) {
    console.error('Geschützter Prüfpfad und Produktivcode ändern sich im selben Vergleich:')
    console.error('')
    console.error('  Geschützt:')
    for (const datei of ergebnis.geaenderteGeschuetzte) console.error(`    ${datei}`)
    console.error('  Produktivcode:')
    for (const datei of ergebnis.geaenderteProduktivDateien) console.error(`    ${datei}`)
    console.error('')
    console.error(
      'ADR-025: Änderungen an test/invarianten oder test/golden (und, ohne begleitende ' +
        'docs/schema/00NN_*.sql-Migration, auch test/schema) laufen nie in derselben Iteration wie ' +
        'der geprüfte Produktivcode. Aufteilen oder zweiten Blick einholen.',
    )
    return 1
  }

  if (ergebnis.enthaeltMigrationsAenderung && ergebnis.schemaTestsGeaendert) {
    console.log(
      'Geschützter Prüfpfad: test/schema ändert sich zusammen mit einer neuen/geänderten ' +
        'docs/schema/00NN_*.sql-Migration — laut ADR-025-Nachtrag zulässig (test/invarianten und ' +
        'test/golden bleiben in jedem Fall geschützt).',
    )
  } else {
    console.log('Geschützter Prüfpfad: keine Vermischung mit Produktivcode gefunden.')
  }
  return 0
}

// CLI-Einstieg, analog zu skripte/schema-dump.ts.
const direktAufgerufen = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direktAufgerufen) {
  process.exit(pruefpfadPruefen())
}
