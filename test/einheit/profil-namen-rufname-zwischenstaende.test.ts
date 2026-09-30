// A-02, AP-1.30 (Fix Rufname-Anhängen): Der Namen-Reiter schreibt eine bestehende Namenszeile per
// Autosave (Blur oder `AUTOSAVE_DEBOUNCE_MS`) über `name.aendern`; nach jedem Schreiben lädt die Maske
// die Zeile neu (`abfrage:person.detail` → `namenEintragAusPersonDetailName`) und setzt den Entwurf
// darauf zurück (`useEntwurfMitVerzoegertemCommit`). Wer langsamer tippt als die Debounce-Frist,
// schreibt darum JEDEN Zwischenstand einzeln — und jeder schreibt auf dem zuvor gespeicherten Stand auf.
//
// Fachlich (docs/20_Domaenenwissen.md §24): der Rufname MARKIERT einen vorhandenen Vornamen
// (`rufname_index`). `zerlegeName` hängt einen `rufname_text`, der keinem Vornamen gleicht, als
// zusätzlichen Vornamen an — für einen einmaligen Import richtig (verlustfrei), für einen Autosave
// über Zwischenstände falsch: jeder Zwischenstand bliebe als eigener Vorname stehen.
//
// Der Test spielt die Schreibfolge der Maske über den echten Befehlsbus und die echte Leseabfrage
// nach: je Zwischenstand lesen → Eintrag bauen → ein Feld ändern → `name.aendern`.
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
import {
  geaendertesNamensFeld,
  mitVornamen,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function gespeicherterName(db: Db, personId: string, nameId: string): PersonDetailName {
  const name = personDetail(db, { personId }).namen.find((kandidat) => kandidat.id === nameId)
  if (name === undefined) throw new Error(`gespeicherterName(): Name ${nameId} fehlt in person.detail.`)
  return name
}

/** Ein Autosave-Schritt der Maske: gespeicherten Stand lesen, ein Feld ändern, `name.aendern`. */
function autosaveSchritt(db: Db, personId: string, nameId: string, aenderung: Partial<NamenEintragWerte>): void {
  const gelesen = namenEintragAusPersonDetailName(gespeicherterName(db, personId, nameId))
  const naechster: NamenEintragWerte = { ...gelesen, ...aenderung }
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(nameId, naechster, geaendertesNamensFeld(gelesen, naechster)))
}

/** V-130-11e-1: ein Vornamen-Schritt wie im Reiter Person — der Entwurf folgt `mitVornamen` (der Rufname
 * wandert mit dem umgeschriebenen markierten Wort oder entfällt), dann `name.aendern`. */
function vornamenSchritt(db: Db, personId: string, nameId: string, vornamen: string): void {
  const gelesen = namenEintragAusPersonDetailName(gespeicherterName(db, personId, nameId))
  const naechster = mitVornamen(gelesen, vornamen)
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(nameId, naechster, geaendertesNamensFeld(gelesen, naechster)))
}

/** Alle Präfixe eines Worts, wie sie beim Tippen Zeichen für Zeichen entstehen („F", „Fr", …). */
function zwischenstaende(wort: string): readonly string[] {
  return Array.from({ length: wort.length }, (_, laenge) => wort.slice(0, laenge + 1))
}

describe('Namen-Reiter: Rufname über Autosave-Zwischenstände (A-02, AP-1.30)', () => {
  it('langsam getippter Rufname „Friedrich" hängt keine Zwischenstände als Vornamen an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', nachname: 'Gutnoff' })

      for (const text of zwischenstaende('Friedrich')) autosaveSchritt(db, personId, id, { rufname: text })

      const ergebnis = gespeicherterName(db, personId, id)
      expect(ergebnis.vornamen).toBe('Karl Friedrich')
      expect(ergebnis.rufname_index).toBe(1)
      expect(ergebnis.rufname_text).toBe('Friedrich')
    } finally {
      db.close()
    }
  })

  it('Vornamen langsam umschreiben hängt den bisherigen Rufnamen nicht als zusätzlichen Vornamen an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', {
        personId,
        typ: 'geburtsname',
        vornamen: 'Karl Friedrich',
        rufnameText: 'Friedrich',
        nachname: 'Gutnoff',
      })
      expect(gespeicherterName(db, personId, id).rufname_index).toBe(1)

      // „Friedrich" zu „Fritz" umschreiben: rückwärts löschen bis „Fri", dann „tz" tippen.
      for (const vornamen of ['Karl Friedric', 'Karl Friedri', 'Karl Friedr', 'Karl Fried', 'Karl Frie', 'Karl Fri', 'Karl Frit', 'Karl Fritz']) {
        autosaveSchritt(db, personId, id, { vornamen })
      }

      expect(gespeicherterName(db, personId, id).vornamen).toBe('Karl Fritz')
    } finally {
      db.close()
    }
  })

  // U-130-11c2-rufname-verlust (docs/80 §33, PR 11e-1): der Rufname hängt am umgeschriebenen Vornamen.
  // Im ersten Zwischenstand „Karl Friedric" gleicht der Rufname „Friedrich" keinem Vornamen mehr. Es hat
  // sich aber genau das markierte Wort geändert (gleiche Wortzahl, alle anderen gleich): `mitVornamen`
  // führt den Rufname-Text mit („Friedric", Position 1), statt die Markierung zu verlieren.
  it('U-130-11c2-rufname-verlust: nach „Friedrich" → „Fritz" bleibt der Rufname „Fritz" an Position 1', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameText: 'Friedrich', nachname: 'Gutnoff' })

      vornamenSchritt(db, personId, id, 'Karl Friedric')
      const erster = gespeicherterName(db, personId, id)
      expect([erster.vornamen, erster.rufname_text, erster.rufname_index]).toEqual(['Karl Friedric', 'Friedric', 1])
      for (const vornamen of ['Karl Friedri', 'Karl Friedr', 'Karl Fried', 'Karl Frie', 'Karl Fri', 'Karl Frit', 'Karl Fritz']) {
        vornamenSchritt(db, personId, id, vornamen)
      }

      const ergebnis = gespeicherterName(db, personId, id)
      expect([ergebnis.vornamen, ergebnis.rufname_text, ergebnis.rufname_index]).toEqual(['Karl Fritz', 'Fritz', 1])
    } finally {
      db.close()
    }
  })

  // Vorne eingefügt: das markierte Wort und alles dahinter sind unverändert, die Stelle verschiebt sich um
  // das eingefügte Wort. Die Textsuche allein fände das erste „Johann" (Position 1) statt des markierten.
  it('ein vorne eingefügter Vorname verschiebt die Markierung mit („H Johann Georg Johann", Position 3)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Johann Georg Johann', rufnameIndex: 2, nachname: 'Gutnoff' })

      for (const vornamen of ['HJohann Georg Johann', 'H Johann Georg Johann']) vornamenSchritt(db, personId, id, vornamen)

      const ergebnis = gespeicherterName(db, personId, id)
      expect([ergebnis.vornamen, ergebnis.rufname_text, ergebnis.rufname_index]).toEqual(['H Johann Georg Johann', 'Johann', 3])
    } finally {
      db.close()
    }
  })

  // Das markierte letzte „Johann" wird umgeschrieben: die Zwischenstände „Jo…" halten Position 2, das
  // wieder vollständige „Johann" springt nicht auf das erste.
  it('das markierte letzte „Johann" umschreiben hält Position 2', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Johann Georg Johann', rufnameIndex: 2, nachname: 'Gutnoff' })

      for (const vornamen of ['Johann Georg Johan', 'Johann Georg Joha', 'Johann Georg Joh', 'Johann Georg Jo', 'Johann Georg Joh', 'Johann Georg Joha', 'Johann Georg Johan', 'Johann Georg Johann']) {
        vornamenSchritt(db, personId, id, vornamen)
        expect(gespeicherterName(db, personId, id).rufname_index).toBe(2)
      }

      const ergebnis = gespeicherterName(db, personId, id)
      expect([ergebnis.vornamen, ergebnis.rufname_text, ergebnis.rufname_index]).toEqual(['Johann Georg Johann', 'Johann', 2])
    } finally {
      db.close()
    }
  })

  // Wird das markierte Wort gelöscht, entfällt die Markierung — sie springt nicht auf ein anderes Wort.
  it.each([
    ['letztes Wort', 'Karl Friedrich', 1, ['Karl Friedric', 'Karl F', 'Karl'], 'Karl'],
    ['erstes Wort', 'Karl Friedrich', 0, ['arl Friedrich', 'l Friedrich', ' Friedrich'], 'Friedrich'],
  ] as const)('das markierte Wort löschen nimmt die Markierung weg (%s)', (_titel, vornamen, rufnameIndex, schritte, endstand) => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen, rufnameIndex, nachname: 'Gutnoff' })

      for (const schritt of schritte) vornamenSchritt(db, personId, id, schritt)

      const ergebnis = gespeicherterName(db, personId, id)
      expect([ergebnis.vornamen, ergebnis.rufname_text, ergebnis.rufname_index]).toEqual([endstand, null, null])
    } finally {
      db.close()
    }
  })

  // Review H1: ein Rufname, der beim Anlegen/Import/Migration 0006 KEIN Vorname war, steht als EIN
  // `name_part` hinten an — auch mehrwortig („Hans Peter"). Die Rekonstruktion gibt ihn als
  // `rufname_text` „Hans Peter" mit Index 1 zurück, die Vornamen-Kette als „Karl Hans Peter".
  it('mehrwortiger Rufname behält seine Markierung, wenn nur ein anderes Feld geändert wird', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      const vorher = gespeicherterName(db, personId, id)
      expect([vorher.vornamen, vorher.rufname_text, vorher.rufname_index]).toEqual(['Karl Hans Peter', 'Hans Peter', 1])

      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })

      const nachher = gespeicherterName(db, personId, id)
      expect([nachher.vornamen, nachher.rufname_text, nachher.rufname_index, nachher.nachname]).toEqual(['Karl Hans Peter', 'Hans Peter', 1, 'Gutnow'])
    } finally {
      db.close()
    }
  })

  it('mehrwortiger Rufname bleibt, wenn ein ANDERER Vorname umgeschrieben wird', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })

      autosaveSchritt(db, personId, id, { vornamen: 'Carl Hans Peter' })

      const nachher = gespeicherterName(db, personId, id)
      expect([nachher.vornamen, nachher.rufname_text, nachher.rufname_index]).toEqual(['Carl Hans Peter', 'Hans Peter', 1])
    } finally {
      db.close()
    }
  })
})
