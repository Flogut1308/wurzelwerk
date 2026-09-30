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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
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
import { neuePerson, neueTestDatenbank, teile, transaktionAnzahl, uhrStarten, warte, type Db } from './_hilfen-namensteil'

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

  // Koordinator-Entscheidung zu PR 11c-1: E6 betrifft das Erzeugen einer Umschrift, nicht das Bearbeiten einer
  // vorhandenen — die flache Maske konnte jede Form bearbeiten, das Modal kann es auch.
  it('eine Umschrift ist bearbeitbar: Rolle bleibt NULL, der Bezug wird nur angezeigt', () => {
    // Norm schon „manuell": dann ändert Übernehmen am Kopf nichts (Review #207 3b trifft nur automatische Normen).
    const umschrift = form('u', { rolle: null, umschrift_von: 'f1', umschrift_norm: 'manuell', schrift: 'latn', teile: [teil('a', 'vorname', 'Karl'), teil('b', 'nachname', 'Guytnaty')] })
    const basis = entwurfAusForm(umschrift)
    if (basis === null) throw new Error('Umschrift nicht bearbeitbar')
    expect(basis).toMatchObject({ formId: 'u', rolle: null, umschriftVon: 'f1', hauptname: false })
    const ein = uebernehmenEin('p1', basis, teilWertSetzen(basis, 'b', 'Gutnaty'))
    expect(ein).toEqual({
      personId: 'p1',
      formId: 'u',
      kopf: {},
      teile: [
        { id: 'a', art: 'vorname', wert: 'Karl', istRufname: false },
        { id: 'b', art: 'nachname', wert: 'Gutnaty', istRufname: false },
      ],
    })
    expect(ein.kopf).not.toHaveProperty('rolle')
    expect(ein.kopf).not.toHaveProperty('umschriftVon')
  })

  // Review #207 3b (A-19, docs/datenmodell.md: 'manuell' kennzeichnet eine korrigierte Umschrift): wer die
  // Teile einer automatisch erzeugten Umschrift ändert, korrigiert sie von Hand — die Norm wird 'manuell',
  // damit eine spätere automatische Umschrift sie nicht überschreibt und die Karte nicht mehr „ISO 9" sagt.
  it('geänderte Teile einer automatischen Umschrift (iso9, din1460) setzen umschriftNorm auf manuell', () => {
    for (const norm of ['iso9', 'din1460'] as const) {
      const basis = basisVon(form('u', { rolle: null, umschrift_von: 'f1', umschrift_norm: norm, teile: [teil('a', 'vorname', 'Karl'), teil('b', 'nachname', 'Guytnaty')] }))
      expect(uebernehmenEin('p1', basis, teilWertSetzen(basis, 'b', 'Gutnaty')).kopf).toEqual({ umschriftNorm: 'manuell' })
      // Nur ein Kopf-Feld geändert, Teile gleich: die Umschrift ist nicht korrigiert, die Norm bleibt.
      expect(uebernehmenEin('p1', basis, { ...basis, sprache: 'de' }).kopf).toEqual({ sprache: 'de' })
      // Ein leer angelegter Teil ändert die Zielliste nicht.
      expect(uebernehmenEin('p1', basis, teilHinzufuegen(basis, 'titel', 'neu-1')).kopf).toEqual({})
    }
  })

  // PR 11c-1b, Nachreview #207 H1: der Handler vergleicht getrimmt (`teil.wert.trim() === vorher.wert`); ein
  // angehängtes Leerzeichen ist darum keine Änderung — weder „korrigiert" (Norm bleibt) noch „geändert" (E9).
  it('H1: ein angehängtes Leerzeichen ist keine Korrektur und keine Änderung', () => {
    const basis = basisVon(form('u', { rolle: null, umschrift_von: 'f1', umschrift_norm: 'iso9', teile: [teil('a', 'vorname', 'Karl'), teil('b', 'nachname', 'Gutnov')] }))
    const entwurf = teilWertSetzen(basis, 'b', 'Gutnov ')
    expect(entwurfGeaendert(basis, entwurf)).toBe(false)
    expect(uebernehmenEin('p1', basis, entwurf).kopf).toEqual({})
  })

  // PR 11c-1b, H2 (entschieden): eine reine Rufname-Markierung korrigiert die Transliteration nicht.
  it('H2: nur den Rufnamen setzen lässt die Norm einer automatischen Umschrift stehen, ist aber eine Änderung', () => {
    const basis = basisVon(form('u', { rolle: null, umschrift_von: 'f1', umschrift_norm: 'iso9', teile: [teil('a', 'vorname', 'Karl'), teil('b', 'nachname', 'Gutnov')] }))
    const entwurf = rufnameSetzen(basis, 'a')
    expect(entwurfGeaendert(basis, entwurf)).toBe(true)
    const ein = uebernehmenEin('p1', basis, entwurf)
    expect(ein.kopf).toEqual({})
    expect(ein.teile).toContainEqual({ id: 'a', art: 'vorname', wert: 'Karl', istRufname: true })
  })

  it('keine Umschrift oder ohne Norm: umschriftNorm wird nie gesetzt', () => {
    const ohneNorm = basisVon(form('u', { rolle: null, umschrift_von: 'f1', umschrift_norm: null, teile: [teil('b', 'nachname', 'Guytnaty')] }))
    expect(uebernehmenEin('p1', ohneNorm, teilWertSetzen(ohneNorm, 'b', 'X')).kopf).toEqual({})
    const basis = basisVon(KARL)
    expect(uebernehmenEin('p1', basis, teilWertSetzen(basis, 'n1', 'X')).kopf).toEqual({})
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

  // Review #207 M8: eine Änderung nur an `feminine_variante` (z. B. Undo einer Genusform-Änderung) ist eine
  // Änderung der gespeicherten Form. Das Modal schickt die Genusform zwar nicht mit (fehlt = bleibt), der
  // Hinweis „Undo gewinnt" soll aber jeden abweichenden gespeicherten Stand melden — und ab 11c-3 bearbeitet
  // das Modal die Genusform selbst.
  it('eine Änderung nur an feminine_variante eines Teils: geändert', () => {
    const mitGenusform = { ...KARL, teile: KARL.teile.map((eintrag) => (eintrag.id === 'n1' ? { ...eintrag, feminine_variante: 'Gutnowa' } : eintrag)) }
    expect(formVonAussen(KARL, mitGenusform)).toBe('geaendert')
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

  // Review #207 (Mutant M1b überlebte): eine Form mit allem, was das Modal nicht oder nur mittelbar zeigt —
  // Vatersname, `feminine_variante` am Nachnamen, ein mehrwortiger Altbestand-Vorname (E4) und Kopf-Felder
  // ohne Feld im Modal (`rollen_notiz`, `konfidenz`, `gueltig_*`). Ändert der Nutzer einen anderen Teil, bleibt
  // all das bitgleich (Zeilen samt Zeitstempeln), nur der geänderte Teil ändert sich.
  it('Übernehmen mit einer Änderung an einem Teil lässt Vatersname, Genusform, Altbestand und verdeckten Kopf bitgleich', () => {
    const personId = neuePerson(db)
    const formId = fuehreAus(db, 'namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: 'geburtsname', rollenNotiz: 'amtlich ab 1946', konfidenz: 3, gueltigVon: 2431822, gueltigBis: 2440588, sprache: 'ru', schrift: 'cyrl', reihenfolge: 'nachname_zuerst' },
      teile: [
        { art: 'vorname', wert: 'Карл', istRufname: true },
        { art: 'vorname', wert: 'Фридрих', istRufname: false },
        { art: 'vatersname', wert: 'Фридрихович', istRufname: false },
        { art: 'nachname', wert: 'Гутнов', feminineVariante: 'Гутнова', istRufname: false },
      ],
    }).id
    // Altbestand: ein Vorname-Teil mit innerem Leerraum (entsteht über die flache Brücke, nicht über das Modal).
    journalAus(db, 'Test Review #207: Altbestand-Vorname mit Leerraum direkt setzen (entsteht nicht über das Modal).')
    db.prepare("UPDATE name_part SET wert = 'Фридрих Вильгельм' WHERE name_form_id = @formId AND wert = 'Фридрих'").run({ formId })
    journalAn(db)

    const kopf = (): unknown =>
      db
        .prepare<{ readonly formId: string }, Record<string, unknown>>(
          'SELECT rolle, rollen_notiz, konfidenz, gueltig_von, gueltig_bis, sprache, schrift, reihenfolge, umschrift_von, umschrift_norm, ist_bevorzugt, sortier_index FROM name_form WHERE id = @formId',
        )
        .get({ formId })
    const kopfVorher = kopf()
    const teileVorher = teile(db, formId)
    const karl = teileVorher.find((eintrag) => eintrag.wert === 'Карл')
    if (karl === undefined) throw new Error('Teil Карл fehlt')

    warte(10_000)
    const basis = basisVon(formLesen(personId, formId))
    fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, teilWertSetzen(basis, karl.id, 'Карлуша')))

    expect(kopf()).toEqual(kopfVorher)
    const teileNachher = teile(db, formId)
    expect(teileNachher.filter((eintrag) => eintrag.id !== karl.id)).toEqual(teileVorher.filter((eintrag) => eintrag.id !== karl.id))
    expect(teileNachher.find((eintrag) => eintrag.id === karl.id)).toMatchObject({ wert: 'Карлуша', ist_rufname: 1, sortier_index: karl.sortier_index })
    expect(teileNachher.map((eintrag) => eintrag.art).sort()).toEqual(['nachname', 'vatersname', 'vorname', 'vorname'])
  })

  // PR 11c-1b H1 gegen die echte Datenbank: früher meldete der ungetrimmte Vergleich „korrigiert", und der
  // Handler schrieb einen Undo-Schritt, der nur die Norm auf 'manuell' setzte.
  it('H1: angehängtes Leerzeichen an einer iso9-Umschrift schreibt keine Transaktion, die Norm bleibt iso9', () => {
    const personId = neuePerson(db)
    const haupt = fuehreAus(db, 'namensform.uebernehmen', { personId, formId: null, kopf: { rolle: 'geburtsname', sprache: 'ru', schrift: 'cyrl' }, teile: [{ art: 'nachname', wert: 'Гутнов', istRufname: false }] }).id
    const umschriftId = fuehreAus(db, 'namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: null, umschriftVon: haupt, umschriftNorm: 'iso9', schrift: 'latn' },
      teile: [{ art: 'nachname', wert: 'Gutnov', istRufname: false }],
    }).id
    const basis = basisVon(formLesen(personId, umschriftId))
    const nachname = basis.teile.find((eintrag) => eintrag.art === 'nachname' && eintrag.id !== null)
    if (nachname === undefined) throw new Error('Nachname fehlt')
    const vorher = transaktionAnzahl(db)
    fuehreAus(db, 'namensform.uebernehmen', uebernehmenEin(personId, basis, teilWertSetzen(basis, nachname.schluessel, 'Gutnov ')))
    expect(transaktionAnzahl(db)).toBe(vorher)
    expect(formLesen(personId, umschriftId).umschrift_norm).toBe('iso9')
  })
})
