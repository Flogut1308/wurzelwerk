# Wurzelwerk — Prompts für Claude Code (agentische Umsetzung)

**Stand:** 07.09.2026 · **Für:** Claude Code / Cowork, nativ auf dem Mac im Repo `wurzelwerk`.
**Grundlage:** `57_Phase0_Arbeitspakete.md` (was), `CLAUDE.md` (wie), ADR-015/021/012/009/025 in `60_Technik_ADR.md`.

Analog zu `74_Prompts_Claude_Design.md`, aber für die Codestrecke: **pro Arbeitspaket ein Startprompt, ein Chat.** Entwickelt wird agentisch in Loops mit den Guardrails aus ADR-025 (geschützter Prüfpfad, gestufte Gates, Windows im Feedback, Doku als Wahrheit).

---

## Vorbereitung — einmal

1. **Das GitHub-Repo besteht bereits:** `https://github.com/Flogut1308/wurzelwerk.git`. Claude Code klont es und richtet die Werkzeugkette selbst ein (Schritt 0 im Prompt) — du musst nichts vorbereiten.
2. Alles liegt unter `~/Claude/Projects/Ahnenforschung/`: die Konzeptdokumente in `Wissen/`, das geklonte Repo in `wurzelwerk/` (siehe Schritt 0). Kein zweiter Ordner daneben (E49).
3. Claude Code auf dem Mac aus `~/Claude/Projects/Ahnenforschung/` starten und den Prompt unten einfügen.

---

## AP-0.1 — Repository, Werkzeugkette, CI

*Der erste Lauf. Erzeugt das leere, aber vollständig armierte Repo. Läuft in einem leeren Ordner `~/Claude/Projects/Ahnenforschung/wurzelwerk`; der Konzeptordner liegt daneben unter `../Wissen`.*

```
Kontext: Wurzelwerk ist eine lokale Desktop-App für Ahnenforschung (Electron +
TypeScript + React + SQLite, offline, kein Konto). Konzeption, Architektur und
Designvorbereitung sind abgeschlossen; die Dokumente im Nachbarordner
../Wissen sind die Wahrheit. Entwickelt wird vollständig agentisch in Loops
mit Tests/Gates (ADR-025).

Deine Aufgabe: AP-0.1 — Repository, Werkzeugkette, CI aus
../Wissen/57_Phase0_Arbeitspakete.md. NUR dieses Paket. Kein Anwendungscode
über das leere Fenster hinaus, kein Schema, keine Fachlogik.

Schritt 0 — Preflight (führe das selbst aus, keine Handarbeit für mich):
- Klone das Repo nach ~/Claude/Projects/Ahnenforschung/wurzelwerk, falls noch nicht vorhanden, und
  arbeite darin:
      git clone https://github.com/Flogut1308/wurzelwerk.git ~/Claude/Projects/Ahnenforschung/wurzelwerk
  Der Konzeptordner liegt daneben unter ../Wissen.
- Stelle die Werkzeugkette sicher: Node 22 LTS (per Versionsmanager, falls nötig),
  pnpm über corepack (corepack enable && corepack prepare pnpm@latest --activate) und
  die GitHub-CLI gh. Prüfe die Anmeldung mit gh auth status; ist sie nicht
  eingerichtet, HALTE AN und sag mir das — ich melde mich an, du erfindest keine
  Zugangsdaten.
- Prüfe mit gh, dass origin auf Flogut1308/wurzelwerk zeigt, das Repo privat ist und
  main der Standardzweig ist. Weicht etwas ab, nenn es mir; ändere die Sichtbarkeit
  nicht eigenmächtig.

Lies zuerst, in dieser Reihenfolge:
- ../Wissen/00_INDEX.md (Status, Entscheidungen)
- ../Wissen/57_Phase0_Arbeitspakete.md, Abschnitt AP-0.1 (Auftrag, Umfang,
  Abnahme, Tests)
- ../Wissen/CLAUDE.md (Architekturgrenzen, TypeScript-Regeln, Befehle,
  Testpflicht, agentische Guardrails §13)
- ../Wissen/60_Technik_ADR.md: ADR-015 (Werkzeugkette), ADR-021
  (Schichtgrenzen), ADR-012 (CI/Windows), ADR-009 + ADR-025 (Qualität + Loop-Guardrails)
- ../Wissen/55_Architektur.md §1-3 (Ordnerstruktur, Schichten)

Dann umsetzen, Umfang genau nach AP-0.1:
1. package.json mit der Werkzeugkette aus ADR-015 (pnpm, electron-vite,
   electron-builder, better-sqlite3, Zod, Zustand + TanStack Query, i18next,
   Vitest + fast-check + Playwright, dependency-cruiser, electron-log; Node 22 LTS)
   und den Skripten aus CLAUDE.md §3 (dev typen lint grenzen test test:e2e
   test:budget trigger schema:dump pruefe build).
2. tsconfig.json + tsconfig.core.json — strict plus noUncheckedIndexedAccess,
   exactOptionalPropertyTypes, noImplicitOverride. tsconfig.core.json enthält KEIN
   "DOM" in lib und KEINE @types/node, sodass `import fs from 'fs'` in src/core/ ein
   Typfehler ist (Abnahmekriterium).
3. electron.vite.config.ts, electron-builder.yml, eslint.config.js,
   vitest.config.ts, .dependency-cruiser.cjs mit den Schichtregeln aus ADR-021
   (core->nichts, shared->core, main/renderer->core+shared, preload->nur shared),
   .gitignore, README.md.
4. CLAUDE.md aus ../Wissen/CLAUDE.md übernehmen; docs/ mit Kopien der
   Konzeptdokumente anlegen, benannt wie in CLAUDE.md §1 referenziert
   (55->architektur.md, 50->datenmodell.md, 40->anforderungen.md,
   56->import-vertrag.md, 57->arbeitspakete.md, 60->adr/, 80->offene-fragen.md);
   die übrigen Konzeptdokumente als Kopie mitnehmen.
5. Grundgerüst der fünf src/-Wurzeln (leer bzw. Platzhalter) und ein leeres Fenster,
   das „Wurzelwerk" anzeigt.
6. .github/workflows/ci.yml nach ADR-012 UND ADR-025:
   - schnelle Gates (pnpm typen lint grenzen test) bei jedem Push;
   - Matrix macos-latest UND windows-latest, beide grün, je ein Paket (pnpm build)
     als Artefakt; unter Windows Screenshots der Hauptansicht als Artefakt
     (Baseline-Gate vorbereiten);
   - langsame Gates (test:e2e, test:budget) als eigener Job/Torwächter, nicht im
     schnellen Pfad;
   - den Prüfpfad (test/invarianten, test/golden, test/schema) als geschützten
     Bereich kennzeichnen (CODEOWNERS oder ein Prüf-Skript, das Teständerungen im
     selben PR wie Produktivcode markiert).
7. Tests: ein trivialer Vitest-Test in test/einheit/, damit die Suite belegt läuft;
   pnpm grenzen grün auf leerem src/; im CI EINMAL absichtlich eine verbotene
   Importzeile einfügen, das Rot der „grenzen"-Regel zeigen, wieder entfernen — eine
   Regel, deren Rot man nie gesehen hat, ist nicht bewiesen.

Abnahme (aus AP-0.1), alle müssen erfüllt sein:
- pnpm dev öffnet ein Fenster auf macOS.
- pnpm pruefe läuft durch.
- Ein Push löst die CI aus; sie läuft auf macOS UND Windows grün und legt für beide
  ein Paket als Artefakt ab.
- tsconfig.core.json: kein DOM, kein @types/node.
- Repo ist privat, main ist Standardzweig.

Verbindliche Regeln (CLAUDE.md):
- Architekturgrenzen aus §2 gelten ab der ersten Datei; pnpm grenzen setzt sie durch.
- strict: true, kein any, kein as ohne Begründung in derselben Zeile, kein !.
- Fachbegriffe deutsch, Technik englisch.
- Keine neuen Abhängigkeiten über die Werkzeugkette hinaus ohne Rückfrage.
- Sichtbare Texte über i18n, nicht als Literal.
- Determinismus in core (kein Math.random/Date.now).

Vorgehen: Zeig mir ZUERST einen Plan — welche Dateien du anlegst, welche Versionen du
für die Werkzeugkette wählst, und wie der CI-Workflow schnelle/langsame Gates trennt.
Erst nach meiner Zustimmung umsetzen. Danach EIN Commit pro Schritt, deutsche
Betreffzeile im Imperativ (<bereich>: <was>), jeder Commit mit grünem pnpm pruefe.
Am Ende: Push, CI grün auf beiden Systemen, dann Chat beenden.

Nicht: Anwendungslogik. Nicht: Schema. Nicht: den Stack ändern.
```

*Danach: AP-0.2 (Anwendungsgerüst, IPC-Hülle, Fehlertypen, Protokoll) im nächsten Chat — ein Paket, ein Chat, jeweils denselben Aufbau (lesen → Plan → Zustimmung → Commit je Schritt → grünes `pnpm pruefe`). Die Reihenfolge steht in `57_Phase0_Arbeitspakete.md` und ist eine Abhängigkeitskette, kein Vorschlag.*
