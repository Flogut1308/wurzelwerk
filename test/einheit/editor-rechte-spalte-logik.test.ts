// AP-1.30 (PR 8): rechte Spalte von „Person bearbeiten" (Artboard 1a) — reine Aufbereitung von
// Vollständigkeit (aus `person.detail.kernangaben`, ADR-031: keine eigene Berechnung), offenen
// Punkten (Sprungziel) und Verlauf (Text ohne Importpfad, M-08, Filter, Zeitformat).
import { describe, expect, it } from 'vitest'
import { KERNANGABE_IDS, KERNANGABE_ZUSTAENDE } from '../../src/core/person/kernangaben'
import { EDITOR_FELDER } from '../../src/core/person/offene-punkte'
import { editorFeldId } from '../../src/renderer/ansichten/profil/editor-feld-id'
import {
  kernangabeNameSchluessel,
  kernangabeZustandSchluessel,
  offenePunkteZeilen,
  sprungzielElement,
  verlaufText,
  verlaufTextUebersetzen,
  verlaufZeilen,
  verlaufZeit,
  verlaufZeitUebersetzen,
  vollstaendigkeitAnzeige,
  VERLAUF_ABFRAGE_GRENZE,
  VERLAUF_ANZEIGE_ANZAHL,
} from '../../src/renderer/ansichten/profil/editor-rechte-spalte-logik'
import { i18n } from '../../src/renderer/i18n/einrichten'
import profilRessourcen from '../../src/shared/i18n/de/profil.json'
import type { VerlaufEintrag } from '../../src/shared/ipc/vertrag'
import type { PersonDetailBeziehung, PersonDetailKernangaben, PersonDetailOffenerPunkt } from '../../src/shared/schemata/person-detail'

function t(schluessel: string, optionen?: Record<string, unknown>): string {
  return optionen === undefined ? i18n.t(schluessel) : i18n.t(schluessel, optionen)
}

const texte: Readonly<Record<string, unknown>> = profilRessourcen

const MINUTE = 60_000
const STUNDE = 60 * MINUTE
const JETZT = new Date(2026, 8, 25, 15, 4, 30).getTime()

function eintrag(teil: Partial<VerlaufEintrag> & Pick<VerlaufEintrag, 'id'>): VerlaufEintrag {
  return { zeitpunkt: JETZT, art: 'nutzer', status: 'angewendet', beschreibung: 'journal.person_feld_gesetzt', rueckgaengigMoeglich: true, anzahl: 1, ...teil }
}

describe('Vollständigkeit (aus kernangaben, keine eigene Berechnung)', () => {
  const kernangaben: PersonDetailKernangaben = {
    erfuellt: 5,
    anwendbar: 8,
    prozent: 62,
    fehlend: ['todesort', 'vater', 'mutter'],
    aufschluesselung: [
      { id: 'name', zustand: 'belegt' },
      { id: 'geschlecht', zustand: 'vorhanden' },
      { id: 'geburtsdatum', zustand: 'belegt' },
      { id: 'geburtsort', zustand: 'vorhanden' },
      { id: 'todesdatum', zustand: 'vorhanden' },
      { id: 'todesort', zustand: 'unbelegt' },
      { id: 'vater', zustand: 'fehlt' },
      { id: 'mutter', zustand: 'fehlt' },
    ],
  }

  it('Zeilen = Aufschlüsselung (Id, Zustand, Reihenfolge), Zahlen unverändert durchgereicht', () => {
    const anzeige = vollstaendigkeitAnzeige(kernangaben)
    expect(anzeige).not.toBeNull()
    expect(anzeige?.zeilen.map((zeile) => [zeile.id, zeile.zustand])).toEqual(kernangaben.aufschluesselung.map((e) => [e.id, e.zustand]))
    expect(anzeige?.prozent).toBe(62)
    expect(anzeige?.erfuellt).toBe(5)
    expect(anzeige?.anwendbar).toBe(8)
  })

  it('„belegt" zählt nur Zeilen mit Zustand belegt (nicht vorhanden/erfasst)', () => {
    expect(vollstaendigkeitAnzeige(kernangaben)?.belegt).toBe(2)
    expect(vollstaendigkeitAnzeige({ ...kernangaben, aufschluesselung: [{ id: 'elternteil', zustand: 'belegt' }, { id: 'elternteil', zustand: 'fehlt' }] })?.belegt).toBe(1)
  })

  it('Platzhalter (kernangaben null) → keine Anzeige, kein 0 %', () => {
    expect(vollstaendigkeitAnzeige(null)).toBeNull()
  })

  it('Zustandswörter: belegt → „belegt", vorhanden → „erfasst", unbelegt → „Beleg fehlt", fehlt → „fehlt"', () => {
    expect(t(kernangabeZustandSchluessel('belegt'), { ns: 'profil' })).toBe('belegt')
    expect(t(kernangabeZustandSchluessel('vorhanden'), { ns: 'profil' })).toBe('erfasst')
    expect(t(kernangabeZustandSchluessel('unbelegt'), { ns: 'profil' })).toBe('Beleg fehlt')
    expect(t(kernangabeZustandSchluessel('fehlt'), { ns: 'profil' })).toBe('fehlt')
  })

  it('jede Kernangabe und jeder Zustand hat einen Text in profil.json', () => {
    for (const id of KERNANGABE_IDS) expect(typeof texte[kernangabeNameSchluessel(id)]).toBe('string')
    for (const zustand of KERNANGABE_ZUSTAENDE) expect(typeof texte[kernangabeZustandSchluessel(zustand)]).toBe('string')
  })

  it('Zeile und Prozent nach Vorgabe; „x % der Kernangaben belegt" kommt nirgends vor', () => {
    expect(t('vollstaendigkeit_zeile', { ns: 'profil', erfuellt: 5, anwendbar: 8, belegt: 2 })).toBe('5 von 8 Kernangaben · 2 belegt')
    expect(t('vollstaendigkeit_prozent', { ns: 'profil', prozent: 62 })).toBe('62 %')
    for (const wert of Object.values(texte)) expect(String(wert)).not.toMatch(/der Kernangaben belegt/)
  })
})

describe('Offene Punkte', () => {
  const kind = (id: string, anzeigename: string): PersonDetailBeziehung => ({ person_id: id, anzeigename, richtung: 'kind', kantentyp: 'biologisch', ist_platzhalter: false })
  const punkt = (teil: Partial<PersonDetailOffenerPunkt>): PersonDetailOffenerPunkt => ({
    regel_id: 'kind_ohne_partnerschaft',
    reiter: 'beziehungen',
    feld: 'kinder',
    meldungsschluessel: 'offener_punkt_kind_ohne_partnerschaft',
    bezug_id: null,
    ...teil,
  })

  it('Mehrfachpunkte: Name ergänzt, wenn bezug_id eine Person in beziehungen ist; sonst ohne Zusatz, mehrfach', () => {
    const zeilen = offenePunkteZeilen(
      [punkt({ bezug_id: 'k1' }), punkt({ bezug_id: 'k2' }), punkt({ bezug_id: 'unbekannt' }), punkt({ bezug_id: 'unbekannt' })],
      [kind('k1', 'Anna Muster'), kind('k2', '  ')],
    )
    expect(zeilen.map((zeile) => zeile.bezugName)).toEqual(['Anna Muster', null, null, null])
    expect(zeilen).toHaveLength(4)
  })

  it('Reihenfolge, Reiter, Feld und Schlüssel wie geliefert', () => {
    const zeilen = offenePunkteZeilen(
      [
        punkt({ regel_id: 'sterbeort_fehlt', reiter: 'person', feld: 'todesort', meldungsschluessel: 'offener_punkt_sterbeort_fehlt' }),
        punkt({ regel_id: 'elternteil_nicht_zugeordnet', feld: 'eltern', meldungsschluessel: 'offener_punkt_vater_nicht_zugeordnet' }),
      ],
      [],
    )
    expect(zeilen.map((zeile) => [zeile.reiter, zeile.feld, zeile.meldungsschluessel])).toEqual([
      ['person', 'todesort', 'offener_punkt_sterbeort_fehlt'],
      ['beziehungen', 'eltern', 'offener_punkt_vater_nicht_zugeordnet'],
    ])
  })

  it('Sprungziel: das Feld, wenn der Reiter es rendert, sonst der Inhaltsbereich', () => {
    const vorhanden = new Map([
      ['p-feld-todesort', 'FELD'],
      ['p-inhalt', 'PANEL'],
    ])
    const finde = (id: string) => vorhanden.get(id) ?? null
    expect(sprungzielElement(editorFeldId('p', 'todesort'), 'p-inhalt', finde)).toBe('FELD')
    expect(sprungzielElement(editorFeldId('p', 'eltern'), 'p-inhalt', finde)).toBe('PANEL')
    expect(sprungzielElement(editorFeldId('p', 'eltern'), 'fehlt', finde)).toBeNull()
  })

  it('editorFeldId: eindeutig je Feld, DOM-tauglich, mit Präfix', () => {
    const ids = EDITOR_FELDER.map((feld) => editorFeldId('person-bearbeiten', feld))
    expect(new Set(ids).size).toBe(EDITOR_FELDER.length)
    for (const id of ids) expect(id).toMatch(/^person-bearbeiten-feld-[a-z]+$/)
  })
})

describe('Verlauf — Text', () => {
  const PFAD = '/Users/erna/Ahnen/import-wruck.json'

  it('Import: „Import · n Änderungen", nie der Dateipfad aus der Beschreibung', () => {
    const text = verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', art: 'import', beschreibung: `Import ${PFAD}`, anzahl: 5 })), t)
    expect(text).toBe('Import · 5 Änderungen')
    expect(text).not.toContain(PFAD)
    expect(text).not.toContain('/')
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'b', art: 'import', beschreibung: `Import ${PFAD}`, anzahl: 1 })), t)).toBe('Import · 1 Änderung')
  })

  it('Großimport ohne Journal (anzahl 0): „Import" ohne Zahl, ohne Pfad', () => {
    const text = verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', art: 'import', beschreibung: `Großimport ${PFAD}`, anzahl: 0 })), t)
    expect(text).toBe('Import')
  })

  it('nur Gesundheitsdaten (beschreibung null, M-08): „Geschützte Angaben geändert"', () => {
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', beschreibung: null })), t)).toBe('Geschützte Angaben geändert')
  })

  it('journal.*-Schlüssel → übersetzter Satz (dieselbe Funktion wie das Undo-Menü)', () => {
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', beschreibung: 'journal.person_feld_gesetzt' })), t)).toBe('Personenfeld geändert')
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', art: 'wartung', beschreibung: 'journal.aufgeraeumt' })), t)).toBe('Journal aufgeräumt')
  })

  it('freier Text / fremder Namensraum wird nicht gezeigt, sondern die Art', () => {
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', art: 'merge', beschreibung: `Zusammenführung ${PFAD}` })), t)).toBe('Zusammenführung')
    expect(verlaufTextUebersetzen(verlaufText(eintrag({ id: 'a', beschreibung: 'menue.datei' })), t)).toBe('Änderung')
  })
})

describe('Verlauf — Filter und Kürzung', () => {
  it('zurückgenommene und verworfene Einträge fallen heraus, danach auf drei gekürzt', () => {
    const eintraege = [
      eintrag({ id: 'z1', status: 'zurueckgenommen' }),
      eintrag({ id: 'a1' }),
      eintrag({ id: 'v1', status: 'verworfen' }),
      eintrag({ id: 'a2' }),
      eintrag({ id: 'a3' }),
      eintrag({ id: 'a4' }),
    ]
    expect(verlaufZeilen(eintraege, JETZT).map((zeile) => zeile.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('Abfrage mit Vorrat über der Anzeigezahl', () => {
    expect(VERLAUF_ANZEIGE_ANZAHL).toBe(3)
    expect(VERLAUF_ABFRAGE_GRENZE).toBeGreaterThan(VERLAUF_ANZEIGE_ANZAHL)
  })
})

describe('Verlauf — Zeit', () => {
  it('unter 24 Stunden relativ (Formen des Speicherstatus)', () => {
    expect(verlaufZeitUebersetzen(verlaufZeit(JETZT - 10_000, JETZT), t)).toBe('gerade eben')
    expect(verlaufZeitUebersetzen(verlaufZeit(JETZT - 5 * MINUTE, JETZT), t)).toBe('vor 5 Minuten')
    expect(verlaufZeitUebersetzen(verlaufZeit(JETZT - (24 * STUNDE - 1), JETZT), t)).toBe('vor 23 Stunden')
  })

  it('ab 24 Stunden absolut: Datum + Uhrzeit in Ortszeit', () => {
    const zeitpunkt = new Date(2026, 8, 3, 9, 5).getTime()
    expect(verlaufZeitUebersetzen(verlaufZeit(zeitpunkt, JETZT), t)).toBe('03.09.2026, 09:05')
    const genau24 = JETZT - 24 * STUNDE
    expect(verlaufZeit(genau24, JETZT)).toEqual({ art: 'absolut', zeitpunkt: genau24 })
  })

  it('kein Benutzername, nur Zeit und Text je Zeile', () => {
    const [zeile] = verlaufZeilen([eintrag({ id: 'a' })], JETZT)
    expect(Object.keys(zeile ?? {}).sort()).toEqual(['id', 'text', 'zeit'])
  })
})
