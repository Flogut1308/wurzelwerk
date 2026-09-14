---
description: Die Nachzug-Kette AP-0.16 bis AP-0.25 am Stück durchlaufen (Auto-Merge bei grüner CI)
argument-hint: [start-ap, z.B. 0.16 — leer = ab dem obersten offenen]
model: sonnet
---

Du bist **Kettenführer**, nicht Umsetzer. Du schreibst in diesem Lauf **keinen Produktivcode**.
Deine Aufgabe ist: Pakete der Reihe nach an Subagents geben, nach jedem Paket die Gates prüfen,
und die Kette anhalten, wenn etwas nicht stimmt.

**Kontext ist die knappste Ressource.** Zehn Pakete passen nicht in ein Fenster. Hol dir aus jedem
Subagent **nur** die drei Ergebniszeilen für den Laufplan zurück — keine Diffs, keine Dateiinhalte,
keine Testausgaben außer der letzten Zusammenfassungszeile. Lies selbst nur: diesen Befehl,
`../Wissen/58_Laufplan.md` (Abschnitt „Nachzug"), und pro Paket dessen AP-Abschnitt in
`../Wissen/57_Phase0_Arbeitspakete.md`. Nicht die ganze Datei.

## Vorbereitung (einmal)

1. `nvm use` (Node 22 — eine andere Version lässt `pnpm grenzen` hart abbrechen).
2. `git switch main && git pull` — arbeite nie auf einem veralteten Stand.
3. `gh pr list --state open` — offene PRs zuerst klären. Eine Kette auf divergentem `main` ist wertlos.
4. `pnpm pruefe` muss **vor** dem ersten Paket grün sein. Ist sie rot, halte an: die Kette repariert Befunde, nicht einen kaputten Ausgangszustand.
5. Lies die „Vorentscheidungen für den Kettenlauf" in `57` einmal. Sie ersparen dem `planer` pro Paket eine Runde.
6. Die CI läuft seit 14.09.2026 **einmal** je PR (Trigger auf `main` + `pull_request`). Siehst du zwei Läufe pro Push, ist der Branch älter als diese Änderung — rebasen.

## Modellrouting — pro Paket, nicht pro Rolle

Opus kostet ein Vielfaches von Sonnet. Er verdient sich seinen Platz dort, wo ein Fehler still
bleibt: Byte-Identität, Typverträge, geschützter Prüfpfad. Bei einer CI-YAML tut er es nicht.

| Paket | `planer` | `hueter` | Warum |
|---|---|---|---|
| 0.16, 0.18, 0.19, 0.22, 0.23 | sonnet | sonnet | Klar umrissen, je ein roter Test, Fehler scheitern laut an einem Gate. |
| 0.17 | **opus** | **opus** | Byte-Identität der Migrationsprüfsummen — ein Fehler macht jede bestehende Projektdatei unöffenbar, und keine CI sieht es (sie kennt nur frische Datenbanken). |
| 0.20 | **opus** | sonnet | Typkarte über einen IPC-Vertrag; ein zu weiter Typ fällt nie auf. |
| 0.21, 0.24 | **opus** | **opus** | Geschützter Prüfpfad mit Mutationsprobe (PR-B). |
| 0.25 | sonnet | sonnet | Werkzeugarbeit; jede Regel wird ohnehin einmal rot gesehen. |
| Mechanisches | `mechaniker` (haiku) | — | Doku-Abgleich `Wissen/` ↔ `docs/`, Laufplan-Einträge, Gate-Ausgaben zusammenfassen. |

Du selbst (der Kettenführer) läufst auf Sonnet: du routest und prüfst Gates, das Urteilsvermögen
sitzt in `planer` und `hueter`. Schreib keinen Code und lies keine Diffs.

## Reihenfolge

AP-0.16 → 0.17 → 0.18 → 0.19 → 0.20 → 0.21 (+PR-B) → 0.22 → 0.23 → 0.24 (+PR-B) → 0.25.

Mit `$0` startest du bei diesem Paket statt am Anfang. **AP-0.26 gehört nicht in die Kette** —
optional, läuft einzeln über `/ap 0.26`.

## Je Paket — dieselben neun Schritte, keine Abkürzung

1. **Plan** via `planer` (Modell s. Tabelle oben). Kein Produktivcode. Der Plan nennt Dateien, Vorgehen, Tests, Risiken — und den **Rot-Befehl samt erwarteter Fehlermeldung** für Schritt 4. **Nicht anhalten** für Freigabe — das ist der Unterschied zu `/ap`. Widerspricht der Plan einer Vorentscheidung aus `57`, ist das ein Abbruchgrund, kein Spielraum.
2. **Branch** `ap/<id>-<kurz>`, von aktuellem `main`.
3. **Rot sehen.** Zuerst den Test schreiben, der den Befund zeigt, und ihn **laufen lassen**. Läuft er grün, ist entweder der Test falsch oder der Befund nicht da — beides hält die Kette an. Die rote Ausgabe kommt in die Ergebniszeilen. Das ist `CLAUDE.md` §5, die einzige Regel, deren Verletzung Arbeit rückgängig macht.
4. **Rot maschinell belegen** via `mechaniker` (haiku) — **nicht** der `umsetzer`, der den Test geschrieben hat. Ablauf:

   ```bash
   BASIS=$(git merge-base main HEAD)
   ARBEIT=$(mktemp -d) && git worktree add -q "$ARBEIT" "$BASIS"
   for f in $(git diff --name-only "$BASIS" HEAD -- 'test/**'); do
     mkdir -p "$ARBEIT/$(dirname "$f")" && git show "HEAD:$f" > "$ARBEIT/$f"
   done
   cd "$ARBEIT" && <Rot-Befehl aus dem Plan>     # erwartet: FEHLSCHLAG
   ```

   Also: der Produktivstand **vor** dem Fix, aber mit den neuen Testdateien. Der Plan aus Schritt 1
   nennt dazu zwei Dinge — den **Rot-Befehl** und die **erwartete Fehlermeldung**. Beides gehört in
   den PR-Rumpf, mitsamt der tatsächlichen Ausgabe.

   Der Rot-Befehl ist nicht immer `pnpm test`: bei AP-0.20 ist es `pnpm typen`, und die erwartete
   Meldung lautet `Unused '@ts-expect-error' directive`. Läuft der Befehl **grün**, fängt der Test
   den Befund nicht — Kette anhalten. Bricht er ab, weil ein Helfer im Basisstand fehlt, ist der
   Beleg ebenfalls nicht erbracht: dann gehört der Helfer mit in den Rot-Lauf.

   **Ausnahme AP-0.16**, ehrlich benannt: dessen Befund liegt in der CI-Konfiguration, nicht im
   Code — hier zählt allein der absichtlich rote CI-Lauf aus dem Paket, und den sieht ein Mensch an.
   Bei jedem anderen Paket ist dieser Schritt Pflicht.

   Aufräumen nicht vergessen: `git worktree remove "$ARBEIT" --force`.

5. **Bauen** via `umsetzer` (sonnet). Kleine Commits, jeder mit grünem `pnpm pruefe`. Den geschützten Prüfpfad NICHT anfassen.
6. **Schnelle Gates** lokal: `pnpm typen && pnpm lint && pnpm grenzen && pnpm test`.
7. **PR** gegen `main`, Titel `AP-<id>: <Kurzname>`, Rumpf mit `Betrifft: <Anforderungs-IDs>`.
8. **CI-Gate.** `gh pr checks <nr> --watch`. Gemergt wird **nur**, wenn alle drei grün sind: `pruefen (macos-latest)`, `pruefen (windows-latest)`, `langsame Gates (test:e2e, test:budget)`. Fehlt einer dieser drei Namen in der Ausgabe, ist das ein Abbruchgrund — nicht „vermutlich noch nicht gelaufen".
9. **Review** via `hueter` (opus) gegen den PR-Diff. „FREIGABE MIT AUFLAGEN" heißt: Auflagen abarbeiten, CI erneut abwarten, erneut prüfen lassen. Erst dann mergen.

Danach: `gh pr merge <nr> --squash --delete-branch`, `git switch main && git pull`, dann den
Laufplan nachziehen — **Board und Archiv getrennt**: eine Zeile mit Status ✅, PR/Commit und
einem Satz Ergebnis in `../Wissen/58_Laufplan.md`; der Volltext (Entscheidungen, Auflagen,
Funde) nach `../Wissen/58a_Ergebnisse.md`. Nicht beides ins Board — das liest jede Session
zuerst. Diesen Schritt gibst du dem `mechaniker` (haiku). Dann das nächste Paket.

## Geschützter Prüfpfad (AP-0.21 und AP-0.24)

Beide haben einen **PR-B**. Der wird erst **nach dem Merge von PR-A** von frischem `main` gebrancht
und enthält **ausschließlich** Dateien aus `test/invarianten/`. Niemals zusammen mit Produktivcode
— das CI-Gate `pruefpfad-pruefen.ts` weist es ab, und `pnpm pruefe` lokal sieht es nicht.
Routing: `planer` statt `umsetzer`, und der `hueter` läuft hier als **adversariales** Gate mit
Mutationsprobe (`CLAUDE.md` §13 erlaubt dafür ausdrücklich den zweiten Lauf statt eines Menschen):
mindestens eine Mutation im geprüften Produktivcode muss die neue Invariante rot machen. Tut sie
das nicht, ist die Invariante leer und die Kette hält an.

## Wann du anhältst — vollständige Liste

Halte an, schreibe den Stand in `58_Laufplan.md`, sag in drei Sätzen was los ist, und warte.

- `hueter` blockiert, oder eine Auflage lässt sich nicht ohne Architekturentscheidung erfüllen.
- CI zweimal in Folge rot am selben Commit. **Einmal** rot darf ein Rerun sein (`gh run rerun --failed`) — Windows-Flakes sind bei euch belegt, `test/migration/historisch.test.ts` mit 5000 ms Timeout. Ein Rerun, der grün wird, kommt als Flake in den Laufplan; ein zweiter roter Lauf nicht.
- Der Rot-Beleg aus Schritt 4 schlägt fehl: der Befehl läuft grün, oder er bricht aus einem anderen Grund ab als der erwarteten Meldung.
- Eine Entscheidung fehlt, die **nicht** in den Vorentscheidungen steht und Datenmodell, Invariante oder Architekturgrenze berührt (`CLAUDE.md` §12.3). Eintrag nach `../Wissen/80_Offene_Fragen.md`, dann anhalten.
- Ein Paket braucht mehr als ~10 Dateien oder hat kein einzelnes grünes Testkriterium — dann ist der Zuschnitt falsch (§12.4).
- Der `pruefpfad-pruefen.ts`-Schritt in der CI weist einen PR ab.
- Eine Migration entsteht, die keine Fixture-Datenbank für die Vorgängerversion mitbringt.

## Nach dem letzten Paket

Rufe `/abnahme` auf. Die Kette ist **nicht** fertig, wenn AP-0.25 gemergt ist — sie ist fertig,
wenn die Abnahme durch ist.

## Berichtsdisziplin

Nach jedem Paket **eine** Nachricht an mich, höchstens fünf Zeilen: Paket, PR-Nummer,
Merge-Commit, was rot war und jetzt grün ist, Auffälligkeiten. Kein Zwischenstand während eines
Pakets. Bei Abbruch stattdessen: was, warum, was du brauchst.
