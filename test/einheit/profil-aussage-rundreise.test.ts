// AP-1.30 PR 9a (Bugfix Aussage-Rundreise, gleiche Fehlerklasse wie V-130-2a-rundreise):
// `befehl:aussage.aendern` ersetzt alle Werte der Zeile — ein nicht mitgeschicktes optionales Feld wird
// NULL, ein fehlendes `datum` entfernt das gespeicherte (O10). Das Lesemodell der Profilseite
// (`PersonDetailAussage`) trug nur `wert`/`konfidenz`/`ist_bevorzugt`/`begruendung`/`belege` — wer
// daraus einen Änderungsbefehl baute, verlor Datumsgruppe, `unsicherheit`, `gueltig_von`/`bis` und die
// Rohwerte `wert_text`/`wert_zahl`/`wert_ref_id`.
//
// Rot zuerst (CLAUDE.md §5). Der Vollständigkeitstest läuft über die Schlüssel des Vertragsschemas
// von `aussage.aendern` (Muster profil-name-rundreise.test.ts): ein neuer Vertragsschlüssel ohne
// Rundreise (Lesemodell → Abbildung → Befehl) macht ihn rot.
import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import { aussageAendernEinSchema, type AussageAendernEin, type AussageAendernFeld } from '../../src/shared/schemata/befehle'
import type { PersonDetailAussage } from '../../src/shared/schemata/person-detail'
import { aussageAendernEinAus, type AussageAenderung } from '../../src/renderer/ansichten/profil/profil-aussage-logik'

type Db = Database.Database

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

/** Vertragsschlüssel OHNE eigene Spalte — sie tragen keinen Wert der Aussage:
 * - `id`: Identität der Aussage, adressiert nur.
 * - `datumBeibehalten`: Signal „gespeicherte Datumsgruppe unberührt lassen" (V-E5-erhalt); die
 *   Abbildung setzt es, wann immer das Datum nicht geändert wird — so bleibt auch eine Altbestands-
 *   Datumsgruppe mit Sonderformen bitgleich, ohne sie über den Vertrag zurückzuschreiben.
 * - `feld`: Koaleszenzfeld (AP-1.30 PR 4), wird nicht gespeichert. */
const KEIN_SPALTENWERT: ReadonlySet<string> = new Set(['id', 'datumBeibehalten', 'feld'])

type WertSchluessel = Exclude<keyof AussageAendernEin, 'id' | 'feld' | 'datumBeibehalten'>

/** Je Vertragsschlüssel ein Nicht-Standardwert (der Typ erzwingt Vollständigkeit beim Übersetzen). */
function nichtStandard(wertRefId: string): { readonly [K in WertSchluessel]-?: Exclude<AussageAendernEin[K], undefined> } {
  return {
    wertText: 'Schmied',
    wertZahl: 7,
    wertRefId,
    datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
    konfidenz: 2,
    begruendung: 'aus dem Kirchenbuch erschlossen',
    unsicherheit: 'Lesung unsicher',
    gueltigVon: 2396759,
    gueltigBis: 2400000,
  }
}

/** Eine sichtbare Änderung je Vertragsschlüssel — jeweils ein anderer Wert als in `nichtStandard`. */
function sichtbareAenderung(schluessel: WertSchluessel, andereRefId: string): AussageAenderung {
  switch (schluessel) {
    case 'wertText':
      return { wertText: 'Schmiedemeister' }
    case 'wertZahl':
      return { wertZahl: 8 }
    case 'wertRefId':
      return { wertRefId: andereRefId }
    case 'datum':
      return { datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1860' } }
    case 'konfidenz':
      return { konfidenz: 4 }
    case 'begruendung':
      return { begruendung: 'neu begründet' }
    case 'unsicherheit':
      return { unsicherheit: 'Tinte verblasst' }
    case 'gueltigVon':
      return { gueltigVon: 2396800 }
    case 'gueltigBis':
      return { gueltigBis: 2400100 }
  }
}

function spalteFuer(schluessel: string): string {
  return schluessel.replace(/[A-Z]/gu, (buchstabe) => `_${buchstabe.toLowerCase()}`)
}

/** Die DB-Spalten, die ein Vertragsschlüssel schreibt (`datum` = die ganze Datumsgruppe). */
function spaltenFuer(schluessel: string, zeile: Readonly<Record<string, unknown>>): readonly string[] {
  return schluessel === 'datum' ? Object.keys(zeile).filter((spalte) => spalte.startsWith('datum_')) : [spalteFuer(schluessel)]
}

function vertragsSchluessel(): readonly string[] {
  if (!(aussageAendernEinSchema instanceof z.ZodObject)) {
    throw new Error('aussageAendernEinSchema ist kein z.object — Schlüssel nicht bestimmbar.')
  }
  return Object.keys(aussageAendernEinSchema.shape)
}

function wertSchluessel(): readonly WertSchluessel[] {
  const erwartet: readonly WertSchluessel[] = ['wertText', 'wertZahl', 'wertRefId', 'datum', 'konfidenz', 'begruendung', 'unsicherheit', 'gueltigVon', 'gueltigBis']
  expect([...vertragsSchluessel()].filter((s) => !KEIN_SPALTENWERT.has(s)).sort()).toEqual([...erwartet].sort())
  return erwartet
}

function roh(db: Db, id: string): Readonly<Record<string, unknown>> {
  const zeile = aussageRepo.lesen(db, id)
  if (zeile === undefined) throw new Error(`Aussage ${id} fehlt.`)
  return { ...zeile }
}

function lesemodell(db: Db, personId: string, aussageId: string): PersonDetailAussage {
  const aussage = personDetail(db, { personId })
    .grunddaten.flatMap((feld) => feld.aussagen)
    .find((kandidat) => kandidat.aussage_id === aussageId)
  if (aussage === undefined) throw new Error(`Aussage ${aussageId} fehlt im Lesemodell.`)
  return aussage
}

/** Die Rundreise: Lesen (personDetail) → Abbildung mit EINER Änderung → Befehl. Liefert den Befehl. */
function profilAendern(db: Db, personId: string, aussageId: string, aenderung: AussageAenderung): AussageAendernEin {
  const ein = aussageAendernEinAus(lesemodell(db, personId, aussageId), aenderung)
  if (ein === null) throw new Error('Abbildung lieferte keinen Befehl.')
  fuehreAus(db, 'aussage.aendern', ein)
  return ein
}

type Wertart = 'wertText' | 'wertZahl' | 'wertRefId' | 'nurDatum'

/** Eine Aussage mit ALLEN Vertragsfeldern auf Nicht-Standardwerten (je Wertart genau ein Wert, die
 * Regel „genau einer"). Die Datumsgruppe wird danach am Befehl vorbei auf eine Altbestands-Sonderform
 * gesetzt (Zweitkalender, Doppeljahr, Originaltext, Sortierwerte, die `datumSpalten` nicht erzeugte) —
 * sie muss trotzdem bitgleich überleben. `nurDatum`: ein Datumsprädikat nur mit Datum (Import, D1). */
function aussageMitAllenFeldern(db: Db, personId: string, wertart: Wertart, refId: string): string {
  const w = nichtStandard(refId)
  const wert = wertart === 'wertText' ? { wertText: w.wertText } : wertart === 'wertZahl' ? { wertZahl: w.wertZahl } : wertart === 'wertRefId' ? { wertRefId: w.wertRefId } : {}
  const { id } = fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: wertart === 'nurDatum' ? 'geburtsdatum' : 'beruf',
    ...wert,
    datum: w.datum,
    konfidenz: w.konfidenz,
    begruendung: w.begruendung,
    unsicherheit: w.unsicherheit,
    gueltigVon: w.gueltigVon,
    gueltigBis: w.gueltigBis,
  })
  journalAus(db, 'Testvorbereitung (AP-1.30 PR 9a): Altbestands-Datumsgruppe mit Sonderformen.')
  try {
    db.prepare<{ readonly id: string }>(
      `UPDATE aussage SET datum_kalender = 'julian', datum_modifikator = 'zwischen', datum_praezision = 'jahr', datum_wert1 = '1711', datum_wert2 = '1712',
              datum_originaltext = 'Anno 1711/12', datum_sort_von = 2346000, datum_sort_bis = 2346365,
              datum_zweitkalender = 'gregorian', datum_zweitwert = '1712', datum_doppeljahr = '1711/12'
        WHERE id = @id`,
    ).run({ id })
  } finally {
    journalAn(db)
  }
  return id
}

const WERTARTEN: readonly Wertart[] = ['wertText', 'wertZahl', 'wertRefId', 'nurDatum']
const WERT_SCHLUESSEL: ReadonlySet<string> = new Set(['wertText', 'wertZahl', 'wertRefId'])

/** Welche Änderungen an einer Aussage dieser Wertart zulässig sind: kein zweiter Wert neben dem
 * vorhandenen (Regel „genau einer"); an `nurDatum` (Datumsprädikat) darf genau ein Wert hinzukommen. */
function anwendbar(wertart: Wertart, schluessel: WertSchluessel): boolean {
  if (!WERT_SCHLUESSEL.has(schluessel)) return true
  return wertart === 'nurDatum' ? schluessel === 'wertText' : schluessel === wertart
}

describe('Profil-Aussageänderung erhält alle Felder (AP-1.30 PR 9a)', () => {
  it('Vollständigkeit: jeder Vertragsschlüssel hat einen Nicht-Standardwert, eine Spalte und ein Feld im Lesemodell', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const refId = neuePerson(db)
      const werte = nichtStandard(refId)
      const id = aussageMitAllenFeldern(db, personId, 'wertText', refId)
      const zeile = roh(db, id)
      const gelesen: Readonly<Record<string, unknown>> = { ...lesemodell(db, personId, id) }
      for (const schluessel of vertragsSchluessel()) {
        if (KEIN_SPALTENWERT.has(schluessel)) continue
        expect(Object.keys(werte), `kein Nicht-Standardwert für ${schluessel}`).toContain(schluessel)
        for (const spalte of spaltenFuer(schluessel, zeile)) expect(Object.keys(zeile), `keine Spalte für ${schluessel}`).toContain(spalte)
        expect(Object.keys(gelesen), `kein Feld im Lesemodell für ${schluessel}`).toContain(spalteFuer(schluessel))
      }
      expect(wertSchluessel()).toHaveLength(9)
    } finally {
      db.close()
    }
  })

  for (const wertart of WERTARTEN) {
    it(`Vollständigkeit (${wertart}): jede Einzeländerung lässt alle übrigen Spalten bitgleich`, () => {
      const db = neueTestDatenbank()
      try {
        const personId = neuePerson(db)
        const refId = neuePerson(db)
        const andereRefId = neuePerson(db)
        const id = aussageMitAllenFeldern(db, personId, wertart, refId)
        let geprueft = 0
        for (const schluessel of wertSchluessel()) {
          if (!anwendbar(wertart, schluessel)) continue
          const vorher = roh(db, id)
          const ein = profilAendern(db, personId, id, sichtbareAenderung(schluessel, andereRefId))
          const nachher = roh(db, id)
          expect(ein.feld, `Koaleszenzfeld für ${schluessel}`).toBe(schluessel)
          const geaendert = spaltenFuer(schluessel, vorher)
          expect(geaendert.some((spalte) => nachher[spalte] !== vorher[spalte]), `${schluessel} wurde nicht geändert`).toBe(true)
          for (const spalte of Object.keys(vorher)) {
            if (geaendert.includes(spalte)) continue
            expect(nachher[spalte], `Spalte ${spalte} nach Änderung von ${schluessel} verändert`).toStrictEqual(vorher[spalte])
          }
          geprueft += 1
        }
        // eigener Wert (bzw. an `nurDatum` ein hinzukommender Text) + die sechs übrigen Felder
        expect(geprueft).toBe(7)
      } finally {
        db.close()
      }
    })
  }

  it('Entfernen: null entfernt genau dieses Feld, alles andere bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const refId = neuePerson(db)
      const id = aussageMitAllenFeldern(db, personId, 'wertText', refId)
      const entfernen: ReadonlyArray<readonly [AussageAendernFeld, AussageAenderung]> = [
        ['begruendung', { begruendung: null }],
        ['unsicherheit', { unsicherheit: null }],
        ['gueltigVon', { gueltigVon: null }],
        ['gueltigBis', { gueltigBis: null }],
        ['datum', { datum: null }],
      ]
      for (const [schluessel, aenderung] of entfernen) {
        const vorher = roh(db, id)
        profilAendern(db, personId, id, aenderung)
        const nachher = roh(db, id)
        const geaendert = spaltenFuer(schluessel, vorher)
        for (const spalte of geaendert) expect(nachher[spalte], `${spalte} nicht entfernt`).toBeNull()
        for (const spalte of Object.keys(vorher)) {
          if (!geaendert.includes(spalte)) expect(nachher[spalte], `Spalte ${spalte} nach Entfernen von ${schluessel} verändert`).toStrictEqual(vorher[spalte])
        }
      }
    } finally {
      db.close()
    }
  })

  it('ohne Änderung ist die Rundreise ein No-op (keine neue Transaktion)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = aussageMitAllenFeldern(db, personId, 'nurDatum', neuePerson(db))
      const anzahl = (): number => db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM transaktion`).get()?.n ?? -1
      const vorher = anzahl()
      const ein = profilAendern(db, personId, id, {})
      expect(ein.feld).toBeUndefined()
      expect(anzahl()).toBe(vorher)
    } finally {
      db.close()
    }
  })
})
