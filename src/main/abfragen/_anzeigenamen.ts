// Vorarbeiten AP-1.30, PR 4 (docs/80 §30 U-1.33-anzeigename-unbenutzt, Eigentümer 25.09.2026):
// der sichtbare Name einer Person kommt in Liste, Profil, Suche (und später Export) aus der
// Kernfunktion `anzeigenameFuer` (src/core/name/anzeigename.ts) — nicht aus der SQL-Projektion
// `person_flach.anzeigename`, die nur noch für Sortierung und Suche dient. Hilfsmodul der Abfragen
// (Unterstrich-Präfix, kein eigener Kanal): lädt für eine Menge von Personen alle Namensformen samt
// Bestandteilen in ZWEI Anweisungen und ruft je Person die Kernfunktion.
//
// Ohne Wunschsprache (§32 V-4-wunschsprache): die Kette beginnt bei der Umschrift, sonst Hauptform.
// Eine Person ohne jede Namensform bekommt '' — wie die Projektion; der Renderer zeigt dafür seinen
// Platzhaltertext.
//
// Die Ids gehen als EIN JSON-Parameter über `json_each` in die Abfrage (benannter Parameter, kein
// zusammengesetztes SQL, CLAUDE.md §6; keine Obergrenze an Bindungsvariablen).
import type Database from 'better-sqlite3'
import { anzeigenameFuer, type AnzeigeForm } from '../../core/name/anzeigename'
import type { GeladenerTeil } from '../../core/name/zerlegung'
import { NamePartArtEnum } from '../../shared/schemata/name'

interface FormZeile {
  readonly id: string
  readonly person_id: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly ist_bevorzugt: number
  readonly umschrift_von: string | null
  readonly original_text: string | null
}

interface TeilZeile {
  readonly name_form_id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
}

/** Anzeigename je `person.id` für die übergebenen Personen. Fehlt eine Person in der Karte, hat sie
 * keine Namensform (Aufrufer: `?? ''`). Doppelte Ids sind erlaubt. */
export function anzeigenamenLaden(db: Database.Database, personIds: readonly string[]): ReadonlyMap<string, string> {
  const karte = new Map<string, string>()
  if (personIds.length === 0) return karte
  const ids = JSON.stringify([...new Set(personIds)])

  const formen = db
    .prepare<
      { readonly ids: string },
      FormZeile
    >(`SELECT nf.id AS id, nf.person_id AS person_id, nf.sprache AS sprache, nf.schrift AS schrift,
              nf.ist_bevorzugt AS ist_bevorzugt, nf.umschrift_von AS umschrift_von, nf.original_text AS original_text
       FROM name_form nf
       WHERE nf.person_id IN (SELECT value FROM json_each(@ids))`,
    )
    .all({ ids })
  if (formen.length === 0) return karte

  const teile = db
    .prepare<
      { readonly ids: string },
      TeilZeile
    >(`SELECT tp.name_form_id AS name_form_id, tp.art AS art, tp.wert AS wert,
              tp.ist_rufname AS ist_rufname, tp.sortier_index AS sortier_index
       FROM name_part tp
       JOIN name_form nf ON nf.id = tp.name_form_id
       WHERE nf.person_id IN (SELECT value FROM json_each(@ids))`,
    )
    .all({ ids })

  const teileJeForm = new Map<string, GeladenerTeil[]>()
  for (const zeile of teile) {
    const liste = teileJeForm.get(zeile.name_form_id) ?? []
    liste.push({ art: NamePartArtEnum.parse(zeile.art), wert: zeile.wert, istRufname: zeile.ist_rufname === 1, sortierIndex: zeile.sortier_index })
    teileJeForm.set(zeile.name_form_id, liste)
  }

  const formenJePerson = new Map<string, AnzeigeForm[]>()
  for (const zeile of formen) {
    const liste = formenJePerson.get(zeile.person_id) ?? []
    liste.push({
      formId: zeile.id,
      sprache: zeile.sprache,
      schrift: zeile.schrift,
      istBevorzugt: zeile.ist_bevorzugt === 1,
      umschriftVon: zeile.umschrift_von,
      originalText: zeile.original_text,
      teile: teileJeForm.get(zeile.id) ?? [],
    })
    formenJePerson.set(zeile.person_id, liste)
  }

  for (const [personId, personFormen] of formenJePerson) {
    karte.set(personId, anzeigenameFuer(personFormen)?.text ?? '')
  }
  return karte
}
