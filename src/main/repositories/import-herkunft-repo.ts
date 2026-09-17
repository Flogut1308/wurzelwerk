// AP-1.5: einziges Repository, das `import_lauf`/`import_herkunft`-SQL schreibt oder liest
// (CLAUDE.md §2 — SQL nur in `src/main/repositories/`). Beide Tabellen sind JOURNALISIERT
// (`src/main/journal/journalisierung.ts`) — kein `BEGIN`/`COMMIT` hier, läuft in einer bereits
// offenen Transaktion (armiert beim kleinen Import, `journalAus` beim Großimport, s.
// `src/main/befehle/import-ausfuehren.ts`).
import type { Tx } from './basis'

export interface ImportLaufAnlegenEin {
  readonly id: string
  readonly datei: string
  readonly pruefsumme: string | null
  readonly vertragsversion: string
  readonly zeitpunkt: number
  readonly transaktionId: string
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `import_lauf`-Zeile an — eine je tatsächlich ausgeführtem Import (56_Import_Vertrag.md §6, AP-1.5). */
export function importLaufAnlegen(tx: Tx, ein: ImportLaufAnlegenEin): void {
  tx.prepare(
    `INSERT INTO import_lauf (id, datei, pruefsumme, vertragsversion, zeitpunkt, transaktion_id, erstellt_am, geaendert_am)
     VALUES (@id, @datei, @pruefsumme, @vertragsversion, @zeitpunkt, @transaktionId, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    datei: ein.datei,
    pruefsumme: ein.pruefsumme,
    vertragsversion: ein.vertragsversion,
    zeitpunkt: ein.zeitpunkt,
    transaktionId: ein.transaktionId,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

export interface ImportHerkunftAnlegenEin {
  readonly id: string
  readonly importLaufId: string
  /** Die ECHTE, aufgelöste UUID des Datensatzes (nie eine `tmp:`/`db:`-Kennung, AP-1.5). */
  readonly datensatzId: string
  /** Der Tabellenname des Datensatzes (E-7-Diskriminator, z. B. `'person'`). */
  readonly datensatzTyp: string
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `import_herkunft`-Zeile an — eine je real (nicht per `db:` nur referenziertem) geschriebenem Datensatz. */
export function importHerkunftAnlegen(tx: Tx, ein: ImportHerkunftAnlegenEin): void {
  tx.prepare(
    `INSERT INTO import_herkunft (id, import_lauf_id, datensatz_id, datensatz_typ, erstellt_am, geaendert_am)
     VALUES (@id, @importLaufId, @datensatzId, @datensatzTyp, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    importLaufId: ein.importLaufId,
    datensatzId: ein.datensatzId,
    datensatzTyp: ein.datensatzTyp,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Eine Herkunftsangabe für "Woher stammt dieser Datensatz?" (56_Import_Vertrag.md §6, AP-1.5-Abnahme). */
export interface HerkunftEintrag {
  readonly importLaufId: string
  readonly datei: string | null
  readonly pruefsumme: string | null
  readonly zeitpunkt: number | null
}

interface HerkunftRow {
  readonly import_lauf_id: string
  readonly datei: string | null
  readonly pruefsumme: string | null
  readonly zeitpunkt: number | null
}

/**
 * Findet alle Importläufe, aus denen der Datensatz `datensatzId` (Tabelle `datensatzTyp`) stammt
 * — bleibt auffindbar, auch nachdem das Journal aufgeräumt wurde (die `aenderung`-Zeilen sind dann
 * weg, `import_herkunft` bleibt bestehen, AP-1.5-Abnahme "Herkunft ist abfragbar").
 */
export function herkunftFuerDatensatz(tx: Tx, datensatzId: string, datensatzTyp: string): readonly HerkunftEintrag[] {
  return tx
    .prepare<{ readonly datensatzId: string; readonly datensatzTyp: string }, HerkunftRow>(
      `SELECT il.id AS import_lauf_id, il.datei, il.pruefsumme, il.zeitpunkt
       FROM import_herkunft ih
       JOIN import_lauf il ON il.id = ih.import_lauf_id
       WHERE ih.datensatz_id = @datensatzId AND ih.datensatz_typ = @datensatzTyp
       ORDER BY il.zeitpunkt ASC`,
    )
    .all({ datensatzId, datensatzTyp })
    .map((zeile) => ({ importLaufId: zeile.import_lauf_id, datei: zeile.datei, pruefsumme: zeile.pruefsumme, zeitpunkt: zeile.zeitpunkt }))
}
