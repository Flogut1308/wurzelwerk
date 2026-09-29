// A-02, AP-1.30 (Folgepunkt U-130-rufname-montage, docs/80 §33): Montage (`montiereOriginalText`) und
// Erkennung (`istMontierterOriginalText`) müssen für einen mehrwortigen, ANGEHÄNGTEN Rufnamen
// zueinander passen. `zerlegeName` Regel 3 hängt einen `rufname_text`, der kein Vorname ist, als EINEN
// markierten Bestandteil hinter die Vornamen („Karl" + „Hans Peter" → Vornamen „Karl Hans Peter",
// Index 1). Vorher kannte die Montage diesen Bestandteil nicht, und die Erkennung ließ nur EIN Wort weg:
//  - nach einer Nachnamenänderung wurde „Karl Hans Peter Gutnoff" zu „Karl Gutnow" montiert (Rufname
//    fehlt im `original_text` und damit im FTS-Text, `COALESCE(original_text, …)`);
//  - „Gutnoff" / „Karl Otto Gutnoff" / „Karl Gutnoff" galten als wortgetreu und folgten der Änderung nicht.
// Der Test spielt die Schreibfolge der Maske über den echten Befehlsbus nach (lesen → Eintrag bauen →
// Nachname ändern → `name.aendern`) und prüft den Kern direkt (Rundreise Montage ↔ Erkennung).
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
import { suche } from '../../src/main/abfragen/suche'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach, zerlegeName, type FlacherName } from '../../src/core/name/zerlegung'
import {
  geaendertesNamensFeld,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'
import type { PersonListeFilter } from '../../src/shared/schemata/person-liste'

type Db = ReturnType<typeof oeffnen>

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function gespeichert(eingabe: FlacherName): FlacherName {
  return rekonstruiereFlach(zerlegeName(eingabe))
}

function gespeicherterName(db: Db, personId: string, nameId: string): PersonDetailName {
  const name = personDetail(db, { personId }).namen.find((kandidat) => kandidat.id === nameId)
  if (name === undefined) throw new Error(`gespeicherterName(): Name ${nameId} fehlt in person.detail.`)
  return name
}

function autosaveSchritt(db: Db, personId: string, nameId: string, aenderung: Partial<NamenEintragWerte>): void {
  const gelesen = namenEintragAusPersonDetailName(gespeicherterName(db, personId, nameId))
  const naechster: NamenEintragWerte = { ...gelesen, ...aenderung }
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(nameId, naechster, geaendertesNamensFeld(gelesen, naechster)))
}

function findet(db: Db, text: string, personId: string): boolean {
  return suche(db, { text, grenze: 50, filter: FILTER_ALLE, sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100 }).treffer.some(
    (treffer) => treffer.person_id === personId,
  )
}

interface Fall {
  readonly titel: string
  readonly anlegen: { readonly vornamen?: string; readonly rufnameText: string; readonly originalText?: string }
  readonly erwartet: string
}

const FAELLE: readonly Fall[] = [
  { titel: 'Karl + „Hans Peter", original_text „Karl Hans Peter Gutnoff"', anlegen: { vornamen: 'Karl', rufnameText: 'Hans Peter', originalText: 'Karl Hans Peter Gutnoff' }, erwartet: 'Karl Hans Peter Gutnow' },
  { titel: 'Karl + „Hans Peter", montiert', anlegen: { vornamen: 'Karl', rufnameText: 'Hans Peter' }, erwartet: 'Karl Hans Peter Gutnow' },
  { titel: 'nur „Hans Peter", montiert', anlegen: { rufnameText: 'Hans Peter' }, erwartet: 'Hans Peter Gutnow' },
  { titel: 'Karl Otto + „Hans Peter", montiert', anlegen: { vornamen: 'Karl Otto', rufnameText: 'Hans Peter' }, erwartet: 'Karl Otto Hans Peter Gutnow' },
]

describe('mehrwortiger angehängter Rufname: original_text folgt der Nachnamenänderung (U-130-rufname-montage)', () => {
  for (const fall of FAELLE) {
    it.fails(fall.titel, () => {
      const db = oeffnen(':memory:')
      migrieren(db)
      try {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Gutnoff', ...fall.anlegen })

        autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })

        const nachher = gespeicherterName(db, personId, id)
        expect([nachher.original_text, nachher.rufname_text, nachher.nachname]).toEqual([fall.erwartet, 'Hans Peter', 'Gutnow'])
        expect(findet(db, 'Peter Gutnow', personId)).toBe(true)
        expect(findet(db, 'Gutnoff', personId)).toBe(false)
      } finally {
        db.close()
      }
    })
  }

  it('einwortiger angehängter Rufname war schon korrekt („Karl Fritz Gutnow")', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Fritz', nachname: 'Gutnoff' })
      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
      expect(gespeicherterName(db, personId, id).original_text).toBe('Karl Fritz Gutnow')
    } finally {
      db.close()
    }
  })
})

describe('Rundreise Montage ↔ Erkennung (Kern, U-130-rufname-montage)', () => {
  const MEHRWORTIG: readonly FlacherName[] = [
    { vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
    { rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
    { vornamen: 'Karl Otto', rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
    { titelVor: 'Dr.', vornamen: 'Karl', rufnameText: 'Hans Peter', praefix: 'von', nachname: 'Gutnoff', zusatzNach: 'd. Ä.' },
  ]

  it.fails('die Montage enthält den angehängten Rufnamen und ist gleich der Montage der gespeicherten Teile', () => {
    for (const eingabe of MEHRWORTIG) {
      const text = montiereOriginalText(eingabe)
      expect(text).toContain('Hans Peter')
      expect(text).toBe(montiereOriginalText(gespeichert(eingabe)))
    }
  })

  it.fails('die Montage der Eingabe gilt nach dem Speichern als montiert', () => {
    for (const eingabe of MEHRWORTIG) {
      expect(istMontierterOriginalText(montiereOriginalText(eingabe), gespeichert(eingabe))).toBe(true)
    }
  })

  it.fails('eine ältere Montage OHNE den mehrwortigen Rufnamen gilt als montiert (Bestand vor dem Fix)', () => {
    expect(istMontierterOriginalText('Karl Gutnoff', gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
    expect(istMontierterOriginalText('Gutnoff', gespeichert({ rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
    expect(istMontierterOriginalText('Karl Otto Gutnoff', gespeichert({ vornamen: 'Karl Otto', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
  })

  it.fails('nach Änderung eines Teils enthält die neue Montage alle Teile inklusive Rufname', () => {
    const vorher = gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
    // So schickt die Maske den angehängten Rufnamen zurück (Vornamen ohne ihn + `rufnameText`).
    expect(montiereOriginalText({ vornamen: 'Karl', rufnameText: vorher.rufnameText, nachname: 'Gutnow' })).toBe('Karl Hans Peter Gutnow')
  })

  it('wortgetreue importierte Texte gelten NICHT als montiert', () => {
    expect(istMontierterOriginalText('Carolus Joh. Petrus Müller', gespeichert({ vornamen: 'Carolus Johannes Petrus', nachname: 'Müller' }))).toBe(false)
    expect(istMontierterOriginalText('Carolus Joh. Petrus', gespeichert({ vornamen: 'Carolus', rufnameText: 'Johann Peter', nachname: 'Müller' }))).toBe(false)
    expect(istMontierterOriginalText('Carolus Joh. Petrus Müller', gespeichert({ vornamen: 'Carolus', rufnameText: 'Johann Peter', nachname: 'Müller' }))).toBe(false)
    // Nur der Rufname-Bestandteil darf weggelassen sein — nicht ein beliebiges Endstück der Vornamen.
    expect(istMontierterOriginalText('Karl Hans Gutnoff', gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(false)
    expect(istMontierterOriginalText('Karl Hans Gutnoff', gespeichert({ vornamen: 'Karl Hans Peter', nachname: 'Gutnoff' }))).toBe(false)
  })
})
