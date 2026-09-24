// AP-1.3d: Kennungsauflösung (56_Import_Vertrag.md §2.1) — `tmp:` wird zu einer gültigen, in sich
// konsistenten UUID v7; `db:` OHNE `ueberschreiben` verändert die bestehende Zeile nicht (§2.1
// "Schutzregel für db:": "referenziert nur, ersetzt nichts").
//
// AP-1.34 PR-A (Vorgaben §2.2/§5.5, keine A-ID) ergänzt unten die fortlaufende Personen-Kennung
// (`person.kennung` aus `kennung_zaehler`) für den Importweg: fortlaufend über Importe hinweg,
// Trockenlauf verbraucht keine Nummer, und E12 — die Rücknahme eines Großimports per Schnappschuss
// setzt den Zähler NICHT zurück („nie neu vergeben" gilt ausnahmslos).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { undo } from '../../src/main/journal/undo'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { einfuegen as personEinfuegen, lesen as personLesen } from '../../src/main/repositories/person-repo'
import { RUECKNAHME_SCHWELLE_ZEILEN } from '../../src/shared/import/trockenlauf-bericht'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))

function ladeFixture(): ReturnType<typeof importDateiSchema.parse> {
  return importDateiSchema.parse(JSON.parse(readFileSync(FIXTURE_PFAD, 'utf8')))
}

describe('schreibeImport() — Kennungsauflösung (AP-1.3d, 56_Import_Vertrag.md §2.1)', () => {
  it('tmp:-Kennungen werden zu gültigen, in sich konsistenten UUID-v7-Werten', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const datei = ladeFixture()
    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

    const karlId = ergebnis.kennungen.get('tmp:karl')
    expect(karlId).toBeDefined()
    expect(karlId).toMatch(UUID_V7_REGEX)

    // Konsistent: dieselbe UUID taucht überall auf, wo tmp:karl referenziert wird — als
    // beteiligung.person_id (Ereignis "Trauung") UND als elternschaft.elternteil_id.
    const beteiligungPersonIds = db
      .prepare<[], { readonly person_id: string }>(
        `SELECT DISTINCT b.person_id FROM beteiligung b
         JOIN ereignis e ON e.id = b.ereignis_id
         WHERE e.typ = 'trauung'`,
      )
      .all()
      .map((zeile) => zeile.person_id)
    expect(beteiligungPersonIds).toContain(karlId)

    const elternteilIds = db.prepare<[], { readonly elternteil_id: string }>('SELECT elternteil_id FROM elternschaft').all().map((z) => z.elternteil_id)
    expect(elternteilIds).toContain(karlId)

    // Jede aufgelöste UUID ist ein gültiger UUID-v7-Wert, keine nur zufällig passende Zeichenkette.
    for (const uuid of ergebnis.kennungen.values()) {
      expect(uuid).toMatch(UUID_V7_REGEX)
    }
  })

  it('db:-Kennung OHNE ueberschreiben verändert die bestehende person-Zeile nicht (§2.1)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const bestehendeId = '018f2c44-7a91-7c3e-9d10-5b6e7f801234'
    personEinfuegen(db, {
      id: bestehendeId,
      geschlecht: 'F',
      notiz: 'URSPRUENGLICHE NOTIZ — darf NICHT überschrieben werden',
      privat: 0,
      ist_platzhalter: 0,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })

    const rohImport = {
      vertrag: 'wurzelwerk-import/v1',
      erzeugt: { am: '2026-09-17', werkzeug: 'test' },
      zusammenfassung: { personen: 1, notizen_unverarbeitet: 0 },
      quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
      personen: [
        {
          id: `db:${bestehendeId}`,
          geschlecht: 'M', // widerspricht bewusst dem bestehenden 'F'
          namen: [{ typ: 'geburtsname', vornamen: 'Sollte', nachname: 'Nichtangelegt', ist_bevorzugt: true }],
          konfidenz: 3,
          belege: [{ quelle: 'tmp:q1', konfidenz: 3 }],
        },
      ],
      notizen_unverarbeitet: [],
    }
    const datei = importDateiSchema.parse(rohImport)

    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })

    expect(ergebnis.kennungen.get(`db:${bestehendeId}`)).toBe(bestehendeId)

    const zeileNachImport = personLesen(db, bestehendeId)
    expect(zeileNachImport?.geschlecht).toBe('F') // unverändert, NICHT auf 'M' überschrieben
    expect(zeileNachImport?.notiz).toBe('URSPRUENGLICHE NOTIZ — darf NICHT überschrieben werden')

    const personenAnzahl = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
    expect(personenAnzahl?.anzahl).toBe(1) // keine zweite person-Zeile angelegt

    const namenAnzahl = db
      .prepare<{ readonly id: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM name_form WHERE person_id = @id')
      .get({ id: bestehendeId })
    expect(namenAnzahl?.anzahl).toBe(0) // kein neuer Name für die db:-Person angelegt

    // Die Existenz-Aussage wird trotzdem geschrieben (neue Bezeugung, keine Eigenschaft der Zeile).
    const existenzAnzahl = db
      .prepare<{ readonly id: string }, { readonly anzahl: number }>(
        `SELECT COUNT(*) AS anzahl FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id AND praedikat = 'existenz'`,
      )
      .get({ id: bestehendeId })
    expect(existenzAnzahl?.anzahl).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
// AP-1.34 PR-A: Kennungsvergabe im Importweg. Kennung und Zählerstand werden über SQL gelesen
// (`person.kennung`, `kennung_zaehler.naechste`) — vor dem Fix ist der Rot-Grund darum ein
// Laufzeitfehler („no such column: kennung" / „no such table: kennung_zaehler"), kein Typfehler.
// ---------------------------------------------------------------------------------------------

/** Deterministische Importdatei mit `anzahl` Personen; `praefix` hält Namen und damit die
 * Prüfsumme je Datei verschieden (sonst griffe die Doppelimport-Erkennung). */
function baueImport(anzahl: number, praefix: string): unknown {
  const personen = Array.from({ length: anzahl }, (_, i) => ({
    id: `tmp:${praefix}${String(i)}`,
    geschlecht: 'M',
    lebend_status: 'verstorben',
    namen: [{ typ: 'geburtsname', vornamen: `Vorname${praefix}${String(i)}`, nachname: `Nachname${praefix}${String(i)}`, ist_bevorzugt: true }],
    konfidenz: 4,
    belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
  }))
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-24', werkzeug: 'test' },
    zusammenfassung: { personen: anzahl, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: `Generierte Testquelle (AP-1.34, ${praefix})` }],
    personen,
    notizen_unverarbeitet: [],
  }
}

function kennungenAufsteigend(db: Database.Database): readonly (number | null)[] {
  return db
    .prepare<[], { readonly kennung: number | null }>('SELECT kennung FROM person ORDER BY kennung')
    .all()
    .map((zeile) => zeile.kennung)
}

function zaehlerstand(db: Database.Database): number {
  const zeile = db
    .prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
    .get()
  if (zeile === undefined) {
    throw new Error("zaehlerstand(): kennung_zaehler hat keine Zeile für bereich = 'person'.")
  }
  return zeile.naechste
}

function personenAnzahl(db: Database.Database): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
  if (zeile === undefined) {
    throw new Error('personenAnzahl(): COUNT(*) lieferte keine Zeile.')
  }
  return zeile.anzahl
}

function bereich(von: number, bis: number): readonly number[] {
  return Array.from({ length: bis - von + 1 }, (_, i) => von + i)
}

describe('Import — fortlaufende Personen-Kennung (AP-1.34 PR-A)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-kennung-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  function schreibeDatei(name: string, inhalt: unknown): string {
    const pfad = join(ordner, name)
    writeFileSync(pfad, JSON.stringify(inhalt), 'utf8')
    return pfad
  }

  it('importierte Personen bekommen fortlaufende Kennungen, über zwei Importe hinweg lückenlos', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const erster = importAusfuehren(db, { pfad: schreibeDatei('erster.json', baueImport(3, 'a')) })
      expect(erster.importGesperrt).toBe(false)
      expect(kennungenAufsteigend(db)).toEqual([1, 2, 3])
      expect(zaehlerstand(db)).toBe(4)

      const zweiter = importAusfuehren(db, { pfad: schreibeDatei('zweiter.json', baueImport(2, 'b')) })
      expect(zweiter.importGesperrt).toBe(false)
      expect(kennungenAufsteigend(db)).toEqual([1, 2, 3, 4, 5])
      expect(zaehlerstand(db)).toBe(6)
    } finally {
      db.close()
    }
  })

  it('Trockenlauf verbraucht keine Nummer — auch nicht die Sondierung innerhalb von importAusfuehren()', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const pfad = schreibeDatei('trocken.json', baueImport(3, 't'))
      expect(zaehlerstand(db)).toBe(1)

      const bericht = importTrockenlaufDurchfuehren(db, pfad)
      expect(bericht.importGesperrt).toBe(false)
      expect(personenAnzahl(db)).toBe(0)
      expect(zaehlerstand(db)).toBe(1)

      // Gegenprobe: der echte Import (der intern selbst erst sondiert) beginnt bei 1, nicht bei 4
      // oder 7 — sonst hätten Trockenlauf oder Sondierung Nummern verbraucht.
      importAusfuehren(db, { pfad })
      expect(kennungenAufsteigend(db)).toEqual([1, 2, 3])
      expect(zaehlerstand(db)).toBe(4)
    } finally {
      db.close()
    }
  })

  it('E12: Rücknahme eines Großimports per Schnappschuss setzt den Zähler nicht zurück', () => {
    const kleinPfad = schreibeDatei('klein.json', baueImport(3, 'k'))
    const grossPfad = schreibeDatei('gross.json', baueImport(800, 'g'))
    const danachPfad = schreibeDatei('danach.json', baueImport(1, 'd'))

    const db = oeffnen(dbPfad)
    migrieren(db)
    importAusfuehren(db, { pfad: kleinPfad })
    expect(kennungenAufsteigend(db)).toEqual([1, 2, 3])
    expect(zaehlerstand(db)).toBe(4)

    const bericht = importAusfuehren(db, { pfad: grossPfad })
    expect(bericht.zusammenfassung.ruecknahmeArt).toBe('schnappschuss')
    expect(kennungenAufsteigend(db)).toEqual(bereich(1, 803))
    expect(zaehlerstand(db)).toBe(804)

    // undo() schließt `db` (Datei-Wiederherstellungsweg, AP-1.5) — weiter über eine neue Verbindung.
    undo(db)

    const dbNach = oeffnen(dbPfad)
    try {
      // Die Rücknahme hat wirklich stattgefunden: nur die drei Personen von vorher sind da …
      expect(kennungenAufsteigend(dbNach)).toEqual([1, 2, 3])
      // … aber der Zähler steht auf max(alt, wiederhergestellt) = 804, nicht auf dem Schnappschuss-
      // stand 4 — die Nummern 4..803 waren vergeben und werden nie neu vergeben.
      expect(zaehlerstand(dbNach)).toBe(804)

      importAusfuehren(dbNach, { pfad: danachPfad })
      expect(kennungenAufsteigend(dbNach)).toEqual([1, 2, 3, 804])
      expect(zaehlerstand(dbNach)).toBe(805)
    } finally {
      dbNach.close()
    }
    // Großzügiger Timeout wie in import-undo-gross.test.ts (Schnappschuss-Roundtrip auf Windows-CI).
  }, 90_000)

  it('E12: Rücknahme eines Großimports OHNE neue Personen gelingt, der Zähler bleibt unverändert', () => {
    // hueter-H1 (PR #111): zieht der Großimport keine neue Nummer, sind alter und wiederhergestellter
    // Zählerstand gleich. Der Filter `naechste < @mindestens` in `zaehlerMindestensSetzen` muss den
    // Gleichstand dann ungeschrieben lassen — sonst feuert `chk_kennung_zaehler_vorwaerts` und die
    // Rücknahme bricht ab. Groß wird der Import hier allein über Quellen (> Schwelle geänderte Zeilen).
    const kleinPfad = schreibeDatei('klein.json', baueImport(3, 'k'))
    const quellen = Array.from({ length: RUECKNAHME_SCHWELLE_ZEILEN + 50 }, (_, i) => ({
      id: `tmp:q${String(i)}`,
      typ: 'sonstiges',
      titel: `Generierte Testquelle ohne Personen (AP-1.34, ${String(i)})`,
    }))
    const grossPfad = schreibeDatei('gross-ohne-personen.json', {
      vertrag: 'wurzelwerk-import/v1',
      erzeugt: { am: '2026-09-24', werkzeug: 'test' },
      zusammenfassung: { personen: 0, notizen_unverarbeitet: 0 },
      quellen,
      notizen_unverarbeitet: [],
    })

    const db = oeffnen(dbPfad)
    migrieren(db)
    importAusfuehren(db, { pfad: kleinPfad })
    expect(zaehlerstand(db)).toBe(4)

    const bericht = importAusfuehren(db, { pfad: grossPfad })
    expect(bericht.importGesperrt).toBe(false)
    expect(bericht.zusammenfassung.ruecknahmeArt).toBe('schnappschuss')
    expect(personenAnzahl(db)).toBe(3)
    expect(zaehlerstand(db)).toBe(4)

    // undo() schließt `db` (Datei-Wiederherstellungsweg, AP-1.5) — weiter über eine neue Verbindung.
    expect(() => undo(db)).not.toThrow()

    const dbNach = oeffnen(dbPfad)
    try {
      const quellenAnzahl = dbNach.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM quelle').get()
      expect(quellenAnzahl?.anzahl).toBe(1) // nur die Quelle des kleinen Imports: Rücknahme erfolgt
      expect(kennungenAufsteigend(dbNach)).toEqual([1, 2, 3])
      expect(zaehlerstand(dbNach)).toBe(4)
    } finally {
      dbNach.close()
    }
  }, 90_000)
})
