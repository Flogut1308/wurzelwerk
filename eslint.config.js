const tseslint = require('typescript-eslint')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const globals = require('globals')

module.exports = tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
      // Fixtures verletzen Architekturgrenzen absichtlich (test/grenzen/verletzungen.test.ts
      // prüft sie über die dependency-cruiser-API, nicht über ESLint).
      'test/grenzen/fixtures/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // Sichtbare Texte gehören nur in src/renderer/i18n/ (ADR-011, §4). `noAttributeStrings`
      // bleibt bei ihrem Default `false`, damit Attribute wie `role="alert"` weiter erlaubt sind —
      // nur Text-Kindknoten in JSX sollen auffallen.
      'react/jsx-no-literals': 'error',
    },
    settings: { react: { version: 'detect' } },
  },
  // CLAUDE.md §4 / §2: src/core ist reines TypeScript und bleibt deterministisch — kein
  // Math.random, kein Date.now, kein new Date(), kein process/globalThis, kein Node/Electron/
  // React/SQL-Import. dependency-cruiser (.dependency-cruiser.cjs) setzt die Import-Grenze
  // bereits autoritativ durch; die no-restricted-imports-Regel hier ist Tiefenverteidigung
  // (schnelleres Feedback im Editor, gleiche Aussage).
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random() ist in src/core verboten (ADR-005/009, Determinismus für Golden-/Property-Tests).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Date.now() ist in src/core verboten (ADR-005/009, Determinismus für Golden-/Property-Tests).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() ist in src/core verboten (ADR-005/009, Determinismus).',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Date() ist in src/core verboten (ADR-005/009, Determinismus).',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'process ist in src/core verboten (CLAUDE.md §4 — reine Funktionen bleiben rein).' },
        { name: 'globalThis', message: 'globalThis ist in src/core verboten (CLAUDE.md §4 — reine Funktionen bleiben rein).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'react', 'react-dom', 'better-sqlite3', 'fs', 'path', 'os', 'crypto', 'node:*'],
              message:
                'src/core ist reines TypeScript und darf kein Node/Electron/React/SQL importieren (CLAUDE.md §2). ' +
                'Maßgeblich ist dependency-cruiser (.dependency-cruiser.cjs) — diese Regel ist Tiefenverteidigung.',
            },
          ],
        },
      ],
    },
  },
  // CLAUDE.md §2 Regel 4: Nur src/main/repositories/, src/main/abfragen/ und die benannten
  // Ausnahmen src/main/datenbank/** (Migration/Trigger/Integrität/Abzug/VACUUM) sowie
  // src/main/journal/kontext.ts (Journal-Armierung) schreiben SQL. `db.prepare`/`db.exec`
  // außerhalb dieser Orte ist ein Lint-Fehler.
  {
    files: ['src/main/**/*.ts'],
    ignores: ['src/main/repositories/**', 'src/main/abfragen/**', 'src/main/datenbank/**', 'src/main/journal/kontext.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='prepare']",
          message:
            'db.prepare() nur in src/main/repositories/, src/main/abfragen/, src/main/datenbank/ oder ' +
            'src/main/journal/kontext.ts (ADR-021, CLAUDE.md §2).',
        },
        {
          selector: "CallExpression[callee.object.name=/^(db|tx)$/][callee.property.name='exec']",
          message:
            'db.exec()/tx.exec() nur in src/main/repositories/, src/main/abfragen/, src/main/datenbank/ oder ' +
            'src/main/journal/kontext.ts (ADR-021, CLAUDE.md §2).',
        },
      ],
    },
  },
)
