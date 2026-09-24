// AP-1.34 A2c, hueter-H1 (PR #115): `undo(db, optionen)` braucht im gepackten Build ausdrücklich
// `schemaBasis` und `appVersion` — die Import-Rücknahme migriert die zurückkopierte Datei, und
// `pruefeAngewendeteMigrationenPruefsummen` liest dafür die Migrations-SQL (auch bei einem No-op
// für einen Schnappschuss ≥v7). Ohne Optionen fällt `undo()` auf `standardSchemaBasis()` (`cwd`)
// zurück — unter Vitest stimmt das, im Paket nicht. Kein Laufzeittest sieht diesen Unterschied,
// darum sichert dieser statische Scan die Verdrahtung: jeder Aufruf der aus `journal/undo`
// importierten Funktion `undo` unter `src/` übergibt als zweites Argument ein Objektliteral mit
// `schemaBasis` und `appVersion`.
//
// AST-basiert wie der `journalAus`-Scanner (`test/invarianten/_journal-aufrufer.ts`), aber mit
// Import-Auflösung: gesucht wird die lokale Bindung aus dem Import von `.../journal/undo` (auch
// `undo as x` und `import * as ns`), nicht der wörtliche Name — ein `undo`, das aus einem anderen
// Modul kommt, zählt nicht. Jede Referenz auf die Bindung, die KEIN direkter Aufruf ist (z. B.
// `const f = undo`), ist ein Fund: sie wäre für den Scan unverfolgbar.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const REPO_WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_WURZEL = join(REPO_WURZEL, 'src')

/** Das Modul, dessen `undo` gemeint ist (Repo-relativ, ohne Endung). */
const UNDO_MODUL = 'src/main/journal/undo'
const PFLICHT_EIGENSCHAFTEN = ['schemaBasis', 'appVersion'] as const

interface UndoAufruf {
  readonly datei: string
  readonly zeile: number
  /** Leer = korrekt verdrahtet; sonst die Gründe. */
  readonly maengel: readonly string[]
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

/** `true`, wenn `spezifizierer` (relativ zu `relativerPfad`) auf `UNDO_MODUL` zeigt. */
function zeigtAufUndoModul(relativerPfad: string, spezifizierer: string): boolean {
  if (!spezifizierer.startsWith('.')) {
    return false
  }
  const aufgeloest = posix.normalize(posix.join(posix.dirname(relativerPfad), spezifizierer)).replace(/\.(ts|js)$/, '')
  return aufgeloest === UNDO_MODUL || aufgeloest === `${UNDO_MODUL}/index`
}

function eigenschaftsName(eigenschaft: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(eigenschaft) || ts.isShorthandPropertyAssignment(eigenschaft)) && ts.isIdentifier(eigenschaft.name)) {
    return eigenschaft.name.text
  }
  if (ts.isPropertyAssignment(eigenschaft) && ts.isStringLiteral(eigenschaft.name)) {
    return eigenschaft.name.text
  }
  return null
}

function maengelDesAufrufs(aufruf: ts.CallExpression): readonly string[] {
  if (aufruf.arguments.length !== 2) {
    return [`erwartet 2 Argumente, gefunden ${String(aufruf.arguments.length)}`]
  }
  const optionen = aufruf.arguments[1]
  if (optionen === undefined || !ts.isObjectLiteralExpression(optionen)) {
    return ['zweites Argument ist kein Objektliteral']
  }
  const namen = new Set(optionen.properties.map(eigenschaftsName))
  return PFLICHT_EIGENSCHAFTEN.filter((name) => !namen.has(name)).map((name) => `Eigenschaft "${name}" fehlt`)
}

/** Alle Aufrufe (und unverfolgbaren Referenzen) von `undo` aus `UNDO_MODUL` in einem Quelltext. */
function undoAufrufeAusQuelltext(relativerPfad: string, quelltext: string): readonly UndoAufruf[] {
  const scriptKind = relativerPfad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const quelle = ts.createSourceFile(relativerPfad, quelltext, ts.ScriptTarget.Latest, true, scriptKind)

  const direkteNamen = new Set<string>()
  const namensraumNamen = new Set<string>()
  const importBezeichner = new Set<ts.Node>()
  for (const anweisung of quelle.statements) {
    if (!ts.isImportDeclaration(anweisung) || !ts.isStringLiteral(anweisung.moduleSpecifier)) {
      continue
    }
    if (!zeigtAufUndoModul(relativerPfad, anweisung.moduleSpecifier.text)) {
      continue
    }
    const bindungen = anweisung.importClause?.namedBindings
    if (bindungen === undefined) {
      continue
    }
    if (ts.isNamespaceImport(bindungen)) {
      namensraumNamen.add(bindungen.name.text)
      continue
    }
    for (const element of bindungen.elements) {
      const importiert = (element.propertyName ?? element.name).text
      if (importiert === 'undo' && !element.isTypeOnly) {
        direkteNamen.add(element.name.text)
        importBezeichner.add(element.name)
      }
    }
  }

  const ergebnis: UndoAufruf[] = []
  const melden = (knoten: ts.Node, maengel: readonly string[]): void => {
    const { line } = quelle.getLineAndCharacterOfPosition(knoten.getStart(quelle))
    ergebnis.push({ datei: relativerPfad, zeile: line + 1, maengel })
  }

  const besuchen = (knoten: ts.Node): void => {
    // Referenz auf die Bindung: `undo` (direkt/alias) oder `ns.undo` (Namensraum).
    const istReferenz =
      (ts.isIdentifier(knoten) && direkteNamen.has(knoten.text) && !importBezeichner.has(knoten) && !ts.isPropertyAccessExpression(knoten.parent)) ||
      (ts.isPropertyAccessExpression(knoten) &&
        ts.isIdentifier(knoten.expression) &&
        namensraumNamen.has(knoten.expression.text) &&
        knoten.name.text === 'undo')
    if (istReferenz) {
      const eltern = knoten.parent
      if (ts.isCallExpression(eltern) && eltern.expression === knoten) {
        melden(eltern, maengelDesAufrufs(eltern))
      } else {
        melden(knoten, ['Referenz ohne direkten Aufruf (für den Scan unverfolgbar)'])
      }
      return
    }
    ts.forEachChild(knoten, besuchen)
  }
  besuchen(quelle)
  return ergebnis
}

function undoAufrufeInSrc(): readonly UndoAufruf[] {
  const ergebnis: UndoAufruf[] = []
  for (const datei of alleQuelldateien(SRC_WURZEL)) {
    const relativerPfad = posixPfad(relative(REPO_WURZEL, datei))
    if (relativerPfad === `${UNDO_MODUL}.ts`) {
      continue // die Definition selbst
    }
    ergebnis.push(...undoAufrufeAusQuelltext(relativerPfad, readFileSync(datei, 'utf8')))
  }
  return ergebnis
}

describe('Produktiv-Aufrufer von undo() übergeben Schema-Basis und App-Version (AP-1.34, hueter-H1)', () => {
  it('genau die zwei bekannten Aufrufer, jeder mit { schemaBasis, appVersion }', () => {
    const aufrufe = undoAufrufeInSrc()
    // Nicht leer grün: ohne Fund wäre die Verdrahtung ungeprüft.
    expect(aufrufe.map((aufruf) => aufruf.datei).sort()).toEqual(['src/main/ipc/registrierung.ts', 'src/main/menue/menue.ts'])
    for (const aufruf of aufrufe) {
      expect(aufruf.maengel, `${aufruf.datei}:${String(aufruf.zeile)}`).toEqual([])
    }
  })
})

describe('Selbstprüfung des undo-Scanners', () => {
  const PFAD = 'src/main/ipc/probe.ts'

  it('erkennt einen Aufruf ohne Optionen', () => {
    const treffer = undoAufrufeAusQuelltext(PFAD, "import { undo } from '../journal/undo'\nundo(db)\n")
    expect(treffer).toEqual([{ datei: PFAD, zeile: 2, maengel: ['erwartet 2 Argumente, gefunden 1'] }])
  })

  it('erkennt fehlende Eigenschaften und Nicht-Literale', () => {
    const treffer = undoAufrufeAusQuelltext(
      PFAD,
      "import { undo } from '../journal/undo'\nundo(db, { schemaBasis: s })\nundo(db, optionen)\nundo(db, { schemaBasis, appVersion: v })\n",
    )
    expect(treffer.map((t) => t.maengel)).toEqual([['Eigenschaft "appVersion" fehlt'], ['zweites Argument ist kein Objektliteral'], []])
  })

  it('löst Alias- und Namensraum-Importe auf und meldet unverfolgbare Referenzen', () => {
    const treffer = undoAufrufeAusQuelltext(
      PFAD,
      [
        "import { undo as zurueck } from '../journal/undo'",
        "import * as journal from '../journal/undo'",
        'zurueck(db)',
        'journal.undo(db)',
        'const f = zurueck',
      ].join('\n'),
    )
    expect(treffer.map((t) => [t.zeile, t.maengel])).toEqual([
      [3, ['erwartet 2 Argumente, gefunden 1']],
      [4, ['erwartet 2 Argumente, gefunden 1']],
      [5, ['Referenz ohne direkten Aufruf (für den Scan unverfolgbar)']],
    ])
  })

  it('ignoriert ein gleichnamiges undo aus einem anderen Modul', () => {
    expect(undoAufrufeAusQuelltext(PFAD, "import { undo } from '../anderes/undo'\nundo(db)\n")).toEqual([])
  })
})
