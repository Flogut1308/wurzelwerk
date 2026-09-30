// A-02, AP-1.30 (Folgepunkt U-130-rufname-doppelt, docs/80 §33, hueter #169 Nebenbefund): ein
// mehrwortiger `rufname_text`, der einer zusammenhängenden Wortfolge der Vornamen gleicht („Hans Peter"
// in „Hans Peter" oder „Karl Hans Peter"), wurde von `zerlegeName` Regel 2 nicht erkannt — Regel 2
// verglich den ganzen Text mit EINZELNEN Vornamen-Wörtern — und per Regel 3 ein zweites Mal angehängt:
// Vornamen „Hans Peter Hans Peter", Rufname-Index 2. Erreichbar über das Neu-Formular im Reiter Namen
// (Textfeld Rufname) und über den Import (import-v1 `rufname_text`).
//
// Das Datenmodell kennt je Form genau EINEN markierten Bestandteil (`idx_name_part_ein_rufname`); ein
// Rufname über mehrere Bestandteile ist nicht abbildbar. Die verlustfreie Abbildung ist dieselbe, die
// Regel 3 für einen angehängten mehrwortigen Rufnamen schon benutzt: die Wortfolge wird EIN markierter
// Vorname-Bestandteil („Hans Peter"), die flache Sicht (Vornamen-Text, `original_text`) bleibt gleich.
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
  istMontierterOriginalText,
  montiereOriginalText,
  montiereOriginalTextDerTeile,
  rekonstruiereFlach,
  zerlegeName,
  type FlacherName,
} from '../../src/core/name/zerlegung'
import {
  geaendertesNamensFeld,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

type Db = ReturnType<typeof oeffnen>

/** Nur die Vorname-Bestandteile als [wert, istRufname, sortierIndex]. */
function vornamenTeile(flach: FlacherName): readonly (readonly [string, boolean, number])[] {
  return zerlegeName(flach)
    .filter((teil) => teil.art === 'vorname')
    .map((teil) => [teil.wert, teil.istRufname, teil.sortierIndex] as const)
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

function mitDb(pruefung: (db: Db, personId: string) => void): void {
  const db = oeffnen(':memory:')
  migrieren(db)
  try {
    const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
    pruefung(db, personId)
  } finally {
    db.close()
  }
}

describe('zerlegeName: mehrwortiger Rufname gleich einer Wortfolge der Vornamen (U-130-rufname-doppelt)', () => {
  it.fails('„Hans Peter" + Rufname „Hans Peter": EIN markierter Bestandteil, nichts angehängt', () => {
    expect(vornamenTeile({ vornamen: 'Hans Peter', rufnameText: 'Hans Peter' })).toEqual([['Hans Peter', true, 0]])
  })

  it.fails('Wortfolge am Ende („Karl Hans Peter")', () => {
    expect(vornamenTeile({ vornamen: 'Karl Hans Peter', rufnameText: 'Hans Peter' })).toEqual([
      ['Karl', false, 0],
      ['Hans Peter', true, 1],
    ])
  })

  it.fails('Wortfolge am Anfang („Hans Peter Karl")', () => {
    expect(vornamenTeile({ vornamen: 'Hans Peter Karl', rufnameText: 'Hans Peter' })).toEqual([
      ['Hans Peter', true, 0],
      ['Karl', false, 1],
    ])
  })

  it.fails('Wortfolge in der Mitte, Leerraum im Rufnamen normiert („Karl  Hans Peter Otto", „ Hans  Peter ")', () => {
    expect(vornamenTeile({ vornamen: 'Karl  Hans Peter Otto', rufnameText: ' Hans  Peter ' })).toEqual([
      ['Karl', false, 0],
      ['Hans Peter', true, 1],
      ['Otto', false, 2],
    ])
  })

  it.fails('rufnameIndex auf dem ersten Wort der Folge + gleicher mehrwortiger Text: dieselbe Folge (Rundreise der flachen Sicht)', () => {
    expect(vornamenTeile({ vornamen: 'Hans Peter Karl Hans Peter', rufnameIndex: 3, rufnameText: 'Hans Peter' })).toEqual([
      ['Hans', false, 0],
      ['Peter', false, 1],
      ['Karl', false, 2],
      ['Hans Peter', true, 3],
    ])
  })

  it.fails('die flache Sicht ist unverändert und zerlegt sich stabil wieder (rekonstruiereFlach ∘ zerlegeName)', () => {
    for (const eingabe of [
      { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
      { vornamen: 'Karl Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
      { vornamen: 'Hans Peter Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' },
    ] satisfies readonly FlacherName[]) {
      const flach = rekonstruiereFlach(zerlegeName(eingabe))
      expect(flach.vornamen).toBe(eingabe.vornamen)
      expect(flach.rufnameText).toBe('Hans Peter')
      expect(zerlegeName(flach)).toEqual(zerlegeName(eingabe))
      expect(montiereOriginalTextDerTeile(eingabe)).toBe(montiereOriginalText(eingabe))
      expect(istMontierterOriginalText(montiereOriginalText(eingabe), flach)).toBe(true)
    }
  })

  it('ohne zusammenhängende Wortfolge bleibt es beim Anhängen (Regel 3 unverändert)', () => {
    expect(vornamenTeile({ vornamen: 'Peter Hans', rufnameText: 'Hans Peter' })).toEqual([
      ['Peter', false, 0],
      ['Hans', false, 1],
      ['Hans Peter', true, 2],
    ])
    expect(vornamenTeile({ vornamen: 'Hans Peterson', rufnameText: 'Hans Peter' })).toEqual([
      ['Hans', false, 0],
      ['Peterson', false, 1],
      ['Hans Peter', true, 2],
    ])
    expect(vornamenTeile({ vornamen: 'Hans', rufnameText: 'Hans Peter' })).toEqual([
      ['Hans', false, 0],
      ['Hans Peter', true, 1],
    ])
  })

  it('ein gültiger rufnameIndex mit anderem Text gewinnt weiter (Regel 1 unverändert)', () => {
    expect(vornamenTeile({ vornamen: 'Karl Hans Peter', rufnameIndex: 0, rufnameText: 'Hans Peter' })).toEqual([
      ['Karl', true, 0],
      ['Hans', false, 1],
      ['Peter', false, 2],
    ])
  })
})

describe('name.anlegen über den Befehlsbus (U-130-rufname-doppelt)', () => {
  it.fails('Neu-Formular „Hans Peter" + Rufname „Hans Peter": keine doppelten Vornamen', () => {
    mitDb((db, personId) => {
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      const name = gespeicherterName(db, personId, id)
      expect([name.vornamen, name.rufname_index, name.rufname_text, name.original_text]).toEqual(['Hans Peter', 0, 'Hans Peter', 'Hans Peter Gutnoff'])
    })
  })

  it.fails('Wortfolge am Anfang: Maske zeigt den Rufnamen und behält ihn bei einer Nachnamenänderung', () => {
    mitDb((db, personId) => {
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Hans Peter Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      const eintrag = namenEintragAusPersonDetailName(gespeicherterName(db, personId, id))
      expect(rufnameAuswahlVornamen(eintrag).map((option) => option.vorname)).toEqual(['Hans Peter', 'Karl'])
      expect(rufnameAuswahlWert(eintrag)).toBe('0')

      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })

      const nachher = gespeicherterName(db, personId, id)
      expect([nachher.vornamen, nachher.rufname_index, nachher.rufname_text, nachher.original_text]).toEqual([
        'Hans Peter Karl',
        0,
        'Hans Peter',
        'Hans Peter Karl Gutnow',
      ])
    })
  })

  it.fails('Wortfolge am Ende: Nachnamenänderung über die Maske ändert die Vornamen nicht', () => {
    mitDb((db, personId) => {
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
      const nachher = gespeicherterName(db, personId, id)
      expect([nachher.vornamen, nachher.rufname_index, nachher.rufname_text, nachher.original_text]).toEqual([
        'Karl Hans Peter',
        1,
        'Hans Peter',
        'Karl Hans Peter Gutnow',
      ])
    })
  })
})
