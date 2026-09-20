// AP-1.4a, 56_Import_Vertrag.md §6.2: der strukturierte Bericht für `beispiel-2-widersprueche.json`
// (Stufe 1+2 akzeptiert) — erwartete WIRD-ANGELEGT-Zahlen, eine Dublettenmeldung (Stufe 4, gegen
// eine vorab geseedete Bestandsperson "August Wruck"), der Stufe-3-Fund IMP-302 auf der absichtlich
// falsch gesetzten Elternkante und die Blockreihenfolge in `alsText()`.
//
// Nachtrag (Kettenlauf-Folgeauftrag): `beispiel-2-widersprueche.json` trug ursprünglich für "Erna"
// kein Geburtsdatum, wodurch die korrekte (nicht erfundene) IMP-302-Logik nicht auslösen konnte.
// Die Fixture wurde darum vervollständigt (alle drei Kopien — `fixtures/import/v1/gueltig/`,
// `docs/56_Beispiele/`, `../Wissen/56_Beispiele/` — synchron): ein neues `ereignisse[]`-Element
// `tmp:e-geb-erna` (Geburt 1896, exakt) mit dem Sollwert aus dem illustrativen Beispiel in
// 56_Import_Vertrag.md §6.2 ("August, geb. etwa 1890" + 6 Jahre = 1896). Damit meldet der
// Trockenlauf jetzt genau den in §6.2 vorgesehenen Fund: "Elternteil wäre 6 Jahre alt gewesen" auf
// `elternschaften[1]` — und NICHT auf `elternschaften[0]` (der Platzhaltervater `vater-august` hat
// kein Geburtsdatum, IMP-302 kann dort nicht ausgelöst werden).
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

const BEISPIEL_2 = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-2-widersprueche.json', import.meta.url))

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
  it('Stufe 1+2 akzeptiert, erwartete WIRD-ANGELEGT-Zahlen, importGesperrt=false, genau ein IMP-302-Hinweis', () => {
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
      expect(tabelle('ereignis')).toBe(2) // Geburt August + Geburt Erna (Nachtrag)
      expect(tabelle('elternschaft')).toBe(2)
      expect(tabelle('quelle')).toBe(3)
      // 7 Existenz (3 Personen + 2 Ereignisse + 2 Elternschaften) + 2 geburtsdatum (August, Erna)
      // + 1 geburtsort (nur August hat ein `ort`-Feld) + 3 reguläre aussagen[]
      expect(tabelle('aussage')).toBe(13)

      // s. Kopfkommentar: die Fixture ist jetzt vollständig — IMP-302 löst genau EINMAL aus, auf
      // der absichtlich falsch gesetzten Kante `elternschaften[1]` (August wäre bei Ernas Geburt
      // ~6 Jahre alt gewesen). Der Platzhaltervater (`elternschaften[0]`) hat kein Geburtsdatum —
      // dort kann IMP-302 nicht auslösen, s. `regeln.ts`.
      expect(bericht.hinweise).toHaveLength(1)
      expect(bericht.hinweise[0]?.code).toBe('IMP-302')
      expect(bericht.hinweise[0]?.pfad).toBe('elternschaften[1]')
      expect(bericht.hinweise.some((h) => h.pfad === 'elternschaften[0]')).toBe(false)
      expect(bericht.zusammenfassung.hinweisAnzahl).toBe(1)
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
