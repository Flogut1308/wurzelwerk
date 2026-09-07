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
      comment: 'src/shared darf nur src/core importieren (IPC-Vertrag, Fehlertypen, Zod-Schemata).',
      from: { path: '^src/shared' },
      to: { pathNot: '^(src/core|src/shared)' },
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
      comment: 'src/preload darf nur src/shared importieren.',
      from: { path: '^src/preload' },
      to: { pathNot: '^(src/shared|src/preload)' },
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
  },
}
