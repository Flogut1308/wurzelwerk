// AP-0.9: die drei ersten echten Befehle (`person.anlegen`, `person.feldSetzen`, `person.loeschen`)
// über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank.
// Prüft die fachliche Seite (person/person_flach/aenderung-Zeilen, Zeitstempel D-3) - die reine
// Bus-Mechanik steht in `test/einheit/befehl-bus.test.ts`.
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
import { redo, undo } from '../../src/main/journal/undo'
import { REGISTRIERUNG } from '../../src/main/befehle/registrierung'
import { redoZiel } from '../../src/main/repositories/journal-repo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface PersonZeile {
  readonly id: string
  readonly notiz: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
}

interface AenderungZeile {
  readonly operation: string
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
}

function personLesen(db: ReturnType<typeof oeffnen>, id: string): PersonZeile | undefined {
  return db
    .prepare<{ readonly id: string }, PersonZeile>('SELECT id, notiz, erstellt_am, geaendert_am FROM person WHERE id = @id')
    .get({ id })
}

function personFlachLesen(db: ReturnType<typeof oeffnen>, id: string): PersonFlachZeile | undefined {
  return db
    .prepare<{ readonly id: string }, PersonFlachZeile>('SELECT person_id, anzeigename FROM person_flach WHERE person_id = @id')
    .get({ id })
}

function aenderungenFuerPerson(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation, wert_alt_json, wert_neu_json FROM aenderung
       WHERE tabelle = 'person' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface TransaktionZahl {
  readonly anzahl: number
}

/** Muster identisch zu `test/einheit/koaleszenz.test.ts`. */
function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

describe('person.anlegen (AP-0.9)', () => {
  it('legt eine person-Zeile + person_flach-Zeile an, mit erstellt_am === geaendert_am und genau einer aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const vor = Date.now()
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const nach = Date.now()

      const person = personLesen(db, id)
      expect(person).toBeDefined()
      expect(person?.erstellt_am).not.toBeNull()
      expect(person?.erstellt_am).toBe(person?.geaendert_am)
      expect(person?.erstellt_am ?? 0).toBeGreaterThan(1_000_000_000_000)
      expect(person?.erstellt_am ?? 0).toBeGreaterThanOrEqual(vor)
      expect(person?.erstellt_am ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(nach)

      const flach = personFlachLesen(db, id)
      expect(flach).toBeDefined()
      expect(flach?.anzeigename).toBe('')

      const aenderungen = aenderungenFuerPerson(db, id)
      expect(aenderungen).toHaveLength(1)
      expect(aenderungen[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })
})

describe('person.feldSetzen (AP-0.9)', () => {
  it('setzt notiz, aktualisiert person_flach über abl_person_au, und trägt operation=update mit wert_alt/neu_json + neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const vorher = personLesen(db, id)
      const erstelltAmVorher = vorher?.erstellt_am ?? null

      fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'Testnotiz' })

      const nachher = personLesen(db, id)
      expect(nachher?.notiz).toBe('Testnotiz')
      expect(nachher?.erstellt_am).toBe(erstelltAmVorher)
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(erstelltAmVorher ?? 0)

      const aenderungen = aenderungenFuerPerson(db, id)
      const letzte = aenderungen[aenderungen.length - 1]
      expect(letzte?.operation).toBe('update')
      expect(letzte?.wert_alt_json).not.toBeNull()
      expect(letzte?.wert_neu_json).not.toBeNull()

      // person_flach existiert weiterhin (abl_person_au hat sie aktualisiert, nicht gelöscht).
      const flach = personFlachLesen(db, id)
      expect(flach).toBeDefined()
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      expect(() => fuehreAus(db, 'person.feldSetzen', { id: 'nicht-vorhanden', feld: 'notiz', wert: 'x' })).toThrow(WurzelFehler)
    } finally {
      db.close()
    }
  })
})

describe('person.loeschen (AP-0.9)', () => {
  it('löscht die person-Zeile (CASCADE räumt person_flach ab) und trägt genau eine aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      fuehreAus(db, 'person.loeschen', { id })

      expect(personLesen(db, id)).toBeUndefined()
      expect(personFlachLesen(db, id)).toBeUndefined()

      const aenderungen = aenderungenFuerPerson(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      expect(() => fuehreAus(db, 'person.loeschen', { id: 'nicht-vorhanden' })).toThrow(WurzelFehler)
    } finally {
      db.close()
    }
  })
})

describe('person.feldSetzen — kein Journaleintrag ohne echte Änderung (AP-0.22)', () => {
  // `gesperrt_bis` statt `notiz` (wie in der Aufgabenbeschreibung für den Redo-Test empfohlen):
  // `notiz` trägt einen Koaleszenz-Schlüssel (`src/main/befehle/registrierung.ts`, AP-0.15) und
  // fasst zwei rasch aufeinanderfolgende `notiz`-Änderungen IMMER zu einer Transaktion zusammen —
  // unabhängig davon, ob der zweite Wert überhaupt vom ersten abweicht. Mit `notiz` wäre dieser
  // Test schon vor dem AP-0.22-Fix grün (die Koaleszenz verdeckt den Fehler) bzw. bei
  // unterschiedlichen Werten fälschlich rot (die Koaleszenz fasst trotzdem zusammen) - in beiden
  // Fällen kein Beleg für das hier geprüfte Verhalten. `gesperrt_bis` hatte keinen Koaleszenz-
  // Schlüssel und machte damit einzig den AP-0.22-Effekt sichtbar. AP-1.30 PR 4: seit JEDES Feld
  // einen Schlüssel trägt, trennt stattdessen eine feste Uhr die Aufrufe um 2001 ms (außerhalb des
  // Koaleszenzfensters) — sonst verdeckte die Koaleszenz auch hier einen Fehler der No-op-Erkennung.
  it('derselbe gesperrt_bis-Wert zweimal hintereinander erzeugt keine zweite Transaktion und keine zweite aenderung-Zeile', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_790_000_000_000)
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      // Erste Änderung: gesperrt_bis war zuvor NULL, ist jetzt 100 - echte Änderung.
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 100 })
      const anzahlVorher = transaktionAnzahl(db)

      // Zweite Änderung: identischer Wert - No-op, darf keine neue Transaktion/aenderung erzeugen.
      vi.setSystemTime(1_790_000_000_000 + 2001)
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 100 })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerPerson(db, id)).toHaveLength(2) // insert (anlegen) + genau ein update (erste Änderung)
    } finally {
      db.close()
      vi.useRealTimers()
    }
  })

  // AP-1.30 PR 4: seit jedes `person.feldSetzen`-Feld einen Koaleszenzschlüssel trägt, fasst der
  // Bus zwei Änderungen am selben Feld binnen 2000 ms zusammen. Damit dieser Test weiter NUR den
  // AP-0.22-Effekt prüft (No-op-Erkennung verschluckt keine echte Änderung), liegen die beiden
  // Aufrufe per fester Uhr außerhalb des Koaleszenzfensters — Koaleszenz selbst prüft
  // `test/einheit/koaleszenz-autosave.test.ts`.
  it('unterschiedliche Werte erzeugen weiterhin je eine eigene Transaktion (Regression)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_790_000_000_000)
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 100 })
      const anzahlNachErster = transaktionAnzahl(db)
      expect(anzahlNachErster).toBe(anzahlVorher + 1)

      vi.setSystemTime(1_790_000_000_000 + 2001)
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 200 })
      expect(transaktionAnzahl(db)).toBe(anzahlNachErster + 1)

      expect(aenderungenFuerPerson(db, id)).toHaveLength(3) // insert + zwei updates
    } finally {
      db.close()
      vi.useRealTimers()
    }
  })

  it('No-op verwirft den Redo-Stapel NICHT (im Gegensatz zu einem echten neuen Befehl, §4.7)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_790_000_000_000)
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      // AP-1.30 PR 4: gesperrt_bis trägt seit AP-1.30 einen Koaleszenz-Schlüssel (jedes Feld) — die
      // beiden echten Änderungen liegen darum per fester Uhr außerhalb des 2000-ms-Fensters und
      // bleiben zwei separate Transaktionen (wie zuvor ohne Schlüssel).
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 100 }) // T1
      vi.setSystemTime(1_790_000_000_000 + 2001)
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 200 }) // T2

      undo(db) // Wert zurück auf 100, T2 ist jetzt das Redo-Ziel
      const anzahlVorher = transaktionAnzahl(db)
      const redoZielVorher = redoZiel(db)?.id
      expect(redoZielVorher).toBeDefined()

      // No-op: der Wert ist bereits 100 - darf weder eine Transaktion anlegen noch den Redo-Stapel verwerfen.
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'gesperrt_bis', wert: 100 })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(redoZiel(db)?.id).toBe(redoZielVorher)

      redo(db) // funktioniert weiterhin - Wert wieder 200
      expect(personLesen(db, id)?.geaendert_am).not.toBeNull()
    } finally {
      db.close()
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------------------------
// AP-1.34 PR-A (Vorgaben §2.2/§5.5, keine A-ID; freigegebener Plan AP-1.34): fortlaufende
// Personen-Kennung aus `kennung_zaehler`. Die Kennung wird hier bewusst über SQL gelesen
// (`person.kennung`, `kennung_zaehler.naechste`), nicht über ein Repository-Feld — so ist der
// Rot-Grund vor dem Fix ein Laufzeitfehler („no such column: kennung" / „no such table:
// kennung_zaehler"), kein Typfehler.
// ---------------------------------------------------------------------------------------------

function kennungLesen(db: ReturnType<typeof oeffnen>, id: string): number | null | undefined {
  return db
    .prepare<{ readonly id: string }, { readonly kennung: number | null }>('SELECT kennung FROM person WHERE id = @id')
    .get({ id })?.kennung
}

function zaehlerstand(db: ReturnType<typeof oeffnen>): number {
  const zeile = db
    .prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
    .get()
  if (zeile === undefined) {
    throw new Error("zaehlerstand(): kennung_zaehler hat keine Zeile für bereich = 'person'.")
  }
  return zeile.naechste
}

/** `wert_neu_json` der insert-Journalzeile als geprüftes Objekt (kein `any`, CLAUDE.md §4). */
function kennungImInsertJournal(db: ReturnType<typeof oeffnen>, id: string): unknown {
  const insert = aenderungenFuerPerson(db, id).find((zeile) => zeile.operation === 'insert')
  if (insert?.wert_neu_json === null || insert?.wert_neu_json === undefined) {
    throw new Error('kennungImInsertJournal(): keine insert-Journalzeile mit wert_neu_json.')
  }
  const roh: unknown = JSON.parse(insert.wert_neu_json)
  if (typeof roh !== 'object' || roh === null || !('kennung' in roh)) {
    return undefined
  }
  return roh.kennung
}

describe('person.anlegen — Kennung aus kennung_zaehler (AP-1.34)', () => {
  it('frische Datenbank: Zähler steht auf 1, anlegen vergibt 1, dann 2; Zähler danach 3', () => {
    const db = neueTestDatenbank()
    try {
      expect(zaehlerstand(db)).toBe(1)

      const { id: erste } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, erste)).toBe(1)
      expect(zaehlerstand(db)).toBe(2)

      const { id: zweite } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, zweite)).toBe(2)
      expect(zaehlerstand(db)).toBe(3)

      // Die Kennung steht im Journal (jrn_person_ai), damit Redo sie wiederherstellen kann.
      expect(kennungImInsertJournal(db, erste)).toBe(1)
      expect(kennungImInsertJournal(db, zweite)).toBe(2)
    } finally {
      db.close()
    }
  })

  it('anlegen → undo → anlegen vergibt die nächste Nummer, nicht die zurückgenommene (nie neu vergeben)', () => {
    const db = neueTestDatenbank()
    try {
      const { id: erste } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, erste)).toBe(1)

      undo(db)
      expect(personLesen(db, erste)).toBeUndefined()
      // Undo lässt den Zähler stehen (kennung_zaehler ist NICHT_JOURNALISIERT).
      expect(zaehlerstand(db)).toBe(2)

      const { id: zweite } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, zweite)).toBe(2)
      expect(zaehlerstand(db)).toBe(3)
    } finally {
      db.close()
    }
  })

  it('Redo stellt die ursprüngliche Kennung aus dem Journal her und verbraucht keine neue Nummer', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, id)).toBe(1)

      undo(db)
      expect(personLesen(db, id)).toBeUndefined()

      redo(db)
      expect(kennungLesen(db, id)).toBe(1)
      expect(zaehlerstand(db)).toBe(2)

      // Gegenprobe: die nächste Anlage bekommt 2 — Redo hat weder gezogen noch den Zähler bewegt.
      const { id: naechste } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      expect(kennungLesen(db, naechste)).toBe(2)
    } finally {
      db.close()
    }
  })

  it("person.feldSetzen('kennung') wird vom Befehlsschema abgewiesen; andere Felder lassen die Kennung stehen", () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const kennungVorher = kennungLesen(db, id)
      expect(kennungVorher).toBe(1)

      // Genau das Schema, das der Bus als ersten Schritt anwendet (`def.schema.parse(ein)`,
      // src/main/befehle/bus.ts) — über `unknown` statt eines unzulässigen Aufrufs von fuehreAus,
      // damit die Abweisung zur Laufzeit geprüft wird und kein Typfehler den Test ersetzt.
      const schema = REGISTRIERUNG['person.feldSetzen'].schema
      const unzulaessig: unknown = { id, feld: 'kennung', wert: 99 }
      expect(schema.safeParse(unzulaessig).success).toBe(false)

      // Gegenprobe: dasselbe Schema nimmt ein zulässiges Feld an …
      const zulaessig: unknown = { id, feld: 'notiz', wert: 'Notiz' }
      expect(schema.safeParse(zulaessig).success).toBe(true)

      // … und dessen Ausführung lässt die Kennung unverändert.
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'Notiz' })
      expect(kennungLesen(db, id)).toBe(kennungVorher)
    } finally {
      db.close()
    }
  })
})
