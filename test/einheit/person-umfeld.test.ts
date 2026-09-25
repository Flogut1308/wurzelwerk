// AP-1.34 PR-C2b (§31 U-1.34-C2-O1): der Umfeld-Lader (`src/main/abfragen/_person-umfeld.ts`)
// liefert `pruefeBestand` genug, dass für JEDE Person dieselben Hinweise entstehen wie im
// Gesamtbestand (`abfrage:pruefhinweise`) — als Multimenge, ohne `zyklus` (eigener Weg, s. u.).
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { personUmfeldLaden, vorfahrenKantenLaden } from '../../src/main/abfragen/_person-umfeld'
import { pruefhinweise } from '../../src/main/abfragen/pruefhinweise'
import { pruefeBestand } from '../../src/core/plausibilitaet/regeln'
import { findeZyklusKnoten, istEigenerVorfahre } from '../../src/core/graph/zyklus'
import { zufallsBestandAufbauen } from '../hilfsmittel/plausibilitaet-zufallsbestand'

const neueTestDatenbank = frischeDatenbankMitAbgeleitetemSchema

function codesSortiert(codes: readonly string[]): readonly string[] {
  return [...codes].sort()
}

describe('personUmfeldLaden() — gleich dem Gesamtbestand je Person', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`Zufallsbestand Seed ${seed}: jede Person bekommt dieselben Hinweise (ohne zyklus)`, () => {
      const db = neueTestDatenbank()
      try {
        const { personIds } = zufallsBestandAufbauen(db, seed)
        const gesamt = pruefhinweise(db).eintraege
        let verglichen = 0
        for (const personId of personIds) {
          const erwartet = gesamt.filter((h) => h.personId === personId && h.code !== 'zyklus').map((h) => h.code)
          const umfeld = pruefeBestand(personUmfeldLaden(db, personId))
            .filter((h) => h.personId === personId && h.code !== 'zyklus')
            .map((h) => h.code)
          expect(codesSortiert(umfeld), personId).toEqual(codesSortiert(erwartet))
          verglichen += erwartet.length
        }
        // Der Bestand muss tatsächlich Hinweise enthalten, sonst prüft der Vergleich nichts.
        expect(verglichen).toBeGreaterThan(10)
      } finally {
        db.close()
      }
    })
  }

  it('die Zufallsbestände decken alle Nicht-Zyklus-Regeln ab (samt ort_mit_datum, AP-1.30 Vorarbeiten Teil 3)', () => {
    const gesehen = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5]) {
      const db = neueTestDatenbank()
      try {
        zufallsBestandAufbauen(db, seed)
        for (const h of pruefhinweise(db).eintraege) gesehen.add(h.code)
      } finally {
        db.close()
      }
    }
    for (const code of ['tod_vor_geburt', 'bestattung_vor_tod', 'mutter_alter', 'vater_alter', 'kind_vor_ehe', 'alter_ueber_110', 'ereignis_vor_ortsexistenz', 'ort_mit_datum']) {
      expect(gesehen, code).toContain(code)
    }
  })
})

describe('vorfahrenKantenLaden() + istEigenerVorfahre()', () => {
  it('jede von pruefhinweise als zyklus gemeldete Person ist eigener Vorfahre über ihre Vorfahrenkanten', () => {
    let zyklenGesehen = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const db = neueTestDatenbank()
      try {
        zufallsBestandAufbauen(db, seed)
        for (const h of pruefhinweise(db).eintraege.filter((e) => e.code === 'zyklus')) {
          zyklenGesehen += 1
          expect(istEigenerVorfahre(h.personId, vorfahrenKantenLaden(db, h.personId)), h.personId).toBe(true)
        }
      } finally {
        db.close()
      }
    }
    expect(zyklenGesehen).toBeGreaterThan(0)
  })

  it('stimmt je Person mit der Prüfung auf allen Nicht-Platzhalter-Kanten überein', () => {
    const db = neueTestDatenbank()
    try {
      const { personIds } = zufallsBestandAufbauen(db, 3)
      const platzhalter = new Set(personIds.filter((_, i) => i % 13 === 7))
      const kanten = db
        .prepare<[], { elternteil_id: string; kind_id: string }>('SELECT elternteil_id, kind_id FROM elternschaft')
        .all()
        .filter((k) => !platzhalter.has(k.elternteil_id) && !platzhalter.has(k.kind_id))
        .map((k) => ({ elternteilId: k.elternteil_id, kindId: k.kind_id }))
      expect(findeZyklusKnoten(kanten).length).toBeGreaterThan(0)
      for (const personId of personIds) {
        expect(istEigenerVorfahre(personId, vorfahrenKantenLaden(db, personId)), personId).toBe(istEigenerVorfahre(personId, kanten))
      }
    } finally {
      db.close()
    }
  })
})
