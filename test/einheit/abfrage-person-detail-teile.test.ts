// AP-1.30 PR 10-4 (docs/80 §33 V-130-10-4; A-02, G-07): `abfrage:person.detail` liefert je Namensform
// zusätzlich die Bestandteile (`teile`) und die übrigen Kopf-Felder von `name_form` — NUR LESEND, als
// Vorbereitung für den Reiter „Namen" (PR 11). Die flache Sicht (vornamen, nachname, rufname …) bleibt
// unverändert; das sichert der letzte Fall über die bestehenden Felder zu.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { montiereOriginalText, NAME_PART_ART_REIHENFOLGE, namePartArtRang } from '../../src/core/name/zerlegung'
import { NamePartArtEnum } from '../../src/shared/schemata/name'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const GRUND = 'Test V-130-10-4: Altbestand bzw. von keinem Befehl geschriebene Felder direkt setzen, um das Lesen zu prüfen.'

function formVon(namen: readonly PersonDetailName[], id: string): PersonDetailName {
  const form = namen.find((kandidat) => kandidat.id === id)
  if (form === undefined) throw new Error(`Form ${id} fehlt in personDetail().namen`)
  return form
}

describe('Anzeige-Reihenfolge der Bestandteil-Arten (V-130-10-4)', () => {
  it('deckt jede Art genau einmal ab', () => {
    expect([...NAME_PART_ART_REIHENFOLGE].sort()).toStrictEqual([...NamePartArtEnum.options].sort())
    for (const art of NamePartArtEnum.options) expect(namePartArtRang(art)).toBeGreaterThanOrEqual(0)
  })

  it('ist dieselbe Folge, in der montiereOriginalText die rekonstruierten Felder verbindet', () => {
    const montiert = montiereOriginalText({
      titelVor: 'titel',
      vornamen: 'vorname',
      vatersname: 'vatersname',
      praefix: 'praefix',
      nachname: 'nachname',
      zusatzNach: 'suffix',
    })
    expect(montiert?.split(' ')).toStrictEqual([...NAME_PART_ART_REIHENFOLGE])
  })
})

describe('abfrage:person.detail — Teile und Kopf-Felder je Namensform (AP-1.30 PR 10-4)', () => {
  it('liefert die Teile nach Art, sortier_index und id sortiert, mit Rufname-Markierung und femininer Variante', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const formId = fuehreAus(db, 'name.anlegen', {
        personId,
        typ: 'geburtsname',
        titelVor: 'Dr.',
        vornamen: 'Johann Georg',
        rufnameIndex: 1,
        praefix: 'von',
        nachname: 'Nowak',
        zusatzNach: 'd. Ä.',
      }).id
      // Ein zweiter Nachname vorn eingefügt (Stelle 0) — die Ausgabe folgt sortier_index, nicht der Einfügefolge.
      const zweiterNachname = fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Kowalski', feminineVariante: 'Kowalska', position: 0 }).id
      const vatersname = fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vatersname', wert: 'Petrowitsch' }).id

      const form = formVon(personDetail(db, { personId }).namen, formId)
      expect(form.teile.map((teil) => [teil.art, teil.wert, teil.ist_rufname, teil.sortier_index])).toStrictEqual([
        ['titel', 'Dr.', false, 0],
        ['vorname', 'Johann', false, 0],
        ['vorname', 'Georg', true, 1],
        ['vatersname', 'Petrowitsch', false, 0],
        ['praefix', 'von', false, 0],
        ['nachname', 'Kowalski', false, 0],
        ['nachname', 'Nowak', false, 1],
        ['suffix', 'd. Ä.', false, 0],
      ])
      const kowalski = form.teile.find((teil) => teil.id === zweiterNachname)
      expect(kowalski?.feminine_variante).toBe('Kowalska')
      expect(form.teile.find((teil) => teil.id === vatersname)?.wert).toBe('Petrowitsch')
      expect(form.teile.filter((teil) => teil.id !== zweiterNachname).every((teil) => teil.feminine_variante === null)).toBe(true)

      // Die Teil-IDs sind die echten `name_part.id` (Schlüssel für die granularen Befehle).
      const ids = db
        .prepare<{ readonly formId: string }, { readonly id: string }>(`SELECT id AS id FROM name_part WHERE name_form_id = @formId ORDER BY id`)
        .all({ formId })
        .map((zeile) => zeile.id)
      expect(form.teile.map((teil) => teil.id).sort()).toStrictEqual(ids)
    } finally {
      db.close()
    }
  })

  it('gleicher sortier_index innerhalb einer Art (Altbestand): Tie-Break über id', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const formId = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' }).id
      const einfuegen = db.prepare<{ readonly id: string; readonly formId: string; readonly wert: string }>(
        `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
         VALUES (@id, @formId, 'nachname', @wert, 0, 0, NULL, 1, 1)`,
      )
      journalAus(db, GRUND)
      einfuegen.run({ id: 'teil-b', formId, wert: 'Zweiter' })
      einfuegen.run({ id: 'teil-a', formId, wert: 'Erster' })
      journalAn(db)

      const form = formVon(personDetail(db, { personId }).namen, formId)
      expect(form.teile.map((teil) => teil.id)).toStrictEqual(['teil-a', 'teil-b'])
    } finally {
      db.close()
    }
  })

  it('liefert die Kopf-Felder der Form; eine Form ohne Teile hat teile = []', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const ursprung = fuehreAus(db, 'namensform.anlegen', {
        personId,
        rolle: 'ehename',
        rollenNotiz: 'nach der Heirat 1788',
        sprache: 'de',
        schrift: 'latn',
        reihenfolge: 'nachname_zuerst',
        konfidenz: 3,
        gueltigVon: 17880101,
        gueltigBis: 18200101,
        originalText: 'Nowak Anna',
      }).id
      const umschrift = fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: ursprung, umschriftNorm: 'manuell' }).id
      // `sortier_index` der Form schreibt heute kein Befehl (V-130-10-1 E6) — direkt gesetzt, um das Lesen zu prüfen.
      journalAus(db, GRUND)
      db.prepare<{ readonly id: string }>(`UPDATE name_form SET sortier_index = 7 WHERE id = @id`).run({ id: ursprung })
      journalAn(db)

      const namen = personDetail(db, { personId }).namen
      const kopf = formVon(namen, ursprung)
      expect({
        rolle: kopf.rolle,
        typ: kopf.typ,
        rollen_notiz: kopf.rollen_notiz,
        sprache: kopf.sprache,
        schrift: kopf.schrift,
        reihenfolge: kopf.reihenfolge,
        konfidenz: kopf.konfidenz,
        sortier_index: kopf.sortier_index,
        gueltig_von: kopf.gueltig_von,
        gueltig_bis: kopf.gueltig_bis,
        original_text: kopf.original_text,
        umschrift_von: kopf.umschrift_von,
        umschrift_norm: kopf.umschrift_norm,
        teile: kopf.teile,
      }).toStrictEqual({
        rolle: 'ehename',
        typ: 'ehename',
        rollen_notiz: 'nach der Heirat 1788',
        sprache: 'de',
        schrift: 'latn',
        reihenfolge: 'nachname_zuerst',
        konfidenz: 3,
        sortier_index: 7,
        gueltig_von: 17880101,
        gueltig_bis: 18200101,
        original_text: 'Nowak Anna',
        umschrift_von: null,
        umschrift_norm: null,
        teile: [],
      })

      // Umschrift: gespeicherte Rolle `null`, die flache Sicht bleibt 'transliteriert'.
      const um = formVon(namen, umschrift)
      expect([um.rolle, um.typ, um.umschrift_von, um.umschrift_norm, um.rollen_notiz, um.reihenfolge, um.konfidenz, um.sortier_index]).toStrictEqual([
        null,
        'transliteriert',
        ursprung,
        'manuell',
        null,
        null,
        null,
        null,
      ])
      expect(um.teile).toStrictEqual([])
    } finally {
      db.close()
    }
  })

  it('die flache Sicht bleibt unverändert neben den Teilen', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Gutnoff' }).id
      const form = formVon(personDetail(db, { personId }).namen, formId)
      expect([form.vornamen, form.nachname, form.rufname_index, form.rufname_text, form.praefix, form.titel_vor, form.zusatz_nach, form.vatersname]).toStrictEqual([
        'Karl Friedrich',
        'Gutnoff',
        1,
        'Friedrich',
        null,
        null,
        null,
        null,
      ])
      expect(form.teile.map((teil) => teil.wert)).toStrictEqual(['Karl', 'Friedrich', 'Gutnoff'])
    } finally {
      db.close()
    }
  })
})
