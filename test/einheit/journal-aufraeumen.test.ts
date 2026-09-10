// AP-0.11, 55_Architektur.md §4.6 (ADR-003): `journalAufraeumen()` — die `transaktion`-Zeile
// bleibt für immer (der Verlauf bleibt lesbar), nur die `aenderung`-Zeilen alter Transaktionen
// werden gelöscht und `rueckgaengig_moeglich` auf 0 gesetzt. Dazu der Undo-Guard
// (`src/main/journal/undo.ts`): ein Undo-Ziel ohne `aenderung`-Zeilen wirft
// `JOURNAL_NICHT_RUECKNEHMBAR` statt eines stillen No-op-Undos (Test zuerst rot, CLAUDE.md §5).
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { journalAufraeumen } from '../../src/main/journal/aufraeumen'
import { undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

const TAG_MS = 86_400_000

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface TransaktionZeile {
  readonly id: string
  readonly art: string
  readonly status: string
  readonly rueckgaengig_moeglich: number
}

function transaktionenNachLfd(db: ReturnType<typeof oeffnen>): readonly TransaktionZeile[] {
  return db.prepare<[], TransaktionZeile>('SELECT id, art, status, rueckgaengig_moeglich FROM transaktion ORDER BY lfd').all()
}

function aenderungAnzahlFuer(db: ReturnType<typeof oeffnen>, transaktionId: string): number {
  const zeile = db
    .prepare<{ readonly id: string }, { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM aenderung WHERE transaktion_id = @id')
    .get({ id: transaktionId })
  if (zeile === undefined) {
    throw new Error('COUNT(*) lieferte keine Zeile.')
  }
  return zeile.anzahl
}

function zeitpunktSetzen(db: ReturnType<typeof oeffnen>, transaktionId: string, zeitpunkt: number): void {
  db.prepare('UPDATE transaktion SET zeitpunkt = @zeitpunkt WHERE id = @id').run({ id: transaktionId, zeitpunkt })
}

/**
 * `fuehreAus()` liefert das Handler-Ergebnis (z. B. die neu angelegte `person.id`) - NICHT die
 * `transaktion.id` des dabei entstandenen Journal-Eintrags. Diese Hilfsfunktion holt die zuletzt
 * (nach `lfd`) angelegte Transaktions-ID direkt aus `transaktion`.
 */
function letzteTransaktionId(db: ReturnType<typeof oeffnen>): string {
  const zeile = db.prepare<[], { readonly id: string }>('SELECT id FROM transaktion ORDER BY lfd DESC LIMIT 1').get()
  if (zeile === undefined) {
    throw new Error('Keine transaktion-Zeile vorhanden.')
  }
  return zeile.id
}

describe('journalAufraeumen() (55_Architektur.md §4.6, AP-0.11)', () => {
  it('räumt aenderung-Zeilen alter, nicht mehr unter den letzten 200 stehender Transaktionen auf — transaktion-Zeile UND Historie bleiben, rueckgaengig_moeglich wird 0', () => {
    const db = neueTestDatenbank()
    try {
      const alteIds: string[] = []
      for (let i = 0; i < 210; i += 1) {
        fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
        alteIds.push(letzteTransaktionId(db))
      }
      const jetzt = 1_000 * TAG_MS
      // Alle 210 auf "vor 40 Tagen" zurückdatieren - jünger als 30 Tage sind danach nur die, die
      // unter den letzten 200 (nach lfd) liegen.
      for (const id of alteIds) {
        zeitpunktSetzen(db, id, jetzt - 40 * TAG_MS)
      }

      journalAufraeumen(db, () => jetzt)

      const historie = transaktionenNachLfd(db)
      // 210 ursprüngliche + genau 1 neue Wartungstransaktion (55_Architektur.md §4.6).
      expect(historie).toHaveLength(211)
      const wartungsZeilen = historie.filter((zeile) => zeile.art === 'wartung')
      expect(wartungsZeilen).toHaveLength(1)
      expect(wartungsZeilen[0]?.rueckgaengig_moeglich).toBe(0)

      // Die ältesten 10 (lfd 1..10, außerhalb der letzten 200) sind begrenzt: keine aenderung-Zeilen
      // mehr, aber die transaktion-Zeile selbst bleibt (Verlauf bleibt lesbar).
      const ersteZehnIds = alteIds.slice(0, 10)
      for (const id of ersteZehnIds) {
        expect(aenderungAnzahlFuer(db, id)).toBe(0)
      }
      const begrenzt = historie.filter((zeile) => ersteZehnIds.includes(zeile.id))
      expect(begrenzt).toHaveLength(10)
      for (const zeile of begrenzt) {
        expect(zeile.rueckgaengig_moeglich).toBe(0)
      }

      // Die letzten 200 (lfd 11..210) bleiben unangetastet: aenderung-Zeilen UND rueckgaengig_moeglich=1.
      const letzten200Ids = alteIds.slice(10)
      for (const id of letzten200Ids) {
        expect(aenderungAnzahlFuer(db, id)).toBeGreaterThan(0)
      }
      const unbegrenzt = historie.filter((zeile) => letzten200Ids.includes(zeile.id))
      for (const zeile of unbegrenzt) {
        expect(zeile.rueckgaengig_moeglich).toBe(1)
      }
    } finally {
      db.close()
    }
  })

  it('ohne Transaktionen (frisches Projekt) ist journalAufraeumen() ein No-op — keine neue Wartungstransaktion', () => {
    const db = neueTestDatenbank()
    try {
      journalAufraeumen(db, () => 0)
      expect(transaktionenNachLfd(db)).toEqual([])
    } finally {
      db.close()
    }
  })

  it('Guard (undo.ts): ein Undo-Ziel ohne aenderung-Zeilen wirft JOURNAL_NICHT_RUECKNEHMBAR statt eines stillen No-op-Undos', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const id = letzteTransaktionId(db)
      // Simuliert die Lücke, die journalAufraeumen() normalerweise über rueckgaengig_moeglich=0
      // sichtbar macht (hier bewusst NICHT gesetzt, um den Guard selbst zu isolieren): die
      // aenderung-Zeilen sind weg, aber rueckgaengig_moeglich steht noch auf 1.
      db.prepare('DELETE FROM aenderung WHERE transaktion_id = @id').run({ id })

      expect.assertions(3)
      try {
        undo(db)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('JOURNAL_NICHT_RUECKNEHMBAR')
        }
      }
      // Kein stiller Statuswechsel: die Transaktion bleibt 'angewendet' (kein No-op-Undo).
      const zeile = db.prepare<{ readonly id: string }, { readonly status: string }>('SELECT status FROM transaktion WHERE id = @id').get({ id })
      expect(zeile?.status).toBe('angewendet')
    } finally {
      db.close()
    }
  })
})
