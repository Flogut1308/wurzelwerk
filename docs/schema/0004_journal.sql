-- Journal-Migration 0004 (AP-0.8, 55_Architektur.md §4.3, ADR-017). Fügt die
-- `journal_kontext`-Singleton-Zeile ein, die in `docs/schema/0001_grundgeruest.sql` (bereits
-- angewendete Migration, wird nicht mehr geändert) fehlt. `0001_grundgeruest.sql` deklariert
-- `aktiv INTEGER NOT NULL DEFAULT 0` - der DEFAULT-Wert ist dort bewusst 0 (keine Zeile vorhanden,
-- also kein Trigger scharf, solange 0004 nicht gelaufen ist). Diese Migration legt die einzige
-- Zeile (`id = 1`) explizit mit `aktiv = 1` an ("scharfer Ruhezustand", 55_Architektur.md §4.3) und
-- überschreibt damit den DEFAULT der Spalte - ab hier ist das Journal einsatzbereit, sobald
-- `src/main/datenbank/migration/laeufer.ts` im Anschluss die `jrn_*`-Trigger anwendet
-- (`src/main/datenbank/journal-trigger-anwenden.ts`, `docs/schema/trigger_generiert.sql`).

INSERT INTO journal_kontext (id, transaktion_id, aktiv) VALUES (1, NULL, 1);
