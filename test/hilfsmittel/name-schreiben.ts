// AP-1.33: Test-Helfer zum Einfügen eines FLACHEN Namens als `name_form` + `name_part`
// (0006_namensformen.sql). Ersetzt die früheren `INSERT INTO name (...)`-Direktschreibungen der
// Einheitstests — dieselbe Zerlegung wie Migration und Produktivcode (src/core/name/zerlegung.ts).
import type Database from 'better-sqlite3'
import { v7 as uuidv7 } from 'uuid'
import { montiereOriginalText, zerlegeName } from '../../src/core/name/zerlegung'

export interface FlacheNameEingabe {
  readonly id?: string
  readonly personId: string
  readonly typ?: string
  readonly schrift?: string | null
  readonly umschriftVon?: string | null
  readonly umschriftNorm?: string | null
  readonly vornamen?: string | null
  readonly rufnameIndex?: number | null
  readonly rufnameText?: string | null
  readonly nachname?: string | null
  readonly praefix?: string | null
  readonly titelVor?: string | null
  readonly zusatzNach?: string | null
  readonly originalText?: string | null
  readonly sprache?: string | null
  readonly istBevorzugt?: 0 | 1
  readonly gueltigVon?: number | null
  readonly gueltigBis?: number | null
}

/**
 * Fügt eine Namensform (+ ihre Bestandteile) ein und liefert die `name_form.id`. Erwartet, dass die
 * Journal-Trigger entschärft sind (journalAus) ODER eine armierte Transaktion läuft. `typ`
 * `'transliteriert'` -> `rolle IS NULL`. Ohne `istBevorzugt` wird die Form bevorzugt (1).
 */
export function flacheNameEinfuegen(db: Database.Database, ein: FlacheNameEingabe): string {
  const id = ein.id ?? uuidv7()
  const typ = ein.typ ?? 'geburtsname'
  const flach = {
    vornamen: ein.vornamen,
    rufnameIndex: ein.rufnameIndex,
    rufnameText: ein.rufnameText,
    nachname: ein.nachname,
    praefix: ein.praefix,
    titelVor: ein.titelVor,
    zusatzNach: ein.zusatzNach,
  }
  const originalText = ein.originalText ?? montiereOriginalText(flach)
  db.prepare(
    `INSERT INTO name_form
       (id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von,
        umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text, erstellt_am, geaendert_am)
     VALUES
       (@id, @personId, @sprache, @schrift, NULL, @rolle, NULL, @istBevorzugt, @umschriftVon,
        @umschriftNorm, NULL, NULL, @gueltigVon, @gueltigBis, @originalText, 1, 1)`,
  ).run({
    id,
    personId: ein.personId,
    sprache: ein.sprache ?? null,
    schrift: ein.schrift ?? null,
    rolle: typ === 'transliteriert' ? null : typ,
    istBevorzugt: ein.istBevorzugt ?? 1,
    umschriftVon: ein.umschriftVon ?? null,
    umschriftNorm: ein.umschriftNorm ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    originalText,
  })
  const teilEinfuegen = db.prepare(
    `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
     VALUES (@id, @nameFormId, @art, @wert, @istRufname, @sortierIndex, NULL, 1, 1)`,
  )
  for (const teil of zerlegeName(flach)) {
    teilEinfuegen.run({
      id: uuidv7(),
      nameFormId: id,
      art: teil.art,
      wert: teil.wert,
      istRufname: teil.istRufname ? 1 : 0,
      sortierIndex: teil.sortierIndex,
    })
  }
  return id
}
