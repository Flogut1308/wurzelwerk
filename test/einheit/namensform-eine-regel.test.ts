// AP-1.30 Bugfix U-130-randleerraum-altbestand (A-02, A-19; docs/80 §33 V-130-fix-randleerraum,
// V-130-11c-1b): Modal und Handler haben EINE Regel für „Wert eines Teils geändert" — die Kernfunktion
// `teilWertUnveraendert`. Geprüft wird (1) dass das Modal diese Funktion benutzt statt einer eigenen Regel,
// und (2) dass Modal („geändert", E9) und Handler („schreibt eine Transaktion") über ein Raster aus
// gespeichertem und Entwurfswert gegen die echte Datenbank übereinstimmen — auch bei ungetrimmtem Altbestand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))
vi.mock('../../src/core/name/teilwert', async (original) => {
  const echt = await original<typeof import('../../src/core/name/teilwert')>()
  return { teilWertUnveraendert: vi.fn(echt.teilWertUnveraendert) }
})

import { teilWertUnveraendert } from '../../src/core/name/teilwert'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { fuehreAus } from '../../src/main/befehle/bus'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'
import { entwurfAusForm, entwurfGeaendert, teilWertSetzen, uebernehmenEin, vornamenMitLeerraum, type NamensformEntwurf } from '../../src/renderer/ansichten/profil/namensform-entwurf'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { fehlerCode, neuePerson, neueTestDatenbank, teilId, transaktionAnzahl, uhrStarten, warte, type Db } from './_hilfen-namensteil'

const NBSP = ' '

let db: Db

beforeEach(() => {
  uhrStarten()
  db = neueTestDatenbank()
  vi.mocked(teilWertUnveraendert).mockClear()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

function formLesen(personId: string, formId: string): PersonDetailName {
  const name = personDetail(db, { personId }).namen.find((eintrag) => eintrag.id === formId)
  if (name === undefined) throw new Error('Form fehlt')
  return name
}

function basisVon(name: PersonDetailName): NamensformEntwurf {
  const entwurf = entwurfAusForm(name)
  if (entwurf === null) throw new Error('keine bearbeitbare Form')
  return entwurf
}

/** Person mit Hauptform „Karl <nachname>" über die flache Brücke (`name.anlegen` speichert den Nachnamen roh). */
function mitNachnamen(nachname: string): { readonly personId: string; readonly formId: string; readonly nachnameId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname }).id
  return { personId, formId, nachnameId: teilId(db, formId, 'nachname', nachname) }
}

describe('das Modal benutzt die gemeinsame Kernfunktion', () => {
  it('entwurfGeaendert fragt teilWertUnveraendert(gespeichert, entwurf)', () => {
    const { personId, formId, nachnameId } = mitNachnamen('Gutnoff ')
    const basis = basisVon(formLesen(personId, formId))
    vi.mocked(teilWertUnveraendert).mockClear()
    entwurfGeaendert(basis, teilWertSetzen(basis, nachnameId, 'Gutnoff  '))
    expect(teilWertUnveraendert).toHaveBeenCalledWith('Gutnoff ', 'Gutnoff  ')
  })
})

describe('Modal und Handler stimmen überein (Raster, echte Datenbank)', () => {
  // Review #213 H3: dazu ein Leerraum-Teil (`' '`) mit leerem Entwurf, innerer Leerraum und ein geleerter Wert.
  const GESPEICHERT = ['Gutnoff', 'Gutnoff ', ' Gutnoff', `Gutnoff${NBSP}`, ' ', 'von Gutnoff'] as const
  const ENTWUERFE = ['Gutnoff', 'Gutnoff ', 'Gutnoff  ', ' Gutnoff', `Gutnoff${NBSP}`, '\tGutnoff', 'Gutnow', 'Gutnow ', '', ' ', 'von Gutnoff', 'von  Gutnoff'] as const

  for (const gespeichert of GESPEICHERT) {
    for (const wert of ENTWUERFE) {
      it(`gespeichert ${JSON.stringify(gespeichert)}, Entwurf ${JSON.stringify(wert)}`, () => {
        const { personId, formId, nachnameId } = mitNachnamen(gespeichert)
        const basis = basisVon(formLesen(personId, formId))
        const entwurf = teilWertSetzen(basis, nachnameId, wert)
        const modalGeaendert = entwurfGeaendert(basis, entwurf)
        expect(modalGeaendert).toBe(!teilWertUnveraendert(gespeichert, wert))

        const abzug = kanonischerAbzug(db)
        const vorher = transaktionAnzahl(db)
        warte(5000)
        fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, entwurf))
        const handlerSchrieb = transaktionAnzahl(db) > vorher
        expect(handlerSchrieb).toBe(modalGeaendert)
        if (!handlerSchrieb) expect(kanonischerAbzug(db)).toBe(abzug)
      })
    }
  }
})

describe('E4-Fehler am richtigen Vorname-Feld (Review #213 H1)', () => {
  /** Person mit Hauptform „<vorname> Gutnoff"; der Vorname-Teil wird als Altbestand direkt gesetzt (mehrwortig bzw.
   * ungetrimmt entsteht er nicht über das Modal, sondern über Migration 0006 bzw. die flache Brücke). */
  function mitVornamen(vorname: string): { readonly personId: string; readonly formId: string; readonly vornameId: string } {
    const personId = neuePerson(db)
    const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Gutnoff' }).id
    const vornameId = teilId(db, formId, 'vorname', 'Karl')
    journalAus(db, 'Test Review #213 H1: Altbestand-Vorname direkt setzen (entsteht nicht über das Modal).')
    db.prepare('UPDATE name_part SET wert = @wert WHERE id = @id').run({ wert: vorname, id: vornameId })
    journalAn(db)
    return { personId, formId, vornameId }
  }

  it('gespeichert „Hans Peter “, Entwurf „Hans Peter“: der Befehl weist ab, der Fehler gehört an dieses Feld', () => {
    const { personId, formId, vornameId } = mitVornamen('Hans Peter ')
    const basis = basisVon(formLesen(personId, formId))
    const entwurf = teilWertSetzen(basis, vornameId, 'Hans Peter')
    expect(fehlerCode(() => fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, entwurf)))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
    expect(vornamenMitLeerraum(basis, entwurf)).toEqual([vornameId])
  })

  const GESPEICHERT = ['Hans Peter', 'Hans Peter ', ' Hans Peter', 'Hans', 'Hans '] as const
  const ENTWUERFE = ['Hans Peter', 'Hans Peter ', 'Hans Peter  ', ' Hans Peter', 'Hans  Peter', 'Hans', 'Hans ', 'Karl Heinz'] as const
  for (const gespeichert of GESPEICHERT) {
    for (const wert of ENTWUERFE) {
      it(`Raster: gespeichert ${JSON.stringify(gespeichert)}, Entwurf ${JSON.stringify(wert)} — Zuordnung genau dann, wenn der Befehl abweist`, () => {
        const { personId, formId, vornameId } = mitVornamen(gespeichert)
        const basis = basisVon(formLesen(personId, formId))
        const entwurf = teilWertSetzen(basis, vornameId, wert)
        const abgewiesen = fehlerCode(() => fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, entwurf))) === 'VALIDIERUNG_NAMENSTEIL_LEERRAUM'
        expect(vornamenMitLeerraum(basis, entwurf)).toEqual(abgewiesen ? [vornameId] : [])
      })
    }
  }
})
