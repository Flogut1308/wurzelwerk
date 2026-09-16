---
description: Die Phase-1-Kette AP-1.1 bis AP-1.5 am Stück durchlaufen (Auto-Merge bei grüner CI)
argument-hint: [start-ap, z.B. 1.3a — leer = ab dem obersten offenen]
model: sonnet
---

Du bist **Kettenführer**, nicht Umsetzer. Du schreibst in diesem Lauf **keinen Produktivcode**.
Pakete der Reihe nach an Subagents geben, nach jedem Paket die Gates prüfen, anhalten wenn
etwas nicht stimmt.

**Der Ablauf je Paket ist identisch mit `.claude/commands/nachzug.md`, Abschnitt „Je Paket —
dieselben neun Schritte".** Lies ihn einmal und wende ihn unverändert an — inklusive des
Rot-Beleg-Rezepts (Schritt 4, `mechaniker` im separaten Worktree), des PR-B-Musters für den
geschützten Prüfpfad und der Berichtsdisziplin. Diese Datei sagt nur, was in Phase 1 **anders**
ist. Zwei Fassungen desselben Ablaufs wären zwei Wahrheiten.

**Kontext ist die knappste Ressource.** Hol dir aus jedem Subagent nur die drei Ergebniszeilen
für den Laufplan zurück — keine Diffs, keine Dateiinhalte, keine Testausgaben außer der letzten
Zusammenfassungszeile. Lies selbst nur: diesen Befehl, den genannten Abschnitt aus `nachzug.md`,
`../Wissen/58_Laufplan.md` (Abschnitt „Phase 1"), und pro Paket dessen AP-Abschnitt in
`../Wissen/57_Phase0_Arbeitspakete.md`.

## Vorbereitung (einmal)

1. `nvm use` (Node 22 — eine andere Version lässt `pnpm grenzen` hart abbrechen).
2. `git switch main && git pull`.
3. `gh pr list --state open` — offene PRs zuerst klären. Eine Kette auf divergentem `main` ist wertlos.
4. `pnpm pruefe` muss **vor** dem ersten Paket grün sein.
5. Lies die **„Vorentscheidungen für den Kettenlauf (Phase 1)"** in `57` (direkt vor AP-1.1)
   einmal vollständig. Sie beantworten die Fragen, an denen der `planer` sonst pro Paket anhält.
   Widerspricht ein Plan einer Vorentscheidung, ist das ein Abbruchgrund, kein Spielraum.

## Reihenfolge

**AP-1.1 → AP-1.2 → AP-1.3a → AP-1.3b → AP-1.4a → AP-1.5 (+PR-B). Danach ANHALTEN.**

Nicht in der Kette, bewusst:

- **AP-1.4b** (Importansichten S-10…S-13) läuft **nach AP-1.6**, auf den Atomen und Molekülen aus
  `71` §2. Die Schnittentscheidung in `57` nennt den Grund: eine Oberfläche vor der
  Bausteinbibliothek müsste danach nachgezogen werden.
- **AP-1.6 und AP-1.7** laufen einzeln über `/ap`. Dort entscheidet ein Blick, kein Gate — eine
  Kette liefert dort Bildschirme, die grün sind und trotzdem falsch aussehen.

## Modellrouting — pro Paket, nicht pro Rolle

| Paket | `planer` | `hueter` | Warum |
|---|---|---|---|
| 1.1, 1.2 | sonnet | sonnet | Reiner Kern, dichte Testtabellen, fast-check-Invarianten. Ein Fehler scheitert laut an einem Gate. |
| 1.3a | **opus** | sonnet | JSON-Schema ≡ Zod: eine zu weite Zusage fällt nie auf — dieselbe Klasse wie AP-0.20. |
| 1.3b | sonnet | sonnet | Neun Fehlerfixtures gegen neun IMP-Codes; jede Regel wird einmal rot gesehen. |
| 1.4a | sonnet | sonnet | Klar umrissen; der kanonische Abzug vor/nach ist ein hartes Kriterium. |
| 1.5 (+PR-B) | **opus** | **opus** | Erste echte Daten, Schnappschuss-Rücknahme, Journal-Zweig — und die Invariante `trockenlauf-gleich-import` im geschützten Prüfpfad, mit adversarialer Mutationsprobe. |
| Mechanisches | `mechaniker` (haiku) | — | Doku-Abgleich `Wissen/` ↔ `docs/`, Laufplan-Einträge, Gate-Ausgaben zusammenfassen. |

## Zusätzliche Abbruchgründe (über `nachzug.md` hinaus)

- **Eine Migration entsteht.** Phase 1 braucht keine: Schema v1 deckt sie ab, `import_lauf` und
  `import_herkunft` stehen seit `0002_kern.sql` (Z. 648/662). Entsteht doch eine, halte an — das
  ist der teuerste Fehlerfall (Byte-Identität der Prüfsummen) und keine Kettenarbeit.
- **Ein Paket will `src/renderer` anfassen**, obwohl sein AP-Abschnitt das nicht vorsieht.
  Oberfläche vor AP-1.6 ist eine Entscheidung, keine Umsetzung.
- **Ein Plan will i18next nach `src/core` holen** (AP-1.1, Formatierer). Die Vorentscheidung
  sagt: `{ schluessel, werte }` zurückgeben, `t()` im Renderer. `core-darf-nichts` gewinnt.
- **Eine zweite neue Abhängigkeit.** Genau eine ist vorgesehen: `ajv` als `devDependency` in
  1.3a. Jede weitere hält an (`CLAUDE.md` §4).

Sonst gilt die vollständige Abbruchliste aus `nachzug.md`.

## Nach dem letzten Paket der Kette

Kein `/abnahme` — das ist der Phase-0-Abschluss. Stattdessen: Laufplan nachziehen (Board eine
Zeile je Paket, Volltext nach `58a_Ergebnisse.md`), den Stand in fünf Zeilen melden, und darauf
hinweisen, dass als Nächstes **AP-1.6 einzeln über `/ap`** ansteht — mit dem Design-Fundament als
Grundlage.
