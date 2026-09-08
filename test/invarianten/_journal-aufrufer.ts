// AP-0.8 PR-B, Hilfsdatei für test/invarianten/journal-vollstaendig.test.ts (geschützter Prüfpfad,
// CLAUDE.md §13/ADR-025). Quelltext-Scan aller Produktivcode-Aufrufstellen von `journalAus()`
// (src/main/journal/kontext.ts, 55_Architektur.md §4.3: nur Migration, Undo/Redo und Großimport
// dürfen das Journal abschalten).
//
// AST-basiert (TypeScript Compiler API), bewusst NICHT regex-basiert über den Rohtext: eine Regex
// träfe auch Kommentare/Docstrings (z. B. den Verweis auf die "journalAus()-Phase" in kontext.ts
// selbst, oder docs/architektur.md, das aber ohnehin außerhalb von src/ liegt und nicht gescannt
// wird) und würde falsch-positiv rot. Ein `ts.CallExpression`, dessen Callee-Identifier
// `journalAus` heißt, ist demgegenüber eine eindeutige echte Aufrufstelle - Kommentare sind im AST
// gar nicht erst als Knoten vorhanden.
//
// Erkannte Aufrufformen (hueter-Review PR #13, Auflage 1): sowohl der bare Call `journalAus(tx,
// grund)` (Named-Import-Stil) ALS AUCH der Property-Access-Aufruf `kontext.journalAus(tx, grund)`
// (Namespace-Import-Stil, 55_Architektur.md §4.3/§4.5 zeigt genau diese Konvention -
// `kontext.armieren()`/`kontext.journalAus()`) werden erfasst. Beide Formen sind vermutlich
// relevant, sobald AP-0.10 (Undo/Redo) und AP-1.5 (Großimport) ihre Aufrufer anlegen.
//
// Bewusste Grenzen dieses Scans (Auflage 2, kurz dokumentiert statt "gelöst"):
//   (a) `kontext.ts` (die Definition selbst) wird komplett vom Scan ausgeschlossen (s.
//       DEFINITIONS_DATEI_POSIX unten) - ein (unplausibler) Aufruf von `journalAus()` INNERHALB
//       von kontext.ts selbst (z. B. aus einer anderen dort definierten Funktion heraus) bliebe
//       dadurch unerkannt. Das ist hier hingenommen: kontext.ts ist die schmale Definitionsdatei
//       aus AP-0.8 PR-A, ein Selbstaufruf dort wäre ein eigenständiges Architekturproblem, das
//       dieser Scan (er prüft AUFRUFER, nicht die Definition) nicht sein Ziel ist zu fangen.
//   (b) ein Alias-Re-Export/-Import (`import { journalAus as x } from '...'; x(tx, grund)`, oder
//       `const x = journalAus; x(tx, grund)`) wird NICHT erkannt - der Scan löst keine
//       Variablenbindungen auf, er sucht nur nach dem callee-Identifier/-Property-Namen
//       `journalAus` wörtlich. Bewusst nicht behoben: eine Bindungsauflösung bräuchte ein
//       Typ-Checker-Programm (ts.createProgram) statt einzelner ts.createSourceFile-Aufrufe und
//       wäre für dieses Prüfziel unverhältnismäßig - ein Alias wäre zudem selbst schon ein
//       ungewöhnlicher, im Review auffälliger Stil (CLAUDE.md §4: keine Standardexporte / klare,
//       suchbare Bezeichner), den ein menschlicher/adversarialer Review-Blick fangen würde.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO_WURZEL = join(HIER, '..', '..')
const SRC_WURZEL = join(REPO_WURZEL, 'src')

/** Die Definition selbst - kein Aufruf, wird aus dem Scan ausgeschlossen. */
const DEFINITIONS_DATEI_POSIX = 'src/main/journal/kontext.ts'

export type JournalAusKategorie = 'migration' | 'undo_redo' | 'grossimport'

export interface JournalAusAufrufstelle {
  /** Repo-relativer Pfad, Forward-Slash (plattformunabhängig vergleichbar). */
  readonly datei: string
  /** 1-basierte Zeilennummer der Aufrufstelle. */
  readonly zeile: number
  /** Text des `grund`-Arguments, falls es ein Zeichenkettenliteral ist - sonst `null`. */
  readonly grund: string | null
  /** Erkannte Kategorie anhand von `grund`, oder `null`, wenn keines der drei Muster passt. */
  readonly kategorie: JournalAusKategorie | null
}

/**
 * Erlaubte Zwecke aus 55_Architektur.md §4.3, erkannt am Text des `grund`-Arguments (das
 * `journalAus()` selbst als Pflichtparameter verlangt, siehe kontext.ts-Kommentar: "der
 * Pflichtparameter `grund` dokumentiert am Aufrufort, WARUM diese Stelle eine der drei ist"). Das
 * ist robuster als eine Whitelist über feste Dateipfade, weil AP-0.10 (Undo/Redo) und AP-1.5
 * (Großimport) ihre jeweiligen Aufrufer-Module noch gar nicht angelegt haben.
 */
const KATEGORIE_MUSTER: ReadonlyArray<{ readonly kategorie: JournalAusKategorie; readonly muster: RegExp }> = [
  { kategorie: 'migration', muster: /migration/i },
  { kategorie: 'undo_redo', muster: /undo|redo|r[üu]ckg[äa]ngig|wiederhol/i },
  { kategorie: 'grossimport', muster: /gro[ßs]import|großimport|grossimport/i },
]

function kategorieVon(grund: string): JournalAusKategorie | null {
  return KATEGORIE_MUSTER.find((eintrag) => eintrag.muster.test(grund))?.kategorie ?? null
}

function posixPfad(pfad: string): string {
  return pfad.split(sep).join('/')
}

function alleQuelldateien(verzeichnis: string): readonly string[] {
  const ergebnis: string[] = []
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) {
      ergebnis.push(...alleQuelldateien(pfad))
    } else if (eintrag.isFile() && (pfad.endsWith('.ts') || pfad.endsWith('.tsx'))) {
      ergebnis.push(pfad)
    }
  }
  return ergebnis
}

/**
 * `true`, wenn `knoten` ein Aufruf von `journalAus` ist - als bare Call (`journalAus(...)`, Named-
 * Import-Stil) ODER als Property-Access (`kontext.journalAus(...)`, Namespace-Import-Stil,
 * 55_Architektur.md §4.3/§4.5-Konvention). Reine Prädikatsfunktion, für sich allein testbar.
 */
function istJournalAusAufruf(knoten: ts.Node): knoten is ts.CallExpression {
  if (!ts.isCallExpression(knoten)) {
    return false
  }
  const callee = knoten.expression
  if (ts.isIdentifier(callee)) {
    return callee.text === 'journalAus'
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
    return callee.name.text === 'journalAus'
  }
  return false
}

/**
 * Alle `journalAus(...)`-Aufrufstellen (beide Formen, s. `istJournalAusAufruf`) in einem bereits
 * eingelesenen Quelltext. Reine, dateisystemfreie Funktion - Grundlage sowohl für
 * `journalAusAufrufstellen()` (echter src/-Scan) als auch für die Selbstprüfung des Scanners in
 * journal-vollstaendig.test.ts (Auflage 1, hueter-Review PR #13: Probe für beide Aufrufformen,
 * damit die Lücke nicht unbemerkt wiederkommt).
 */
export function journalAusAufrufeAusQuelltext(relativerPfad: string, quelltext: string): readonly JournalAusAufrufstelle[] {
  const ergebnis: JournalAusAufrufstelle[] = []
  const scriptKind = relativerPfad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(relativerPfad, quelltext, ts.ScriptTarget.Latest, true, scriptKind)

  const besuchen = (knoten: ts.Node): void => {
    if (istJournalAusAufruf(knoten)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(knoten.getStart(sourceFile))
      const grundArgument = knoten.arguments[1]
      const grund = grundArgument !== undefined && ts.isStringLiteralLike(grundArgument) ? grundArgument.text : null
      ergebnis.push({
        datei: relativerPfad,
        zeile: line + 1,
        grund,
        kategorie: grund === null ? null : kategorieVon(grund),
      })
    }
    ts.forEachChild(knoten, besuchen)
  }
  besuchen(sourceFile)

  return ergebnis
}

/** Alle `journalAus(...)`-Aufrufstellen unter `src/`, ohne die Definition in kontext.ts selbst. */
export function journalAusAufrufstellen(): readonly JournalAusAufrufstelle[] {
  const ergebnis: JournalAusAufrufstelle[] = []

  for (const datei of alleQuelldateien(SRC_WURZEL)) {
    const relativerPfad = posixPfad(relative(REPO_WURZEL, datei))
    if (relativerPfad === DEFINITIONS_DATEI_POSIX) {
      continue
    }

    const quelltext = readFileSync(datei, 'utf8')
    ergebnis.push(...journalAusAufrufeAusQuelltext(relativerPfad, quelltext))
  }

  return ergebnis
}
