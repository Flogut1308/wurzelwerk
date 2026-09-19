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
//
// hueter-Auflage 1 (PR #65, E21): das kanonische "es gibt konkurrierende Angaben"-Signal ist NICHT
// `hat_widerspruch` (das nur unaufgelöste Konflikte markiert), sondern das neue `hatKonkurrierende`
// — es bleibt `true`, auch wenn eine Aussage bevorzugt ist (genau der beispiel-2-Fall unten).

import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { personDetail } from '../../src/main/abfragen/person-detail'
import type { PersonDetailGrunddatenFeld } from '../../src/shared/schemata/person-detail'

function personAnlegen(
  db: Database.Database,
  optionen: { readonly nachname: string; readonly vornamen: string; readonly istPlatzhalter?: 0 | 1 },
): string {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, @istPlatzhalter)').run({
    id: personId,
    istPlatzhalter: optionen.istPlatzhalter ?? 0,
  })
  db.prepare(
    `INSERT INTO name (id, person_id, typ, nachname, vornamen, ist_bevorzugt)
     VALUES (@id, @personId, 'geburtsname', @nachname, @vornamen, 1)`,
  ).run({ id: uuidv7(), personId, nachname: optionen.nachname, vornamen: optionen.vornamen })
  return personId
}

function platzhalterAnlegen(db: Database.Database): string {
  const personId = uuidv7()
  db.prepare(
    `INSERT INTO person (id, privat, ist_platzhalter, platzhalter_grund) VALUES (@id, 0, 1, 'unbekannt')`,
  ).run({ id: personId })
  return personId
}

function elternschaftAnlegen(db: Database.Database, elternteilId: string, kindId: string, typ = 'biologisch'): void {
  db.prepare(
    `INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @elternteilId, @kindId, @typ)`,
  ).run({ id: uuidv7(), elternteilId, kindId, typ })
}

function ortAnlegen(db: Database.Database, name: string): string {
  const ortId = uuidv7()
  db.prepare(`INSERT INTO ort (id, typ) VALUES (@id, 'dorf')`).run({ id: ortId })
  db.prepare(
    `INSERT INTO ortsname (id, ort_id, name, ist_bevorzugt) VALUES (@id, @ortId, @name, 1)`,
  ).run({ id: uuidv7(), ortId, name })
  return ortId
}

function quelleAnlegen(
  db: Database.Database,
  optionen: { readonly typ: string; readonly titel?: string; readonly archivId?: string; readonly signatur?: string; readonly unmittelbarkeit?: string },
): string {
  const quelleId = uuidv7()
  db.prepare(
    `INSERT INTO quelle (id, typ, titel, archiv_id, signatur, unmittelbarkeit)
     VALUES (@id, @typ, @titel, @archivId, @signatur, @unmittelbarkeit)`,
  ).run({
    id: quelleId,
    typ: optionen.typ,
    titel: optionen.titel ?? null,
    archivId: optionen.archivId ?? null,
    signatur: optionen.signatur ?? null,
    unmittelbarkeit: optionen.unmittelbarkeit ?? null,
  })
  return quelleId
}

function archivAnlegen(db: Database.Database, name: string): string {
  const archivId = uuidv7()
  db.prepare(`INSERT INTO archiv (id, name) VALUES (@id, @name)`).run({ id: archivId, name })
  return archivId
}

function zitatAnlegen(
  db: Database.Database,
  quelleId: string,
  transkript: string,
  optionen?: { readonly seite?: string; readonly eintragsnummer?: string; readonly zugriffsdatumWert1?: string; readonly digitalisatUrl?: string },
): string {
  const zitatId = uuidv7()
  db.prepare(
    `INSERT INTO zitat (id, quelle_id, transkript, seite, eintragsnummer, zugriffsdatum_wert1, digitalisat_url)
     VALUES (@id, @quelleId, @transkript, @seite, @eintragsnummer, @zugriffsdatumWert1, @digitalisatUrl)`,
  ).run({
    id: zitatId,
    quelleId,
    transkript,
    seite: optionen?.seite ?? null,
    eintragsnummer: optionen?.eintragsnummer ?? null,
    zugriffsdatumWert1: optionen?.zugriffsdatumWert1 ?? null,
    digitalisatUrl: optionen?.digitalisatUrl ?? null,
  })
  return zitatId
}

function aussageAnlegen(
  db: Database.Database,
  personId: string,
  optionen: {
    readonly praedikat: string
    readonly wertText?: string
    readonly wertRefId?: string
    readonly datumWert1?: string
    readonly konfidenz?: number
    readonly istBevorzugt?: 0 | 1
    readonly begruendung?: string
  },
): string {
  const aussageId = uuidv7()
  db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_ref_id, datum_wert1, konfidenz, ist_bevorzugt, begruendung)
     VALUES (@id, 'person', @personId, @praedikat, @wertText, @wertRefId, @datumWert1, @konfidenz, @istBevorzugt, @begruendung)`,
  ).run({
    id: aussageId,
    personId,
    praedikat: optionen.praedikat,
    wertText: optionen.wertText ?? null,
    wertRefId: optionen.wertRefId ?? null,
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

      const archivFriedhof = archivAnlegen(db, 'Friedhofsamt Kwidzyn')
      const quelleGrabstein = quelleAnlegen(db, {
        typ: 'grabstein',
        titel: 'Grabstein Friedhof Kwidzyn, Feld 4, Reihe 11',
        archivId: archivFriedhof,
        signatur: 'Feld 4 / Reihe 11',
      })
      const quelleErna = quelleAnlegen(db, {
        typ: 'muendlich',
        titel: 'Gespraech mit Erna Wruck, 12.09.2026',
        unmittelbarkeit: 'vom_hoerensagen',
      })

      const aussage1961 = aussageAnlegen(db, augustId, {
        praedikat: 'todesdatum',
        datumWert1: '1961',
        konfidenz: 3,
        istBevorzugt: 1,
        begruendung: 'Der Grabstein ist die staerkere Quelle. Bevorzugt gegenueber Ernas Erinnerung.',
      })
      const zitatGrabstein = zitatAnlegen(db, quelleGrabstein, 'AUGUST WRUCK 1890 - 1961', {
        seite: 'Feld 4',
        eintragsnummer: '11',
        zugriffsdatumWert1: '2019-06-01',
        digitalisatUrl: 'https://beispiel.invalid/grabstein.jpg',
      })
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
      // ABER: es gibt weiterhin konkurrierende Angaben (zwei unterscheidbare Werte) — das
      // kanonische E21-Signal `hatKonkurrierende` bleibt true, unabhängig von der Bevorzugung
      // (hueter-Auflage 1, PR #65).
      expect(feld?.hatKonkurrierende).toBe(true)
      expect(feld?.belegzahl).toBe(2)
      expect(feld?.aussagen).toHaveLength(2)

      const werte = feld?.aussagen.map((aussage) => aussage.wert)
      expect(werte).toContain('1961')
      expect(werte).toContain('1958')

      // U-1.7-belegliste-zweistufig (AP-1.10 PR-B): das Belegdetail ist jetzt DREISTUFIG —
      // Quelle (Typ/Titel/Archiv/Signatur/Unmittelbarkeit) → Zitat (Seite/Eintragsnummer/
      // Zugriffsdatum/Digitalisat) → Transkript, statt der vorherigen flachen `{ quelle, zitat }`.
      const bevorzugteAussage = feld?.aussagen.find((aussage) => aussage.wert === '1961')
      expect(bevorzugteAussage?.ist_bevorzugt).toBe(true)
      expect(bevorzugteAussage?.begruendung).toBe('Der Grabstein ist die staerkere Quelle. Bevorzugt gegenueber Ernas Erinnerung.')
      expect(bevorzugteAussage?.belege).toEqual([
        {
          quelle: {
            typ: 'grabstein',
            titel: 'Grabstein Friedhof Kwidzyn, Feld 4, Reihe 11',
            archiv_name: 'Friedhofsamt Kwidzyn',
            signatur: 'Feld 4 / Reihe 11',
            unmittelbarkeit: null,
          },
          zitat: {
            seite: 'Feld 4',
            eintragsnummer: '11',
            zugriffsdatum_wert1: '2019-06-01',
            digitalisat_url: 'https://beispiel.invalid/grabstein.jpg',
          },
          transkript: 'AUGUST WRUCK 1890 - 1961',
        },
      ])

      const nichtBevorzugteAussage = feld?.aussagen.find((aussage) => aussage.wert === '1958')
      expect(nichtBevorzugteAussage?.ist_bevorzugt).toBe(false)
      expect(nichtBevorzugteAussage?.begruendung).toBeNull()
      expect(nichtBevorzugteAussage?.belege).toEqual([
        {
          quelle: {
            typ: 'muendlich',
            titel: 'Gespraech mit Erna Wruck, 12.09.2026',
            archiv_name: null,
            signatur: null,
            unmittelbarkeit: 'vom_hoerensagen',
          },
          zitat: {
            seite: null,
            eintragsnummer: null,
            zugriffsdatum_wert1: null,
            digitalisat_url: null,
          },
          transkript: 'der ist gestorben, als ich in die Schule kam, das war 58 oder 59',
        },
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
      expect(berufFeld?.hatKonkurrierende).toBe(false)
      expect(berufFeld?.belegzahl).toBe(0)
    } finally {
      db.close()
    }
  })

  it('markiert hat_widerspruch===true UND hatKonkurrierende===true, wenn zwei abweichende Aussagen KEINE davon bevorzugt ist (unaufgelöster Konflikt)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, { nachname: 'Widerspruch', vornamen: 'Test' })
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Bauer' })
      aussageAnlegen(db, personId, { praedikat: 'beruf', wertText: 'Schmied' })

      const ergebnis = personDetail(db, { personId })
      const berufFeld = ergebnis.grunddaten.find((feld) => feld.praedikat === 'beruf')

      expect(berufFeld?.hat_widerspruch).toBe(true)
      expect(berufFeld?.hatKonkurrierende).toBe(true)
    } finally {
      db.close()
    }
  })

  // U-1.7-beziehung-platzhalter (AP-1.10 PR-B, A-17): `PersonDetailBeziehung` trägt jetzt das
  // ECHTE `ist_platzhalter`-Flag der verwandten Person (JOIN auf `person.ist_platzhalter`), statt
  // der vorherigen Leername-Heuristik (`anzeigename.trim() === ''`). Deckt BEIDE in
  // `docs/80_Offene_Fragen.md` §19 benannten Fehlrichtungen ab: ein Platzhalter OHNE Namen ist
  // jetzt korrekt `ist_platzhalter: true`, UND eine echte, noch namenlose Person ist korrekt
  // `ist_platzhalter: false` (nicht mehr fälschlich als Platzhalter beschriftet).
  it('PersonDetailBeziehung trägt das echte ist_platzhalter-Flag der verwandten Person (nicht über den Namen erraten)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const kindId = personAnlegen(db, { nachname: 'Wruck', vornamen: 'August' })
      const platzhalterVaterId = platzhalterAnlegen(db)
      const echteNamenloseMutterId = personAnlegen(db, { nachname: '', vornamen: '' })
      elternschaftAnlegen(db, platzhalterVaterId, kindId)
      elternschaftAnlegen(db, echteNamenloseMutterId, kindId)

      const ergebnis = personDetail(db, { personId: kindId })

      const vaterBeziehung = ergebnis.beziehungen.find((beziehung) => beziehung.person_id === platzhalterVaterId)
      expect(vaterBeziehung?.ist_platzhalter).toBe(true)

      // Zweite Fehlrichtung (hueter-Review PR #66): eine ECHTE Person ohne erfassten Namen hat
      // ebenfalls `anzeigename === ''` — darf aber NICHT als Platzhalter erscheinen.
      const mutterBeziehung = ergebnis.beziehungen.find((beziehung) => beziehung.person_id === echteNamenloseMutterId)
      expect(mutterBeziehung?.ist_platzhalter).toBe(false)
    } finally {
      db.close()
    }
  })

  // Bugfix `aussageWertAnzeige` (vorbestehend, docs/80_Offene_Fragen.md §22 U-1.25-profil-fixture):
  // eine Aussage ohne `wert_text`/`datum_wert1`/`wert_zahl` fiel bisher auf die ROHE `wert_ref_id`
  // (UUID) zurück. `wert_ref_id` ist polymorph (E-7, kein `wert_ref_typ`, docs/schema/0002_kern.sql
  // Z.323) — die Auflösung ist darum PRÄDIKATGESTEUERT: `geburtsort`/`wohnort` (ortsbezogene
  // Prädikate laut `docs/import-vertrag.md` §3 "wert_ref zeigt auf einen Ort oder eine Person")
  // lösen gegen `ort`/`ortsname` auf (wie `ereignisseLaden()` es bereits für `ereignis.ort_id`
  // tut); jedes andere Prädikat mit `wert_ref_id` löst gegen `person_flach.anzeigename` auf.
  it('Bugfix: aussageWertAnzeige löst wert_ref_id bei geburtsort gegen den Ortsnamen auf, NICHT die rohe UUID', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, { nachname: 'Wruck', vornamen: 'August' })
      const ortId = ortAnlegen(db, 'Kwidzyn')
      aussageAnlegen(db, personId, { praedikat: 'geburtsort', wertRefId: ortId, konfidenz: 3 })

      const ergebnis = personDetail(db, { personId })
      const geburtsortFeld = ergebnis.grunddaten.find((feld) => feld.praedikat === 'geburtsort')

      expect(geburtsortFeld?.wert).toBe('Kwidzyn')
      expect(geburtsortFeld?.wert).not.toBe(ortId)
    } finally {
      db.close()
    }
  })

  it('Bugfix: aussageWertAnzeige löst wert_ref_id bei einem NICHT-ortsbezogenen Prädikat gegen den Personennamen auf', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personAnlegen(db, { nachname: 'Wruck', vornamen: 'August' })
      const pateId = personAnlegen(db, { nachname: 'Schmidt', vornamen: 'Otto' })
      aussageAnlegen(db, personId, { praedikat: 'pate', wertRefId: pateId, konfidenz: 2 })

      const ergebnis = personDetail(db, { personId })
      const pateFeld = ergebnis.grunddaten.find((feld) => feld.praedikat === 'pate')

      expect(pateFeld?.wert).toBe('Otto Schmidt')
      expect(pateFeld?.wert).not.toBe(pateId)
    } finally {
      db.close()
    }
  })
})
