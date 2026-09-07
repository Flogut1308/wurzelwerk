# Wurzelwerk

Lokale Desktop-Anwendung (Windows + macOS) zur Erfassung, Verknüpfung, Analyse und Darstellung
eines genealogischen Datenbestands. Kein Login, keine Cloud, keine Serverabhängigkeit.

**Stack:** Electron · TypeScript · React · SQLite (better-sqlite3). Details und Begründungen in
[`docs/architektur.md`](docs/architektur.md) und [`docs/adr/`](docs/adr/).

## Voraussetzungen

- Node 22 LTS (siehe `.nvmrc`)
- pnpm über corepack (`corepack enable && corepack prepare pnpm@latest --activate`)

## Erste Schritte

```bash
pnpm install
pnpm dev
```

## Befehle

Vollständige Liste und Begründung in [`CLAUDE.md`](CLAUDE.md) §3.

```bash
pnpm dev            # Electron im Entwicklungsmodus mit Hot-Reload
pnpm pruefe         # typen + lint + grenzen + test — vor jedem Commit
pnpm test:e2e       # Playwright gegen die gebaute App
pnpm build          # Paket für die aktuelle Plattform
```

## Arbeitsweise

Entwickelt wird vollständig agentisch, arbeitspaketweise, nach
[`docs/arbeitspakete.md`](docs/arbeitspakete.md). Verhaltensregeln für das Repository stehen in
[`CLAUDE.md`](CLAUDE.md) — vor jeder Änderung lesen.
