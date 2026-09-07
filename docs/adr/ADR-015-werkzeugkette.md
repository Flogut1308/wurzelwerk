## ADR-015 — Werkzeugkette

**Status:** entschieden (23.08.2026, Standardentscheidungen von Claude getroffen)

**Entscheidung:** pnpm · electron-vite · electron-builder · better-sqlite3 · Zod · Zustand +
TanStack Query · i18next · Vitest + fast-check + Playwright · dependency-cruiser · electron-log.
Node 22 LTS. Versionsangaben nur in `package.json`, nicht in den Konzeptdokumenten.

**Begründung, nach Gewicht:**
1. **pnpm** löst strikt auf: ein Paket, das nicht in `package.json` steht, ist nicht importierbar. npm erlaubt das stillschweigend — und ein Phantomimport ist ein Fehler, der erst auf einem anderen Rechner auffällt.
2. **electron-vite** bringt die drei Bauziele (Hauptprozess, Preload, Renderer) vorkonfiguriert mit. Verworfen: Electron Forge mit Webpack (mehr Konfiguration, langsamer), reines Vite (Preload-Bau muss man selbst bauen).
3. **better-sqlite3** ist synchron, transaktionsfest und hat die beste Trainingsdatenlage. Verworfen: `node:sqlite` (zu jung, Electrons Node-Version hinkt nach), sql.js/WASM (kein echter Dateizugriff), Prisma/Drizzle — ein ORM verdeckt genau das SQL, das hier durchdacht sein muss, und beide kämpfen mit generierten Triggern.
4. **Zod** liefert aus einer Definition Typ **und** Laufzeitprüfung. Der IPC-Rand und der Importvertrag brauchen beides.
5. **dependency-cruiser** macht die Schichtgrenzen aus ADR-021 zu einer CI-Regel statt zu einer Absichtserklärung.

**Konsequenzen:** better-sqlite3 ist ein nativer Modul und muss gegen die Electron-ABI gebaut
werden (`electron-builder install-app-deps` im postinstall). Nach jedem Electron-Versionssprung
ist ein `pnpm install` nötig; die Fehlermeldung bei Vergessen (`NODE_MODULE_VERSION`) ist
irreführend und steht darum in `CLAUDE.md` §3.
