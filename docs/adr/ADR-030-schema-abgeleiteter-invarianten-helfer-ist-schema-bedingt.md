## ADR-030 — Schema-abgeleitete Prüfpfad-Helfer sind schema-bedingt geschützt, nicht „immer"

**Status:** entschieden (Nutzer, 23.09.2026, im Zuge AP-1.33)

**Kontext:** ADR-025 sperrt `test/invarianten/` hart: ein PR, der eine Datei dort (direkt oder
als indirekt importierter Helfer, `ermittleIndirektGeschuetzteHelfer()`) zusammen mit
Produktivcode unter `src/` ändert, gilt als unzulässige Vermischung und wird von
`skripte/pruefpfad-pruefen.ts` blockiert (`process.exit`, CI-Gate `ci.yml`). Der Grund
(ADR-025 §1): die Loop soll eine Invariante nicht dadurch grün bekommen, dass sie den Maßstab
im selben Atemzug aufweicht.

Nicht jede vom Prüfpfad (direkt oder als indirekt importierter Helfer) erfasste Datei ist aber
eine Zusicherung. Drei sind reine **Eingabe-/Fixture-Bauer**, deren Inhalt eine Ableitung des
Schemas ist und die keine Aussage über ein Ergebnis treffen:

- `test/invarianten/_journal-minimalzeilen.ts` — liefert je **journalisierter** Tabelle die
  minimal gültige INSERT-Zeile. Ein `never`-Zweig erzwingt per Compile-Fehler, dass die Datei
  `JOURNALISIERT` (`src/main/journal/journalisierung.ts`) vollständig abbildet.
- `test/invarianten/_modell-abgeleitet.ts` — der fast-check-Generator für `abgeleitet-gleich`.
  Sein Kopfkommentar hält ausdrücklich fest: „er behauptet nichts über das Ergebnis, das tut
  ausschließlich die Testdatei selbst." Er fügt nur Basisdaten (`person`, `name_form`/`name_part`,
  `aussage`, `ort`, …) über rohes, schema-gebundenes SQL ein. Die eigentliche Zusicherung
  (trigger-gepflegte abgeleitete Tabellen **==** `alleAbgeleitetenNeuAufbauen()`, Produktivcode)
  steht in `abgeleitet-gleich.test.ts` und bleibt unverändert.
- `test/hilfsmittel/fixture-bauen.ts` — der gemeinsame, deterministische Bauer des Fixture-Korpus
  (`baueFixture`, AP-0.12). Über den Import aus `test/invarianten/fixture-gesund.test.ts` ist er
  indirekt „immer" geschützt. Er beschreibt einen Testbaum deklarativ und schreibt ihn ins Schema
  (Namen jetzt als `name_form`+`name_part`); er trifft keine Aussage über ein Ergebnis.

AP-1.33 zerlegt `name` in `name_form`/`name_part` (Migration 0006) und entfernt `name` per
`DROP TABLE`. Beide Helfer fuhren rohes `INSERT INTO name` bzw. einen `case 'name'` — sie MÜSSEN
sich in derselben Migration mitziehen, sonst laufen sie gegen eine nicht mehr existierende
Tabelle. Mit der ausnahmslosen „immer"-Sperre hätte jede Migration, die eine journalisierte
Basistabelle umbaut, das Prüfpfad-Gate ausgelöst: ein Widerspruch zwischen ADR-025 und dem
normalen Migrationsablauf.

**Warum das kein Reward-Hacking-Risiko ist:**
- Die Änderungen sind **mechanisch gegen das Schema nachvollziehbar** — genau die Eigenschaft,
  mit der ADR-025 bereits `test/schema/`, `test/migration/` und die Migrations-Prüfsumme als
  „schema-bedingt" führt (zulässig mit Produktivcode nur, wenn eine `docs/schema/00NN_*.sql` im
  selben Vergleich steckt). Eine umgebaute Basistabelle ⇒ ein umgebautes INSERT; die
  Eins-zu-eins-Entsprechung ist im Review sichtbar.
- Keine der beiden Änderungen berührt eine **Zusicherung** (kein `expect`/`toEqual`/`toThrow` im
  Diff, verifiziert). `_modell-abgeleitet.ts` speist nur Basisdaten — **beide** Vergleichsseiten
  von `abgeleitet-gleich` (inkrementelle Trigger vs. voller Neuaufbau) lesen dieselben
  `name_part`-Zeilen, ein geänderter Generator kann darum keinen Trigger-Bug maskieren. Genau
  dieser Invariantenlauf hat in AP-1.33 zwei echte Produktivbugs gefangen (fehlende
  FTS-Normalform-Pflege in `abl_name_part_*`; `chk_name_form_hauptname_*`-Abbruch beim Löschen),
  die in **Produktivcode** behoben wurden, nicht durch Anpassen der Tests.

**Entscheidung:** `skripte/pruefpfad-pruefen.ts` bekommt neben `BILDVERGLEICH_AUSNAHME` (ADR-028)
eine zweite, eng begrenzte Ausnahme `SCHEMA_ABGELEITETE_PRUEFPFAD_HELFER` — eine Menge **exakter
Pfade** (kein Präfix-Muster), heute die drei oben genannten Dateien. Sie werden aus dem
„immer"-Modus herausgenommen und als **schema-bedingt** geführt: sie dürfen mit `src/` im selben
PR wandern **nur**, wenn der Vergleich eine Migrationsdatei enthält; ohne Migration bleiben sie
gesperrt.

**Was ausnahmslos „immer" geschützt bleibt:**
- Jede Invarianten-**Zusicherung** (`*.test.ts`) und jeder Helfer, der eine Erwartung
  formuliert oder das unabhängige Vergleichs-Orakel bildet — z. B. `_befehlsfolge-generator.ts`
  (Undo-Bitgleichheit) und die `expect`-Seite von `abgeleitet-gleich.test.ts`. AP-1.33 ändert
  keine davon; `_befehlsfolge-generator.ts` fährt weiter die flache Brücke `name.*` (die
  granularen `namensform.*`-Befehle kommen mit AP-1.30) und musste gar nicht angefasst werden.
- `test/golden/` außerhalb `bilder/` (ADR-028).

**Abgrenzung:** Ein künftiges Paket, das einen Schreibbefehl **umbenennt/entfernt** und dadurch
`_befehlsfolge-generator.ts` ändern muss, ist ein eigener Fall mit eigener Begründung — diese
Entscheidung gibt ihn ausdrücklich NICHT frei. Die Ausnahmemenge wächst nur um eine konkret
benannte Datei, wenn erneut nachgewiesen ist, dass sie ein schema-abgeleiteter Eingabe-Bauer ohne
Zusicherung ist.

**Folgen:**
- Ein `test/einheit/pruefpfad-pruefen.test.ts`-Fall deckt beide Richtungen ab (mit Migration
  zulässig, ohne Migration gesperrt) für die benannten Dateien.
- Die Kontrolle über die Änderung liegt weiter beim hueter-Review je PR (adversarial): der
  Reviewer prüft die Schema-Entsprechung Zeile für Zeile und dass keine Zusicherung mitwandert.

**Verweis:** ADR-025 (geschützter Prüfpfad, Reward-Hacking-Schutz), ADR-028 (Sichtbaselines-
Ausnahme in derselben Datei), AP-1.33 (Namensmodell zerlegen, Migration 0006), CLAUDE.md §13.
