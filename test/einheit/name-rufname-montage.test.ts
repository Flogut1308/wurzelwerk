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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { istMontierterOriginalText, montiereOriginalText, montiereOriginalTextDerTeile, rekonstruiereFlach, zerlegeName, type FlacherName } from '../../src/core/name/zerlegung'
import {
  geaendertesNamensFeld,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'
import type { NameAendernEin, NameAendernFeld } from '../../src/shared/schemata/befehle'
import * as nameRepo from '../../src/main/repositories/name-repo'
import { nameAendernSchluessel } from '../../src/main/befehle/koaleszenz-schluessel'
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

function transaktionAnzahl(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) throw new Error('transaktionAnzahl(): COUNT(*) lieferte keine Zeile.')
  return zeile.anzahl
}

/** Die Maske schickt den gelesenen Stand UNVERÄNDERT zurück (kein Feld geändert). */
function unveraendertSchreiben(db: Db, personId: string, nameId: string): void {
  const gelesen = namenEintragAusPersonDetailName(gespeicherterName(db, personId, nameId))
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(nameId, gelesen))
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
    it(fall.titel, () => {
      const db = oeffnen(':memory:')
      migrieren(db)
      try {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Gutnoff', ...fall.anlegen })

        autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })

        const nachher = gespeicherterName(db, personId, id)
        expect([nachher.original_text, nachher.rufname_text, nachher.nachname]).toEqual([fall.erwartet, 'Hans Peter', 'Gutnow'])
        expect(findet(db, 'Peter Gutnow', personId)).toBe(true)
        // Zwei Wörter: nur Volltext (die Phonetik greift bei einem Wort und fände „Gutnoff" ≈ „Gutnow").
        expect(findet(db, 'Peter Gutnoff', personId)).toBe(false)
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

// U-130-rufname-noop (docs/80 §33, hueter #169 H2): ein inhaltsgleiches `name.aendern` ist ein No-op —
// keine Transaktion, keine Journalzeile, kein Undo-Schritt (AP-0.22). Die Maske schickt einen
// angehängten mehrwortigen Rufnamen als „Vornamen ohne ihn + rufnameText" zurück
// (profil-bearbeiten-logik.ts, Review H1 #168); verglichen wird darum die WIRKUNG (die Teile, die
// `zerlegeName` schreiben würde), nicht die Rohfelder. Bis #169 hielten zwei Tests hier „+1
// Transaktion" als festgestellt, nicht entschieden fest; diese Erwartung ist mit dem Fix bewusst
// umgedreht (Verhaltensänderung nach Entscheidung, kein Abschwächen).
function aenderungAnzahl(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM aenderung').get()
  if (zeile === undefined) throw new Error('aenderungAnzahl(): COUNT(*) lieferte keine Zeile.')
  return zeile.anzahl
}

interface KoaleszenzZeile {
  readonly koaleszenz_schluessel: string | null
}

function schluesselListe(db: Db): readonly (string | null)[] {
  return db
    .prepare<[], KoaleszenzZeile>("SELECT koaleszenz_schluessel FROM transaktion WHERE status = 'angewendet' ORDER BY lfd")
    .all()
    .map((zeile) => zeile.koaleszenz_schluessel)
}

describe('inhaltsgleiches name.aendern bei angehängtem mehrwortigem Rufnamen ist ein No-op (U-130-rufname-noop)', () => {
  it('nach der ersten Änderung: keine Transaktion, keine Journalzeile, Inhalt gleich', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
      const vorher = gespeicherterName(db, personId, id)
      expect(vorher.original_text).toBe('Karl Hans Peter Gutnow')
      const transaktionenVorher = transaktionAnzahl(db)
      const aenderungenVorher = aenderungAnzahl(db)

      unveraendertSchreiben(db, personId, id)

      expect(transaktionAnzahl(db)).toBe(transaktionenVorher)
      expect(aenderungAnzahl(db)).toBe(aenderungenVorher)
      expect(gespeicherterName(db, personId, id)).toEqual(vorher)
    } finally {
      db.close()
    }
  })

  it('nach der ersten Änderung, Rohaufrufe ohne Maske (Text statt Index, überzähliger Leerraum): ebenfalls No-op', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
      const transaktionenVorher = transaktionAnzahl(db)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnow' })
      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: '  Karl ', rufnameText: 'Hans Peter', nachname: 'Gutnow' })

      expect(transaktionAnzahl(db)).toBe(transaktionenVorher)
    } finally {
      db.close()
    }
  })

  it('bei noch unveränderter Anlege-Montage („Karl Gutnoff"): No-op, original_text bleibt (Entscheidung U-130-rufname-noop)', () => {
    // Die Anlege-Montage lässt den angehängten Rufnamen weg (im Prüfpfad festgeschrieben); sie ist eine
    // AUTOMATISCHE Montage (`istMontierterOriginalText`, dieselbe Erkennung wie in der Maske) und folgt
    // den Teilen erst bei einer echten Änderung. Ein inhaltsgleicher Aufruf schreibt sie nicht still um.
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      expect(gespeicherterName(db, personId, id).original_text).toBe('Karl Gutnoff')
      const transaktionenVorher = transaktionAnzahl(db)
      const aenderungenVorher = aenderungAnzahl(db)

      unveraendertSchreiben(db, personId, id)

      expect(transaktionAnzahl(db)).toBe(transaktionenVorher)
      expect(aenderungAnzahl(db)).toBe(aenderungenVorher)
      expect(gespeicherterName(db, personId, id).original_text).toBe('Karl Gutnoff')
    } finally {
      db.close()
    }
  })

  it('Anlege-Montage mit überzähligem Leerraum („Karl  Otto Gutnoff"): inhaltsgleich ist No-op', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl  Otto', nachname: 'Gutnoff' })
      expect(gespeicherterName(db, personId, id).original_text).toBe('Karl  Otto Gutnoff')
      const transaktionenVorher = transaktionAnzahl(db)

      unveraendertSchreiben(db, personId, id)

      expect(transaktionAnzahl(db)).toBe(transaktionenVorher)
    } finally {
      db.close()
    }
  })

  describe('Koaleszenz', () => {
    let jetzt = 1_790_000_000_000
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      jetzt = 1_790_000_000_000
      vi.setSystemTime(jetzt)
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    function warte(ms: number): void {
      jetzt += ms
      vi.setSystemTime(jetzt)
    }

    it('ein inhaltsgleicher Aufruf mitten in einer Autosave-Serie unterbricht das Koaleszenzfenster nicht', () => {
      const db = oeffnen(':memory:')
      migrieren(db)
      try {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
        warte(5_000)
        autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
        warte(5_000)
        autosaveSchritt(db, personId, id, { nachname: 'Gutnau' })
        const transaktionenNachZweitem = transaktionAnzahl(db)
        warte(500)
        // Inhaltsgleich, aber mit Feldangabe — so, wie ein Blur ohne Änderung aussehen kann.
        const gelesen = namenEintragAusPersonDetailName(gespeicherterName(db, personId, id))
        fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(id, gelesen, 'nachname'))
        expect(transaktionAnzahl(db)).toBe(transaktionenNachZweitem)
        warte(500)
        autosaveSchritt(db, personId, id, { nachname: 'Gutnau-Meier' })

        // Die zwei Nachnamen-Schritte im Fenster bilden EINEN Undo-Schritt.
        expect(transaktionAnzahl(db)).toBe(transaktionenNachZweitem)
        expect(schluesselListe(db).at(-1)).toBe(`name.aendern:${id}:nachname`)
        expect(gespeicherterName(db, personId, id).original_text).toBe('Karl Hans Peter Gutnau-Meier')
      } finally {
        db.close()
      }
    })

    it('die erste Nachnamenänderung einer Anlege-Montage trägt den Koaleszenzschlüssel (Montage folgt den Teilen, hueter #169 H3)', () => {
      const db = oeffnen(':memory:')
      migrieren(db)
      try {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
        warte(5_000)
        autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })

        expect(schluesselListe(db).at(-1)).toBe(`name.aendern:${id}:nachname`)
        expect(gespeicherterName(db, personId, id).original_text).toBe('Karl Hans Peter Gutnow')
      } finally {
        db.close()
      }
    })
  })
})

// hueter #181 H2 (U-130-rufname-noop, Wechselwirkung mit #180): die Kern-Rundreise
// `rekonstruiereFlach ∘ zerlegeName` ist bei einem angehängten mehrwortigen Rufnamen NICHT die
// Identität — die flache Sicht „Karl Hans Peter" / Index 1 / „Hans Peter" zerlegt sich zu „Karl",
// „Hans"*, „Peter" (Regel 1 markiert nur das Wort am Index). Ein Aufrufer, der die flache Sicht roh
// zurückschickt, darf darum nichts schreiben: sonst ein Undo-Schritt ohne Anlass und `rufname_text`
// schrumpft still auf „Hans" (offene Datenmodellfrage U-130-rufname-mehrteilig).
describe('Rohecho der flachen Sicht bei mehrwortigem angehängtem Rufnamen ist No-op (hueter #181 H2)', () => {
  function rohecho(db: Db, id: string, feld?: NameAendernFeld): NameAendernEin {
    const z = nameRepo.lesen(db, id)
    if (z === undefined) throw new Error(`rohecho(): Name ${id} fehlt.`)
    return {
      id,
      typ: 'geburtsname',
      vornamen: z.vornamen ?? undefined,
      rufnameIndex: z.rufname_index ?? undefined,
      rufnameText: z.rufname_text ?? undefined,
      nachname: z.nachname ?? undefined,
      originalText: z.original_text ?? undefined,
      ...(feld === undefined ? {} : { feld }),
    }
  }

  it.fails('bei Anlege-Montage: keine Transaktion, rufname_text bleibt „Hans Peter", kein Koaleszenzschlüssel', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      const ein = rohecho(db, id, 'rufnameText')
      expect([ein.vornamen, ein.rufnameIndex, ein.rufnameText]).toEqual(['Karl Hans Peter', 1, 'Hans Peter'])
      const anzahlVorher = transaktionAnzahl(db)

      expect(nameAendernSchluessel(db, ein)).toBeNull()
      fuehreAus(db, 'name.aendern', ein)

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(nameRepo.lesen(db, id)?.rufname_text).toBe('Hans Peter')
    } finally {
      db.close()
    }
  })

  it.fails('nach der ersten Änderung, ohne originalText (Teile-Montage): ebenfalls No-op', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      autosaveSchritt(db, personId, id, { nachname: 'Gutnow' })
      const ohneText: NameAendernEin = { ...rohecho(db, id), originalText: undefined }
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'name.aendern', ohneText)

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      const nachher = nameRepo.lesen(db, id)
      expect([nachher?.rufname_text, nachher?.original_text]).toEqual(['Hans Peter', 'Karl Hans Peter Gutnow'])
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

  // Beim Ändern montiert der Befehl die geschriebenen Teile (`montiereOriginalTextDerTeile`); das
  // Anlegen montiert weiter die Eingabe (ohne angehängten Rufnamen, im geschützten Prüfpfad
  // festgeschrieben: test/invarianten/rundreise-vollstaendig-name) — beide gelten als montiert.
  it('die Montage der Teile enthält den angehängten Rufnamen und ist gleich der Montage der gespeicherten Teile', () => {
    for (const eingabe of MEHRWORTIG) {
      const text = montiereOriginalTextDerTeile(eingabe)
      expect(text).toContain('Hans Peter')
      expect(text).toBe(montiereOriginalText(gespeichert(eingabe)))
      expect(montiereOriginalTextDerTeile(gespeichert(eingabe))).toBe(text)
    }
  })

  it('beide Montagen der Eingabe gelten nach dem Speichern als montiert', () => {
    for (const eingabe of MEHRWORTIG) {
      expect(istMontierterOriginalText(montiereOriginalTextDerTeile(eingabe), gespeichert(eingabe))).toBe(true)
      expect(istMontierterOriginalText(montiereOriginalText(eingabe), gespeichert(eingabe))).toBe(true)
    }
  })

  it('eine ältere Montage OHNE den mehrwortigen Rufnamen gilt als montiert (Bestand vor dem Fix)', () => {
    expect(istMontierterOriginalText('Karl Gutnoff', gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
    expect(istMontierterOriginalText('Gutnoff', gespeichert({ rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
    expect(istMontierterOriginalText('Karl Otto Gutnoff', gespeichert({ vornamen: 'Karl Otto', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(true)
  })

  it('nach Änderung eines Teils enthält die neue Montage alle Teile inklusive Rufname', () => {
    const vorher = gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
    // So schickt die Maske den angehängten Rufnamen zurück (Vornamen ohne ihn + `rufnameText`).
    expect(montiereOriginalTextDerTeile({ vornamen: 'Karl', rufnameText: vorher.rufnameText, nachname: 'Gutnow' })).toBe('Karl Hans Peter Gutnow')
  })

  it('wortgetreue importierte Texte gelten NICHT als montiert', () => {
    expect(istMontierterOriginalText('Carolus Joh. Petrus Müller', gespeichert({ vornamen: 'Carolus Johannes Petrus', nachname: 'Müller' }))).toBe(false)
    expect(istMontierterOriginalText('Carolus Joh. Petrus', gespeichert({ vornamen: 'Carolus', rufnameText: 'Johann Peter', nachname: 'Müller' }))).toBe(false)
    expect(istMontierterOriginalText('Carolus Joh. Petrus Müller', gespeichert({ vornamen: 'Carolus', rufnameText: 'Johann Peter', nachname: 'Müller' }))).toBe(false)
    // Nur der Rufname-Bestandteil darf weggelassen sein — nicht ein beliebiges Endstück der Vornamen.
    expect(istMontierterOriginalText('Karl Hans Gutnoff', gespeichert({ vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' }))).toBe(false)
    expect(istMontierterOriginalText('Karl Hans Gutnoff', gespeichert({ vornamen: 'Karl Hans Peter', nachname: 'Gutnoff' }))).toBe(false)
    // hueter #169 H1: der letzte Vorname gleicht dem Rufnamen, markiert ist aber ein ANDERER (Index 0) —
    // weggelassen werden darf nur der markierte Bestandteil.
    expect(istMontierterOriginalText('Johann Georg Müller', gespeichert({ vornamen: 'Johann Georg Johann', rufnameIndex: 0, nachname: 'Müller' }))).toBe(false)
  })
})
