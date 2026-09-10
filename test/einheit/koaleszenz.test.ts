// AP-0.15, F-03: Verdichtung aufeinanderfolgender Änderungen an demselben Datensatz innerhalb des
// Koaleszenz-Fensters (55_Architektur.md §4.8) — reine Verdichtungslogik
// (`src/core/journal/koaleszenz-verdichtung.ts`) zuerst (Gruppe A), danach die Orchestrierung über
// den echten Befehlsbus (Gruppe B, `src/main/journal/koaleszenz.ts`).
import { describe, expect, it } from 'vitest'
import {
  verdichteAenderungen,
  verdichtePaar,
  type AenderungEintrag,
} from '../../src/core/journal/koaleszenz-verdichtung'

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
