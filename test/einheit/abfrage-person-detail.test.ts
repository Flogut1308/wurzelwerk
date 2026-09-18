// AP-1.7 PR-A, rote Tests für `abfrage:person.detail` (src/main/abfragen/person-detail.ts) — VOR
// der Implementierung geschrieben (CLAUDE.md §5, eiserne Regel). Direktes INSERT statt
// Befehlsbus/Import (der Bus ist für Lesevorgänge nicht zuständig, analog
// test/einheit/abfrage-person-liste.test.ts). Das Hauptszenario spiegelt
// fixtures/import/v1/gueltig/beispiel-2-widersprueche.json nach (August Wruck, zwei
// `todesdatum`-Aussagen 1961 vs. 1958, 1961 `ist_bevorzugt` mit Begründung, belegt über Grabstein
// bzw. Ernas mündliche Erinnerung) — hier per Direkt-INSERT statt Import, um die Abfrage isoliert
// und schnell zu prüfen.
//
// KORREKTUR gegenüber der Auftragsbeschreibung: Für GENAU dieses Fixture-Szenario (1961 ist
// bevorzugt) ist `hat_widerspruch` laut der Regel des Triggers `abl_aussage_ai`
// (docs/schema/0003_abgeleitet.sql Z.66-75 — "COUNT(DISTINCT ...) >= 2 AND SUM(ist_bevorzugt=1) =
// 0") tatsächlich FALSE, nicht TRUE: ein Widerspruch ist per Definition ein UNAUFGELÖSTER
// Konflikt, und dieser hier ist durch die Bevorzugung aufgelöst — exakt wie
// test/einheit/abfrage-person-liste.test.ts es für den person-weiten Filter bereits zeigt
// ("Filter nurWiderspruch liefert nur Personen mit widersprüchlichen (NICHT BEVORZUGTEN)
// Aussagen"). Ein `hatWiderspruch===true` für dieses konkrete Szenario zu erzwingen hätte die
// Kern-Funktion vom Trigger abweichen lassen (Auftrag: "Regel exakt wie Trigger") und wäre
// inkonsistent mit dem bereits bestehenden Listen-Filter geworden. Der Widerspruchsfall selbst
// (KEINE Aussage bevorzugt) ist unten als eigener Testfall abgedeckt.

import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { personDetail } from '../../src/main/abfragen/person-detail'
import type { PersonDetailGrunddatenFeld } from '../../src/shared/schemata/person-detail'

function personAnlegen(db: Database.Database, optionen: { readonly nachname: string; readonly vornamen: string }): string {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
  db.prepare(
    `INSERT INTO name (id, person_id, typ, nachname, vornamen, ist_bevorzugt)
     VALUES (@id, @personId, 'geburtsname', @nachname, @vornamen, 1)`,
  ).run({ id: uuidv7(), personId, nachname: optionen.nachname, vornamen: optionen.vornamen })
  return personId
}

function quelleAnlegen(db: Database.Database, optionen: { readonly typ: string; readonly titel?: string }): string {
  const quelleId = uuidv7()
  db.prepare('INSERT INTO quelle (id, typ, titel) VALUES (@id, @typ, @titel)').run({
    id: quelleId,
    typ: optionen.typ,
    titel: optionen.titel ?? null,
  })
  return quelleId
}

function zitatAnlegen(db: Database.Database, quelleId: string, transkript: string): string {
  const zitatId = uuidv7()
  db.prepare('INSERT INTO zitat (id, quelle_id, transkript) VALUES (@id, @quelleId, @transkript)').run({ id: zitatId, quelleId, transkript })
  return zitatId
}

function aussageAnlegen(
  db: Database.Database,
  personId: string,
  optionen: {
    readonly praedikat: string
    readonly wertText?: string
    readonly datumWert1?: string
    readonly konfidenz?: number
    readonly istBevorzugt?: 0 | 1
    readonly begruendung?: string
  },
): string {
  const aussageId = uuidv7()
  db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, datum_wert1, konfidenz, ist_bevorzugt, begruendung)
     VALUES (@id, 'person', @personId, @praedikat, @wertText, @datumWert1, @konfidenz, @istBevorzugt, @begruendung)`,
  ).run({
    id: aussageId,
    personId,
    praedikat: optionen.praedikat,
    wertText: optionen.wertText ?? null,
    datumWert1: optionen.datumWert1 ?? null,
    konfidenz: optionen.konfidenz ?? null,
    istBevorzugt: optionen.istBevorzugt ?? null,
    begruendung: optionen.begruendung ?? null,
  })
  return aussageId
}

function aussageZitatVerknuepfen(db: Database.Database, aussageId: string, zitatId: string): void {
  db.prepare('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)').run({ aussageId, zitatId })
}

function todesdatumFeld(felder: readonly PersonDetailGrunddatenFeld[]): PersonDetailGrunddatenFeld | undefined {
  return felder.find((feld) => feld.praedikat === 'todesdatum')
}

describe('abfrage:person.detail (AP-1.7 PR-A)', () => {
  it('liefert Kopf, Grunddaten (inkl. Widerspruch), Belege und Notiz für das beispiel-2-Szenario (August Wruck)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const augustId = personAnlegen(db, { nachname: 'Wruck', vornamen: 'August' })

      const quelleGrabstein = quelleAnlegen(db, { typ: 'grabstein', titel: 'Grabstein Friedhof Kwidzyn, Feld 4, Reihe 11' })
      const quelleErna = quelleAnlegen(db, { typ: 'muendlich', titel: 'Gespraech mit Erna Wruck, 12.09.2026' })

      const aussage1961 = aussageAnlegen(db, augustId, {
        praedikat: 'todesdatum',
        datumWert1: '1961',
        konfidenz: 3,
        istBevorzugt: 1,
        begruendung: 'Der Grabstein ist die staerkere Quelle. Bevorzugt gegenueber Ernas Erinnerung.',
      })
      const zitatGrabstein = zitatAnlegen(db, quelleGrabstein, 'AUGUST WRUCK 1890 - 1961')
      aussageZitatVerknuepfen(db, aussage1961, zitatGrabstein)

      const aussage1958 = aussageAnlegen(db, augustId, {
        praedikat: 'todesdatum',
        datumWert1: '1958',
        konfidenz: 2,
      })
      const zitatErna = zitatAnlegen(db, quelleErna, 'der ist gestorben, als ich in die Schule kam, das war 58 oder 59')
      aussageZitatVerknuepfen(db, aussage1958, zitatErna)

      const ergebnis = personDetail(db, { personId: augustId })

      expect(ergebnis.kopf.person_id).toBe(augustId)
      expect(ergebnis.kopf.anzeigename).toBe('August Wruck')
      expect(ergebnis.kopf.ist_platzhalter).toBe(false)

      const feld = todesdatumFeld(ergebnis.grunddaten)
      expect(feld).toBeDefined()
      // KEIN Widerspruch, obwohl zwei abweichende Werte vorliegen: Entscheidung 1961 IST bevorzugt
      // ("ist_bevorzugt: 1" oben) — exakt die Regel des Triggers `abl_aussage_ai`
      // (docs/schema/0003_abgeleitet.sql Z.66-75, gespiegelt in src/core/aussage/widerspruch.ts):
      // "hat_widerspruch" markiert NUR unaufgelöste Konflikte (keine Aussage bevorzugt), nicht
      // jede Abweichung. Die widersprechenden Rohwerte bleiben trotzdem beide sichtbar (s. u.).
      expect(feld?.hat_widerspruch).toBe(false)
      expect(feld?.belegzahl).toBe(2)
      expect(feld?.aussagen).toHaveLength(2)

      const werte = feld?.aussagen.map((aussage) => aussage.wert)
      expect(werte).toContain('1961')
      expect(werte).toContain('1958')

      const bevorzugteAussage = feld?.aussagen.find((aussage) => aussage.wert === '1961')
      expect(bevorzugteAussage?.ist_bevorzugt).toBe(true)
      expect(bevorzugteAussage?.begruendung).toBe('Der Grabstein ist die staerkere Quelle. Bevorzugt gegenueber Ernas Erinnerung.')
      expect(bevorzugteAussage?.belege).toEqual([{ quelle: 'Grabstein Friedhof Kwidzyn, Feld 4, Reihe 11', zitat: 'AUGUST WRUCK 1890 - 1961' }])

      const nichtBevorzugteAussage = feld?.aussagen.find((aussage) => aussage.wert === '1958')
      expect(nichtBevorzugteAussage?.ist_bevorzugt).toBe(false)
      expect(nichtBevorzugteAussage?.begruendung).toBeNull()
      expect(nichtBevorzugteAussage?.belege).toEqual([
        { quelle: 'Gespraech mit Erna Wruck, 12.09.2026', zitat: 'der ist gestorben, als ich in die Schule kam, das war 58 oder 59' },
      ])

      expect(ergebnis.beziehungen).toEqual([])
      expect(ergebnis.ereignisse).toEqual([])
      expect(ergebnis.gesundheit).toEqual([])
      expect(ergebnis.notiz).toBeNull()
    } finally {
      db.close()
    }
  })

  it('wirft NICHT_GEFUNDEN_PERSON für eine unbekannte personId', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      expect(() => personDetail(db, { personId: uuidv7() })).toThrow('NICHT_GEFUNDEN_PERSON')
    } finally {
      db.close()
    }
  })

  it('ein einzelnes Prädikat mit genau einer Aussage ist nie ein Widerspruch', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ernaId = personAnlegen(db, { nachname: 'Wruck', vornamen: 'Erna' })
      aussageAnlegen(db, ernaId, { praedikat: 'beruf', konfidenz: 4 })

      const ergebnis = personDetail(db, { personId: ernaId })
      const berufFeld = ergebnis.grunddaten.find((feld) => feld.praedikat === 'beruf')

      expect(berufFeld?.hat_widerspruch).toBe(false)
      expect(berufFeld?.belegzahl).toBe(0)
    } finally {
      db.close()
    }
  })

  it('markiert hat_widerspruch===true, wenn zwei abweichende Aussagen KEINE davon bevorzugt ist (unaufgelöster Konflikt)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, { nachname: 'Widerspruch', vornamen: 'Test' })
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Bauer' })
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Schmied' })

      const ergebnis = personDetail(db, { personId })
      const berufFeld = ergebnis.grunddaten.find((feld) => feld.praedikat === 'beruf')

      expect(berufFeld?.hat_widerspruch).toBe(true)
    } finally {
      db.close()
    }
  })
})
