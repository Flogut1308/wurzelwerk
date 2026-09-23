// AP-1.33: Repository für `name_form` (docs/schema/0006_namensformen.sql). SQL nur hier + in
// `name-part-repo.ts` (CLAUDE.md §2). Kein `BEGIN`/`COMMIT` (läuft in der bereits offenen,
// armierten Bus-Transaktion).
//
// „Genau ein Hauptname je Person": der partielle UNIQUE-Index `idx_name_form_ein_hauptname` (höchstens
// eine bevorzugte Form je Person) UND die Constraint-Trigger `chk_name_form_hauptname_au/_ad` (eine
// Person mit Formen braucht IMMER eine bevorzugte) werden von SQLite BEIDE sofort geprüft. Damit ist
// ein In-Place-Tausch der bevorzugten Form über zwei UPDATEs unmöglich — jeder Zwischenzustand
// verletzt genau eine der beiden Regeln (zwei bevorzugte -> UNIQUE, keine bevorzugte -> Trigger; beide
// werden sofort geprüft). `mitHauptnameConstraintAus()` setzt die beiden Constraint-Trigger für die
// Dauer der Umstellung aus (dasselbe Muster wie `journalAus()`/`alleAbgeleitetenNeuAufbauen()`, die
// Journal- bzw. abgeleitete Trigger vorübergehend abhängen) und stellt am Ende den END-Zustand
// wieder her, der beide Regeln erfüllt. Der partielle UNIQUE-Index bleibt aktiv und wird durch die
// „erst demote, dann promote"-Reihenfolge nie verletzt.
import type { Tx } from './basis'

export interface NameFormEinfuegenEin {
  readonly id: string
  readonly personId: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly rolle: string | null
  readonly rollenNotiz: string | null
  readonly istBevorzugt: 0 | 1
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly konfidenz: number | null
  readonly sortierIndex: number | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly originalText: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `name_form`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: NameFormEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO name_form (
       id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt,
       umschrift_von, umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis,
       original_text, erstellt_am, geaendert_am
     ) VALUES (
       @id, @personId, @sprache, @schrift, @reihenfolge, @rolle, @rollenNotiz, @istBevorzugt,
       @umschriftVon, @umschriftNorm, @konfidenz, @sortierIndex, @gueltigVon, @gueltigBis,
       @originalText, @erstelltAm, @geaendertAm
     )`,
  ).run(ein)
}

export interface NameFormZeile {
  readonly id: string
  readonly person_id: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly rolle: string | null
  readonly rollen_notiz: string | null
  readonly ist_bevorzugt: number
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly konfidenz: number | null
  readonly sortier_index: number | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly original_text: string | null
}

const FORM_SPALTEN =
  `id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von,
   umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text`

/** Liest eine `name_form`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): NameFormZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, NameFormZeile>(`SELECT ${FORM_SPALTEN} FROM name_form WHERE id = @id`)
    .get({ id })
}

/** Alle Formen einer Person, bevorzugte zuerst, dann stabil nach `id`. */
export function formenFuerPerson(tx: Tx, personId: string): readonly NameFormZeile[] {
  return tx
    .prepare<{ readonly personId: string }, NameFormZeile>(
      `SELECT ${FORM_SPALTEN} FROM name_form WHERE person_id = @personId
       ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id`,
    )
    .all({ personId })
}

interface AnzahlZeile {
  readonly anzahl: number
}

/** Anzahl der Formen einer Person (für die „erste Form -> ist_bevorzugt = 1"-Regel). */
export function anzahlFormen(tx: Tx, personId: string): number {
  const zeile = tx
    .prepare<{ readonly personId: string }, AnzahlZeile>(
      'SELECT COUNT(*) AS anzahl FROM name_form WHERE person_id = @personId',
    )
    .get({ personId })
  return zeile?.anzahl ?? 0
}

export interface NameFormAktualisierenEin {
  readonly id: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly rolle: string | null
  readonly rollenNotiz: string | null
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly konfidenz: number | null
  readonly sortierIndex: number | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly originalText: string | null
  readonly geaendertAm: number
}

/** Aktualisiert die editierbaren Spalten (ohne `person_id`, ohne `ist_bevorzugt` — Letzteres nur über
 * `hauptnameWechseln()`/`mitHauptnameConstraintAus()`). */
export function aktualisieren(tx: Tx, ein: NameFormAktualisierenEin): void {
  tx.prepare(
    `UPDATE name_form SET sprache = @sprache, schrift = @schrift, reihenfolge = @reihenfolge,
       rolle = @rolle, rollen_notiz = @rollenNotiz, umschrift_von = @umschriftVon,
       umschrift_norm = @umschriftNorm, konfidenz = @konfidenz, sortier_index = @sortierIndex,
       gueltig_von = @gueltigVon, gueltig_bis = @gueltigBis, original_text = @originalText,
       geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run(ein)
}

export function loeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM name_form WHERE id = @id').run({ id })
}

/**
 * Löscht eine Form und rückt, falls sie die bevorzugte einer Person mit weiteren Formen war, die
 * verbliebene Form mit der niedrigsten `id` deterministisch als neue bevorzugte nach. Nötig, weil
 * `chk_name_form_hauptname_ad` sonst abbricht: „eine Person mit Formen braucht immer eine bevorzugte".
 * Löschen + Hochstufen laufen in DERSELBEN (armierten) Transaktion mit ausgesetzten Constraint-Triggern
 * (`mitHauptnameConstraintAus` — der Zwischenzustand „keine bevorzugte" ist sonst verboten); der
 * partielle UNIQUE-Index bleibt aktiv und sieht durch die Reihenfolge „erst löschen, dann hochstufen"
 * nie zwei bevorzugte. Beide Schritte landen im Journal und sind darum undo-bitgleich (AP-1.33).
 * Löscht man die letzte/einzige Form (Person ohne Form ist erlaubt) oder eine nicht bevorzugte Form,
 * ist kein Nachrücken nötig.
 */
export function loeschenMitNachruecken(tx: Tx, id: string): void {
  const form = lesen(tx, id)
  if (form === undefined || form.ist_bevorzugt !== 1) {
    loeschen(tx, id)
    return
  }
  // formenFuerPerson sortiert bevorzugt-zuerst, dann nach `id`; nach dem Herausfiltern der (einzigen)
  // bevorzugten Form bleiben nur `ist_bevorzugt = 0`-Formen, aufsteigend nach `id` — das erste ist die
  // niedrigste `id`.
  const nachfolger = formenFuerPerson(tx, form.person_id).find((f) => f.id !== id)
  if (nachfolger === undefined) {
    loeschen(tx, id)
    return
  }
  mitHauptnameConstraintAus(tx, () => {
    loeschen(tx, id)
    tx.prepare('UPDATE name_form SET ist_bevorzugt = 1 WHERE id = @id').run({ id: nachfolger.id })
  })
}

interface TriggerSqlZeile {
  readonly name: string
  readonly sql: string
}

const HAUPTNAME_CONSTRAINT_TRIGGER = ['chk_name_form_hauptname_au', 'chk_name_form_hauptname_ad'] as const

/**
 * Führt `fn` mit ausgesetzten „genau ein Hauptname"-Constraint-Triggern aus und stellt sie danach
 * WORTGLEICH wieder her (SQL aus `sqlite_master` zurückgelesen — keine zweite, driftende Kopie der
 * Trigger-SQL, analog `test/hilfsmittel/fixture-bauen.ts`). Nötig, weil eine Umstellung der
 * bevorzugten Form zwangsläufig einen Zwischenzustand ohne bevorzugte Form durchläuft (s. Kopf).
 * `fn` MUSS am Ende einen gültigen Zustand hinterlassen (genau eine bevorzugte Form je betroffener
 * Person) — der partielle UNIQUE-Index bleibt die ganze Zeit aktiv.
 */
export function mitHauptnameConstraintAus(tx: Tx, fn: () => void): void {
  const trigger = tx
    .prepare<[], TriggerSqlZeile>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('chk_name_form_hauptname_au', 'chk_name_form_hauptname_ad')",
    )
    .all()
  for (const name of HAUPTNAME_CONSTRAINT_TRIGGER) {
    tx.exec(`DROP TRIGGER IF EXISTS ${name}`)
  }
  try {
    fn()
  } finally {
    for (const zeile of trigger) {
      tx.exec(zeile.sql)
    }
  }
}

/**
 * Stellt in EINER Transaktion die bevorzugte Form einer Person um: `alt` -> nicht bevorzugt, `neu`
 * -> bevorzugt. Läuft mit ausgesetzten Constraint-Triggern (s. `mitHauptnameConstraintAus`), in der
 * Reihenfolge „erst demote, dann promote", damit der partielle UNIQUE-Index nie zwei bevorzugte
 * Formen gleichzeitig sieht.
 */
export function hauptnameWechseln(tx: Tx, personId: string, altId: string, neuId: string, geaendertAm: number): void {
  mitHauptnameConstraintAus(tx, () => {
    tx.prepare('UPDATE name_form SET ist_bevorzugt = 0, geaendert_am = @geaendertAm WHERE id = @altId AND person_id = @personId').run({
      altId,
      personId,
      geaendertAm,
    })
    tx.prepare('UPDATE name_form SET ist_bevorzugt = 1, geaendert_am = @geaendertAm WHERE id = @neuId AND person_id = @personId').run({
      neuId,
      personId,
      geaendertAm,
    })
  })
}
