## ADR-028 — Bildvergleich-Baselines außerhalb des harten Prüfpfads

**Status:** entschieden (Nutzer, 19.09.2026)

**Kontext:** ADR-025 schützt `test/invarianten/`, `test/golden/` und (schema-bedingt)
`test/schema/`/`test/migration/` hart: ein PR, der einen dieser Pfade zusammen mit
Produktivcode unter `src/` ändert, gilt als unzulässige Vermischung und wird von
`skripte/pruefpfad-pruefen.ts` blockiert (Reward-Hacking-Schutz — die Loop soll eine Prüfung
nicht dadurch grün bekommen, dass sie den Maßstab selbst aufweicht).

AP-1.25 legte die Bildvergleich-Referenzbilder (`test/e2e/bildvergleich.spec.ts` +
`test/golden/bilder/*.png`, s. `docs/80_Offene_Fragen.md` Abschnitt 22) unter `test/golden/`
ab — genau dem Ordner, den ADR-025 ausnahmslos sperrt. AP-1.25 selbst rührte `src/` nicht an,
daher feuerte das Gate dort noch nicht. Die geplante Oberflächen-Kette (`kette-ui.md` §3.3)
sieht aber vor, dass ein Paket einen **bestehenden** Bildschirm ändert und dabei sein
Referenzbild **bewusst erneuert** (`pnpm bilder:erneuern`) — `src/`-Änderung und PNG-Änderung
im selben PR sind dort der Normalfall, kein Ausnahmefall. Mit der ursprünglichen, ausnahmslosen
Sperre hätte jedes solche Paket das Prüfpfad-Gate ausgelöst: ein Widerspruch zwischen ADR-025
und dem vorgesehenen Kettenablauf.

**Warum das kein Reward-Hacking-Risiko ist:** Ein Referenzbild ist keine unabhängige
Fachprüfung wie eine Invariante (Zyklusfreiheit, Bitgleichheit von Undo) oder ein
Layout-Golden (berechnete Koordinaten aus `src/core/layout/`). Es ist eine **Sichtbaseline** —
ein Abzug dessen, wie ein Bildschirm im Moment der Aufnahme aussieht. Ändert sich die
Oberfläche legitim, MUSS die Baseline mitziehen, sonst ist das Bildvergleichs-Gate nach dem
ersten UI-Paket dauerhaft rot, unabhängig davon, ob die Änderung richtig ist. Die Kontrolle
gegen eine unbemerkte Verschlechterung liegt hier nicht im Gate, sondern davor: das
hueter-Review pro PR (`kette-ui.md` §3.3, dritte Abnahmebedingung: „Sieht jetzt anders aus"
ist keine Begründung) und der Nutzerblick an den Kette-Checkpoints (`kette-ui.md`
„Am Checkpoint"). Ein Bild, das sich ändert, ohne dass das Paket es erklären kann, ist dort
explizit ein Abbruchgrund.

**Entscheidung:** `test/golden/bilder/**` wird aus der harten Schutzmenge in
`skripte/pruefpfad-pruefen.ts` ausgenommen (`BILDVERGLEICH_AUSNAHME`,
`/^test\/golden\/bilder\//`). Konkret reduziert diese Ausnahme nur den `test/golden/`-Treffer
in `istImmerGeschuetzt`; `ermittleIndirektGeschuetzteHelfer()` (AST-Scan der `.ts`/`.tsx`-Importe
aus den drei Schutz-Wurzeln) bleibt unverändert — PNGs werden dort ohnehin nie erreicht, da der
Scan nur `import`/`export … from`-Spezifizierer verfolgt.

**Was ausnahmslos geschützt bleibt:**
- `test/golden/` außerhalb von `bilder/` (Layout-/Logik-Goldens, sobald sie ab Phase 2 entstehen)
- `test/invarianten/`
- `test/schema/`, `test/migration/`, `src/main/datenbank/migration/registrierung.ts`
  (unverändert schema-bedingt, s. ADR-025-Nachträge AP-0.7/AP-0.25)

Diese bleiben hart, weil sie Fachverhalten unabhängig vom geprüften Code festschreiben — ihre
Änderung lässt sich nicht mechanisch gegen eine begleitende Datei nachvollziehen (anders als
`test/schema` gegen eine Migrationsdatei) und nicht durch einen Blick auf ein Bild bewerten.

**Folgen:**
- Ein Oberflächenpaket darf `src/` und ein erneuertes `test/golden/bilder/*.png` im selben PR
  ändern, wie `kette-ui.md` §3.3 es vorsieht — das Prüfpfad-Gate blockiert das nicht mehr.
- Die Kontrolle über Bildbaselines verschiebt sich vollständig auf Review + Checkpoint. Ein
  automatisiertes Gate für „ist diese Bildänderung gerechtfertigt" gibt es bewusst nicht (das
  wäre wieder eine Prüfung, die eine Loop optimieren könnte) — das ist eine explizite
  Abweichung vom Reward-Hacking-Grundsatz aus ADR-025 §1, begründet durch das nicht
  automatisierbare fachliche Urteil "sieht das noch richtig aus".
- Ein PR, der `test/golden/bilder/**` löscht statt erneuert (statt eines Diffs ein Fehlen),
  bleibt ein Abbruchgrund für den `hueter` (`kette-ui.md`, „Zusätzliche Abbruchgründe") — das
  regelt diese Ausnahme nicht technisch, sondern weiterhin über Review.

**Verweis:** ADR-025 (Reward-Hacking-Schutz, geschützter Prüfpfad), `kette-ui.md` §3.3,
`docs/80_Offene_Fragen.md` Abschnitt 22 (U-1.25-baseline-mitwandern).
