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

/** Alle `journalAus(...)`-Aufrufstellen unter `src/`, ohne die Definition in kontext.ts selbst. */
export function journalAusAufrufstellen(): readonly JournalAusAufrufstelle[] {
  const ergebnis: JournalAusAufrufstelle[] = []

  for (const datei of alleQuelldateien(SRC_WURZEL)) {
    const relativerPfad = posixPfad(relative(REPO_WURZEL, datei))
    if (relativerPfad === DEFINITIONS_DATEI_POSIX) {
      continue
    }

    const quelltext = readFileSync(datei, 'utf8')
    const scriptKind = datei.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(datei, quelltext, ts.ScriptTarget.Latest, true, scriptKind)

    const besuchen = (knoten: ts.Node): void => {
      if (ts.isCallExpression(knoten) && ts.isIdentifier(knoten.expression) && knoten.expression.text === 'journalAus') {
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
  }

  return ergebnis
}
