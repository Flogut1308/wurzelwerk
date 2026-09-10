// AP-0.14 PR-A: Gegenprobe für `.dependency-cruiser.cjs` — jede Regel aus dem echten Regelsatz
// bekommt genau eine Fixture unter `test/grenzen/fixtures/src/...`, die GENAU DIESE Regel
// verletzt. Der Test lädt den echten `forbidden`-Regelsatz (kein kopierter/abgeschriebener) und
// ruft `dependency-cruiser` (v18) programmatisch über die `cruise()`-API auf.
//
// Mechanik (per Spike empirisch geprüft, siehe AP-0.14-Auftrag): `cruise()` nimmt `baseDir` als
// Teil der zweiten Funktionsargumente (`ICruiseOptions.baseDir`, NICHT der dritten
// Resolve-Options) entgegen. Mit `baseDir: <abs. Pfad zu test/grenzen/fixtures>` löst
// dependency-cruiser die gecruisten Pfade relativ dazu auf — die `^src/...`-Anker aus der echten
// Regeldatei greifen dadurch unverändert auf die Fixtures. Ein Regelanker-Rewrite (Fallback aus
// dem Auftrag) war NICHT nötig. `validate: true` muss zusätzlich gesetzt werden, sonst bleiben
// `dependencies[].rules` und `summary.violations` leer, auch wenn ein `ruleSet` übergeben wurde.
// `doNotFollow: { path: 'node_modules' }` verhindert, dass dependency-cruiser die inneren
// require()-Graphen von better-sqlite3/electron selbst durchquert (das erzeugt sonst dutzende
// Zusatztreffer für dieselbe Regel und macht die Zählung der Fixture-Treffer unzuverlässig).
import { describe, expect, it, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { cruise } from 'dependency-cruiser'
import type { IForbiddenRuleType } from 'dependency-cruiser'

interface DependencyCruiserKonfiguration {
  readonly forbidden: readonly IForbiddenRuleType[]
}

interface Verstoss {
  readonly type: string
  readonly from: string
  readonly to: string
  readonly rule: { readonly name: string; readonly severity: string }
}

interface CruiseJsonAusgabe {
  readonly summary: { readonly violations: readonly Verstoss[] }
}

const require = createRequire(import.meta.url)
const REPO_WURZEL = resolve(__dirname, '../..')
const FIXTURES_WURZEL = resolve(REPO_WURZEL, 'test/grenzen/fixtures')

let violations: readonly Verstoss[] = []

beforeAll(async () => {
  // Der ECHTE Regelsatz aus der Wurzel-Konfiguration, nicht eine Kopie im Test. `require()` ist
  // laut @types/node mit Rückgabetyp `any` deklariert — die Zielannotation an der Konstante reicht
  // hier aus, ein `as`-Cast ist nicht nötig (keine Zod-Prüfung möglich/nötig: dies ist eine
  // CommonJS-Projektkonfigurationsdatei, keine Nutzereingabe über eine IPC-Grenze).
  const konfiguration: DependencyCruiserKonfiguration = require(resolve(REPO_WURZEL, '.dependency-cruiser.cjs'))

  const ergebnis = await cruise(['src'], {
    baseDir: FIXTURES_WURZEL,
    validate: true,
    // dependency-cruiser erwartet ein mutables Array; `konfiguration.forbidden` bleibt selbst
    // `readonly` (Vertragstyp), hier wird nur eine Kopie für den API-Aufruf angelegt.
    ruleSet: { forbidden: [...konfiguration.forbidden] },
    outputType: 'json',
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  })

  // `outputType: 'json'` liefert laut dependency-cruiser immer eine Zeichenkette; JSON.parse()
  // ist mit Rückgabetyp `any` deklariert, daher reicht die Zielannotation, kein `as`-Cast nötig.
  const ausgabe: CruiseJsonAusgabe = typeof ergebnis.output === 'string' ? JSON.parse(ergebnis.output) : ergebnis.output
  violations = ausgabe.summary.violations
})

function verstossFuer(datei: string, regel: string): Verstoss | undefined {
  return violations.find((v) => v.from === datei && v.rule.name === regel)
}

describe('dependency-cruiser: jede Regel hat eine treffende Fixture', () => {
  it.each([
    ['src/core/nutzt-node.ts', 'core-darf-nichts'],
    ['src/shared/importiert-main.ts', 'shared-darf-nur-core'],
    ['src/main/importiert-renderer.ts', 'main-darf-nicht-renderer-oder-preload'],
    ['src/renderer/importiert-main.ts', 'renderer-darf-nicht-main-oder-preload'],
    ['src/preload/importiert-core.ts', 'preload-darf-nur-shared'],
    ['src/renderer/nutzt-sqlite.ts', 'kein-better-sqlite3-ausserhalb-main'],
    ['src/renderer/nutzt-electron.ts', 'kein-electron-ausserhalb-main-preload'],
    ['src/main/nutzt-unaufloesbar.ts', 'not-to-unresolvable'],
  ])('%s verletzt %s', (datei, regel) => {
    expect(verstossFuer(datei, regel)).toBeDefined()
  })

  it('zirkulaer-a.ts/zirkulaer-b.ts verletzen no-circular-core', () => {
    const zyklusVerstoss = violations.find(
      (v) => v.rule.name === 'no-circular-core' && (v.from === 'src/core/zirkulaer-a.ts' || v.from === 'src/core/zirkulaer-b.ts'),
    )
    expect(zyklusVerstoss).toBeDefined()
  })

  it('genau ein Verstoß je Fixture — keine unerwarteten Zusatztreffer', () => {
    expect(violations).toHaveLength(9)
  })
})
