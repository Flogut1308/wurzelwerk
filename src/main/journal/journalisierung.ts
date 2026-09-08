/**
 * Die Journalisierungs-Weißliste (55_Architektur.md §4.4, ADR-017, AP-0.8). Jede Anwendertabelle
 * steht hier in genau einer der beiden Listen — geprüft von `test/schema/trigger-vorhanden.test.ts`
 * gegen die tatsächlich in der migrierten Datenbank vorhandenen Tabellen (Weißliste MIT Gegenprobe:
 * eine neue Tabelle ohne Eintrag hier macht den Test rot, statt stillschweigend unjournalisiert zu
 * bleiben). Herkunft der Einordnung: der `-- JOURNALISIERT`/`-- NICHT_JOURNALISIERT`-Kommentarkopf
 * vor jedem `CREATE TABLE` in `docs/schema/0002_kern.sql` (bereits angewendete Migration, siehe
 * dortiger Kopfkommentar) + der Kopfkommentar von `docs/schema/0001_grundgeruest.sql` ("alle vier
 * Tabellen sind NICHT_JOURNALISIERT") + `docs/schema/0003_abgeleitet.sql` ("NICHT_JOURNALISIERT:
 * person_flach, suche_fts, suche_fts_quelle" — `suche_fts` selbst ist `type='virtual'`, keine
 * Anwendertabelle im Sinn von `anwenderTabellenNamen`, taucht hier daher nicht auf).
 *
 * `skripte/trigger-generieren.ts` erzeugt für jede Tabelle aus `JOURNALISIERT` drei `jrn_*`-Trigger
 * in `docs/schema/trigger_generiert.sql`; `src/main/datenbank/journal-trigger-anwenden.ts` wendet
 * sie nach jeder Migration an.
 */
export const JOURNALISIERT = [
  'person',
  'name',
  'ort',
  'ortsname',
  'ortszugehoerigkeit',
  'ort_externe_id',
  'ereignis',
  'beteiligung',
  'elternschaft',
  'partnerschaft',
  'partnerschaft_person',
  'assoziation',
  'archiv',
  'quelle',
  'zitat',
  'aussage',
  'aussage_zitat',
  'negativbefund',
  'persona',
  'medium',
  'medium_zuordnung',
  'medium_region',
  'aufgabe',
  'diagnose',
  'risikofaktor',
  'feld_definition',
  'feld_auswahloption',
  'feld_wert',
  'interview_sitzung',
  'import_lauf',
  'import_herkunft',
  'ansicht_zustand',
] as const

/**
 * `name_phonetik` und `id_alias` stehen trotz `TEXT`-Primärschlüsseln/-spalten hier, nicht in
 * `JOURNALISIERT`: `name_phonetik` ist abgeleitet (analog `person_flach`, §5), `merge_protokoll`
 * und `id_alias` sind laut Kommentarkopf in `docs/schema/0002_kern.sql` explizit
 * NICHT_JOURNALISIERT (Journal-/Merge-Infrastruktur selbst, kein Fachdatum).
 */
export const NICHT_JOURNALISIERT = [
  'transaktion',
  'aenderung',
  'journal_kontext',
  'schema_migration',
  'name_phonetik',
  'merge_protokoll',
  'id_alias',
  'person_flach',
  'suche_fts_quelle',
] as const

export type JournalisierteTabelle = (typeof JOURNALISIERT)[number]
export type NichtJournalisierteTabelle = (typeof NICHT_JOURNALISIERT)[number]
