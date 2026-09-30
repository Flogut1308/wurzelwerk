// AP-1.30 PR 11-0b (docs/80 §33 V-130-11-0b; A-02, A-19) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Altbestand mit einem heute verbotenen Umschrift-Bezug: eine Form, die auf sich selbst zeigt, wie sie der Import
// still schreibt (docs/80 §33 U-130-umschrift-bestand). E4: ein UNVERÄNDERTER Bezug wird nicht geprüft, die Form
// bleibt in ihren übrigen Feldern bearbeitbar — über `namensform.uebernehmen` und `namensform.aendern`.
//
// WARUM HIER UND NICHT IM BEFEHLSFOLGE-GENERATOR: seit V-130-fix-umschrift-selbstbezug (#206) lehnen auch
// `name.anlegen`/`name.aendern` verbotene Bezüge ab; über Befehle ist dieser Stand nicht mehr herstellbar. Er wird
// VOR dem ersten Schritt per `schreibeImport` bei abgeschaltetem Journal geschrieben (Muster
// `test/einheit/befehl-name-umschrift-bezug.test.ts`). Anlass ist die Mutante A2 (U-130-10b-folge, Nachreview
// #200): prüfte `namensformAenderungPruefen` den Bezug auch ohne Änderung, schlüge schon der erste Fall fehl.
//
// BEFUND U-130-11-0b-selbstbezug-fts (festgehalten als `it.fails`, Fix in eigenem PR mit `src/`): an genau
// dieser Altbestand-Form bricht eine Änderung des `original_text` auf eine längere wortgetreue Schreibung
// („Joh. Georg Müller alias Miller") mit `SQLITE_CORRUPT_VTAB` ab — gleich ob über `namensform.aendern` oder
// `namensform.uebernehmen`; an einer Form ohne Selbstbezug geht dieselbe Änderung durch (Gegenprobe unten).
// Gefunden mit einer Befehlsfolge-Invariante über diesem Altbestand (Seed 20261001); diese wird nach dem Fix
// eingecheckt (bis dahin wäre sie rot).
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { fuehreAus } from '../../src/main/befehle/bus'
import { undo } from '../../src/main/journal/undo'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { schreibeImport } from '../../src/main/import/schreiben'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'
import { frischeMigrierteDatenbank } from './_frische-datenbank'
import { kanonischerAbzug } from './_kanonischer-abzug'

const WORTGETREU = 'Joh. Georg Müller alias Miller'

interface Altbestand {
  readonly db: Database.Database
  readonly personId: string
  readonly formId: string
}

/** Eine Person mit einer Form, deren `umschrift_von` auf sie selbst zeigt (`selbstbezug`), sonst ohne Bezug. */
function altbestand(selbstbezug: boolean): Altbestand {
  const db = frischeMigrierteDatenbank()
  journalAus(db, 'Testaufbau: Altbestand über schreibeImport, ohne Befehlsbus.')
  const name = selbstbezug
    ? { typ: 'transliteriert', vornamen: 'Olga', nachname: 'Scherbakowa', umschrift_von: 0, umschrift_norm: 'iso9', ist_bevorzugt: true }
    : { typ: 'geburtsname', vornamen: 'Olga', nachname: 'Scherbakowa', ist_bevorzugt: true }
  const ergebnis = schreibeImport(
    db,
    importDateiSchema.parse({
      vertrag: 'wurzelwerk-import/v1',
      erzeugt: { am: '2026-10-01', werkzeug: 'test' },
      zusammenfassung: { personen: 1, orte: 0, medien: 0, notizen_unverarbeitet: 0 },
      quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
      orte: [],
      personen: [{ id: 'tmp:p1', namen: [name], konfidenz: 3, belege: [{ quelle: 'tmp:q1', seite: '1', konfidenz: 3 }] }],
      ereignisse: [],
      notizen_unverarbeitet: [],
    }),
    { erstelltAm: 1_700_000_000_000 },
  )
  journalAn(db)
  const personId = ergebnis.kennungen.get('tmp:p1')
  if (personId === undefined) throw new Error('Kennung tmp:p1 fehlt im Schreibergebnis')
  const formId = db.prepare<{ readonly personId: string }, { readonly id: string }>('SELECT id FROM name_form WHERE person_id = @personId').get({ personId })?.id
  if (formId === undefined) throw new Error('Importierte Namensform fehlt')
  return { db, personId, formId }
}

function kopf(db: Database.Database, formId: string): unknown {
  return db.prepare('SELECT umschrift_von, rollen_notiz, schrift, original_text FROM name_form WHERE id = @formId').get({ formId })
}

function teile(db: Database.Database, formId: string): readonly { readonly id: string; readonly art: 'vorname' | 'nachname'; readonly wert: string }[] {
  return db
    .prepare<{ readonly formId: string }, { readonly id: string; readonly art: 'vorname' | 'nachname'; readonly wert: string }>(
      'SELECT id, art, wert FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index',
    )
    .all({ formId })
}

function indexIntakt(db: Database.Database): void {
  expect(() => db.exec("INSERT INTO suche_fts (suche_fts, rank) VALUES ('integrity-check', 0)")).not.toThrow()
}

describe('Altbestand mit Selbstbezug bleibt bearbeitbar (E4, Mutante A2, V-130-11-0b)', () => {
  it('namensform.uebernehmen ändert Kopf und Teile, der unveränderte Bezug bleibt; Undo bitgleich, Index heil', () => {
    const { db, personId, formId } = altbestand(true)
    try {
      expect(kopf(db, formId)).toMatchObject({ umschrift_von: formId })
      const vorher = kanonischerAbzug(db)
      const ziel = teile(db, formId).map((t) => ({ id: t.id, art: t.art, wert: t.wert, istRufname: false }))
      // Einmal ohne `umschriftVon`, einmal mit dem unverändert zurückgereichten Bezug — beides muss gelingen.
      fuehreAus(db, 'namensform.uebernehmen', { personId, formId, kopf: { rollenNotiz: 'Notiz', schrift: 'latn' }, teile: [...ziel, { art: 'vorname', wert: 'Anna', istRufname: true }] })
      fuehreAus(db, 'namensform.uebernehmen', { personId, formId, kopf: { rollenNotiz: "O'Brien-Linie", umschriftVon: formId }, teile: ziel })
      expect(kopf(db, formId)).toMatchObject({ umschrift_von: formId, rollen_notiz: "O'Brien-Linie", schrift: 'latn' })
      indexIntakt(db)
      undo(db)
      undo(db)
      expect(undoZiel(db)).toBeUndefined()
      expect(kanonischerAbzug(db)).toBe(vorher)
      indexIntakt(db)
    } finally {
      db.close()
    }
  })

  it('namensform.aendern ändert ein anderes Kopf-Feld, der unveränderte Bezug bleibt', () => {
    const { db, formId } = altbestand(true)
    try {
      fuehreAus(db, 'namensform.aendern', { id: formId, rollenNotiz: 'Notiz' })
      fuehreAus(db, 'namensform.aendern', { id: formId, schrift: 'latn', umschriftVon: formId })
      expect(kopf(db, formId)).toMatchObject({ umschrift_von: formId, rollen_notiz: 'Notiz', schrift: 'latn' })
      indexIntakt(db)
    } finally {
      db.close()
    }
  })

  it.fails('U-130-11-0b-selbstbezug-fts: eine wortgetreue Schreibung an der Altbestand-Form lässt den Suchindex heil', () => {
    const { db, formId } = altbestand(true)
    try {
      fuehreAus(db, 'namensform.aendern', { id: formId, originalText: WORTGETREU })
      expect(kopf(db, formId)).toMatchObject({ original_text: WORTGETREU })
      indexIntakt(db)
    } finally {
      db.close()
    }
  })

  it('Gegenprobe zum Befund: dieselbe Änderung an einer importierten Form ohne Selbstbezug geht durch', () => {
    const { db, formId } = altbestand(false)
    try {
      fuehreAus(db, 'namensform.aendern', { id: formId, originalText: WORTGETREU })
      expect(kopf(db, formId)).toMatchObject({ original_text: WORTGETREU })
      indexIntakt(db)
    } finally {
      db.close()
    }
  })
})
