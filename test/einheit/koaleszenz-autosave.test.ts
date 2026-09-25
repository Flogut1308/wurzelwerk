// AP-1.30 (PR 4), Abnahme „Kein Speichern-Knopf … Koaleszenz = ein Undo-Schritt, aber nur mit
// koaleszenzSchluessel (Befehl + Subjekt + Feld)", Test „zehn Tastenanschläge in < 2 s = ein
// Undo-Schritt" — über den ECHTEN Befehlsbus (`fuehreAus`) und die echte Befehlsdefinition, je
// Autosave-Befehl (`AUTOSAVE_BEFEHLE`, Szenarien in `test/hilfsmittel/autosave-szenarien.ts`).
//
// Uhr fest (`vi.setSystemTime`, nur `Date` gefälscht): der Bus liest `Date.now()` für den
// Transaktionszeitpunkt, das 2000-ms-Fenster (`src/main/journal/koaleszenz.ts`) entscheidet damit
// deterministisch. Die zehn Abstände liegen zwischen 150 und 450 ms, Summe 1850 ms (< 2 s) — also
// über dem Debounce (400 ms, `AUTOSAVE_DEBOUNCE_MS`) wie unter ihm: jeder Aufruf steht für einen
// Autosave-Commit.
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
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { AUTOSAVE_BEFEHLE } from '../../src/shared/autosave'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { SZENARIEN, type AutosaveLauf, type Ziel } from '../hilfsmittel/autosave-szenarien'

/** Neun Abstände zwischen zehn Aufrufen, je 150–450 ms, Summe 1850 ms. */
const ABSTAENDE_MS: readonly number[] = [150, 200, 180, 450, 160, 170, 190, 150, 200]

let jetzt = 1_790_000_000_000

function warte(ms: number): void {
  jetzt += ms
  vi.setSystemTime(jetzt)
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface Anzahl {
  readonly anzahl: number
}

/** Undo-fähige Schritte = angewendete Transaktionen. */
function schritte(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], Anzahl>("SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'").get()
  if (zeile === undefined) throw new Error('schritte(): COUNT lieferte keine Zeile.')
  return zeile.anzahl
}

/** Zehn Aufrufe; `ziel(i)` wählt je Aufruf das Ziel, `vorAufruf(i)` läuft vor Aufruf `i` (Abstand). */
function zehnAufrufe(lauf: AutosaveLauf, ziel: (i: number) => Ziel, abstand: (i: number) => number = (i) => ABSTAENDE_MS[i - 2] ?? 0, zwischendurch?: (i: number) => void): void {
  for (let i = 1; i <= 10; i += 1) {
    if (i > 1) warte(abstand(i))
    zwischendurch?.(i)
    lauf.schreiben(i, ziel(i))
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  jetzt = 1_790_000_000_000
  vi.setSystemTime(jetzt)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Autosave-Koaleszenz über den Befehlsbus (AP-1.30 PR 4)', () => {
  it('die Abstände der Folge liegen je zwischen 150 und 450 ms, Summe < 2 s', () => {
    expect(ABSTAENDE_MS).toHaveLength(9)
    expect(ABSTAENDE_MS.every((ms) => ms >= 150 && ms <= 450)).toBe(true)
    expect(ABSTAENDE_MS.reduce((a, b) => a + b, 0)).toBeLessThan(2000)
  })

  for (const befehl of AUTOSAVE_BEFEHLE) {
    const szenario = SZENARIEN[befehl]

    describe(befehl, () => {
      it('zehn Aufrufe in < 2 s auf dasselbe Subjekt + Feld = EIN Undo-Schritt; ein Undo stellt den Ausgangsstand bitgleich her', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const ausgang = kanonischerAbzug(db)
          const schritteVorher = schritte(db)
          const zielVorher = undoZiel(db)?.id

          zehnAufrufe(lauf, () => 'feld')

          expect(schritte(db) - schritteVorher).toBe(1)
          expect(kanonischerAbzug(db)).not.toBe(ausgang)
          undo(db)
          expect(kanonischerAbzug(db)).toBe(ausgang)
          expect(undoZiel(db)?.id).toBe(zielVorher)
        } finally {
          db.close()
        }
      })

      it('Gegenprobe: 2001 ms Pause nach dem fünften Aufruf → zwei Undo-Schritte', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          zehnAufrufe(lauf, () => 'feld', (i) => (i === 6 ? 2001 : 150))
          expect(schritte(db) - schritteVorher).toBe(2)
        } finally {
          db.close()
        }
      })

      it('Gegenprobe: fünfmal ein Feld, dann fünfmal ein anderes Feld → zwei Undo-Schritte', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          zehnAufrufe(lauf, (i) => (i <= 5 ? 'feld' : 'anderesFeld'))
          expect(schritte(db) - schritteVorher).toBe(2)
        } finally {
          db.close()
        }
      })

      it('Gegenprobe: fünfmal ein Subjekt, dann fünfmal ein anderes Subjekt → zwei Undo-Schritte', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          zehnAufrufe(lauf, (i) => (i <= 5 ? 'feld' : 'anderesSubjekt'))
          expect(schritte(db) - schritteVorher).toBe(2)
        } finally {
          db.close()
        }
      })

      it('Gegenprobe: ein fremder Befehl dazwischen → zwei Undo-Schritte (plus der fremde)', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          zehnAufrufe(
            lauf,
            () => 'feld',
            undefined,
            (i) => {
              if (i === 6) fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
            },
          )
          expect(schritte(db) - schritteVorher).toBe(3)
        } finally {
          db.close()
        }
      })

      it.runIf(szenario.zweiSpaltenMoeglich)('Gegenprobe: zwei Spalten ändern sich, `feld` nennt nur eine → keine Koaleszenz', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          for (let i = 1; i <= 3; i += 1) {
            if (i > 1) warte(150)
            lauf.schreiben(i, 'zweiSpalten')
          }
          expect(schritte(db) - schritteVorher).toBe(3)
        } finally {
          db.close()
        }
      })

      it.runIf(szenario.ohneFeldMoeglich)('Gegenprobe: ohne Vertragsfeld `feld` → keine Koaleszenz', () => {
        const db = neueTestDatenbank()
        try {
          const lauf = szenario.aufbauen(db)
          warte(5000)
          const schritteVorher = schritte(db)
          for (let i = 1; i <= 3; i += 1) {
            if (i > 1) warte(150)
            lauf.schreiben(i, 'ohneFeld')
          }
          expect(schritte(db) - schritteVorher).toBe(3)
        } finally {
          db.close()
        }
      })
    })
  }
})
