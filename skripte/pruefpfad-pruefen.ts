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
//
// AP-0.25 PR-4-Nachtrag: drei Lücken geschlossen.
//   (1) test/migration/** spiegelt wie test/schema die Migrationswahrheit (jede neue
//       Fixture-Datenbank/jeder neue Migrationstest hängt an einer neuen docs/schema/00NN_*.sql-
//       Datei) - es wird deshalb genauso SCHEMA-BEDINGT geschützt: zulässig zusammen mit
//       Produktivcode NUR, wenn eine neue Migrationsdatei im selben Vergleich steckt.
//   (2) src/main/datenbank/migration/registrierung.ts trägt die Prüfsummen-Wahrheit (ADR-025
//       nennt sie explizit geschützt) - dieselbe SCHEMA-BEDINGTE Regel wie test/migration, aus
//       demselben Grund: eine neue Migration ändert zwangsläufig SCHEMA_VERSION/MIGRATIONEN dort.
//   (3) Von test/invarianten, test/golden oder test/schema INDIREKT importierte Hilfsdateien
//       außerhalb dieser drei Wurzeln (z. B. test/hilfsmittel/fixture-laden.ts,
//       test/einheit/_hilfen-abgeleitet.ts) sind genauso Prüfmaterial wie die Testdatei, die sie
//       einbindet - ein Vermischungs-Check, der nur die Testdatei selbst kennt, aber nicht ihre
//       Hilfsdatei, ließe genau den Umbau zu, den ADR-025 verhindern soll (die Prüfung über eine
//       "unauffällige" Nebendatei ändern). `ermittleIndirektGeschuetzteHelfer()` löst das per
//       AST-Scan (analog zu test/invarianten/_journal-aufrufer.ts) - bewusst NUR in der CLI
//       (`pruefpfadPruefen()`), nicht in der reinen Entscheidungsfunktion
//       `pruefpfadAuswerten()`: die scannt den Dateisystemzustand des jeweiligen Arbeitsbaums,
//       ein Einheitstest gegen `pruefpfadAuswerten()` soll aber mit einer festen Dateiliste
//       arbeiten und deterministisch bleiben, ohne von der Baumstruktur außerhalb des Tests
//       abzuhängen.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO_WURZEL = resolve(HIER, '..')

const IMMER_GESCHUETZTE_PFADE = [/^test\/invarianten\//, /^test\/golden\//]
// Schema-bedingt geschützt: nur zulässig zusammen mit Produktivcode, wenn eine neue
// docs/schema/00NN_*.sql-Migration im selben Vergleich steckt (AP-0.7-Nachtrag, erweitert um
// test/migration/** und registrierung.ts, AP-0.25 PR-4).
const SCHEMA_BEDINGT_GESCHUETZTE_PFADE = [
  /^test\/schema\//,
  /^test\/migration\//,
  /^src\/main\/datenbank\/migration\/registrierung\.ts$/,
]
const MIGRATIONS_DATEI_MUSTER = /^docs\/schema\/\d{4}_[^/]+\.sql$/
const PRODUKTIV_PFAD = /^src\//

/** Schutzmodus eines zusätzlich (indirekt) geschützten Pfads - s. `ermittleIndirektGeschuetzteHelfer`. */
export type ZusaetzlicherSchutzModus = 'immer' | 'schema_bedingt'

export interface ZusaetzlicherGeschuetzterPfad {
  /** Repo-relativer Pfad, Forward-Slash. */
  readonly datei: string
  readonly modus: ZusaetzlicherSchutzModus
}

export interface PruefpfadErgebnis {
  /** `true`, wenn geschützter Pfad und Produktivcode unzulässig im selben Vergleich auftreten. */
  readonly unzulaessigeVermischung: boolean
  /** `true`, wenn der Vergleich mindestens eine neue/geänderte Migrationsdatei enthält. */
  readonly enthaeltMigrationsAenderung: boolean
  /** `true`, wenn ein schema-bedingt geschützter Pfad sich ändert (unabhängig davon, ob das hier zulässig ist). */
  readonly schemaBedingtGeaendert: boolean
  readonly geaenderteGeschuetzte: readonly string[]
  readonly geaenderteProduktivDateien: readonly string[]
}

/**
 * Reine Entscheidungsfunktion (testbar ohne `git`/Prozessumgebung/Dateisystem): nimmt die Liste
 * der im Vergleich geänderten Dateipfade entgegen und wendet die ADR-025-Regel + den
 * AP-0.7/AP-0.25-Nachtrag an. `zusaetzlicheGeschuetztePfade` (Default leer) ergänzt die fest
 * verdrahteten Muster oben um zur Laufzeit ermittelte, indirekt geschützte Hilfsdateien - siehe
 * `ermittleIndirektGeschuetzteHelfer()`. Diese Liste wird HIER nur entgegengenommen, nicht selbst
 * ermittelt, damit diese Funktion dateisystemfrei und deterministisch bleibt.
 */
export function pruefpfadAuswerten(
  dateien: readonly string[],
  zusaetzlicheGeschuetztePfade: readonly ZusaetzlicherGeschuetzterPfad[] = [],
): PruefpfadErgebnis {
  const enthaeltMigrationsAenderung = dateien.some((datei) => MIGRATIONS_DATEI_MUSTER.test(datei))

  const immerZusaetzlich = new Set(
    zusaetzlicheGeschuetztePfade.filter((eintrag) => eintrag.modus === 'immer').map((eintrag) => eintrag.datei),
  )
  const schemaBedingtZusaetzlich = new Set(
    zusaetzlicheGeschuetztePfade.filter((eintrag) => eintrag.modus === 'schema_bedingt').map((eintrag) => eintrag.datei),
  )

  const istImmerGeschuetzt = (datei: string): boolean =>
    IMMER_GESCHUETZTE_PFADE.some((muster) => muster.test(datei)) || immerZusaetzlich.has(datei)
  const istSchemaBedingtGeschuetzt = (datei: string): boolean =>
    SCHEMA_BEDINGT_GESCHUETZTE_PFADE.some((muster) => muster.test(datei)) || schemaBedingtZusaetzlich.has(datei)

  const schemaBedingtGeaendert = dateien.some((datei) => istSchemaBedingtGeschuetzt(datei))

  const istGeschuetzt = (datei: string): boolean =>
    istImmerGeschuetzt(datei) || (!enthaeltMigrationsAenderung && istSchemaBedingtGeschuetzt(datei))

  const geaenderteGeschuetzte = dateien.filter((datei) => istGeschuetzt(datei))
  const geaenderteProduktivDateien = dateien.filter((datei) => PRODUKTIV_PFAD.test(datei))

  return {
    unzulaessigeVermischung: geaenderteGeschuetzte.length > 0 && geaenderteProduktivDateien.length > 0,
    enthaeltMigrationsAenderung,
    schemaBedingtGeaendert,
    geaenderteGeschuetzte,
    geaenderteProduktivDateien,
  }
}

interface SchutzWurzel {
  readonly ordner: string
  readonly modus: ZusaetzlicherSchutzModus
}

// test/invarianten und test/golden geben ihren Modus 'immer' an alles weiter, was sie indirekt
// importieren; test/schema entsprechend 'schema_bedingt' (AP-0.25 PR-4). test/golden existiert
// zum Zeitpunkt dieses Nachtrags noch nicht (Phase 2, Layout) - der Scan überspringt fehlende
// Ordner statt zu brechen.
const SCHUTZ_WURZELN: readonly SchutzWurzel[] = [
  { ordner: 'test/invarianten', modus: 'immer' },
  { ordner: 'test/golden', modus: 'immer' },
  { ordner: 'test/schema', modus: 'schema_bedingt' },
]

function posixPfad(pfad: string): string {
  return pfad.split(sep).join('/')
}

function alleTsDateien(verzeichnis: string): readonly string[] {
  const ergebnis: string[] = []
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) {
      ergebnis.push(...alleTsDateien(pfad))
    } else if (eintrag.isFile() && (pfad.endsWith('.ts') || pfad.endsWith('.tsx'))) {
      ergebnis.push(pfad)
    }
  }
  return ergebnis
}

/** Alle relativen (`./`, `../`) Modul-Spezifizierer aus `import`/`export … from`-Deklarationen. */
function relativeImportSpezifizierer(absoluterPfad: string, quelltext: string): readonly string[] {
  const scriptKind = absoluterPfad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(absoluterPfad, quelltext, ts.ScriptTarget.Latest, true, scriptKind)
  const ergebnis: string[] = []

  const besuchen = (knoten: ts.Node): void => {
    const istModulDeklaration = ts.isImportDeclaration(knoten) || ts.isExportDeclaration(knoten)
    if (istModulDeklaration && knoten.moduleSpecifier !== undefined && ts.isStringLiteralLike(knoten.moduleSpecifier)) {
      const spezifizierer = knoten.moduleSpecifier.text
      if (spezifizierer.startsWith('./') || spezifizierer.startsWith('../')) {
        ergebnis.push(spezifizierer)
      }
    }
    ts.forEachChild(knoten, besuchen)
  }
  besuchen(sourceFile)

  return ergebnis
}

/** Löst einen relativen Modul-Spezifizierer zu einer absoluten Datei auf (`.ts`, `.tsx`, `index.ts`). */
function modulSpezifiziererAufloesen(vonAbsoluterDatei: string, spezifizierer: string): string | null {
  const basis = resolve(dirname(vonAbsoluterDatei), spezifizierer)
  const kandidaten = [`${basis}.ts`, `${basis}.tsx`, join(basis, 'index.ts')]
  return kandidaten.find((kandidat) => existsSync(kandidat)) ?? null
}

/**
 * Scannt test/invarianten, test/golden und test/schema (AST, nicht Regex - s. Kommentar oben) und
 * folgt rekursiv ihren relativen Importen. Jede erreichte Datei, die unter `test/**` liegt, aber
 * außerhalb dieser drei Schutz-Wurzeln, ist ein indirekt geschützter Helfer: dieselbe Prüfmaterial-
 * Eigenschaft wie die Testdatei, die sie einbindet, nur eine Ebene entfernt. Importe nach `src/**`
 * werden NICHT aufgenommen - eine Änderung an Produktivcode ist ohnehin Vermischung, unabhängig
 * davon, von wem er importiert wird.
 *
 * Läuft nur in der CLI (`pruefpfadPruefen`), nicht in `pruefpfadAuswerten` - s. Nachtrag oben.
 */
export function ermittleIndirektGeschuetzteHelfer(repoWurzel: string = REPO_WURZEL): readonly ZusaetzlicherGeschuetzterPfad[] {
  const modusJeDatei = new Map<string, ZusaetzlicherSchutzModus>()
  const bereitsExpandiert = new Set<string>()

  const istUnterhalbSchutzwurzel = (relativerPfad: string): boolean =>
    SCHUTZ_WURZELN.some(({ ordner }) => relativerPfad === ordner || relativerPfad.startsWith(`${ordner}/`))

  const besuchen = (absoluterPfad: string, modus: ZusaetzlicherSchutzModus): void => {
    const relativerPfad = posixPfad(relative(repoWurzel, absoluterPfad))
    if (!relativerPfad.startsWith('test/')) {
      return
    }

    if (!istUnterhalbSchutzwurzel(relativerPfad)) {
      const bestehenderModus = modusJeDatei.get(relativerPfad)
      if (bestehenderModus !== 'immer') {
        modusJeDatei.set(relativerPfad, modus === 'immer' ? 'immer' : (bestehenderModus ?? modus))
      }
    }

    if (bereitsExpandiert.has(absoluterPfad)) {
      return
    }
    bereitsExpandiert.add(absoluterPfad)

    const quelltext = readFileSync(absoluterPfad, 'utf8')
    for (const spezifizierer of relativeImportSpezifizierer(absoluterPfad, quelltext)) {
      const ziel = modulSpezifiziererAufloesen(absoluterPfad, spezifizierer)
      if (ziel !== null) {
        besuchen(ziel, modus)
      }
    }
  }

  for (const { ordner, modus } of SCHUTZ_WURZELN) {
    const absoluterOrdner = join(repoWurzel, ...ordner.split('/'))
    if (!existsSync(absoluterOrdner)) {
      continue
    }
    for (const datei of alleTsDateien(absoluterOrdner)) {
      besuchen(datei, modus)
    }
  }

  return [...modusJeDatei.entries()].map(([datei, modus]) => ({ datei, modus }))
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
  const indirekteHelfer = ermittleIndirektGeschuetzteHelfer()
  const ergebnis = pruefpfadAuswerten(dateien, indirekteHelfer)

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
        'docs/schema/00NN_*.sql-Migration, auch test/schema, test/migration oder ' +
        'src/main/datenbank/migration/registrierung.ts - sowie von diesen drei Wurzeln indirekt ' +
        'importierte Hilfsdateien) laufen nie in derselben Iteration wie der geprüfte ' +
        'Produktivcode. Aufteilen oder zweiten Blick einholen.',
    )
    return 1
  }

  if (ergebnis.enthaeltMigrationsAenderung && ergebnis.schemaBedingtGeaendert) {
    console.log(
      'Geschützter Prüfpfad: test/schema, test/migration oder registrierung.ts ändert sich zusammen ' +
        'mit einer neuen/geänderten docs/schema/00NN_*.sql-Migration — laut ADR-025-Nachtrag ' +
        'zulässig (test/invarianten und test/golden bleiben in jedem Fall geschützt).',
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
