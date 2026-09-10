/** Schichtgrenzen aus 55_Architektur.md §1.1 / ADR-021 als CI-Regel (AP-0.1). */
module.exports = {
  forbidden: [
    {
      name: 'core-darf-nichts',
      severity: 'error',
      comment:
        'src/core ist reines TypeScript und darf nur sich selbst importieren — kein Node, kein Electron, kein React, kein SQL.',
      from: { path: '^src/core' },
      to: { pathNot: '^src/core' },
    },
    {
      name: 'shared-darf-nur-core',
      severity: 'error',
      comment:
        'src/shared darf nur src/core importieren (IPC-Vertrag, Fehlertypen, Zod-Schemata) ' +
        '+ zod selbst (Laufzeitprüfung für die Schemata in src/shared/schemata/, AP-0.6).',
      from: { path: '^src/shared' },
      to: { pathNot: '^(src/core|src/shared)|node_modules/zod/' },
    },
    {
      name: 'main-darf-nicht-renderer-oder-preload',
      severity: 'error',
      comment: 'src/main darf core und shared importieren, aber nicht renderer oder preload.',
      from: { path: '^src/main' },
      to: { path: '^src/(renderer|preload)' },
    },
    {
      name: 'renderer-darf-nicht-main-oder-preload',
      severity: 'error',
      comment:
        'src/renderer darf core und shared importieren, aber nicht main oder preload — der Renderer sieht keine Datenbank.',
      from: { path: '^src/renderer' },
      to: { path: '^src/(main|preload)' },
    },
    {
      name: 'preload-darf-nur-shared',
      severity: 'error',
      comment:
        'src/preload darf nur src/shared importieren (+ electron selbst — contextBridge/ipcRenderer kommen von dort, 55_Architektur.md §2.1).',
      from: { path: '^src/preload' },
      to: { pathNot: '^(src/shared|src/preload)|node_modules/electron/' },
    },
    {
      name: 'kein-better-sqlite3-ausserhalb-main',
      severity: 'error',
      comment:
        'better-sqlite3 gehört ausschließlich src/main — der Renderer sieht keine Datenbank (CLAUDE.md §2.1).',
      from: { pathNot: '^src/main' },
      to: { path: 'node_modules/better-sqlite3' },
    },
    {
      name: 'kein-electron-ausserhalb-main-preload',
      severity: 'error',
      comment: 'Der Renderer läuft sandboxed und darf electron nicht importieren (55_Architektur.md §2.1).',
      from: { pathNot: '^src/(main|preload)' },
      to: { path: 'node_modules/electron' },
    },
    {
      name: 'no-circular-core',
      severity: 'error',
      comment: 'src/core bleibt zyklusfrei — sonst sind Golden-/Property-Tests nicht mehr verlässlich reproduzierbar.',
      from: { path: '^src/core' },
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Ein Import, der sich nicht auflösen lässt, ist immer ein Fehler (Tippfehler, fehlende Abhängigkeit).',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
        theme: {
          graph: { rankdir: 'TD' },
        },
      },
    },
  },
}
