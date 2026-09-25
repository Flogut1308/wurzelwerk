// Vorarbeiten AP-1.30, PR 4a (docs/80 §30 U-1.33-anzeigename-unbenutzt, Eigentümer 25.09.2026): der
// sichtbare Name kommt in Liste, Suche und Profil aus `anzeigenameFuer` (src/core/name/anzeigename.ts),
// nicht aus der SQL-Projektion `person_flach.anzeigename` (die nur Vornamen + Nachname der Hauptform
// kennt: „Dr. Florian von Gutnoff" erschien als „Florian Gutnoff"). Rot zuerst (CLAUDE.md §5).
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { personListe } from '../../src/main/abfragen/person-liste'
import { suche } from '../../src/main/abfragen/suche'
import { pruefhinweise } from '../../src/main/abfragen/pruefhinweise'
import { quelleDetail } from '../../src/main/abfragen/quelle-detail'
import type { PersonListeFilter } from '../../src/shared/schemata/person-liste'

type Db = ReturnType<typeof oeffnen>

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }
const VOLL = 'Dr. Florian von Gutnoff Jr.'

function mitDb(fn: (db: Db) => void): void {
  const db = oeffnen(':memory:')
  try {
    migrieren(db)
    fn(db)
  } finally {
    db.close()
  }
}

function person(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

/** Person mit Titel, Präfix und Zusatz — die SQL-Projektion kennt nur Vornamen + Nachname. */
function gutnoff(db: Db): string {
  const p = person(db)
  fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname', titelVor: 'Dr.', vornamen: 'Florian', praefix: 'von', nachname: 'Gutnoff', zusatzNach: 'Jr.' })
  return p
}

describe('Anzeigename aus dem Kern für alle Leser (Vorarbeiten AP-1.30, PR 4a)', () => {
  it('N1: Personenliste zeigt den Kern-Anzeigenamen', () => {
    mitDb((db) => {
      const p = gutnoff(db)
      const zeile = personListe(db, { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE }).zeilen.find((z) => z.person_id === p)
      expect(zeile?.anzeigename).toBe(VOLL)
    })
  })

  it('N2: Suche zeigt den Kern-Anzeigenamen', () => {
    mitDb((db) => {
      const p = gutnoff(db)
      const treffer = suche(db, { text: 'Gutnoff', grenze: 50, filter: FILTER_ALLE, sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100 }).treffer.find((z) => z.person_id === p)
      expect(treffer?.anzeigename).toBe(VOLL)
    })
  })

  it('N3: Profilkopf, Beziehungen und Personen-Wertverweise zeigen den Kern-Anzeigenamen', () => {
    mitDb((db) => {
      const vater = gutnoff(db)
      const kind = person(db)
      fuehreAus(db, 'name.anlegen', { personId: kind, typ: 'geburtsname', vornamen: 'Anna', praefix: 'von', nachname: 'Gutnoff' })
      fuehreAus(db, 'elternschaft.anlegen', { elternteilId: vater, kindId: kind, typ: 'biologisch', konfidenz: 3 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: kind, praedikat: 'taufpate', wertRefId: vater, konfidenz: 3 })

      expect(personDetail(db, { personId: vater }).kopf.anzeigename).toBe(VOLL)
      const detail = personDetail(db, { personId: kind })
      expect(detail.kopf.anzeigename).toBe('Anna von Gutnoff')
      expect(detail.beziehungen.find((b) => b.person_id === vater)?.anzeigename).toBe(VOLL)
      expect(personDetail(db, { personId: vater }).beziehungen.find((b) => b.person_id === kind)?.anzeigename).toBe('Anna von Gutnoff')
      expect(detail.grunddaten.find((f) => f.praedikat === 'taufpate')?.wert).toBe(VOLL)
    })
  })

  it('N4: die Rückfallkette gilt auch in der Liste — eine Umschrift-Form wird angezeigt, sortiert wird weiter nach der Hauptform', () => {
    mitDb((db) => {
      const p = person(db)
      const haupt = fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname', schrift: 'cyrl', vornamen: 'Иван', nachname: 'Иванов' }).id
      fuehreAus(db, 'name.anlegen', { personId: p, typ: 'transliteriert', schrift: 'latn', umschriftVon: haupt, umschriftNorm: 'iso9', vornamen: 'Ivan', nachname: 'Ivanov' })
      const zeile = personListe(db, { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE }).zeilen.find((z) => z.person_id === p)
      expect(zeile?.anzeigename).toBe('Ivan Ivanov')
      expect(personDetail(db, { personId: p }).kopf.anzeigename).toBe('Ivan Ivanov')

      // Sortiert wird nach der Hauptform (V-4-sortierung, hueter #128 Befund 9): „Zander" steht vor
      // „Иванов" (Kyrillisch nach Latein), obwohl die angezeigte Umschrift „Ivan Ivanov" davor läge.
      const zander = person(db)
      fuehreAus(db, 'name.anlegen', { personId: zander, typ: 'geburtsname', vornamen: 'Anton', nachname: 'Zander' })
      const reihenfolge = personListe(db, { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE })
        .zeilen.map((z) => z.person_id)
        .filter((id) => id === p || id === zander)
      expect(reihenfolge).toEqual([zander, p])
    })
  })

  it('N3b: ein Personen-Wertverweis auf eine gelöschte Person bleibt ohne Namen (hueter #128, Befund 3)', () => {
    mitDb((db) => {
      const kind = gutnoff(db)
      const pate = gutnoff(db)
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: kind, praedikat: 'taufpate', wertRefId: pate, konfidenz: 3 })
      fuehreAus(db, 'person.loeschen', { id: pate })
      expect(personDetail(db, { personId: kind }).grunddaten.find((f) => f.praedikat === 'taufpate')?.wert).toBeNull()
    })
  })

  it('N5: eine Person ohne Namensform bleibt leer (wie bisher)', () => {
    mitDb((db) => {
      const p = person(db)
      expect(personDetail(db, { personId: p }).kopf.anzeigename).toBe('')
      expect(personListe(db, { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE }).zeilen.find((z) => z.person_id === p)?.anzeigename).toBe('')
    })
  })
})

// Vorarbeiten AP-1.30, PR 4b: die übrigen Leser (Prüfhinweise, Informant einer Quelle).
describe('Anzeigename aus dem Kern — Prüfhinweise und Informant (Vorarbeiten AP-1.30, PR 4b)', () => {
  it('N6: ein Prüfhinweis nennt die Person mit dem Kern-Anzeigenamen', () => {
    mitDb((db) => {
      const p = gutnoff(db)
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'geburtsdatum', wertText: '1900', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' }, konfidenz: 3 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'todesdatum', wertText: '1850', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' }, konfidenz: 3 })
      const eintrag = pruefhinweise(db).eintraege.find((e) => e.personId === p && e.code === 'tod_vor_geburt')
      expect(eintrag?.anzeigename).toBe(VOLL)
    })
  })

  it('N7: der Informant einer mündlichen Quelle erscheint mit dem Kern-Anzeigenamen, ohne Informant null', () => {
    mitDb((db) => {
      const p = gutnoff(db)
      const { id: mitInformant } = fuehreAus(db, 'quelle.anlegen', { typ: 'muendlich', informantPersonId: p, form: 'gespraech', unmittelbarkeit: 'selbst_erlebt' })
      expect(quelleDetail(db, { quelleId: mitInformant }).kopf.informant_anzeigename).toBe(VOLL)
      const { id: ohne } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'KB' })
      expect(quelleDetail(db, { quelleId: ohne }).kopf.informant_anzeigename).toBeNull()
    })
  })
})

// hueter #131, Befund 7: Randfälle ohne Namensform bzw. mit gelöschtem Informanten.
describe('Anzeigename aus dem Kern — Randfälle (Vorarbeiten AP-1.30, PR 4b)', () => {
  it('N8: Prüfhinweis und Informant ohne Namensform zeigen den leeren Namen, ein gelöschter Informant null', () => {
    mitDb((db) => {
      const namenlos = person(db)
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: namenlos, praedikat: 'geburtsdatum', wertText: '1900', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' }, konfidenz: 3 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: namenlos, praedikat: 'todesdatum', wertText: '1850', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' }, konfidenz: 3 })
      expect(pruefhinweise(db).eintraege.find((e) => e.personId === namenlos && e.code === 'tod_vor_geburt')?.anzeigename).toBe('')

      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'muendlich', informantPersonId: namenlos, form: 'gespraech', unmittelbarkeit: 'selbst_erlebt' })
      expect(quelleDetail(db, { quelleId }).kopf.informant_anzeigename).toBe('')

      const informant = gutnoff(db)
      const { id: zweite } = fuehreAus(db, 'quelle.anlegen', { typ: 'muendlich', informantPersonId: informant, form: 'gespraech', unmittelbarkeit: 'selbst_erlebt' })
      fuehreAus(db, 'person.loeschen', { id: informant })
      expect(quelleDetail(db, { quelleId: zweite }).kopf.informant_anzeigename).toBeNull()
    })
  })
})
