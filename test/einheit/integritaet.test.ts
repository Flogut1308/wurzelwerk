import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { baueFixture } from '../hilfsmittel/fixture-bauen'

// `integritaetVollPruefen` protokolliert über `protokollInfo()` (§7: nur Code/Anzahl, nie
// Meldungstexte) — die echte Fassung importiert `electron-log/main`, das wiederum `electron`
// erwartet. Analog zu `test/einheit/projekt-dienst.test.ts`: das ganze Modul durch Spione ersetzen,
// statt ein Electron-Attrappenmodul aufzubauen, das dieser Testdatei sonst nicht fehlen würde.
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))

import { ableitungAbweichung, datenbestandBericht, integritaetPruefen, integritaetVollPruefen } from '../../src/main/datenbank/integritaet'
import { protokollInfo } from '../../src/main/protokoll/logger'

/**
 * AP-0.5, §9.3: `PRAGMA quick_check` ist der erste Schritt beim Öffnen — vor jeder Migration.
 * Eine beschädigte Datei muss auffallen, bevor irgendetwas versucht wird, sie zu migrieren.
 */
describe('main/datenbank/integritaet', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-integritaet-'))
    dbPfad = join(ordner, 'test.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('wirft nicht bei einer frischen, intakten Datenbank', () => {
    const db = new Database(dbPfad)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(() => integritaetPruefen(db)).not.toThrow()
    db.close()
  })

  it('wirft DATENBANK_INTEGRITAET bei einer zerschossenen Datei', () => {
    writeFileSync(dbPfad, Buffer.from('das ist keine sqlite-datei, nur müll'))
    const db = new Database(dbPfad)
    try {
      expect(() => integritaetPruefen(db)).toThrow(WurzelFehler)
      try {
        integritaetPruefen(db)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('DATENBANK_INTEGRITAET')
        }
      }
    } finally {
      db.close()
    }
  })
})

/**
 * AP-0.13 — `ableitungAbweichung(db)`: probeweiser Neuaufbau (eigene BEGIN/ROLLBACK-Transaktion,
 * s. Kommentar an `ableitungAbweichung`) mit Abzug vorher/nachher. Eine gesunde Datenbank meldet
 * keine Abweichung UND der Vergleich selbst mutiert nichts (Abzug vorher == Abzug nachher, weil der
 * Neuaufbau per ROLLBACK rückgängig gemacht wird). Eine künstlich verfälschte `person_flach`-Zeile
 * (roher UPDATE, Journal währenddessen aus — `person_flach` ist ohnehin NICHT_JOURNALISIERT) muss
 * als Abweichung auffallen, und nach einem echten `alleAbgeleitetenNeuAufbauen()` wieder verschwinden.
 */
describe('main/datenbank/integritaet: ableitungAbweichung', () => {
  it('meldet keine Abweichung bei einer gesunden, migrierten Datenbank', () => {
    const db = baueFixture(
      {
        personen: [{ schluessel: 'anna', privat: 0, ist_platzhalter: 0 }],
        namen: [{ schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', nachname: 'Muster' }],
      },
      1,
    )
    try {
      alleAbgeleitetenNeuAufbauen(db)
      expect(ableitungAbweichung(db).betroffeneTabellen).toEqual([])
    } finally {
      db.close()
    }
  })

  it('mutiert die Datenbank selbst nicht (Abzug vor dem Aufruf == Abzug nach dem Aufruf)', () => {
    const db = baueFixture(
      {
        personen: [{ schluessel: 'anna', privat: 0, ist_platzhalter: 0 }],
        namen: [{ schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', nachname: 'Muster' }],
      },
      1,
    )
    try {
      alleAbgeleitetenNeuAufbauen(db)
      const vorAbzug = db.prepare('SELECT person_id, anzeigename FROM person_flach ORDER BY person_id').all()
      ableitungAbweichung(db)
      const nachAbzug = db.prepare('SELECT person_id, anzeigename FROM person_flach ORDER BY person_id').all()
      expect(nachAbzug).toEqual(vorAbzug)
    } finally {
      db.close()
    }
  })

  it('meldet person_flach als abweichend, wenn die Tabelle künstlich verfälscht wurde, und wieder leer nach echtem Neuaufbau', () => {
    const db = baueFixture(
      {
        personen: [{ schluessel: 'anna', privat: 0, ist_platzhalter: 0 }],
        namen: [{ schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', nachname: 'Muster' }],
      },
      1,
    )
    try {
      alleAbgeleitetenNeuAufbauen(db)
      // `person_flach` ist NICHT_JOURNALISIERT (journalisierung.ts) — ein roher UPDATE braucht keine
      // armierte Transaktion, im Gegensatz zu einer JOURNALISIERT-Tabelle.
      db.prepare("UPDATE person_flach SET anzeigename = 'Verfälscht'").run()

      expect(ableitungAbweichung(db).betroffeneTabellen).toEqual(['person_flach'])

      alleAbgeleitetenNeuAufbauen(db)
      expect(ableitungAbweichung(db).betroffeneTabellen).toEqual([])
    } finally {
      db.close()
    }
  })
})

/**
 * AP-0.13 — `datenbestandBericht(db)`: Sammelprüfung für den Menüpunkt „Wartung → Datenbestand
 * prüfen“. Ein Fund ist kein Fehler (kein Wurf, kein neuer Fehlercode) — nur ein Bericht.
 */
describe('main/datenbank/integritaet: datenbestandBericht', () => {
  it('meldet bei einer gesunden, migrierten Datenbank alle vier Befunde leer/ok', () => {
    const db = baueFixture(
      {
        personen: [
          { schluessel: 'anna', privat: 0, ist_platzhalter: 0 },
          { schluessel: 'bert', privat: 0, ist_platzhalter: 0 },
        ],
        namen: [{ schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', nachname: 'Muster' }],
        elternschaften: [{ schluessel: 'e1', elternteilSchluessel: 'anna', kindSchluessel: 'bert', typ: 'biologisch' }],
      },
      2,
    )
    try {
      alleAbgeleitetenNeuAufbauen(db)
      const bericht = datenbestandBericht(db)

      expect(bericht.integrityCheckFunde).toEqual([])
      expect(bericht.fremdschluesselFunde).toEqual([])
      expect(bericht.ableitungAbweichung.betroffeneTabellen).toEqual([])
      expect(bericht.zyklusGefunden).toBe(false)
    } finally {
      db.close()
    }
  })

  it('meldet bei einer verfälschten person_flach NUR die Ableitungsabweichung, der Rest bleibt ok', () => {
    const db = baueFixture(
      { personen: [{ schluessel: 'anna', privat: 0, ist_platzhalter: 0 }] },
      3,
    )
    try {
      alleAbgeleitetenNeuAufbauen(db)
      db.prepare("UPDATE person_flach SET anzeigename = 'Verfälscht'").run()

      const bericht = datenbestandBericht(db)

      expect(bericht.integrityCheckFunde).toEqual([])
      expect(bericht.fremdschluesselFunde).toEqual([])
      expect(bericht.ableitungAbweichung.betroffeneTabellen).toEqual(['person_flach'])
      expect(bericht.zyklusGefunden).toBe(false)
    } finally {
      db.close()
    }
  })
})

/**
 * AP-0.13 — `integritaetVollPruefen(db)`: der volle `integrity_check` nach einem unsauberen Lauf
 * (`projekt-dienst.ts`, `sperre.status === 'verwaist'`). Wirft NICHT (§7-Protokoll statt
 * IPC-Ausnahme) und protokolliert ausschließlich Code + Anzahl — nie die Meldungstexte von
 * `PRAGMA integrity_check` selbst (die könnten im Extremfall Fragmente aus der Datei enthalten).
 */
/** Typwächter für den (gemockten) `protokollInfo`-Aufruf — ohne `as` auf einen unbekannten Wert (CLAUDE.md §4). */
function istProtokollEintragMitZeilenzahl(wert: unknown): wert is { readonly zeilenzahl: unknown } {
  return typeof wert === 'object' && wert !== null && 'zeilenzahl' in wert
}

function protokollSchluesselMenge(wert: unknown): readonly string[] {
  return typeof wert === 'object' && wert !== null ? Object.keys(wert).sort() : []
}

describe('main/datenbank/integritaet: integritaetVollPruefen', () => {
  beforeEach(() => {
    vi.mocked(protokollInfo).mockClear()
  })

  it('wirft nicht bei einer intakten Datenbank und protokolliert AUSSCHLIESSLICH code+zeilenzahl (Anzahl 0)', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    try {
      expect(() => integritaetVollPruefen(db)).not.toThrow()
      expect(protokollInfo).toHaveBeenCalledTimes(1)
      const [eintrag] = vi.mocked(protokollInfo).mock.calls[0] ?? []
      // §7: NUR Code/Anzahl im Protokoll, nie die Meldungstexte von `PRAGMA integrity_check` selbst
      // (die könnten im Extremfall Fragmente aus der Datei enthalten) — geprüft über die exakte
      // Schlüsselmenge, nicht nur `toMatchObject` (das würde zusätzliche Felder nicht auffallen lassen).
      expect(protokollSchluesselMenge(eintrag)).toEqual(['code', 'zeilenzahl'])
      expect(istProtokollEintragMitZeilenzahl(eintrag) && eintrag.zeilenzahl).toBe(0)
    } finally {
      db.close()
    }
  })

  it('wirft nicht bei einer zerschossenen Datei, protokolliert aber eine Anzahl > 0', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-integritaet-voll-'))
    const dbPfad = join(ordner, 'test.sqlite')
    writeFileSync(dbPfad, Buffer.from('das ist keine sqlite-datei, nur müll'))
    const db = new Database(dbPfad)
    try {
      expect(() => integritaetVollPruefen(db)).not.toThrow()
      const [eintrag] = vi.mocked(protokollInfo).mock.calls[0] ?? []
      expect(protokollSchluesselMenge(eintrag)).toEqual(['code', 'zeilenzahl'])
      const zeilenzahl = istProtokollEintragMitZeilenzahl(eintrag) ? eintrag.zeilenzahl : undefined
      expect(typeof zeilenzahl).toBe('number')
      expect(zeilenzahl).toBeGreaterThan(0)
    } finally {
      db.close()
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
