// AP-0.11, 55_Architektur.md §6.2/§6.4 (F-04, ADR-003): `schnappschussWiederherstellen()` — Projekt
// schließen, aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` verschieben (NIE löschen),
// gewählten Schnappschuss zurückkopieren, wieder öffnen.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kontext } from '../../src/main/ipc/huelle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

// AP-0.17: `projekt-dienst.ts` löst `docs/schema` über `schemaBasisverzeichnis()`
// (`app.getAppPath()`) auf — die Attrappe liefert das Repo-Root, wo `docs/schema` echt liegt
// (Vitest läuft mit cwd = Repo-Root, `vitest.config.ts`).
vi.mock('electron', () => ({ app: { getVersion: () => '0.1.0-test', isPackaged: false, getAppPath: () => process.cwd() } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))
vi.mock('electron-store', () => {
  class SpeicherAttrappe<T extends Record<string, unknown>> {
    private daten: T
    public constructor(optionen: { readonly defaults: T }) {
      this.daten = { ...optionen.defaults }
    }
    public get<K extends keyof T>(schluessel: K): T[K] {
      return this.daten[schluessel]
    }
    public set<K extends keyof T>(schluessel: K, wert: T[K]): void {
      this.daten[schluessel] = wert
    }
  }
  return { default: SpeicherAttrappe }
})

import { fuehreAus } from '../../src/main/befehle/bus'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { offenesProjektDatenbank, projektAnlegen, projektOeffnen, projektSchliessen } from '../../src/main/projekt/projekt-dienst'
import { schnappschussErzeugen } from '../../src/main/schnappschuss/erzeugen'
import { schnappschussWiederherstellen } from '../../src/main/schnappschuss/wiederherstellen'
import { altSchnappschussBauen, v6SchnappschussBauen } from '../hilfsmittel/alt-schnappschuss'

const ktx: Kontext = { vorgangsId: 'v-test-0001' }

function personenAnzahl(pfad: string): number {
  const db = new Database(pfad, { readonly: true })
  try {
    const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
    if (zeile === undefined) {
      throw new Error('COUNT(*) lieferte keine Zeile.')
    }
    return zeile.anzahl
  } finally {
    db.close()
  }
}

describe('schnappschussWiederherstellen() (55_Architektur.md §6.2/§6.4, AP-0.11)', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
  })

  it('verschiebt die ersetzte Datei nach snapshots/ersetzt-<Zeit>.sqlite (intakt, NIE gelöscht) und stellt den Schnappschuss-Stand wieder her', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbVorher = offenesProjektDatenbank()
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const eintrag = schnappschussErzeugen(dbVorher, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 8, 0, 0))

    // Nach dem Schnappschuss noch eine zweite Person anlegen — dieser Stand darf nach der
    // Wiederherstellung NICHT mehr im aktiven baum.sqlite stehen, aber IN der verschobenen Datei.
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    expect(personenAnzahl(dbPfad)).toBe(2)

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))

    // Wiederhergestellt: genau der Ein-Personen-Stand des Schnappschusses.
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Die verschobene Vorgängerdatei liegt in snapshots/ersetzt-<Zeit>.sqlite, ist NICHT gelöscht
    // und enthält weiterhin den Zwei-Personen-Stand von unmittelbar vor der Wiederherstellung.
    const ersetztPfad = join(snapshotsPfad, 'ersetzt-2026-09-10T09-00-00Z.sqlite')
    expect(existsSync(ersetztPfad)).toBe(true)
    expect(personenAnzahl(ersetztPfad)).toBe(2)

    // Das Projekt ist danach wieder offen (nicht nur die Datei ausgetauscht).
    expect(() => offenesProjektDatenbank()).not.toThrow()
  })

  it('ohne einen Schnappschuss mit der übergebenen id wirft es DATEI_NICHT_LESBAR', () => {
    projektAnlegen({ elternordner, name: 'Testbaum' })

    expect.assertions(2)
    try {
      schnappschussWiederherstellen({ id: 'nie-existiert' }, ktx)
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('DATEI_NICHT_LESBAR')
      }
    }
  })

  it('ohne offenes Projekt wirft es PROJEKT_NICHT_GEOEFFNET', () => {
    expect.assertions(2)
    try {
      schnappschussWiederherstellen({ id: 'irgendwas' }, ktx)
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_NICHT_GEOEFFNET')
      }
    }
  })

  it('ein zweiter Schnappschuss danach wiederherstellen belässt genau eine ersetzt-Datei je Wiederherstellung (keine überschrieben)', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const db = offenesProjektDatenbank()
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const eintrag = schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 8, 0, 0))

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))
    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 10, 0, 0))

    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(2)
  })

  it('ein fehlschlagendes copyFileSync (nach erfolgreichem renameSync) rollt zurück - baum.sqlite ist wieder da, keine verwaiste ersetzt-Datei, Projekt danach wieder öffenbar (hueter-Auflage C2)', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbVorher = offenesProjektDatenbank()
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Erzwingt einen `copyFileSync`-Fehlschlag OHNE Testseam in der Produktivfunktion: eine
    // Quelle, die als Verzeichnis existiert (besteht `existsSync()`, aber `copyFileSync` scheitert
    // an einem Verzeichnis als Quelle mit EISDIR) - `renameSync(dbPfad → ersetzt-)` läuft davor
    // bereits erfolgreich durch.
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    mkdirSync(join(snapshotsPfad, 'kaputt.sqlite'))

    try {
      schnappschussWiederherstellen({ id: 'kaputt' }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('DATEI_KEIN_PLATZ')
      }
    }

    // Rückgerollt: baum.sqlite ist wieder da, mit unverändertem Inhalt.
    expect(existsSync(dbPfad)).toBe(true)
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Keine verwaiste ersetzt-Datei (der Rückroll benennt sie zurück, statt sie liegen zu lassen).
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)

    // Das Projekt ist NICHT mehr offen (der Fehlschlag passiert nach projektSchliessen(), vor
    // dem erneuten projektOeffnen()) - lässt sich aber unverändert wieder öffnen, statt an einem
    // fehlenden baum.sqlite zu scheitern (der eigentliche Kern der Auflage: kein "Projekt steckt").
    expect(() => offenesProjektDatenbank()).toThrow(WurzelFehler)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
    expect(personenAnzahl(dbPfad)).toBe(1)
  })
})

function personZaehler(pfad: string): number {
  const db = new Database(pfad, { readonly: true })
  try {
    const zeile = db
      .prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
      .get()
    if (zeile === undefined) {
      throw new Error('kennung_zaehler hat keine Zeile für person.')
    }
    return zeile.naechste
  } finally {
    db.close()
  }
}

function personKennung(pfad: string, id: string): number | null {
  const db = new Database(pfad, { readonly: true })
  try {
    const zeile = db.prepare<{ readonly id: string }, { readonly kennung: number | null }>('SELECT kennung FROM person WHERE id = @id').get({ id })
    if (zeile === undefined) {
      throw new Error('Person nicht gefunden.')
    }
    return zeile.kennung
  } finally {
    db.close()
  }
}

describe('schnappschussWiederherstellen() senkt den Kennungszähler nie (AP-1.34, A2a)', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-kennung-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
  })

  it('A2-T1: nach dem Wiederherstellen steht der Zähler auf dem Stand vor der Wiederherstellung, die nächste Person bekommt keine bereits vergebene Kennung', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const db = offenesProjektDatenbank()

    const a = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personKennung(dbPfad, a.id)).toBe(1)
    const eintrag = schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 24, 8, 0, 0))
    const b = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const c = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personKennung(dbPfad, b.id)).toBe(2)
    expect(personKennung(dbPfad, c.id)).toBe(3)
    expect(personZaehler(dbPfad)).toBe(4)

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))

    expect(personenAnzahl(dbPfad)).toBe(1)
    // O-3: der Schnappschuss behält seine eigenen Kennungen.
    expect(personKennung(dbPfad, a.id)).toBe(1)
    expect(personZaehler(dbPfad)).toBe(4)

    const neu = fuehreAus(offenesProjektDatenbank(), 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personKennung(dbPfad, neu.id)).toBe(4)
  })

  it('A2-T2: Schnappschuss sofort wiederhergestellt (Gleichstand) wirft nicht und lässt den Zähler unverändert', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const db = offenesProjektDatenbank()
    fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personZaehler(dbPfad)).toBe(3)
    const eintrag = schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 24, 8, 0, 0))

    expect(() => schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))).not.toThrow()

    expect(personZaehler(dbPfad)).toBe(3)
    expect(() => offenesProjektDatenbank()).not.toThrow()
  })

  it('A2-T3: scheitert das Nachziehen (Schnappschuss-Datei mit Fremdbytes), wird zurückgerollt - alter Inhalt, keine ersetzt-Datei, Projekt wieder öffenbar', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    fuehreAus(offenesProjektDatenbank(), 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Kopieren gelingt, erst das Öffnen zum Nachziehen scheitert (SQLITE_NOTADB).
    mkdirSync(snapshotsPfad, { recursive: true })
    writeFileSync(join(snapshotsPfad, 'fremd.sqlite'), Buffer.from('das ist keine SQLite-Datei, sondern Fremdbytes '.repeat(200)))

    try {
      schnappschussWiederherstellen({ id: 'fremd' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('INTERN_UNERWARTET')
      }
    }

    expect(existsSync(dbPfad)).toBe(true)
    expect(personenAnzahl(dbPfad)).toBe(1)
    expect(personZaehler(dbPfad)).toBe(2)
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)

    expect(() => offenesProjektDatenbank()).toThrow(WurzelFehler)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
    expect(personenAnzahl(dbPfad)).toBe(1)
  })
})

/** Sortiert per `ORDER BY id` vor jeder uuidv7 aus `person.anlegen`. */
const X_ID = '00000000-0000-7000-8000-000000000001'

function alleKennungen(pfad: string): Record<string, number | null> {
  const db = new Database(pfad, { readonly: true })
  try {
    const ergebnis: Record<string, number | null> = {}
    for (const zeile of db.prepare<[], { readonly id: string; readonly kennung: number | null }>('SELECT id, kennung FROM person ORDER BY id').all()) {
      ergebnis[zeile.id] = zeile.kennung
    }
    return ergebnis
  } finally {
    db.close()
  }
}

function personenAnlegen(anzahl: number): readonly string[] {
  const ids: string[] = []
  for (let i = 0; i < anzahl; i += 1) {
    ids.push(fuehreAus(offenesProjektDatenbank(), 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id)
  }
  return ids
}

/** Fünf Personen P1..P5 aus `person.anlegen` (Kennungen 1..5, Zähler 6). */
function fuenfPersonen(): readonly [string, string, string, string, string] {
  const [p1, p2, p3, p4, p5] = personenAnlegen(5)
  if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined || p5 === undefined) {
    throw new Error('person.anlegen lieferte keine fünf IDs.')
  }
  return [p1, p2, p3, p4, p5]
}

describe('H6b: Schnappschuss vor 0007 übernimmt die Kennungen der ersetzten Datei (AP-1.34, A2b)', () => {
  let elternordner: string
  let bauordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-h6b-'))
    bauordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-h6b-bau-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
    rmSync(bauordner, { recursive: true, force: true })
  })

  it('H6b-T1: Treffer behalten ihre Kennung, die Person ohne Treffer bekommt den Zählerstand vorher; Zähler 7, nächste Person 7', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const [p1, p2, p3, p4, p5] = fuenfPersonen()
    expect(alleKennungen(dbPfad)).toEqual({ [p1]: 1, [p2]: 2, [p3]: 3, [p4]: 4, [p5]: 5 })
    expect(personZaehler(dbPfad)).toBe(6)

    v6SchnappschussBauen(bauordner, snapshotsPfad, 'v6-alt', [p2, p4, p5, X_ID])

    schnappschussWiederherstellen({ id: 'v6-alt' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))

    expect(alleKennungen(dbPfad)).toEqual({ [X_ID]: 6, [p2]: 2, [p4]: 4, [p5]: 5 })
    expect(personZaehler(dbPfad)).toBe(7)
    const neu = fuehreAus(offenesProjektDatenbank(), 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personKennung(dbPfad, neu.id)).toBe(7)
  })

  it('H6b-T2: ersetzte Datei ohne Personen (Zähler 1), v6-Schnappschuss mit drei Personen: 1, 2, 3 in ORDER BY id, Zähler 4', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    expect(personZaehler(dbPfad)).toBe(1)
    const a = '018f0000-0000-7000-8000-00000000000a'
    const b = '018f0000-0000-7000-8000-00000000000b'
    const c = '018f0000-0000-7000-8000-00000000000c'
    v6SchnappschussBauen(bauordner, snapshotsPfad, 'v6-drei', [c, a, b])

    schnappschussWiederherstellen({ id: 'v6-drei' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))

    expect(alleKennungen(dbPfad)).toEqual({ [a]: 1, [b]: 2, [c]: 3 })
    expect(personZaehler(dbPfad)).toBe(4)
  })

  it('H6b-T3: denselben v6-Schnappschuss zweimal wiederherstellen ergibt dieselben Kennungen, der Zähler bleibt', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const [, p2, , p4, p5] = fuenfPersonen()
    v6SchnappschussBauen(bauordner, snapshotsPfad, 'v6-alt', [p2, p4, p5, X_ID])

    schnappschussWiederherstellen({ id: 'v6-alt' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))
    const nachErstem = alleKennungen(dbPfad)
    expect(personZaehler(dbPfad)).toBe(7)

    schnappschussWiederherstellen({ id: 'v6-alt' }, ktx, () => Date.UTC(2026, 8, 24, 10, 0, 0))

    expect(alleKennungen(dbPfad)).toEqual(nachErstem)
    expect(nachErstem).toEqual({ [X_ID]: 6, [p2]: 2, [p4]: 4, [p5]: 5 })
    expect(personZaehler(dbPfad)).toBe(7)
  })

  it('H6b-T4: ein v7-Schnappschuss behält seine Kennungen, auch wenn die ersetzte Datei sie inzwischen anders trägt (O-3); nur der Zähler wird nachgezogen', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const [p1, p2, p3] = personenAnlegen(3)
    if (p1 === undefined || p2 === undefined || p3 === undefined) {
      throw new Error('person.anlegen lieferte keine drei IDs.')
    }
    const eintrag = schnappschussErzeugen(offenesProjektDatenbank(), { snapshotsPfad }, () => Date.UTC(2026, 8, 24, 8, 0, 0))
    personenAnlegen(1) // Kennung 4, Zähler 5

    // Test-SQL: P1 trägt in der ersetzten Datei eine andere Kennung als im Schnappschuss.
    const db = offenesProjektDatenbank()
    journalAus(db, 'Testvorbereitung (AP-1.34, A2b): Kennung in der ersetzten Datei umsetzen.')
    db.prepare('UPDATE person SET kennung = @kennung WHERE id = @id').run({ id: p1, kennung: 3000 })
    journalAn(db)
    expect(personKennung(dbPfad, p1)).toBe(3000)

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))

    expect(alleKennungen(dbPfad)).toEqual({ [p1]: 1, [p2]: 2, [p3]: 3 })
    expect(personZaehler(dbPfad)).toBe(5)
  })

  it('H6b-F: scheitert die Übernahme im Migrations-Hook (Kennungskollision), wird zurückgerollt - alter Inhalt, keine ersetzt-Datei, Projekt wieder öffenbar', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const [p1, p2, p3, p4, p5] = fuenfPersonen()
    // Erzwungene Kollision: P1 trägt in der ersetzten Datei den Zählerstand (6) als Kennung — die
    // Person ohne Treffer (X, sortiert vor P1) bekommt ebenfalls 6 -> UNIQUE idx_person_kennung.
    const db = offenesProjektDatenbank()
    journalAus(db, 'Testvorbereitung (AP-1.34, A2b): Kennungskollision in der ersetzten Datei erzwingen.')
    db.prepare('UPDATE person SET kennung = @kennung WHERE id = @id').run({ id: p1, kennung: 6 })
    journalAn(db)
    const vorher = alleKennungen(dbPfad)
    expect(vorher).toEqual({ [p1]: 6, [p2]: 2, [p3]: 3, [p4]: 4, [p5]: 5 })

    v6SchnappschussBauen(bauordner, snapshotsPfad, 'v6-kollision', [X_ID, p1])

    try {
      schnappschussWiederherstellen({ id: 'v6-kollision' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('INTERN_UNERWARTET')
        // Gescheitert ist genau die Übernahme (nicht etwa Kopie oder Öffnen).
        expect(u.message).toMatch(/UNIQUE constraint failed: person\.kennung/)
      }
    }

    expect(existsSync(dbPfad)).toBe(true)
    expect(alleKennungen(dbPfad)).toEqual(vorher)
    expect(personZaehler(dbPfad)).toBe(6)
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)

    expect(() => offenesProjektDatenbank()).toThrow(WurzelFehler)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
    expect(alleKennungen(dbPfad)).toEqual(vorher)
  })
})

const FIXTURE_V5_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v5.sqlite')

/**
 * Überschreibt die Wurzelseite des Index `indexName` in `pfad` mit Fremdbytes. Die Datei öffnet
 * danach weiter (Seite 1 mit dem Schema bleibt heil), aber `PRAGMA quick_check` scheitert an der
 * ungültigen B-Baum-Seite. Die Datei muss vollständig in der Hauptdatei stehen (kein `-wal`).
 */
function indexSeiteBeschaedigen(pfad: string, indexName: string): void {
  const db = new Database(pfad, { readonly: true })
  let seitengroesse: number
  let wurzelseite: number
  try {
    const groesse: unknown = db.pragma('page_size', { simple: true })
    const zeile = db
      .prepare<{ readonly name: string }, { readonly rootpage: number }>("SELECT rootpage FROM sqlite_master WHERE type = 'index' AND name = @name")
      .get({ name: indexName })
    if (typeof groesse !== 'number' || zeile === undefined) {
      throw new Error('Seitengröße oder Wurzelseite nicht lesbar.')
    }
    seitengroesse = groesse
    wurzelseite = zeile.rootpage
  } finally {
    db.close()
  }
  expect(existsSync(`${pfad}-wal`)).toBe(false)
  expect(wurzelseite).toBeGreaterThan(1)
  const inhalt = readFileSync(pfad)
  inhalt.fill(0xab, (wurzelseite - 1) * seitengroesse, wurzelseite * seitengroesse)
  writeFileSync(pfad, inhalt)
}

function quickCheckErgebnis(pfad: string): unknown {
  const db = new Database(pfad, { readonly: true })
  try {
    return db.pragma('quick_check', { simple: true })
  } finally {
    db.close()
  }
}

describe('Wiederherstellen über mehrere Migrationen und mit beschädigter Seite (AP-1.34, hueter-H1/H2)', () => {
  let elternordner: string
  let bauordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-h1h2-'))
    bauordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-h1h2-bau-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
    rmSync(bauordner, { recursive: true, force: true })
  })

  it('H6b-T5: ein v5-Schnappschuss (Migration 6 und 7) übernimmt die Kennungen genau bei Version 7 — Treffer behalten ihre Kennung, X bekommt 6, Zähler 7', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const [p1, p2, p3, p4, p5] = fuenfPersonen()
    expect(alleKennungen(dbPfad)).toEqual({ [p1]: 1, [p2]: 2, [p3]: 3, [p4]: 4, [p5]: 5 })
    expect(personZaehler(dbPfad)).toBe(6)

    altSchnappschussBauen(FIXTURE_V5_PFAD, 5, bauordner, snapshotsPfad, 'v5-alt', [p2, p4, p5, X_ID])

    schnappschussWiederherstellen({ id: 'v5-alt' }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))

    expect(alleKennungen(dbPfad)).toEqual({ [X_ID]: 6, [p2]: 2, [p4]: 4, [p5]: 5 })
    expect(personZaehler(dbPfad)).toBe(7)
    const neu = fuehreAus(offenesProjektDatenbank(), 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    expect(personKennung(dbPfad, neu.id)).toBe(7)
  })

  it('H2: ein Schnappschuss, der öffnet, aber quick_check nicht besteht, wird nicht übernommen — Rückrollen, alter Inhalt, keine ersetzt-Datei, Projekt wieder öffenbar', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    personenAnlegen(3)
    const eintrag = schnappschussErzeugen(offenesProjektDatenbank(), { snapshotsPfad }, () => Date.UTC(2026, 8, 24, 8, 0, 0))
    personenAnlegen(1)
    const vorher = alleKennungen(dbPfad)
    expect(Object.keys(vorher)).toHaveLength(4)
    expect(personZaehler(dbPfad)).toBe(5)

    const schnappschussPfad = join(snapshotsPfad, `${eintrag.id}.sqlite`)
    indexSeiteBeschaedigen(schnappschussPfad, 'idx_person_kennung')
    // Vorbedingung des Fixtures: öffnet über den Produktivweg, quick_check scheitert.
    expect(() => oeffnen(schnappschussPfad).close()).not.toThrow()
    expect(quickCheckErgebnis(schnappschussPfad)).not.toBe('ok')

    try {
      schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('DATENBANK_INTEGRITAET')
      }
    }

    expect(existsSync(dbPfad)).toBe(true)
    expect(alleKennungen(dbPfad)).toEqual(vorher)
    expect(personZaehler(dbPfad)).toBe(5)
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)

    expect(() => offenesProjektDatenbank()).toThrow(WurzelFehler)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
    expect(alleKennungen(dbPfad)).toEqual(vorher)
  })

  it('H3: ein Schnappschuss mit neuerer Schemaversion wirft PROJEKT_NEUERE_SCHEMAVERSION (nicht umgepackt) und rollt zurück', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    personenAnlegen(2)
    const eintrag = schnappschussErzeugen(offenesProjektDatenbank(), { snapshotsPfad }, () => Date.UTC(2026, 8, 24, 8, 0, 0))
    personenAnlegen(1)
    const vorher = alleKennungen(dbPfad)
    expect(Object.keys(vorher)).toHaveLength(3)

    // Test-SQL: der Schnappschuss behauptet eine Schemaversion, die diese App nicht kennt.
    const schnappschuss = new Database(join(snapshotsPfad, `${eintrag.id}.sqlite`))
    try {
      schnappschuss.pragma(`user_version = ${String(SCHEMA_VERSION + 1)}`)
    } finally {
      schnappschuss.close()
    }

    try {
      schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 24, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_NEUERE_SCHEMAVERSION')
      }
    }

    expect(existsSync(dbPfad)).toBe(true)
    expect(alleKennungen(dbPfad)).toEqual(vorher)
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
  })
})
