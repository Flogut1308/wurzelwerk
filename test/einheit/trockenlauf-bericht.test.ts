// AP-1.4a, 56_Import_Vertrag.md §6.2: der strukturierte Bericht für `beispiel-2-widersprueche.json`
// (Stufe 1+2 akzeptiert) — erwartete WIRD-ANGELEGT-Zahlen, eine Dublettenmeldung (Stufe 4, gegen
// eine vorab geseedete Bestandsperson "August Wruck") und die Blockreihenfolge in `alsText()`.
//
// ABWEICHUNG vom ursprünglichen Plan (dokumentiert, s. PR-Beschreibung/docs/80_Offene_Fragen.md
// U-AP1.4a-imp302): `beispiel-2-widersprueche.json` trägt für "Erna" KEIN Geburtsdatum (weder als
// `ereignisse[]`-Eintrag noch als Aussage) — die absichtlich falsch gesetzte Elternkante
// (`tmp:august -> tmp:erna`, `elternschaften[1]`) kann darum mit einer korrekten, nicht
// erfundenen Implementierung von IMP-302 (die BEIDE Geburtsdaten kennen muss, s.
// `src/core/plausibilitaet/regeln.ts`) nicht ausgelöst werden — anders als das illustrative
// Beispiel in 56_Import_Vertrag.md §6.2 (dort trägt "tmp:erna" explizit "geb. 1896"). Dieser Test
// prüft darum den TATSÄCHLICHEN, korrekten Befund (keine Stufe-3-Hinweise) statt eine Zahl zu
// erzwingen, die die Fixture nicht hergibt. `plausibilitaet.test.ts` zeigt IMP-302 an einem Fall,
// der beide Geburtsdaten trägt.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { alsText } from '../../src/main/import/bericht'
import { datumSpalten } from '../../src/main/import/datum-spalten'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import * as nameRepo from '../../src/main/repositories/name-repo'
import * as personRepo from '../../src/main/repositories/person-repo'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import { frischeDatenbankMitJournal } from './_hilfen-trockenlauf'

const BEISPIEL_2 = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/beispiel-2-widersprueche.json', import.meta.url))

/** Seedet eine Bestandsperson "August Wruck" (Geburtsjahr 1890, wie im Grabstein/der Erzählung in
 * `beispiel-2-widersprueche.json`) — Grundlage für den erwarteten IMP-401-Dublettenfund. */
function seedeAugustWruck(db: ReturnType<typeof frischeDatenbankMitJournal>): string {
  const personId = neueId()
  const seedTxId = neueId()
  db.transaction(() => {
    const lfd = naechsteLfd(db)
    transaktionAnlegen(db, { id: seedTxId, zeitpunkt: 1_600_000_000_000, art: 'nutzer', lfd })
    armieren(db, seedTxId)
    personRepo.einfuegen(db, {
      id: personId,
      privat: 0,
      ist_platzhalter: 0,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })
    nameRepo.einfuegen(db, {
      id: neueId(),
      personId,
      typ: 'geburtsname',
      schrift: null,
      umschriftVon: null,
      umschriftNorm: null,
      vornamen: 'August',
      rufnameIndex: null,
      rufnameText: null,
      nachname: 'Wruck',
      praefix: null,
      titelVor: null,
      zusatzNach: null,
      originalText: null,
      sprache: null,
      istBevorzugt: 1,
      gueltigVon: null,
      gueltigBis: null,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })
    aussageRepo.einfuegen(db, {
      id: neueId(),
      subjektTyp: 'person',
      subjektId: personId,
      praedikat: 'geburtsdatum',
      wertText: null,
      wertZahl: null,
      wertRefId: null,
      datum: datumSpalten({ modifikator: 'etwa', praezision: 'jahrzehnt', wert1: '1890', original_text: 'Grabstein' }),
      konfidenz: 3,
      istBevorzugt: null,
      begruendung: null,
      unsicherheit: null,
      gueltigVon: null,
      gueltigBis: null,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })
    entwaffnen(db)
  })()
  return personId
}

describe('Trockenlauf-Bericht (beispiel-2-widersprueche.json, 56_Import_Vertrag.md §6.2)', () => {
  it('Stufe 1+2 akzeptiert, erwartete WIRD-ANGELEGT-Zahlen, importGesperrt=false, keine Stufe-3-Hinweise', () => {
    const db = frischeDatenbankMitJournal()
    try {
      seedeAugustWruck(db)
      const bericht = importTrockenlaufDurchfuehren(db, BEISPIEL_2)

      expect(bericht.importGesperrt).toBe(false)
      expect(bericht.fehler).toEqual([])
      expect(bericht.zusammenfassung.fehlerAnzahl).toBe(0)

      const tabelle = (name: string): number => bericht.wirdAngelegt.find((e) => e.tabelle === name)?.anzahl ?? 0
      expect(tabelle('person')).toBe(3)
      expect(tabelle('ort')).toBe(3)
      expect(tabelle('ereignis')).toBe(1)
      expect(tabelle('elternschaft')).toBe(2)
      expect(tabelle('quelle')).toBe(3)
      expect(tabelle('aussage')).toBe(11) // 6 Existenz (3 Personen + 1 Ereignis + 2 Elternschaften) + geburtsdatum + geburtsort + 3 reguläre aussagen[]

      // s. Kopfkommentar: mit korrekter (nicht erfundener) IMP-302-Logik kann diese Fixture das
      // Prädikat NICHT auslösen, weil "erna" kein eigenes Geburtsdatum trägt.
      expect(bericht.hinweise).toEqual([])
    } finally {
      db.close()
    }
  })

  it('meldet die geseedete Bestandsperson "August Wruck" als mögliche Dublette (IMP-401)', () => {
    const db = frischeDatenbankMitJournal()
    try {
      const bestehendePersonId = seedeAugustWruck(db)
      const bericht = importTrockenlaufDurchfuehren(db, BEISPIEL_2)

      const fund = bericht.moeglicheDubletten.find((d) => d.bestehendeKennung === `db:${bestehendePersonId}`)
      expect(fund, 'kein Dublettenfund für die geseedete Bestandsperson').toBeDefined()
      expect(fund?.neueKennung).toBe('tmp:august')
      expect(fund?.punktwert).toBeGreaterThanOrEqual(0.5)
      expect(fund?.begruendung.length).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })

  it('alsText() zeigt die Berichtsblöcke in der Reihenfolge aus §6.2', () => {
    const db = frischeDatenbankMitJournal()
    try {
      seedeAugustWruck(db)
      const bericht = importTrockenlaufDurchfuehren(db, BEISPIEL_2)
      const text = alsText(bericht)

      const blockreihenfolge = ['ZUSAMMENFASSUNG', 'WIRD ANGELEGT', 'WIRD ERGÄNZT', 'MÖGLICHE DUBLETTEN', 'FEHLER', 'HINWEISE', 'NICHT VERARBEITETES MATERIAL', 'GESUNDHEITSDATEN']
      const positionen = blockreihenfolge.map((label) => text.indexOf(label))

      for (const position of positionen) {
        expect(position, `Block nicht im Bericht gefunden`).toBeGreaterThanOrEqual(0)
      }
      for (let i = 1; i < positionen.length; i += 1) {
        const vorherige = positionen[i - 1]
        const aktuelle = positionen[i]
        expect(vorherige, 'Positionsarray unerwartet lückenhaft').toBeDefined()
        expect(aktuelle, 'Positionsarray unerwartet lückenhaft').toBeDefined()
        if (vorherige === undefined || aktuelle === undefined) continue
        expect(aktuelle).toBeGreaterThan(vorherige)
      }

      expect(text).toContain('NICHT VERARBEITETES MATERIAL') // §6.2 Gestaltungsentscheidung 5: immer sichtbar
      expect(text).toContain('M-08') // §6.2 Gestaltungsentscheidung 6: Exportsperre wird genannt
    } finally {
      db.close()
    }
  })
})
