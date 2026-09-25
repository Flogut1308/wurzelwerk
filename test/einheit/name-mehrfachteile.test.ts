// Vorarbeiten AP-1.30 Teil 3, PR 2 (Eigentümer-Entscheidung E2 vom 25.09.2026, docs/80 §32
// V-4b-ersterwert): ALLE Titel, Präfixe und Zusätze einer Namensform erscheinen im Anzeigetext, je Art
// in `sortierIndex`-Reihenfolge — „Dr. med. Karl von und zu Guttenberg“ statt „Dr. Karl von
// Guttenberg“. Vorher übernahm `rekonstruiereFlach` je Art nur den ersten Wert (`ersterWert`); weitere
// gingen in Anzeige, Profil und beim Ändern über die flache Namensbrücke verloren.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { anzeigetextVon } from '../../src/core/name/anzeigename'
import { rekonstruiereFlach, type GeladenerTeil } from '../../src/core/name/zerlegung'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { personDetail } from '../../src/main/abfragen/person-detail'

function teil(art: GeladenerTeil['art'], wert: string, sortierIndex: number): GeladenerTeil {
  return { art, wert, istRufname: false, sortierIndex }
}

const guttenberg: readonly GeladenerTeil[] = [
  teil('titel', 'Dr.', 0),
  teil('titel', 'med.', 1),
  teil('vorname', 'Karl', 0),
  teil('praefix', 'von', 0),
  teil('praefix', 'und', 1),
  teil('praefix', 'zu', 2),
  teil('nachname', 'Guttenberg', 0),
  teil('suffix', 'd. Ä.', 0),
  teil('suffix', 'II.', 1),
]

describe('Mehrfache Titel, Präfixe und Zusätze im Anzeigetext (E2, V-4b-ersterwert)', () => {
  it('zeigt alle Titel, Präfixe und Zusätze in sortierIndex-Reihenfolge', () => {
    expect(anzeigetextVon({ teile: guttenberg, originalText: null })).toBe('Dr. med. Karl von und zu Guttenberg d. Ä. II.')
  })

  it('hängt nicht von der Ladereihenfolge ab (die Datenbank liefert keine garantierte)', () => {
    const umgekehrt = [...guttenberg].reverse()
    expect(anzeigetextVon({ teile: umgekehrt, originalText: null })).toBe('Dr. med. Karl von und zu Guttenberg d. Ä. II.')
  })

  it('ein leerer erster Titel verdrängt keinen gefüllten zweiten; reine Leerzeichen-Teile erzeugen keine Doppelleerzeichen', () => {
    const teile = [teil('titel', ' ', 0), teil('titel', 'Prof.', 1), teil('vorname', 'Anna', 0), teil('praefix', ' ', 0), teil('praefix', 'van', 1), teil('nachname', 'Dijk', 0)]
    expect(anzeigetextVon({ teile, originalText: null })).toBe('Prof. Anna van Dijk')
  })

  it('Leerraum-Teile (Tab, NBSP, U+3000) zählen auch bei Nachname und Vatersname nicht (hueter #141, 1/2)', () => {
    const teile = [
      teil('vorname', 'Iwan', 0),
      teil('vatersname', '\t', 0),
      teil('vatersname', 'Petrowitsch', 1),
      teil('nachname', '\u00a0', 0),
      teil('nachname', '\u3000', 1),
      teil('nachname', 'Iwanow', 2),
      teil('suffix', '\t', 0),
    ]
    expect(anzeigetextVon({ teile, originalText: null })).toBe('Iwan Petrowitsch Iwanow')
    expect(rekonstruiereFlach(teile)).toMatchObject({ vatersname: 'Petrowitsch', nachname: 'Iwanow', zusatzNach: null })
  })

  it('rekonstruiereFlach verkettet Titel, Präfix und Zusatz wie Nachname und Vatersname', () => {
    expect(rekonstruiereFlach(guttenberg)).toMatchObject({ titelVor: 'Dr. med.', praefix: 'von und zu', zusatzNach: 'd. Ä. II.', nachname: 'Guttenberg' })
  })
})

describe('Flache Namensbrücke erhält weitere Titel beim Ändern (E2)', () => {
  it('Profil zeigt „Dr. med.“, und name.aendern mit den gelesenen Feldern (wie die Oberfläche) verliert „med.“ nicht', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Guttenberg', titelVor: 'Dr.' })
      // Ein zweiter Titel, wie ihn Import oder die granularen Namensbefehle (AP-1.30) schreiben.
      journalAus(db, 'test')
      db.prepare(
        `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index) VALUES ('teil-med', @id, 'titel', 'med.', 0, 1)`,
      ).run({ id })
      journalAn(db)

      const gelesen = personDetail(db, { personId }).namen.find((name) => name.id === id)
      expect(gelesen?.titel_vor).toBe('Dr. med.')
      if (gelesen === undefined) return

      // Die Oberfläche ändert nur den Vornamen und schickt die übrigen gelesenen Felder zurück.
      fuehreAus(db, 'name.aendern', {
        id,
        typ: 'geburtsname',
        vornamen: 'Karl Theodor',
        nachname: gelesen.nachname ?? undefined,
        praefix: gelesen.praefix ?? undefined,
        titelVor: gelesen.titel_vor ?? undefined,
        zusatzNach: gelesen.zusatz_nach ?? undefined,
      })
      const titel = db
        .prepare<{ readonly id: string }, { readonly wert: string }>(
          `SELECT wert FROM name_part WHERE name_form_id = @id AND art = 'titel' ORDER BY sortier_index`,
        )
        .all({ id })
        .map((zeile) => zeile.wert)
        .join(' ')
      expect(titel).toBe('Dr. med.')
      expect(personDetail(db, { personId }).namen.find((name) => name.id === id)?.titel_vor).toBe('Dr. med.')
    } finally {
      db.close()
    }
  })
})
