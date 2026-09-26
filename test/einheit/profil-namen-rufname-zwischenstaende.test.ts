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
})
