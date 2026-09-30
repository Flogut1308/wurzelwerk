// AP-1.30 PR 11c-1 (A-02, A-19, C-26; docs/80 §33 V-130-11-E1, E4, E9): der lokale Entwurf des Modals
// „Namensform bearbeiten" und seine Zielliste für `befehl:namensform.uebernehmen`. Rot zuerst (CLAUDE.md
// §5): vor PR 11c-1 gibt es `namensform-entwurf.ts` nicht.
//
// Geprüft: Entwurf aus der Form und leer; „geändert ja/nein" (Nachfrage beim Abbrechen, E9); die
// Zielliste (unveränderte Teile mit ihrer ID, leere Teile verworfen, Kopf nur mit geänderten Feldern);
// die Zuordnung eines E4-Fehlers zum Feld (ohne eigene Zerlegung); die Erkennung einer Änderung der Form
// von außen (Undo bei offenem Modal); die Live-Vorschau über den Kern. Die Rundreise über die echte
// Datenbank belegt: die Zielliste ist genau ein Undo-Schritt, unveränderte Teile behalten ihre ID, und
// ein unveränderter Entwurf schreibt nichts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { personDetail } from '../../src/main/abfragen/person-detail'
import { fuehreAus } from '../../src/main/befehle/bus'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'
import {
  entwurfAusForm,
  entwurfGeaendert,
  entwurfVorschau,
  formVonAussen,
  neuerEntwurf,
  rufnameSetzen,
  teilHinzufuegen,
  teilWertSetzen,
  uebernehmenEin,
  vornamenMitLeerraum,
  type NamensformEntwurf,
} from '../../src/renderer/ansichten/profil/namensform-entwurf'
import { neuePerson, neueTestDatenbank, transaktionAnzahl, uhrStarten, warte, type Db } from './_hilfen-namensteil'

function teil(id: string, art: PersonDetailNamensteil['art'], wert: string, sortierIndex = 0, istRufname = false): PersonDetailNamensteil {
  return { id, art, wert, ist_rufname: istRufname, sortier_index: sortierIndex, feminine_variante: null }
}

function form(id: string, ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
  return {
    id,
    ist_bevorzugt: false,
    typ: 'geburtsname',
    schrift: null,
    vornamen: null,
    nachname: null,
    praefix: null,
    titel_vor: null,
    zusatz_nach: null,
    vatersname: null,
    rufname_text: null,
    rufname_index: null,
    umschrift_von: null,
    umschrift_norm: null,
    sprache: null,
    gueltig_von: null,
    gueltig_bis: null,
    original_text: null,
    rolle: 'geburtsname',
    rollen_notiz: null,
    reihenfolge: null,
    konfidenz: null,
    sortier_index: null,
    teile: [],
    ...ueberschreibung,
  }
}

const KARL = form('f1', {
  ist_bevorzugt: true,
  sprache: 'de',
  schrift: 'latn',
  teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('v2', 'vorname', 'Friedrich', 1), teil('n1', 'nachname', 'Gutnoff')],
})

function basisVon(name: PersonDetailName): NamensformEntwurf {
  const entwurf = entwurfAusForm(name)
  if (entwurf === null) throw new Error('keine bearbeitbare Form')
  return entwurf
}

describe('Entwurf aus der Form und leer', () => {
  it('übernimmt Kopf, Teile mit ID und Rufname; ergänzt nichts, was schon da ist', () => {
    const entwurf = basisVon(KARL)
    expect(entwurf).toMatchObject({ formId: 'f1', rolle: 'geburtsname', sprache: 'de', schrift: 'latn', reihenfolge: null, rufname: 'v1', hauptname: true })
    expect(entwurf.teile.map((eintrag) => [eintrag.id, eintrag.art, eintrag.wert])).toEqual([
      ['v1', 'vorname', 'Karl'],
      ['v2', 'vorname', 'Friedrich'],
      ['n1', 'nachname', 'Gutnoff'],
    ])
  })

  it('ergänzt eine leere Zeile für Vorname und Nachname, wenn die Form keinen trägt', () => {
    const entwurf = basisVon(form('f', { teile: [teil('t', 'titel', 'Dr.')] }))
    expect(entwurf.teile.map((eintrag) => [eintrag.id, eintrag.art, eintrag.wert])).toEqual([
      ['t', 'titel', 'Dr.'],
      [null, 'vorname', ''],
      [null, 'nachname', ''],
    ])
  })

  it('eine Umschrift ist im Modal nicht bearbeitbar (E6)', () => {
    expect(entwurfAusForm(form('u', { rolle: null, umschrift_von: 'f1' }))).toBeNull()
  })

  it('leerer Entwurf: Vorname und Nachname leer, Hauptname nur für die erste Form', () => {
    expect(neuerEntwurf(true)).toMatchObject({ formId: null, rolle: 'geburtsname', sprache: null, schrift: null, reihenfolge: null, rufname: null, hauptname: true })
    expect(neuerEntwurf(false).hauptname).toBe(false)
    expect(neuerEntwurf(false).teile.map((eintrag) => [eintrag.id, eintrag.art, eintrag.wert])).toEqual([
      [null, 'vorname', ''],
      [null, 'nachname', ''],
    ])
  })
})

describe('entwurfGeaendert (E9: Nachfrage nur bei geändertem Entwurf)', () => {
  const basis = basisVon(KARL)

  it('unverändert, ein leer angelegter Teil und zurückgetippt: nicht geändert', () => {
    expect(entwurfGeaendert(basis, basis)).toBe(false)
    expect(entwurfGeaendert(basis, teilHinzufuegen(basis, 'praefix', 'neu-1'))).toBe(false)
    const hin = teilWertSetzen(basis, 'n1', 'Gutnoffx')
    expect(entwurfGeaendert(basis, teilWertSetzen(hin, 'n1', 'Gutnoff'))).toBe(false)
  })

  it('geänderter Wert, geleerter Teil, neuer Teil mit Inhalt, Rufname, Kopf, Hauptname: geändert', () => {
    expect(entwurfGeaendert(basis, teilWertSetzen(basis, 'n1', 'Gutnow'))).toBe(true)
    expect(entwurfGeaendert(basis, teilWertSetzen(basis, 'v2', ''))).toBe(true)
    expect(entwurfGeaendert(basis, teilWertSetzen(teilHinzufuegen(basis, 'vorname', 'neu-1'), 'neu-1', 'Wilhelm'))).toBe(true)
    expect(entwurfGeaendert(basis, rufnameSetzen(basis, 'v2'))).toBe(true)
    expect(entwurfGeaendert(basis, { ...basis, reihenfolge: 'nachname_zuerst' })).toBe(true)
    expect(entwurfGeaendert(basis, { ...basis, sprache: 'ru' })).toBe(true)
    const neben = basisVon(form('f2', { teile: [teil('a', 'vorname', 'Carl')] }))
    expect(entwurfGeaendert(neben, { ...neben, hauptname: true })).toBe(true)
  })
})

describe('uebernehmenEin — die vollständige Zielliste', () => {
  const basis = basisVon(KARL)

  it('unveränderte Teile gehen mit ihrer ID mit, der geänderte ebenfalls; Kopf leer, kein Hauptname', () => {
    const ein = uebernehmenEin('p1', basis, teilWertSetzen(basis, 'n1', 'Gutnow'))
    expect(ein).toEqual({
      personId: 'p1',
      formId: 'f1',
      kopf: {},
      teile: [
        { id: 'v1', art: 'vorname', wert: 'Karl', istRufname: true },
        { id: 'v2', art: 'vorname', wert: 'Friedrich', istRufname: false },
        { id: 'n1', art: 'nachname', wert: 'Gutnow', istRufname: false },
      ],
    })
  })

  it('leere Teile werden verworfen: neu angelegte und geleerte bestehende (dann ohne Rufname)', () => {
    let entwurf = teilHinzufuegen(basis, 'titel', 'neu-1')
    entwurf = teilWertSetzen(entwurf, 'v1', '   ')
    const ein = uebernehmenEin('p1', basis, entwurf)
    expect(ein.teile).toEqual([
      { id: 'v2', art: 'vorname', wert: 'Friedrich', istRufname: false },
      { id: 'n1', art: 'nachname', wert: 'Gutnoff', istRufname: false },
    ])
  })

  it('neue Teile ohne ID, in Zielfolge je Art; der Rufname folgt dem Teil', () => {
    let entwurf = teilHinzufuegen(basis, 'vorname', 'neu-1')
    entwurf = teilWertSetzen(entwurf, 'neu-1', 'Wilhelm')
    entwurf = rufnameSetzen(entwurf, 'neu-1')
    expect(uebernehmenEin('p1', basis, entwurf).teile).toEqual([
      { id: 'v1', art: 'vorname', wert: 'Karl', istRufname: false },
      { id: 'v2', art: 'vorname', wert: 'Friedrich', istRufname: false },
      { art: 'vorname', wert: 'Wilhelm', istRufname: true },
      { id: 'n1', art: 'nachname', wert: 'Gutnoff', istRufname: false },
    ])
  })

  it('der Kopf trägt bei einer bestehenden Form nur die geänderten Felder', () => {
    expect(uebernehmenEin('p1', basis, { ...basis, reihenfolge: 'nachname_zuerst', schrift: null }).kopf).toEqual({ reihenfolge: 'nachname_zuerst', schrift: null })
    expect(uebernehmenEin('p1', basis, { ...basis, rolle: 'ehename' }).kopf).toEqual({ rolle: 'ehename' })
  })

  it('neue Form: formId null, voller Kopf, keine IDs; Hauptname nur beim Einschalten', () => {
    let entwurf = neuerEntwurf(false)
    const leer = entwurf
    const nachname = entwurf.teile.find((eintrag) => eintrag.art === 'nachname')
    if (nachname === undefined) throw new Error('keine Nachname-Zeile')
    entwurf = teilWertSetzen({ ...entwurf, sprache: 'ru', schrift: 'cyrl', hauptname: true }, nachname.schluessel, 'Гутнов')
    expect(uebernehmenEin('p1', leer, entwurf)).toEqual({
      personId: 'p1',
      formId: null,
      kopf: { rolle: 'geburtsname', sprache: 'ru', schrift: 'cyrl', reihenfolge: null },
      teile: [{ art: 'nachname', wert: 'Гутнов', istRufname: false }],
      hauptname: true,
    })
    // Schon Hauptname: kein `hauptname` im Aufruf.
    expect(uebernehmenEin('p1', basis, teilWertSetzen(basis, 'n1', 'X'))).not.toHaveProperty('hauptname')
  })
})

describe('vornamenMitLeerraum (E4: Fehler des Befehls am Feld, ohne eigene Zerlegung)', () => {
  const basis = basisVon(form('f', { teile: [teil('alt', 'vorname', 'Hans Peter'), teil('n', 'nachname', 'Gutnoff')] }))

  it('ein unveränderter Altbestand mit Leerraum ist kein Kandidat', () => {
    expect(vornamenMitLeerraum(basis, basis)).toEqual([])
  })

  it('ein neuer oder geänderter Vorname mit innerem Leerraum ist Kandidat; äußerer Leerraum nicht', () => {
    let entwurf = teilHinzufuegen(basis, 'vorname', 'neu-1')
    entwurf = teilWertSetzen(entwurf, 'neu-1', 'Karl Heinz')
    expect(vornamenMitLeerraum(basis, entwurf)).toEqual(['neu-1'])
    expect(vornamenMitLeerraum(basis, teilWertSetzen(basis, 'alt', 'Hans  Peter'))).toEqual(['alt'])
    expect(vornamenMitLeerraum(basis, teilWertSetzen(basis, 'alt', ' Hans '))).toEqual([])
  })
})

describe('formVonAussen (Undo bei offenem Modal)', () => {
  it('gleicher Inhalt in neuer Referenz: gleich; neue Form: gleich', () => {
    expect(formVonAussen(KARL, { ...KARL, teile: KARL.teile.map((eintrag) => ({ ...eintrag })) })).toBe('gleich')
    expect(formVonAussen(null, undefined)).toBe('gleich')
  })

  it('geänderter Teil, Kopf oder Hauptname-Status: geändert; verschwunden: entfernt', () => {
    expect(formVonAussen(KARL, { ...KARL, teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('n1', 'nachname', 'Gutnow')] })).toBe('geaendert')
    expect(formVonAussen(KARL, { ...KARL, reihenfolge: 'nachname_zuerst' })).toBe('geaendert')
    expect(formVonAussen(KARL, { ...KARL, ist_bevorzugt: false })).toBe('geaendert')
    expect(formVonAussen(KARL, { ...KARL, rollen_notiz: 'amtlich ab 1946' })).toBe('geaendert')
    expect(formVonAussen(KARL, undefined)).toBe('entfernt')
  })
})

describe('entwurfVorschau (Live-Vorschau über den Kern)', () => {
  it('ohne leere Teile, mit Reihenfolge des Entwurfs', () => {
    const basis = basisVon(form('os', { teile: [teil('v', 'vorname', 'Карл'), teil('n', 'nachname', 'Гуытнаты')] }))
    expect(entwurfVorschau(basis)).toBe('Карл Гуытнаты')
    expect(entwurfVorschau({ ...teilHinzufuegen(basis, 'vorname', 'neu-1'), reihenfolge: 'nachname_zuerst' })).toBe('Гуытнаты Карл')
  })
})

describe('Rundreise über die echte Datenbank', () => {
  let db: Db

  beforeEach(() => {
    uhrStarten()
    db = neueTestDatenbank()
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

  it('neu anlegen, dann Nachname ändern: je ein Schritt, unveränderte Teile behalten ihre ID, leere werden nicht gespeichert', () => {
    const personId = neuePerson(db)
    const leer = neuerEntwurf(true)
    const [vorname, nachname] = leer.teile
    if (vorname === undefined || nachname === undefined) throw new Error('leere Zeilen fehlen')
    let entwurf = teilWertSetzen(leer, vorname.schluessel, 'Karl')
    entwurf = teilWertSetzen(entwurf, nachname.schluessel, 'Gutnoff')
    entwurf = teilHinzufuegen(entwurf, 'vorname', 'neu-1')
    const vorher = transaktionAnzahl(db)
    const formId = fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, leer, entwurf)).id
    expect(transaktionAnzahl(db)).toBe(vorher + 1)
    const angelegt = formLesen(personId, formId)
    expect(angelegt.ist_bevorzugt).toBe(true)
    expect(angelegt.teile.map((eintrag) => [eintrag.art, eintrag.wert])).toEqual([
      ['vorname', 'Karl'],
      ['nachname', 'Gutnoff'],
    ])

    warte(10_000)
    const basis = basisVon(angelegt)
    const karlId = angelegt.teile[0]?.id
    const nachnameId = angelegt.teile[1]?.id
    if (karlId === undefined || nachnameId === undefined) throw new Error('Teile fehlen')
    fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, teilWertSetzen(basis, nachnameId, 'Gutnow')))
    expect(transaktionAnzahl(db)).toBe(vorher + 2)
    const geaendert = formLesen(personId, formId)
    expect(geaendert.teile.map((eintrag) => [eintrag.id, eintrag.wert])).toEqual([
      [karlId, 'Karl'],
      [nachnameId, 'Gutnow'],
    ])
  })

  it('ein unveränderter Entwurf ist nicht geändert und schreibt auch als Aufruf nichts (AP-0.22)', () => {
    const personId = neuePerson(db)
    const leer = neuerEntwurf(true)
    const [vorname] = leer.teile
    if (vorname === undefined) throw new Error('leere Zeile fehlt')
    const formId = fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, leer, teilWertSetzen(leer, vorname.schluessel, 'Karl'))).id
    const basis = basisVon(formLesen(personId, formId))
    expect(entwurfGeaendert(basis, basis)).toBe(false)
    const vorher = transaktionAnzahl(db)
    fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, basis))
    expect(transaktionAnzahl(db)).toBe(vorher)
  })
})
