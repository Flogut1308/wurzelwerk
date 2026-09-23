// test/migration/namensformen.test.ts (AP-1.33, docs/schema/0006_namensformen.sql, additiv — kein
// geschützter Prüfpfad; nur die neue Migration 0006 selbst geprüft, analog import-luecken.test.ts).
// Deckt den Auftrag aus 57_Phase0_Arbeitspakete.md AP-1.33 ab: Aufstieg 5->6, verlustfreier
// Datenumzug der flachen `name`-Tabelle in `name_form` + `name_part` (jede alte Spalte jeder alten
// Zeile an ihrem Zielort wiederfindbar, IDs erhalten), harter DROP von `name`, Constraint "genau ein
// Hauptname je Person", Trigger-/FK-Funktionsfähigkeit.
//
// Der Vor-Zustand kommt aus der eingefrorenen fixtures/datenbanken/schema-v5.sqlite (mit dem zu v5
// passenden trigger_generiert.sql gebaut, `pnpm fixture:db 5`) — dieselbe Vorsichtsmaßnahme wie in
// import-luecken.test.ts (:195-203): eine frisch gefilterte In-Memory-DB bekäme die v6-Trigger.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

const FIXTURE_V5_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v5.sqlite')

interface TabelleZeile {
  readonly name: string
}

function tabelleExistiert(db: Database.Database, tabelle: string): boolean {
  const zeile = db
    .prepare<{ readonly name: string }, TabelleZeile>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = @name",
    )
    .get({ name: tabelle })
  return zeile !== undefined
}

function triggerNamenFuerTabelle(db: Database.Database, tabelle: string): readonly string[] {
  return db
    .prepare<{ readonly tabelle: string }, TabelleZeile>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = @tabelle",
    )
    .all({ tabelle })
    .map((zeile) => zeile.name)
    .sort((a, b) => a.localeCompare(b))
}

interface AnzahlZeile {
  readonly anzahl: number
}

function zeilenzahl(db: Database.Database, tabelle: string): number {
  const zeile = db.prepare<[], AnzahlZeile>(`SELECT COUNT(*) AS anzahl FROM ${tabelle}`).get()
  if (zeile === undefined) {
    throw new Error(`COUNT(*) auf ${tabelle} lieferte keine Zeile.`)
  }
  return zeile.anzahl
}

/** Bestandteile einer Form, art-gefiltert, aufsteigend nach sortier_index. */
function teilWerte(db: Database.Database, formId: string, art: string): readonly string[] {
  return db
    .prepare<{ readonly formId: string; readonly art: string }, { readonly wert: string }>(
      'SELECT wert FROM name_part WHERE name_form_id = @formId AND art = @art ORDER BY sortier_index',
    )
    .all({ formId, art })
    .map((zeile) => zeile.wert)
}

interface FormZeile {
  readonly id: string
  readonly person_id: string
  readonly rolle: string | null
  readonly ist_bevorzugt: number
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly sprache: string | null
  readonly schrift: string | null
  readonly original_text: string | null
  readonly gueltig_von: number | null
}

function formVon(db: Database.Database, id: string): FormZeile {
  const zeile = db
    .prepare<{ readonly id: string }, FormZeile>(
      'SELECT id, person_id, rolle, ist_bevorzugt, umschrift_von, umschrift_norm, sprache, schrift, original_text, gueltig_von FROM name_form WHERE id = @id',
    )
    .get({ id })
  if (zeile === undefined) {
    throw new Error(`Keine name_form mit id "${id}" gefunden.`)
  }
  return zeile
}

/** Eine alte `name`-Zeile im Fixture — nur die im Test gesetzten Spalten. */
interface AltNameZeile {
  readonly id: string
  readonly personId: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly vornamen: string | null
  readonly rufnameIndex: number | null
  readonly rufnameText: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titelVor: string | null
  readonly zusatzNach: string | null
  readonly originalText: string | null
  readonly sprache: string | null
  readonly istBevorzugt: number | null
  readonly gueltigVon: number | null
}

describe('test/migration/namensformen (AP-1.33, docs/schema/0006_namensformen.sql)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-namensformen-'))
    dbPfad = join(ordner, 'baum.sqlite')
    copyFileSync(FIXTURE_V5_PFAD, dbPfad)
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  // IDs deterministisch je Testfall neu (uuidv7), aber die polymorphen Verweise (umschrift_von)
  // brauchen stabile Bezüge — darum in setzeFixture() als Objekt zurückgegeben.
  function setzeFixture(db: Database.Database): {
    readonly zeilen: readonly AltNameZeile[]
    readonly cyrlId: string
    readonly translitId: string
    readonly ehenameId: string
    readonly sonstigesId: string
    readonly rufnameTextId: string
    readonly rufnameKollisionId: string
    readonly geburtsnameId: string
  } {
    // Journal VOR jedem Insert entschärfen: person/name sind journalisiert, ihre jrn_*-Trigger
    // (WHEN aktiv = 1) würden ohne armierte Transaktion an aenderung.transaktion_id NOT NULL
    // scheitern. Muss vor den lazy person()-Inserts unten stehen.
    journalAus(db, 'Testvorbereitung (AP-1.33): Fixture-Namen ohne armierte Transaktion einfügen.')

    const personIds = new Map<string, string>()
    const person = (schluessel: string): string => {
      let id = personIds.get(schluessel)
      if (id === undefined) {
        id = uuidv7()
        personIds.set(schluessel, id)
        db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id })
      }
      return id
    }

    const cyrlId = uuidv7()
    const translitId = uuidv7()
    const ehenameId = uuidv7()
    const sonstigesId = uuidv7()
    const rufnameTextId = uuidv7()
    const rufnameKollisionId = uuidv7()
    const geburtsnameId = uuidv7()

    // Ein Person je Rolle (damit "genau ein Hauptname" trivial hält), außer dem transliterierten
    // Paar, das sich EINE Person teilt (Original cyrillisch bevorzugt + lateinische Umschrift).
    const pTrans = person('translit')
    const zeilen: readonly AltNameZeile[] = [
      {
        id: geburtsnameId,
        personId: person('geburtsname'),
        typ: 'geburtsname',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Karl Friedrich Wilhelm',
        rufnameIndex: 1, // "Friedrich" ist Rufname
        rufnameText: null,
        nachname: 'Gutnoff',
        praefix: 'von',
        titelVor: 'Dr.',
        zusatzNach: 'Jr.',
        originalText: 'Dr. Karl Friedrich Wilhelm von Gutnoff Jr.',
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: 2451545,
      },
      {
        id: ehenameId,
        personId: person('ehename'),
        typ: 'ehename',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Maria',
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Schmidt',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: null, // einzige Form der Person -> Migration macht sie bevorzugt
        gueltigVon: null,
      },
      {
        id: uuidv7(),
        personId: person('vulgo'),
        typ: 'vulgo',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: null,
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Zimmermanns-Hof',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: null,
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: uuidv7(),
        personId: person('latinisiert'),
        typ: 'latinisiert',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Carolus',
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Fabricius',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'la',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: uuidv7(),
        personId: person('ordensname'),
        typ: 'ordensname',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Bruder Konrad',
        rufnameIndex: null,
        rufnameText: null,
        nachname: null,
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: uuidv7(),
        personId: person('beruf'),
        typ: 'beruf',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: null,
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Müller',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: uuidv7(),
        personId: person('aka'),
        typ: 'aka',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Fritz',
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'der Große',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: sonstigesId,
        personId: person('sonstiges'),
        typ: 'sonstiges',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: null,
        rufnameIndex: null,
        rufnameText: null,
        nachname: null,
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: 'unklarer Namenszusatz', // nur original_text -> Form ohne Bestandteile
        sprache: null,
        istBevorzugt: 1,
        gueltigVon: null,
      },
      // Transliteriertes Paar auf EINER Person:
      {
        id: cyrlId,
        personId: pTrans,
        typ: 'geburtsname',
        schrift: 'cyrl',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Карл',
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Гутнофф',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'ru',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      {
        id: translitId,
        personId: pTrans,
        typ: 'transliteriert',
        schrift: 'latn',
        umschriftVon: cyrlId, // Selbstverweis auf die Ursprungsform -> ID muss erhalten bleiben
        umschriftNorm: 'iso9',
        vornamen: 'Karl',
        rufnameIndex: null,
        rufnameText: null,
        nachname: 'Gutnoff',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'ru',
        istBevorzugt: null,
        gueltigVon: null,
      },
      // Rufname als Text, NICHT unter den Vornamen -> zusätzlicher name_part(vorname, ist_rufname=1)
      {
        id: rufnameTextId,
        personId: person('rufnameText'),
        typ: 'geburtsname',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Johann Baptist',
        rufnameIndex: null,
        rufnameText: 'Hans',
        nachname: 'Weber',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: null,
      },
      // Rufname als Text, der IST unter den Vornamen (Kollision, hueter-Auflage 1): rufname_index
      // NULL, rufname_text='Hans' gleicht dem vorhandenen Vorname-Token -> GENAU dieser Token wird
      // markiert, KEIN zweiter „Hans" entsteht (verlustfrei, sonst wäre die Rufname-Angabe verloren).
      {
        id: rufnameKollisionId,
        personId: person('rufnameKollision'),
        typ: 'geburtsname',
        schrift: 'latn',
        umschriftVon: null,
        umschriftNorm: null,
        vornamen: 'Hans Peter',
        rufnameIndex: null,
        rufnameText: 'Hans',
        nachname: 'Weber',
        praefix: null,
        titelVor: null,
        zusatzNach: null,
        originalText: null,
        sprache: 'de',
        istBevorzugt: 1,
        gueltigVon: null,
      },
    ]

    const stmt = db.prepare(
      'INSERT INTO name (id, person_id, typ, schrift, umschrift_von, umschrift_norm, vornamen, rufname_index, rufname_text, nachname, praefix, titel_vor, zusatz_nach, original_text, sprache, ist_bevorzugt, gueltig_von) ' +
        'VALUES (@id, @personId, @typ, @schrift, @umschriftVon, @umschriftNorm, @vornamen, @rufnameIndex, @rufnameText, @nachname, @praefix, @titelVor, @zusatzNach, @originalText, @sprache, @istBevorzugt, @gueltigVon)',
    )
    for (const zeile of zeilen) {
      stmt.run(zeile)
    }
    journalAn(db)

    return { zeilen, cyrlId, translitId, ehenameId, sonstigesId, rufnameTextId, rufnameKollisionId, geburtsnameId }
  }

  it('SCHEMA_VERSION ist 6 und der Aufstieg landet auf 6', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(SCHEMA_VERSION).toBe(6)
      expect(db.pragma('user_version', { simple: true })).toBe(5)
      migrieren(db)
      expect(db.pragma('user_version', { simple: true })).toBe(6)
    } finally {
      db.close()
    }
  })

  it('harter Schnitt: name ist entfernt, name_form und name_part existieren', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      expect(tabelleExistiert(db, 'name')).toBe(false)
      expect(tabelleExistiert(db, 'name_form')).toBe(true)
      expect(tabelleExistiert(db, 'name_part')).toBe(true)
    } finally {
      db.close()
    }
  })

  it('verlustfrei: jede alte name-Zeile wird zu genau einer name_form mit erhaltener id', () => {
    const db = oeffnen(dbPfad)
    try {
      const { zeilen } = setzeFixture(db)
      const anzahlVorher = zeilenzahl(db, 'name')
      migrieren(db)

      expect(zeilenzahl(db, 'name_form')).toBe(anzahlVorher)
      for (const alt of zeilen) {
        const form = formVon(db, alt.id) // id erhalten
        expect(form.person_id).toBe(alt.personId)
        expect(form.sprache).toBe(alt.sprache)
        expect(form.schrift).toBe(alt.schrift)
        expect(form.original_text).toBe(alt.originalText)
        expect(form.gueltig_von).toBe(alt.gueltigVon)
      }
    } finally {
      db.close()
    }
  })

  it('rolle-Abbildung: typ wird rolle; transliteriert wird rolle=NULL mit erhaltenem umschrift_von', () => {
    const db = oeffnen(dbPfad)
    try {
      const { zeilen, cyrlId, translitId } = setzeFixture(db)
      migrieren(db)

      for (const alt of zeilen) {
        const form = formVon(db, alt.id)
        if (alt.typ === 'transliteriert') {
          expect(form.rolle).toBeNull()
          expect(form.umschrift_norm).toBe('iso9')
        } else {
          expect(form.rolle).toBe(alt.typ)
        }
      }
      // umschrift_von zeigt weiter auf die erhaltene Ursprungs-id.
      expect(formVon(db, translitId).umschrift_von).toBe(cyrlId)
    } finally {
      db.close()
    }
  })

  it('Bestandteile: Vornamen zerlegt und sortiert, Rufname markiert, Präfix/Titel/Suffix/Nachname am Zielort', () => {
    const db = oeffnen(dbPfad)
    try {
      const { geburtsnameId } = setzeFixture(db)
      migrieren(db)

      // vornamen='Karl Friedrich Wilhelm', rufname_index=1 -> drei Vorname-Teile, Friedrich=Rufname.
      expect(teilWerte(db, geburtsnameId, 'vorname')).toEqual(['Karl', 'Friedrich', 'Wilhelm'])
      expect(teilWerte(db, geburtsnameId, 'nachname')).toEqual(['Gutnoff'])
      expect(teilWerte(db, geburtsnameId, 'praefix')).toEqual(['von'])
      expect(teilWerte(db, geburtsnameId, 'titel')).toEqual(['Dr.'])
      expect(teilWerte(db, geburtsnameId, 'suffix')).toEqual(['Jr.'])

      const rufname = db
        .prepare<{ readonly formId: string }, { readonly wert: string }>(
          "SELECT wert FROM name_part WHERE name_form_id = @formId AND art = 'vorname' AND ist_rufname = 1",
        )
        .all({ formId: geburtsnameId })
      expect(rufname).toEqual([{ wert: 'Friedrich' }])
    } finally {
      db.close()
    }
  })

  it('Rufname-Text nicht unter den Vornamen wird ein zusätzlicher Vorname-Teil mit ist_rufname=1', () => {
    const db = oeffnen(dbPfad)
    try {
      const { rufnameTextId } = setzeFixture(db)
      migrieren(db)

      // Johann Baptist bleiben Vornamen, Hans kommt als markierter Rufname hinzu.
      expect([...teilWerte(db, rufnameTextId, 'vorname')].sort()).toEqual(['Baptist', 'Hans', 'Johann'])
      const rufname = db
        .prepare<{ readonly formId: string }, { readonly wert: string }>(
          "SELECT wert FROM name_part WHERE name_form_id = @formId AND art = 'vorname' AND ist_rufname = 1",
        )
        .all({ formId: rufnameTextId })
      expect(rufname).toEqual([{ wert: 'Hans' }])
    } finally {
      db.close()
    }
  })

  it('Rufname-Text, der IST unter den Vornamen, markiert genau diesen Token (kein zweiter Token, verlustfrei)', () => {
    const db = oeffnen(dbPfad)
    try {
      const { rufnameKollisionId } = setzeFixture(db)
      migrieren(db)

      // vornamen='Hans Peter', rufname_index=NULL, rufname_text='Hans': genau ein „Hans"-Vorname …
      expect(teilWerte(db, rufnameKollisionId, 'vorname')).toEqual(['Hans', 'Peter'])

      // … und genau dieser vorhandene Token trägt ist_rufname=1 (kein zusätzlicher „Hans"-Teil).
      const rufname = db
        .prepare<{ readonly formId: string }, { readonly wert: string }>(
          "SELECT wert FROM name_part WHERE name_form_id = @formId AND art = 'vorname' AND ist_rufname = 1",
        )
        .all({ formId: rufnameKollisionId })
      expect(rufname).toEqual([{ wert: 'Hans' }])
    } finally {
      db.close()
    }
  })

  it('leere Bestandteile werden nicht persistiert (Form ohne name_part erlaubt)', () => {
    const db = oeffnen(dbPfad)
    try {
      const { sonstigesId } = setzeFixture(db)
      migrieren(db)
      const anzahl = db
        .prepare<{ readonly formId: string }, AnzahlZeile>(
          'SELECT COUNT(*) AS anzahl FROM name_part WHERE name_form_id = @formId',
        )
        .get({ formId: sonstigesId })
      expect(anzahl).toEqual({ anzahl: 0 })
      expect(formVon(db, sonstigesId).original_text).toBe('unklarer Namenszusatz')
    } finally {
      db.close()
    }
  })

  it('genau ein Hauptname je Person nach dem Umzug (auch wo alt keiner bevorzugt war)', () => {
    const db = oeffnen(dbPfad)
    try {
      const { ehenameId } = setzeFixture(db)
      migrieren(db)

      // Jede Person mit mindestens einer Form hat genau eine bevorzugte.
      const verstoesse = db
        .prepare<[], { readonly person_id: string; readonly anzahl: number }>(
          'SELECT person_id, SUM(ist_bevorzugt) AS anzahl FROM name_form GROUP BY person_id HAVING SUM(ist_bevorzugt) <> 1',
        )
        .all()
      expect(verstoesse).toEqual([])

      // Die alt unbevorzugte einzige Form wurde bevorzugt.
      expect(formVon(db, ehenameId).ist_bevorzugt).toBe(1)
    } finally {
      db.close()
    }
  })

  it('Constraint erzwingt genau einen Hauptnamen: zwei bevorzugte Formen je Person werden abgelehnt', () => {
    const db = oeffnen(dbPfad)
    try {
      const { ehenameId, geburtsnameId } = setzeFixture(db)
      migrieren(db)

      journalAus(db, 'Testvorbereitung (AP-1.33): Constraint-Gegenprobe ohne armierte Transaktion.')
      // ehenameId gehört Person A (eine bevorzugte Form). Eine zweite bevorzugte Form derselben
      // Person muss die DB ablehnen (partieller UNIQUE-Index).
      const personA = formVon(db, ehenameId).person_id
      expect(() =>
        db
          .prepare(
            "INSERT INTO name_form (id, person_id, rolle, ist_bevorzugt) VALUES (@id, @personId, 'aka', 1)",
          )
          .run({ id: uuidv7(), personId: personA }),
      ).toThrow()

      // Eine nicht-bevorzugte zweite Form ist dagegen erlaubt.
      expect(() =>
        db
          .prepare(
            "INSERT INTO name_form (id, person_id, rolle, ist_bevorzugt) VALUES (@id, @personId, 'aka', 0)",
          )
          .run({ id: uuidv7(), personId: personA }),
      ).not.toThrow()
      journalAn(db)
      expect(geburtsnameId).toBeTruthy()
    } finally {
      db.close()
    }
  })

  it('Trigger und referenzielle Integrität: name-Trigger weg, name_form/name_part journalisiert + abgeleitet, FK sauber', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)

      expect(triggerNamenFuerTabelle(db, 'name')).toEqual([])

      const formTrigger = triggerNamenFuerTabelle(db, 'name_form')
      expect(formTrigger).toContain('jrn_name_form_ai')
      expect(formTrigger).toContain('jrn_name_form_au')
      expect(formTrigger).toContain('jrn_name_form_ad')
      // Abgeleitete Projektion (person_flach/FTS/Phonetik) hängt jetzt an name_form.
      expect(formTrigger.some((name) => name.startsWith('abl_name_form_'))).toBe(true)

      const teilTrigger = triggerNamenFuerTabelle(db, 'name_part')
      expect(teilTrigger).toContain('jrn_name_part_ai')
      expect(teilTrigger).toContain('jrn_name_part_au')
      expect(teilTrigger).toContain('jrn_name_part_ad')

      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('person_flach ist nach dem Umzug je Person neu aufgebaut', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      const personenVorher = zeilenzahl(db, 'person')
      migrieren(db)
      // Jede Person hat weiterhin genau eine person_flach-Zeile.
      expect(zeilenzahl(db, 'person_flach')).toBe(personenVorher)
    } finally {
      db.close()
    }
  })
})
