---
description: Ein Arbeitspaket nach Laufplan umsetzen (mit Checkpoints)
argument-hint: [ap-nummer]
model: sonnet
---
Lies ../Wissen/58_Laufplan.md und nimm AP-$0 (oder den obersten offenen). Lies den
AP-Abschnitt in ../Wissen/57_Phase0_Arbeitspakete.md + genau die dort genannten Doc-Abschnitte + ../Wissen/CLAUDE.md.
Routing: Planung/Schema/geschützter Prüfpfad -> planer (opus); normale Umsetzung ->
umsetzer (sonnet); Mechanisches -> mechaniker (haiku); Review -> hueter (opus).
1) Plan via planer. VARIANTE A: HALTE AN, zeig den Plan, warte auf "weiter".
2) Branch ap/$0-<kurz>; via umsetzer bauen; schnelle Gates (pnpm typen lint grenzen test)
   grün; PR gegen main; hueter-Review.
3) /usage ausgeben; 3 Zeilen Ergebnis in ../Wissen/58_Laufplan.md; dann STOPP.
Offene Entscheidung -> nicht raten (CLAUDE.md §12): anhalten oder Punkt in ../Wissen/80 /
ADR in ../Wissen/60.
