// AP-1.30 PR 10a (docs/80 §33 U-130-10a-bruecke-erhaelt), A-02/A-19, F-01/F-02: die flache
// Namensbrücke (`name-repo.ts::aktualisieren`, erreicht über `befehl:name.aendern` aus dem Reiter
// Person/Namen) darf nichts überschreiben, was sie selbst nicht trägt.
//
// Befund vor dem Fix: jedes `name.aendern` setzte die Kopf-Felder `reihenfolge`, `rollen_notiz`,
// `konfidenz`, `sortier_index` der Form fest auf NULL und baute ALLE `name_part`-Zeilen neu (löschen +
// neu einfügen): neue Teil-IDs, `feminine_variante = NULL`, und zwei getrennte Nachnamen-Teile wurden zu
// einem zusammengezogen — auch wenn sich nur ein ANDERER Bestandteil änderte.
//
// Heute setzt kein Produktivpfad diese Felder (Import, Migration 0006 und `name.anlegen` schreiben
// NULL bzw. je Art einen Teil); die Tests legen sie darum per direktem SQL an (Journal aus), so wie
// es die künftigen granularen Namensbefehle (AP-1.30 PR 10) tun werden.
//
// Eiserne Regel §5: die Fälle „Kopf-Felder" und die drei `it.fails` waren rot gegen den unveränderten
// Stand. Die Kopf-Felder sind behoben; die drei `it.fails` (Teil-Abgleich statt Neuaufbau) bleiben rot,
// bis der Prüfpfad-Vorlauf die Deckungsschwelle `koaleszenz.verdichtet` in
// test/invarianten/undo-bitgleich.test.ts neu fasst (docs/80 §33 U-130-10a-bruecke-erhaelt). Die übrigen sind
// Schutzgeländer, die vor UND nach dem Fix gelten müssen: Undo/Redo bitgleich (auch zusammengefasst
// über den Koaleszenzschlüssel) und abgeleitete Tabellen gleich ihrem Neuaufbau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { redo, undo } from '../../src/main/journal/undo'
import {
  geaendertesNamensFeld,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from './_hilfen-abgeleitet'

type Db = ReturnType<typeof oeffnen>

let jetzt = 1_790_000_000_000

function warte(ms: number): void {
  jetzt += ms
  vi.setSystemTime(jetzt)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  jetzt = 1_790_000_000_000
  vi.setSystemTime(jetzt)
})

afterEach(() => {
  vi.useRealTimers()
})

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const GRUND = 'Test U-130-10a: Felder außerhalb der flachen Brücke direkt setzen (wie künftige granulare Namensbefehle).'

interface FormKopf {
  readonly reihenfolge: string | null
  readonly rollen_notiz: string | null
  readonly konfidenz: number | null
  readonly sortier_index: number | null
}

function formKopf(db: Db, formId: string): FormKopf | undefined {
  return db
    .prepare<{ readonly formId: string }, FormKopf>('SELECT reihenfolge, rollen_notiz, konfidenz, sortier_index FROM name_form WHERE id = @formId')
    .get({ formId })
}

interface TeilZeile {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

function teile(db: Db, formId: string, art?: string): readonly TeilZeile[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>(
      `SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am
       FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index, id`,
    )
    .all({ formId })
    .filter((teil) => art === undefined || teil.art === art)
}

const KOPF_GESETZT: FormKopf = { reihenfolge: 'nachname_zuerst', rollen_notiz: 'Taufbuch 1802', konfidenz: 3, sortier_index: 2 }

/** Person + Form „Karl Friedrich* Nowak" (Rufname Friedrich), dann per direktem SQL die Felder, die die
 * flache Brücke nicht trägt: alle vier Kopf-Felder und `feminine_variante` am Nachnamen und an „Karl". */
function formMitGranularenFeldern(db: Db): { readonly personId: string; readonly formId: string } {
  const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Nowak' }).id
  journalAus(db, GRUND)
  db.prepare(
    `UPDATE name_form SET reihenfolge = @reihenfolge, rollen_notiz = @rollen_notiz, konfidenz = @konfidenz, sortier_index = @sortier_index
     WHERE id = @formId`,
  ).run({ ...KOPF_GESETZT, formId })
  db.prepare("UPDATE name_part SET feminine_variante = 'Nowakowa' WHERE name_form_id = @formId AND art = 'nachname'").run({ formId })
  db.prepare("UPDATE name_part SET feminine_variante = 'Karla' WHERE name_form_id = @formId AND art = 'vorname' AND wert = 'Karl'").run({ formId })
  journalAn(db)
  return { personId, formId }
}

/** Die Maske: Lesemodell -> Bearbeitungszustand -> EINE sichtbare Änderung -> `name.aendern` (mit `feld`). */
function maskeAendern(db: Db, personId: string, formId: string, aendern: (eintrag: NamenEintragWerte) => NamenEintragWerte): void {
  const name = personDetail(db, { personId }).namen.find((kandidat) => kandidat.id === formId)
  if (name === undefined) throw new Error(`Form ${formId} fehlt im Lesemodell.`)
  const vorher = namenEintragAusPersonDetailName(name)
  const nachher = aendern(vorher)
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(formId, nachher, geaendertesNamensFeld(vorher, nachher)))
}

function angewendeteSchritte(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>("SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'").get()
  if (zeile === undefined) throw new Error('angewendeteSchritte(): COUNT lieferte keine Zeile.')
  return zeile.anzahl
}

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly sortier_nachname: string | null
  readonly sortier_vornamen: string | null
}

interface PhonetikZeile {
  readonly name_id: string
  readonly verfahren: string
  readonly code: string
}

function abgeleitetAbzug(db: Db): string {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5vocab('suche_fts', 'instance')")
  const fts = sucheFtsInhaltAbzug(db)
  const verwaist = verwaisteFtsEintraegeAnzahl(db)
  db.exec('DROP TABLE vocab')
  const flach = db
    .prepare<[], PersonFlachZeile>('SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen FROM person_flach ORDER BY person_id')
    .all()
  const phonetik = db.prepare<[], PhonetikZeile>('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren').all()
  return JSON.stringify({ fts, verwaist, flach, phonetik })
}

/** Abgeleitete Tabellen (FTS, person_flach, name_phonetik) gleich ihrem vollständigen Neuaufbau. */
function erwarteAbgeleitetWieNeuaufbau(db: Db): void {
  const inkrementell = abgeleitetAbzug(db)
  alleAbgeleitetenNeuAufbauen(db)
  expect(inkrementell).toBe(abgeleitetAbzug(db))
  expect(JSON.parse(inkrementell)).toMatchObject({ verwaist: 0 })
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
}

describe('name.aendern erhält Felder außerhalb der flachen Brücke (U-130-10a-bruecke-erhaelt)', () => {
  it('Kopf-Felder außerhalb des flachen Vertrags (reihenfolge, rollen_notiz, konfidenz, sortier_index) bleiben bei jeder Maskenänderung', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formMitGranularenFeldern(db)
      warte(5000)
      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, nachname: 'Nowack' }))
      expect(formKopf(db, formId)).toEqual(KOPF_GESETZT)
      warte(5000)
      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, vornamen: 'Karl Friedrich Wilhelm', typ: 'ehename' }))
      expect(formKopf(db, formId)).toEqual(KOPF_GESETZT)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it.fails('Nachname ändern (wie die Maske): Kopf-Felder bleiben, Vorname-Teile bleiben Zeile für Zeile (ID, feminine_variante)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formMitGranularenFeldern(db)
      const vornamenVorher = teile(db, formId, 'vorname')
      warte(5000)

      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, nachname: 'Nowack' }))

      expect(formKopf(db, formId)).toEqual(KOPF_GESETZT)
      expect(teile(db, formId, 'vorname')).toEqual(vornamenVorher)
      expect(teile(db, formId, 'nachname').map((teil) => teil.wert)).toEqual(['Nowack'])
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it.fails('Vornamen ändern: der Nachname-Teil bleibt Zeile für Zeile (ID, feminine_variante „Nowakowa")', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formMitGranularenFeldern(db)
      const nachnameVorher = teile(db, formId, 'nachname')
      warte(5000)

      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, vornamen: 'Karl Friedrich Wilhelm' }))

      expect(formKopf(db, formId)).toEqual(KOPF_GESETZT)
      expect(teile(db, formId, 'nachname')).toEqual(nachnameVorher)
      expect(nachnameVorher[0]?.feminine_variante).toBe('Nowakowa')
      // Die unveränderten Vornamen „Karl" und „Friedrich" stehen an derselben Stelle: auch sie bleiben.
      const karl = teile(db, formId, 'vorname').find((teil) => teil.wert === 'Karl')
      expect(karl?.feminine_variante).toBe('Karla')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it.fails('zwei getrennte Nachnamen-Teile bleiben getrennt, wenn der flache Nachname gleich bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Anna', nachname: 'Müller' }).id
      journalAus(db, GRUND)
      db.prepare(
        `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
         VALUES ('teil-zweiter-nachname', @formId, 'nachname', 'Lüdenscheidt', 0, 1, NULL, 1, 1)`,
      ).run({ formId })
      journalAn(db)
      const nachnamenVorher = teile(db, formId, 'nachname')
      expect(nachnamenVorher.map((teil) => teil.wert)).toEqual(['Müller', 'Lüdenscheidt'])
      warte(5000)

      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, vornamen: 'Anna Maria' }))

      expect(teile(db, formId, 'nachname')).toEqual(nachnamenVorher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Schutzgeländer: Undo und Redo nach einer Maskenänderung sind bitgleich, abgeleitete Tabellen wie Neuaufbau', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formMitGranularenFeldern(db)
      warte(5000)
      const ausgang = kanonischerAbzug(db)

      maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, nachname: 'Nowack', vornamen: 'Friedrich Karl' }))
      const nachher = kanonischerAbzug(db)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Schutzgeländer: zusammengefasste Folge (Koaleszenz) aus Umbenennen, Anhängen, Tauschen und Entfernen — EIN Undo-Schritt, Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formMitGranularenFeldern(db)
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const schritteVorher = angewendeteSchritte(db)

      // Alle Schritte ändern nur `vornamen` (feld 'vornamen'); der Rufname „Friedrich" bleibt an Index 1.
      for (const [i, vornamen] of ['Carl Friedrich', 'Carl Friedrich Wilhelm', 'Wilhelm Friedrich Carl', 'Wilhelm Friedrich'].entries()) {
        if (i > 0) warte(300)
        maskeAendern(db, personId, formId, (eintrag) => ({ ...eintrag, vornamen }))
      }
      expect(angewendeteSchritte(db) - schritteVorher).toBe(1)
      const nachher = kanonischerAbzug(db)
      erwarteAbgeleitetWieNeuaufbau(db)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Schutzgeländer: Rufname-Wechsel über rufnameIndex dreimal zusammengefasst — Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = formMitGranularenFeldern(db)
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const schritteVorher = angewendeteSchritte(db)
      for (const [i, rufnameIndex] of [0, 1, 0].entries()) {
        if (i > 0) warte(300)
        fuehreAus(db, 'name.aendern', { id: formId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex, nachname: 'Nowak', feld: 'rufnameIndex' })
      }
      expect(angewendeteSchritte(db) - schritteVorher).toBe(1)
      const nachher = kanonischerAbzug(db)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

describe('Behauptung zerlegung.ts (montiereOriginalText): Form mit original_text = NULL und nachträglich eingefügten Teilen', () => {
  it('FTS bleibt deckungsgleich mit dem Neuaufbau — über Einfügen der Teile, Ändern der Form, Ändern eines Teils und Löschen', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      journalAus(db, GRUND)
      db.prepare(
        `INSERT INTO name_form (id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von,
           umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text, erstellt_am, geaendert_am)
         VALUES ('form-ohne-text', @personId, NULL, NULL, NULL, 'geburtsname', NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 1)`,
      ).run({ personId })
      erwarteAbgeleitetWieNeuaufbau(db)
      const teilEinfuegen = db.prepare(
        `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
         VALUES (@id, 'form-ohne-text', @art, @wert, 0, @sortierIndex, NULL, 1, 1)`,
      )
      teilEinfuegen.run({ id: 'teil-1', art: 'vorname', wert: 'Johann', sortierIndex: 0 })
      teilEinfuegen.run({ id: 'teil-2', art: 'vorname', wert: 'Georg', sortierIndex: 1 })
      teilEinfuegen.run({ id: 'teil-3', art: 'nachname', wert: "O'Brien", sortierIndex: 0 })
      erwarteAbgeleitetWieNeuaufbau(db)

      db.prepare("UPDATE name_form SET gueltig_von = 18000101 WHERE id = 'form-ohne-text'").run()
      erwarteAbgeleitetWieNeuaufbau(db)
      db.prepare("UPDATE name_part SET wert = 'Jörg' WHERE id = 'teil-2'").run()
      erwarteAbgeleitetWieNeuaufbau(db)
      db.prepare("DELETE FROM name_part WHERE id = 'teil-1'").run()
      erwarteAbgeleitetWieNeuaufbau(db)
      db.prepare("DELETE FROM name_form WHERE id = 'form-ohne-text'").run()
      erwarteAbgeleitetWieNeuaufbau(db)
      journalAn(db)
    } finally {
      db.close()
    }
  })
})
