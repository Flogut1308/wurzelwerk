// Vorarbeiten AP-1.30 Teil 2, PR 5 (Eigentümer 25.09.2026: Personenliste ≤ 15 ms, Ergebnis bitgleich):
// `personListe` und `suche` laden seit PR 5 in zwei Phasen (`sortierZeilenLaden` für alle gefilterten
// Personen, `zeilenFuerIdsLaden` nur für die Seite). Dieser Test hält die Ausgabe gleich der
// Einphasen-Fassung davor: `referenzZeilenLaden` ist deren Abfrage WORTGLEICH (Stand main 93192a7 /
// 382cee1), die Referenz-Pipeline lädt alle gefilterten Zeilen, sortiert mit `vergleicheZeilen` und
// schneidet die Seite. Verglichen wird die ganze Ausgabe (`toEqual`) über eine Matrix aus Sortierung,
// Richtung, Seite, Seitengröße und Filtern auf dem 2000er-Bestand, dazu die Suche.
//
// Die Referenz ist eine Kopie auf Zeit: ändert sich die Listen-Ausgabe künftig GEWOLLT (neue Spalte,
// andere Regel), wird die Referenz im selben PR mitgezogen oder dieser Test entfernt — nicht blind.
import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { grossbestandAufbauen } from '../hilfsmittel/grossbestand'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { filterBedingungen, personListe, vergleicheZeilen, whereSql, zeileZuAusgabe, type RohZeile, type SortierEingabe } from '../../src/main/abfragen/person-liste'
import { suche } from '../../src/main/abfragen/suche'
import { anzeigenamenLaden } from '../../src/main/abfragen/_anzeigenamen'
import { nameFormNachnameSql, nameFormVornamenSql } from '../../src/main/datenbank/abgeleitet-projektion'
import type { PersonListeAus, PersonListeEin, PersonListeFilter } from '../../src/shared/schemata/person-liste'

type Db = Database.Database

function referenzZeilenLaden(db: Db, whereKlausel: string, parameter: Record<string, number | string>): readonly RohZeile[] {
  return db
    .prepare<
      Record<string, number | string>,
      RohZeile
    >(`SELECT pf.person_id AS person_id, pf.geburt_jahr AS geburt_jahr,
              pf.geburt_sort_von AS geburt_sort_von, pf.tod_jahr AS tod_jahr, pf.tod_sort_von AS tod_sort_von,
              pf.geburt_ort_name AS geburt_ort_name, pf.konfidenz_min AS konfidenz_min,
              pf.hat_widerspruch AS hat_widerspruch, p.ist_platzhalter AS ist_platzhalter,
              bn.nachname AS nachname, bn.vornamen AS vornamen,
              ber.beruf AS beruf,
              COALESCE(bz.belegzahl, 0) AS belegzahl,
              COALESCE(kz.kinderzahl, 0) AS kinderzahl,
              gbv.datum_kalender AS geburt_kalender, gbv.datum_modifikator AS geburt_modifikator,
              gbv.datum_praezision AS geburt_praezision, gbv.datum_wert1 AS geburt_wert1,
              gbv.datum_wert2 AS geburt_wert2, gbv.datum_originaltext AS geburt_originaltext,
              gbv.datum_sort_von AS geburt_datum_sort_von, gbv.datum_sort_bis AS geburt_datum_sort_bis,
              tdv.datum_kalender AS tod_kalender, tdv.datum_modifikator AS tod_modifikator,
              tdv.datum_praezision AS tod_praezision, tdv.datum_wert1 AS tod_wert1,
              tdv.datum_wert2 AS tod_wert2, tdv.datum_originaltext AS tod_originaltext,
              tdv.datum_sort_von AS tod_datum_sort_von, tdv.datum_sort_bis AS tod_datum_sort_bis
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       LEFT JOIN (
         SELECT nf.person_id AS person_id,
           ${nameFormVornamenSql('nf.id')} AS vornamen,
           ${nameFormNachnameSql('nf.id')} AS nachname,
           ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
         FROM name_form nf
       ) bn ON bn.person_id = pf.person_id AND bn.rang = 1
       LEFT JOIN (
         SELECT subjekt_id AS person_id, wert_text AS beruf,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'beruf'
       ) ber ON ber.person_id = pf.person_id AND ber.rang = 1
       LEFT JOIN (
         SELECT subjekt_id AS person_id, datum_kalender, datum_modifikator, datum_praezision,
           datum_wert1, datum_wert2, datum_originaltext, datum_sort_von, datum_sort_bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum'
       ) gbv ON gbv.person_id = pf.person_id AND gbv.rang = 1
       LEFT JOIN (
         SELECT subjekt_id AS person_id, datum_kalender, datum_modifikator, datum_praezision,
           datum_wert1, datum_wert2, datum_originaltext, datum_sort_von, datum_sort_bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum'
       ) tdv ON tdv.person_id = pf.person_id AND tdv.rang = 1
       LEFT JOIN (
         SELECT a.subjekt_id AS person_id, COUNT(az.zitat_id) AS belegzahl
         FROM aussage a
         LEFT JOIN aussage_zitat az ON az.aussage_id = a.id
         WHERE a.subjekt_typ = 'person'
         GROUP BY a.subjekt_id
       ) bz ON bz.person_id = pf.person_id
       LEFT JOIN (
         SELECT elternteil_id AS person_id, COUNT(*) AS kinderzahl
         FROM elternschaft
         GROUP BY elternteil_id
       ) kz ON kz.person_id = pf.person_id
       ${whereKlausel}`,
    )
    .all(parameter)
}


function referenzListe(db: Db, ein: PersonListeEin): PersonListeAus {
  const { bedingungen, parameter } = filterBedingungen(ein.filter)
  const zeilen = referenzZeilenLaden(db, whereSql(bedingungen), parameter)
  const sortiert = [...zeilen].sort((a, b) => vergleicheZeilen(a, b, ein))
  const start = (ein.seite - 1) * ein.proSeite
  const seite = sortiert.slice(start, start + ein.proSeite)
  const namen = anzeigenamenLaden(db, seite.map((zeile) => zeile.person_id))
  return { zeilen: seite.map((zeile) => zeileZuAusgabe(zeile, namen)), gesamt: zeilen.length }
}

const SORTIERUNGEN: readonly SortierEingabe[] = (['nachname', 'vornamen', 'geburt', 'tod'] as const).flatMap((sortierung) =>
  (['auf', 'ab'] as const).map((richtung) => ({ sortierung, richtung })),
)
const ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }
const FILTER: readonly PersonListeFilter[] = [
  ALLE,
  { platzhalter: 'nur', privat: 'alle', nurWiderspruch: false },
  { platzhalter: 'ohne', privat: 'ohne', nurWiderspruch: false },
  { platzhalter: 'alle', privat: 'nur', nurWiderspruch: false },
  { platzhalter: 'alle', privat: 'alle', nurWiderspruch: true },
  { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false, konfidenzMin: 3 },
  { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false, zeitraumVon: 1800, zeitraumBis: 1900 },
  { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false, ort: 'a' },
]
const SEITEN: readonly { readonly seite: number; readonly proSeite: number }[] = [
  { seite: 1, proSeite: 100 },
  { seite: 2, proSeite: 100 },
  { seite: 20, proSeite: 100 },
  { seite: 21, proSeite: 100 },
  { seite: 7, proSeite: 37 },
  { seite: 1, proSeite: 5000 },
]

describe('Personenliste in zwei Phasen = Einphasen-Referenz (Vorarbeiten AP-1.30 Teil 2, PR 5)', () => {
  it('Z1: personListe gibt für Sortierung × Richtung × Seite × Filter genau die Referenzausgabe', () => {
    const db = grossbestandAufbauen()
    try {
      let zeilenGesamt = 0
      for (const filter of FILTER) {
        for (const sortierung of SORTIERUNGEN) {
          for (const seite of SEITEN) {
            const ein: PersonListeEin = { ...sortierung, ...seite, filter }
            const ist = personListe(db, ein)
            expect(ist, JSON.stringify(ein)).toEqual(referenzListe(db, ein))
            zeilenGesamt += ist.zeilen.length
          }
        }
      }
      // Deckung: die Matrix vergleicht echte Zeilen, nicht nur leere Seiten.
      expect(zeilenGesamt).toBeGreaterThan(20000)
    } finally {
      db.close()
    }
  })

  it('Z2: suche liefert dieselben Zeilen und dieselbe Ordnung wie die Referenz über ihre Kandidaten', () => {
    const db = grossbestandAufbauen()
    try {
      let trefferGesamt = 0
      for (const text of ['Meyer', 'Anna', 'Schmidt', 'Maier']) {
        for (const sortierung of SORTIERUNGEN) {
          const alle = suche(db, { text, grenze: 100, filter: ALLE, ...sortierung, seite: 1, proSeite: 100 })
          const ids = alle.treffer.map((treffer) => treffer.person_id)
          trefferGesamt += ids.length
          const platzhalter = ids.map((_, index) => `@r${index}`).join(', ')
          const parameter = Object.fromEntries(ids.map((id, index) => [`r${index}`, id]))
          const referenz = ids.length === 0 ? [] : [...referenzZeilenLaden(db, `WHERE pf.person_id IN (${platzhalter})`, parameter)].sort((a, b) => vergleicheZeilen(a, b, sortierung))
          const namen = anzeigenamenLaden(db, ids)
          expect(alle.treffer, text).toEqual(referenz.map((zeile, index) => ({ ...zeileZuAusgabe(zeile, namen), quelle: alle.treffer[index]?.quelle })))
          expect(alle.gesamt).toBe(referenz.length)

          // Seitenweise geschnitten ergibt dieselbe Folge.
          const seite2 = suche(db, { text, grenze: 100, filter: ALLE, ...sortierung, seite: 2, proSeite: 7 })
          expect(seite2.treffer).toEqual(alle.treffer.slice(7, 14))
        }
      }
      expect(trefferGesamt).toBeGreaterThan(400)
    } finally {
      db.close()
    }
  })

  // Der Großbestand hat je Person genau eine Namensform und je Prädikat eine Aussage — Rangfolgen
  // (bevorzugt vs. erster Eintrag), Personen ohne alles und Mehrfachkinder prüft erst dieser gezielt
  // gebaute Bestand.
  it('Z3: gezielter Bestand mit Mehrfachformen, Mehrfachaussagen und Leerpersonen = Referenz', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const neuePerson = (): string => fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Kirchenbuch' })
      const zitat = (): string => fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1' }).id
      const personen: string[] = []
      for (let i = 0; i < 24; i += 1) {
        const p = neuePerson()
        personen.push(p)
        if (i % 6 === 5) continue // ohne Namen und ohne Aussagen
        const geburtsname = fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname', vornamen: `Vorname${i % 5}`, nachname: `Name${i % 4}` }).id
        if (i % 3 === 0) {
          // Die spätere Form wird Hauptname: bevorzugt ist dann NICHT die erste nach id.
          const ehename = fuehreAus(db, 'name.anlegen', { personId: p, typ: 'ehename', vornamen: `Anders${i}`, nachname: `Ehe${i % 7}` }).id
          fuehreAus(db, 'hauptname.wechseln', { personId: p, alt: geburtsname, neu: ehename })
        }
        const berufe = i % 4
        for (let b = 0; b < berufe; b += 1) {
          fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: `Beruf${i}-${b}`, konfidenz: 2, ...(b === 1 ? { istBevorzugt: 1 as const } : {}) })
        }
        for (let d = 0; d < (i % 3); d += 1) {
          fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'geburtsdatum', wertText: `${1800 + i + d}`, datum: d === 0 ? { modifikator: 'etwa', praezision: 'jahr', wert1: `${1800 + i}`, original_text: `um ${1800 + i}` } : { modifikator: 'exakt', praezision: 'jahr', wert1: `${1800 + i + d}` }, konfidenz: 3, ...(d === 1 ? { istBevorzugt: 1 as const } : {}) })
        }
        if (i % 2 === 0) fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'todesdatum', wertText: `${1870 + i}`, datum: { modifikator: 'vor', praezision: 'jahr', wert1: `${1870 + i}`, original_text: `vor ${1870 + i}` }, konfidenz: 3, belege: [zitat(), zitat()] })
        if (i % 5 === 0) fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'konfession', wertText: 'ev.', konfidenz: 1, belege: [zitat()] })
      }
      for (const [eltern, kind] of [[0, 1], [0, 2], [0, 3], [4, 3], [7, 8], [7, 9]] as const) {
        const elternteilId = personen[eltern]
        const kindId = personen[kind]
        if (elternteilId === undefined || kindId === undefined) throw new Error('Person fehlt')
        fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ: 'biologisch', konfidenz: 3 })
      }
      const ereignis = fuehreAus(db, 'ereignis.anlegen', { typ: 'geburt', beteiligungen: [{ personId: personen[0] ?? '', rolle: 'kind' }], konfidenz: 3 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'ereignis', subjektId: ereignis.id, praedikat: 'beruf', wertText: 'kein Personenberuf', konfidenz: 2 })

      let zeilenGesamt = 0
      for (const sortierung of SORTIERUNGEN) {
        for (const seite of [{ seite: 1, proSeite: 100 }, { seite: 2, proSeite: 5 }, { seite: 3, proSeite: 7 }]) {
          const ein: PersonListeEin = { ...sortierung, ...seite, filter: ALLE }
          const ist = personListe(db, ein)
          expect(ist, JSON.stringify(ein)).toEqual(referenzListe(db, ein))
          zeilenGesamt += ist.zeilen.length
        }
      }
      expect(zeilenGesamt).toBeGreaterThan(8 * 24)
    } finally {
      db.close()
    }
  })
})

