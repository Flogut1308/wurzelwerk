// AP-0.15, F-03: Verdichtung aufeinanderfolgender Änderungen an demselben Datensatz innerhalb des
// Koaleszenz-Fensters (55_Architektur.md §4.8) — reine Verdichtungslogik
// (`src/core/journal/koaleszenz-verdichtung.ts`) zuerst (Gruppe A), danach die Orchestrierung über
// den echten Befehlsbus (Gruppe B, `src/main/journal/koaleszenz.ts`).
//
// Gruppe B nutzt den echten Bus (`fuehreAus`) mit einer schnellen Doppel-Eingabe (zwei
// `person.feldSetzen(feld:'notiz')`-Aufrufe direkt hintereinander) — der reale Zeitabstand
// zwischen den beiden `Date.now()`-Aufrufen im Testprozess liegt sicher weit unter dem
// 2000ms-Fenster, das 2000ms-Randverhalten selbst prüft deterministisch
// `test/einheit/koaleszenz-grenzen.test.ts` über `versucheZusammenfassen()` mit explizitem
// `zeitpunktMs` (Auftragsvorgabe).
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  verdichteAenderungen,
  verdichtePaar,
  type AenderungEintrag,
} from '../../src/core/journal/koaleszenz-verdichtung'

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
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface TransaktionZahl {
  readonly anzahl: number
}

function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

interface AenderungZeile {
  readonly transaktion_id: string
  readonly operation: string
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
}

function aenderungenZuTabelleUndDatensatz(
  db: ReturnType<typeof oeffnen>,
  tabelle: string,
  datensatzId: string,
): readonly AenderungZeile[] {
  return db
    .prepare<
      { readonly tabelle: string; readonly datensatzId: string },
      AenderungZeile
    >(
      `SELECT transaktion_id, operation, wert_alt_json, wert_neu_json FROM aenderung
       WHERE tabelle = @tabelle AND datensatz_id = @datensatzId`,
    )
    .all({ tabelle, datensatzId })
}

function notizVon(json: string | null): unknown {
  if (json === null) {
    throw new Error('notizVon(): erwartet non-null JSON.')
  }
  const wert: unknown = JSON.parse(json)
  if (typeof wert !== 'object' || wert === null || !('notiz' in wert)) {
    throw new Error('notizVon(): erwartet ein JSON-Objekt mit notiz-Feld.')
  }
  return (wert as { readonly notiz: unknown }).notiz
}

function eintrag(teil: Partial<AenderungEintrag> & Pick<AenderungEintrag, 'operation'>): AenderungEintrag {
  return {
    tabelle: 'person',
    datensatzId: 'p1',
    wertAltJson: null,
    wertNeuJson: null,
    ...teil,
  }
}

describe('verdichtePaar() — Verdichtungstabelle §4.8 (AP-0.15)', () => {
  it('insert+update → insert, wertNeu = neuer.wertNeu, wertAlt = null', () => {
    const aelter = eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":1}' })
    const neuer = eintrag({ operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":2}' })
    expect(verdichtePaar(aelter, neuer)).toEqual(
      eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":2}' }),
    )
  })

  it('insert+delete → null (beide entfallen)', () => {
    const aelter = eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":1}' })
    const neuer = eintrag({ operation: 'delete', wertAltJson: '{"a":1}', wertNeuJson: null })
    expect(verdichtePaar(aelter, neuer)).toBeNull()
  })

  it('update+update → update, wertAlt = ältestes, wertNeu = neuestes', () => {
    const aelter = eintrag({ operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":2}' })
    const neuer = eintrag({ operation: 'update', wertAltJson: '{"a":2}', wertNeuJson: '{"a":3}' })
    expect(verdichtePaar(aelter, neuer)).toEqual(
      eintrag({ operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":3}' }),
    )
  })

  it('update+delete → delete, wertAlt = ältestes, wertNeu = null', () => {
    const aelter = eintrag({ operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":2}' })
    const neuer = eintrag({ operation: 'delete', wertAltJson: '{"a":2}', wertNeuJson: null })
    expect(verdichtePaar(aelter, neuer)).toEqual(
      eintrag({ operation: 'delete', wertAltJson: '{"a":1}', wertNeuJson: null }),
    )
  })

  it('delete+insert → update, wertAlt = altes, wertNeu = neues', () => {
    const aelter = eintrag({ operation: 'delete', wertAltJson: '{"a":1}', wertNeuJson: null })
    const neuer = eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":2}' })
    expect(verdichtePaar(aelter, neuer)).toEqual(
      eintrag({ operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":2}' }),
    )
  })

  it('defensiv: insert+insert ist bei konsistentem Bestand unmöglich → toThrow', () => {
    const aelter = eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":1}' })
    const neuer = eintrag({ operation: 'insert', wertAltJson: null, wertNeuJson: '{"a":2}' })
    expect(() => verdichtePaar(aelter, neuer)).toThrow()
  })
})

describe('verdichteAenderungen() — Gruppierung + Fold (AP-0.15)', () => {
  it('zwei Gruppen unterschiedlicher Datensätze werden unabhängig verdichtet', () => {
    const alt = [eintrag({ tabelle: 'person', datensatzId: 'p1', operation: 'insert', wertNeuJson: '{"a":1}' })]
    const neu = [
      eintrag({ tabelle: 'person', datensatzId: 'p1', operation: 'update', wertAltJson: '{"a":1}', wertNeuJson: '{"a":2}' }),
      eintrag({ tabelle: 'person', datensatzId: 'p2', operation: 'insert', wertNeuJson: '{"b":1}' }),
    ]
    const ergebnis = verdichteAenderungen(alt, neu)
    expect(ergebnis).toHaveLength(2)
    expect(ergebnis[0]).toEqual(eintrag({ tabelle: 'person', datensatzId: 'p1', operation: 'insert', wertNeuJson: '{"a":2}' }))
    expect(ergebnis[1]).toEqual(eintrag({ tabelle: 'person', datensatzId: 'p2', operation: 'insert', wertNeuJson: '{"b":1}' }))
  })

  it('eine insert+delete-Gruppe entfällt komplett aus dem Ergebnis', () => {
    const alt = [eintrag({ operation: 'insert', wertNeuJson: '{"a":1}' })]
    const neu = [eintrag({ operation: 'delete', wertAltJson: '{"a":1}' })]
    expect(verdichteAenderungen(alt, neu)).toEqual([])
  })

  it('kein Overlap zwischen alt und neu (unterschiedliche Datensätze): beide Zeilen bleiben unverändert erhalten', () => {
    const alt = [eintrag({ datensatzId: 'p1', operation: 'insert', wertNeuJson: '{"a":1}' })]
    const neu = [eintrag({ datensatzId: 'p2', operation: 'insert', wertNeuJson: '{"b":1}' })]
    expect(verdichteAenderungen(alt, neu)).toEqual([...alt, ...neu])
  })

  it('leere Eingaben: leeres Ergebnis', () => {
    expect(verdichteAenderungen([], [])).toEqual([])
  })
})

describe('Gruppe B — Orchestrierung über den echten Bus (55_Architektur.md §4.8, AP-0.15)', () => {
  it('zwei schnelle person.feldSetzen(notiz) auf dieselbe Person: genau ein zusätzlicher Undo-Schritt, eine verdichtete update-Zeile, undo() stellt den Wert vor der ERSTEN Notiz wieder her', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const anzahlVorErsterNotiz = transaktionAnzahl(db)

      fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'erste notiz' })
      fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'zweite notiz' })

      // (i) genau EIN zusätzlicher rücknehmbarer Undo-Schritt gegenüber vor der ersten Notiz.
      expect(transaktionAnzahl(db)).toBe(anzahlVorErsterNotiz + 1)

      // (ii) die zusammengefasste Transaktion (= aktuelles Undo-Ziel) hat genau eine
      // aenderung-update-Zeile: wert_alt = Zustand vor der ERSTEN Notiz (also die noch-leere
      // Notiz aus person.anlegen), wert_neu = letzter Wert ("zweite notiz").
      const undoZielId = undoZiel(db)?.id
      const zeilen = aenderungenZuTabelleUndDatensatz(db, 'person', id).filter((zeile) => zeile.transaktion_id === undoZielId)
      expect(zeilen).toHaveLength(1)
      expect(zeilen[0]?.operation).toBe('update')
      expect(notizVon(zeilen[0]?.wert_alt_json ?? null)).toBeNull()
      expect(notizVon(zeilen[0]?.wert_neu_json ?? null)).toBe('zweite notiz')

      // (iii) undo(db) EINMAL stellt die Notiz auf den Wert VOR der ersten Änderung her.
      undo(db)
      interface PersonNotizZeile {
        readonly notiz: string | null
      }
      const personZeile = db.prepare<{ readonly id: string }, PersonNotizZeile>('SELECT notiz FROM person WHERE id = @id').get({ id })
      expect(personZeile?.notiz ?? null).toBeNull()
    } finally {
      db.close()
    }
  })
})
