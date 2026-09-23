---
description: Ein Arbeitspaket nach Laufplan umsetzen (mit Checkpoints)
argument-hint: [ap-nummer]
model: opus
---
Lies ../Wissen/58_Laufplan.md und nimm AP-$0 (oder den obersten offenen). Lies den
AP-Abschnitt in ../Wissen/57_Phase0_Arbeitspakete.md + genau die dort genannten Doc-Abschnitte + ../Wissen/CLAUDE.md.
Routing: Planung/Schema/geschützter Prüfpfad -> planer (opus); normale Umsetzung ->
umsetzer (opus); Mechanisches -> mechaniker (haiku); Review -> hueter (opus).
opus = aktuelles Opus-Modell (Stand 23.09.2026: Opus 5.5). Beim Agent-Aufruf KEIN sonnet-Override.
1) Plan via planer. VARIANTE A: HALTE AN, zeig den Plan, warte auf "weiter".
2) Branch ap/$0-<kurz>. Erst den roten Test, dann der Fix (CLAUDE.md §5).
   ROT-BELEG (via mechaniker, nicht via umsetzer): Basisstand + nur die neuen Testdateien,
   Rot-Befehl aus dem Plan laufen lassen, FEHLSCHLAG erwarten. Ausgabe in den PR-Rumpf.
     BASIS=$(git merge-base main HEAD); ARBEIT=$(mktemp -d); git worktree add -q "$ARBEIT" "$BASIS"
     for f in $(git diff --name-only "$BASIS" HEAD -- 'test/**'); do
       mkdir -p "$ARBEIT/$(dirname "$f")"; git show "HEAD:$f" > "$ARBEIT/$f"; done
     cd "$ARBEIT" && <Rot-Befehl>   # danach: git worktree remove "$ARBEIT" --force
   Grün statt rot = der Test fängt den Befund nicht -> ANHALTEN.
   (Nicht anwendbar, wenn der Befund in CI-Konfiguration statt Code liegt - dann zählt der
   absichtlich rote CI-Lauf, den ein Mensch ansieht.)
   Dann via umsetzer bauen; schnelle Gates (pnpm typen lint grenzen test) grün;
   PR gegen main; hueter-Review.
3) /usage ausgeben; Laufplan nachziehen — EINE Board-Zeile (Status, PR/Commit, ein Satz)
   in ../Wissen/58_Laufplan.md, Volltext (Entscheidungen, Auflagen, Funde) nach
   ../Wissen/58a_Ergebnisse.md. Nicht beides ins Board: das liest jede Session zuerst.
   Dann STOPP.
Offene Entscheidung -> nicht raten (CLAUDE.md §12): anhalten oder Punkt in ../Wissen/80 /
ADR in ../Wissen/60.
