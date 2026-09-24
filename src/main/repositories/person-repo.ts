// AP-0.9: einziges Repository, das `person`-SQL schreibt (CLAUDE.md §2). Nimmt ein Handle
// innerhalb einer bereits offenen Transaktion entgegen (`Tx`) - kein `BEGIN`/`COMMIT` hier, kein
// Journalcode: die `jrn_person_a{i,u,d}`-Trigger (docs/schema/trigger_generiert.sql) schreiben die
// `aenderung`-Zeilen automatisch, solange die Transaktion armiert ist (`src/main/journal/kontext.ts`,
// aufgerufen vom Befehlsbus in `src/main/befehle/bus.ts`).
import type { PersonAnlegenEin, PersonFeldSetzenEin } from '../../shared/schemata/befehle'
import type { Tx } from './basis'
import { kennungZiehen } from './kennung-repo'
import { mitHauptnameConstraintAus } from './name-form-repo'

/** Spalten von `person` (docs/schema/0002_kern.sql + 0005_import_luecken.sql +
 * 0007_kennung_textanker.sql), für `lesen()`. */
export interface PersonZeile {
  readonly id: string
  readonly geschlecht: string | null
  readonly lebend_status: string | null
  readonly privat: 0 | 1
  readonly notiz: string | null
  readonly gesperrt_bis: number | null
  readonly ist_platzhalter: 0 | 1
  readonly platzhalter_grund: string | null
  readonly unsicherheit: string | null
  /** Fortlaufende Kennung (AP-1.34). In der DB nullable (B2/E13: Undo über die Migrationsgrenze
   * setzt Zeilen ohne Kennung wieder ein); jede über `einfuegen()` angelegte Person hat eine. */
  readonly kennung: number | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

/** Nutzlast von `einfuegen()`: `PersonAnlegenEin` + die vom Handler gesetzte `id`/Zeitstempel (D-3). */
export interface PersonEinfuegenEin extends PersonAnlegenEin {
  readonly id: string
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `person`-Zeile an (benannte Parameter, CLAUDE.md §6). `unsicherheit` (0005-Spalte,
 * AP-1.3c/ADR-026) fehlt in `PersonAnlegenEin` (AP-0.9, vor 0005) — deshalb hier optional statt
 * über `PersonEinfuegenEin` erzwungen, mit `null`-Vorgabe für den bestehenden Aufrufer
 * (`src/main/befehle/person-anlegen.ts`).
 *
 * AP-1.34 (B2): der EINZIGE Schreibweg für neue Personen — hier und nur hier wird die Kennung aus
 * `kennung_zaehler` gezogen, in derselben Transaktion wie das INSERT (Befehl bzw. Import). Die
 * Kennung ist darum kein Eingabefeld: weder `PersonAnlegenEin` noch `person.feldSetzen` kennen sie.
 * Redo setzt eine zurückgenommene Person über `rohEinfuegen` mit ihrer ursprünglichen Kennung aus
 * dem Journal wieder ein und zieht keine neue. */
export function einfuegen(
  tx: Tx,
  ein: PersonEinfuegenEin & { readonly unsicherheit?: string | null },
): { readonly kennung: number } {
  const kennung = kennungZiehen(tx, 'person')
  tx.prepare(
    `INSERT INTO person (id, geschlecht, lebend_status, privat, notiz, gesperrt_bis, ist_platzhalter, platzhalter_grund, unsicherheit, kennung, erstellt_am, geaendert_am)
     VALUES (@id, @geschlecht, @lebendStatus, @privat, @notiz, @gesperrtBis, @istPlatzhalter, @platzhalterGrund, @unsicherheit, @kennung, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    geschlecht: ein.geschlecht ?? null,
    lebendStatus: ein.lebend_status ?? null,
    privat: ein.privat,
    notiz: ein.notiz ?? null,
    gesperrtBis: ein.gesperrt_bis ?? null,
    istPlatzhalter: ein.ist_platzhalter,
    platzhalterGrund: ein.platzhalter_grund ?? null,
    unsicherheit: ein.unsicherheit ?? null,
    kennung,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
  return { kennung }
}

/** Nutzlast von `feldSetzen()`: `PersonFeldSetzenEin` + der vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export type PersonFeldSetzenRepoEin = PersonFeldSetzenEin & { readonly geaendertAm: number }

/**
 * Setzt genau ein Feld einer `person`-Zeile. Diskriminierte Union über `ein.feld` (D-FELD) - jeder
 * Zweig trägt festes SQL, kein dynamischer Spaltenname im SQL-Text (CLAUDE.md §6).
 */
export function feldSetzen(tx: Tx, ein: PersonFeldSetzenRepoEin): void {
  switch (ein.feld) {
    case 'geschlecht':
      tx.prepare('UPDATE person SET geschlecht = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'lebend_status':
      tx.prepare('UPDATE person SET lebend_status = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'privat':
      tx.prepare('UPDATE person SET privat = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'notiz':
      tx.prepare('UPDATE person SET notiz = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'gesperrt_bis':
      tx.prepare('UPDATE person SET gesperrt_bis = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'ist_platzhalter':
      tx.prepare('UPDATE person SET ist_platzhalter = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
    case 'platzhalter_grund':
      tx.prepare('UPDATE person SET platzhalter_grund = @wert, geaendert_am = @geaendertAm WHERE id = @id').run({
        id: ein.id,
        wert: ein.wert,
        geaendertAm: ein.geaendertAm,
      })
      return
  }
}

/** Löscht eine `person`-Zeile (CASCADE räumt `person_flach`/`name_form`/`name_part`/… über die
 * Fremdschlüssel ab). Die „genau ein Hauptname"-Constraint-Trigger (`chk_name_form_hauptname_*`,
 * 0006_namensformen.sql) werden dabei ausgesetzt: Löscht eine Person mit mehreren Namensformen, so
 * durchläuft die CASCADE zwangsläufig einen Zwischenzustand, in dem noch Formen der Person existieren,
 * aber (weil die bevorzugte schon weg ist) keine bevorzugte mehr — das würde `chk_name_form_hauptname_ad`
 * sonst abbrechen. Am Transaktionsende hat die Person gar keine Form mehr, die Regel ist trivial erfüllt.
 * Undo re-insertiert die Formen (INSERT feuert die Constraint-Trigger nicht) und setzt sie ebenfalls aus
 * (src/main/journal/undo.ts) — der Ablauf bleibt undo-bitgleich (AP-1.33). */
export function loeschen(tx: Tx, id: string): void {
  mitHauptnameConstraintAus(tx, () => {
    tx.prepare('DELETE FROM person WHERE id = @id').run({ id })
  })
}

/** Liest eine `person`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): PersonZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, PersonZeile>(
      `SELECT id, geschlecht, lebend_status, privat, notiz, gesperrt_bis, ist_platzhalter, platzhalter_grund, unsicherheit, kennung, erstellt_am, geaendert_am
       FROM person WHERE id = @id`,
    )
    .get({ id })
}
