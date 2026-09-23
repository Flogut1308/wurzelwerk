## ADR-029 — Der generierte abl-Triggerblock wandert in die jüngste Migration

**Status:** entschieden (Nutzer, 23.09.2026, im Zuge AP-1.33)

**Kontext:** `pnpm trigger` (`skripte/trigger-generieren.ts`) erzeugt zwei Trigger-Familien
(55_Architektur.md §5.2, §4.4 „Trigger werden erzeugt, nicht geschrieben"):

1. Die `jrn_*`-Journal-Trigger — geschrieben in die **eigenständige**, nicht nummerierte Datei
   `docs/schema/trigger_generiert.sql`, die nach jeder Migrationsschleife neu angewendet wird
   (`journal-trigger-anwenden.ts`). Sie trägt keine Prüfsumme und darf jederzeit neu erzeugt
   werden.
2. Die `abl_*`-Trigger für die abgeleiteten Daten (`person_flach`, `suche_fts`,
   `name_phonetik`) — bisher **eingebettet zwischen Markierungskommentaren in
   `docs/schema/0003_abgeleitet.sql`**, der Migration, die diese abgeleiteten Tabellen einführt.

Das war unproblematisch, solange sich das Quellmodell der Projektion (`name`) nicht änderte.
AP-1.33 zerlegt `name` in `name_form`/`name_part` und **droppt `name`**. Damit müssen die
`abl_name_*`-Trigger durch `abl_name_form_*`/`abl_name_part_*` ersetzt werden — der generierte
Block ändert sich also. Ein Neu-Erzeugen in `0003` verbietet CLAUDE.md §6 ausnahmslos: eine
angewendete Migration wird nie geändert (auch kein Kommentar), sonst verhindert die veränderte
Prüfsumme in `registrierung.ts` das Öffnen echter Projektdateien.

**Entscheidung:** Das Ziel des `abl_*`-Blocks (`ZIEL_DATEI` in `trigger-generieren.ts`) wandert
von `0003_abgeleitet.sql` auf die **jeweils jüngste Migration** — bei AP-1.33 auf
`docs/schema/0006_namensformen.sql`. Der Generator schreibt den vollständigen `abl_*`-Block
zwischen die Marker `-- @generierte-trigger-anfang` / `-- @generierte-trigger-ende` **dieser**
Datei. Die alten `abl_*`-Trigger aus `0003` werden nicht dort geändert, sondern in `0006`
kontrolliert ersetzt: `DROP TABLE name` entfernt `abl_name_*` automatisch; die übrigen
`abl_person_*`/`abl_aussage_*`/`abl_ortsname_*`/`abl_zitat_*` (deren Rümpfe `name` lasen) werden
über eine `DROP TRIGGER IF EXISTS …`-Präambel im generierten Block neu gesetzt.

**Warum das die §6-Zusicherung nicht verletzt, sondern präzisiert:**
- `0003` bleibt **byte-identisch** und behält seine Prüfsumme. Eine mit Schema ≤ 5 angelegte
  Projektdatei migriert weiterhin über das unveränderte `0003`; `0006` baut darauf auf.
- Der generierte Block ist **reine Funktion der Projektions-Bausteine**
  (`abgeleitet-projektion.ts`) — derselbe Text, den `src/main/datenbank/trigger.ts` für den
  Laufzeit-Neuaufbau nutzt (Bitgleichheits-Garantie aus AP-0.7). Ein Test sichert, dass der Block
  in der jüngsten Migration mit `generierterTriggerBlock()` übereinstimmt (Driftschutz).
- „Trigger werden erzeugt, nicht von Hand geschrieben" gilt unverändert; nur der **Ablageort** des
  erzeugten `abl`-Blocks folgt jetzt der Migrationsspitze statt fix auf `0003` zu zeigen.

**Regel für künftige Migrationen, die die Projektion berühren:** Wer das Quellmodell einer
abgeleiteten Tabelle ändert, legt in seiner neuen Migration eine Marker-Region an, setzt
`ZIEL_DATEI` auf diese Datei und lässt `pnpm trigger` den Block dort einfüllen. `0003` (und jede
frühere Migration) wird nie wieder Ziel des Generators.

**Folgen:**
- `test/schema/`/`test/migration/` und `registrierung.ts` (Prüfsumme der jüngsten Migration)
  wandern schema-bedingt mit `src/` im selben PR (ADR-025-Nachträge AP-0.7/AP-0.25) — hier
  zusätzlich der generierte `abl`-Block in der Migrationsdatei selbst.
- Der Determinismus des Blocks (alphabetische Tabellensortierung, reine Bausteine) bleibt Pflicht,
  damit der Driftschutz-Vergleich reproduzierbar ist (ADR-005/023).

**Verweis:** CLAUDE.md §6 (Migrationen nur vorwärts, angewandte Migration nie ändern), §5.2/§4.4
(Trigger werden erzeugt), AP-1.33 (Namensmodell zerlegen), ADR-025 (geschützter Prüfpfad).
