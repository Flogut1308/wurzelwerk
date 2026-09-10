// AP-0.14 PR-A: Gegenprobe für die Determinismus-/SQL-Ort-Regeln aus `eslint.config.js`
// (`src/core/**` Block A, `src/main/**` Block B). Nutzt die ESLint-API mit SYNTHETISCHEN
// `filePath`s — die Dateien existieren nicht auf der Platte, `lintText` schreibt nichts. So lässt
// sich die tatsächliche, geladene Konfiguration prüfen statt einer Abschrift der Regeln.
import { describe, expect, it, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'

const REPO_WURZEL = resolve(__dirname, '../..')

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ overrideConfigFile: resolve(REPO_WURZEL, 'eslint.config.js') })
})

async function ruleIdsFuer(code: string, filePath: string): Promise<readonly (string | null | undefined)[]> {
  const [ergebnis] = await eslint.lintText(code, { filePath: resolve(REPO_WURZEL, filePath) })
  if (!ergebnis) {
    throw new Error('eslint.lintText hat kein Ergebnis geliefert.')
  }
  return ergebnis.messages.map((m) => m.ruleId)
}

describe('src/core: Determinismus-Regeln (CLAUDE.md §4)', () => {
  it('Math.random() ist verboten', async () => {
    const ruleIds = await ruleIdsFuer('export const x = Math.random()\n', 'src/core/__verletzung_random__.ts')
    expect(ruleIds).toContain('no-restricted-properties')
  })

  it('Date.now() ist verboten', async () => {
    const ruleIds = await ruleIdsFuer('export const x = Date.now()\n', 'src/core/__verletzung_datenow__.ts')
    expect(ruleIds).toContain('no-restricted-properties')
  })

  it('new Date() ist verboten', async () => {
    const ruleIds = await ruleIdsFuer('export const x = new Date()\n', 'src/core/__verletzung_newdate__.ts')
    expect(ruleIds).toContain('no-restricted-syntax')
  })

  it('process ist verboten', async () => {
    const ruleIds = await ruleIdsFuer('export const x = process.cwd()\n', 'src/core/__verletzung_process__.ts')
    expect(ruleIds).toContain('no-restricted-globals')
  })

  it('Node-Importe sind verboten', async () => {
    const ruleIds = await ruleIdsFuer("import 'fs'\n", 'src/core/__verletzung_import__.ts')
    expect(ruleIds).toContain('no-restricted-imports')
  })
})

describe('src/main: SQL nur in repositories/abfragen/datenbank/journal-kontext (CLAUDE.md §2)', () => {
  it('db.prepare() außerhalb der Allowlist ist verboten', async () => {
    const code = "declare const db: { prepare: (sql: string) => unknown }\ndb.prepare('SELECT 1')\n"
    const ruleIds = await ruleIdsFuer(code, 'src/main/befehle/__verletzung_sql__.ts')
    expect(ruleIds).toContain('no-restricted-syntax')
  })

  it('db.prepare() in src/main/repositories/ ist erlaubt (Allowlist)', async () => {
    const code = "declare const db: { prepare: (sql: string) => unknown }\ndb.prepare('SELECT 1')\n"
    const ruleIds = await ruleIdsFuer(code, 'src/main/repositories/__ok_sql__.ts')
    expect(ruleIds).not.toContain('no-restricted-syntax')
  })
})
