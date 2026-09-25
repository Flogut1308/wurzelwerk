// AP-1.30 (PR 4): je Autosave-Befehl (`src/shared/autosave.ts::AUTOSAVE_BEFEHLE`) ein Szenario über
// den ECHTEN Befehlsbus — gemeinsam genutzt von `test/einheit/koaleszenz-autosave.test.ts` (A:
// Koaleszenz + Undo) und `test/einheit/autosave-befehle-struktur.test.ts` (C: jeder Autosave-Befehl
// vergibt für eine Ein-Feld-Änderung einen Schlüssel). `SZENARIEN` ist über `AutosaveBefehl`
// indiziert: ein neuer Eintrag in `AUTOSAVE_BEFEHLE` ohne Szenario ist ein Typfehler.
//
// Jedes Szenario legt ZWEI Subjekte an (für die Gegenprobe „anderes Subjekt") und liefert
// Schreib-/Schlüsselfunktionen je `Ziel`. Die ersetzenden Befehle bekommen stets den vollständigen
// aktuellen Stand plus die eine Änderung — so ändert `ziel = 'feld'` wirklich nur eine Spalte.
import { fuehreAus } from '../../src/main/befehle/bus'
import { REGISTRIERUNG, type BefehlEin } from '../../src/main/befehle/registrierung'
import type { Tx } from '../../src/main/repositories/basis'
import * as nameRepo from '../../src/main/repositories/name-repo'
import type { AutosaveBefehl } from '../../src/shared/autosave'
import {
  nameAendernEinSchema,
  type AussageAendernEin,
  type ElternschaftAendernEin,
  type EreignisAendernEin,
  type NameAendernEin,
  type PartnerschaftAendernEin,
  type PersonFeldSetzenEin,
} from '../../src/shared/schemata/befehle'

/**
 * - `feld`: die Ein-Feld-Änderung am ersten Subjekt (mit gesetztem `feld`, wo der Vertrag es kennt).
 * - `anderesFeld`: eine Ein-Feld-Änderung an einer anderen Spalte desselben Subjekts.
 * - `anderesSubjekt`: dieselbe Spalte am zweiten Subjekt.
 * - `zweiSpalten`: zwei Spalten ändern sich, `feld` nennt nur eine (keine Koaleszenz erlaubt).
 * - `ohneFeld`: wie `feld`, aber ohne Vertragsfeld `feld` (keine Koaleszenz erlaubt).
 */
export type Ziel = 'feld' | 'anderesFeld' | 'anderesSubjekt' | 'zweiSpalten' | 'ohneFeld'

export interface AutosaveLauf {
  /** Schreibt den `i`-ten Wert (i ≥ 1, je Aufruf verschieden) über `fuehreAus`. */
  readonly schreiben: (i: number, ziel: Ziel) => void
  /** Der Schlüssel, den die Registrierung für den `i`-ten Aufruf im jetzigen Stand vergäbe. */
  readonly schluessel: (i: number, ziel: Ziel) => string | null
  /** `Befehl:Subjekt:Feld` des ersten Subjekts. */
  readonly erwarteterSchluessel: string
}

export interface AutosaveSzenario {
  readonly befehl: AutosaveBefehl
  /** `false`, wo der Vertrag nur eine Spalte je Aufruf kennt (`person.feldSetzen`). */
  readonly zweiSpaltenMoeglich: boolean
  /** `false`, wo der Vertrag kein optionales `feld` hat (`person.feldSetzen`: `feld` ist Pflicht). */
  readonly ohneFeldMoeglich: boolean
  readonly aufbauen: (db: Tx) => AutosaveLauf
}

function nichtMoeglich(befehl: string, ziel: Ziel): never {
  throw new Error(`autosave-szenarien: Ziel "${ziel}" ist für ${befehl} nicht vorgesehen.`)
}

function neuePerson(db: Tx): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

function schluesselVon<N extends AutosaveBefehl>(db: Tx, befehl: N, ein: BefehlEin<N>): string | null {
  const def = REGISTRIERUNG[befehl]
  const fn = def.koaleszenzSchluessel
  if (fn === undefined) return null
  return fn(db, def.schema.parse(ein))
}

// -----------------------------------------------------------------------------------------------

const personFeldSetzen: AutosaveSzenario = {
  befehl: 'person.feldSetzen',
  zweiSpaltenMoeglich: false,
  ohneFeldMoeglich: false,
  aufbauen: (db) => {
    const a = neuePerson(db)
    const b = neuePerson(db)
    const ein = (i: number, ziel: Ziel): PersonFeldSetzenEin => {
      switch (ziel) {
        case 'feld':
          return { id: a, feld: 'notiz', wert: `Notiz ${i}` }
        case 'anderesFeld':
          return { id: a, feld: 'geschlecht', wert: i % 2 === 1 ? 'M' : 'F' }
        case 'anderesSubjekt':
          return { id: b, feld: 'notiz', wert: `Notiz ${i}` }
        default:
          return nichtMoeglich('person.feldSetzen', ziel)
      }
    }
    return {
      schreiben: (i, ziel) => fuehreAus(db, 'person.feldSetzen', ein(i, ziel)),
      schluessel: (i, ziel) => schluesselVon(db, 'person.feldSetzen', ein(i, ziel)),
      erwarteterSchluessel: `person.feldSetzen:${a}:notiz`,
    }
  },
}

/** Vollständiger aktueller Stand einer Form als `name.aendern`-Nutzlast (ohne `feld`), gelesen aus
 * dem Repository — so trägt der Aufruf exakt die gespeicherten Werte (auch den rekonstruierten
 * `rufnameText`), und nur die eine gewollte Änderung unterscheidet sich. `originalText` bleibt
 * aus: er ist hier stets die automatische Montage (s. `name-aendern.ts`). */
function nameStand(db: Tx, id: string): NameAendernEin {
  const zeile = nameRepo.lesen(db, id)
  if (zeile === undefined) throw new Error(`autosave-szenarien: Namensform ${id} fehlt.`)
  return nameAendernEinSchema.parse({
    id,
    typ: zeile.typ,
    schrift: zeile.schrift ?? undefined,
    umschriftVon: zeile.umschrift_von ?? undefined,
    umschriftNorm: zeile.umschrift_norm ?? undefined,
    vornamen: zeile.vornamen ?? undefined,
    rufnameIndex: zeile.rufname_index ?? undefined,
    rufnameText: zeile.rufname_text ?? undefined,
    nachname: zeile.nachname ?? undefined,
    praefix: zeile.praefix ?? undefined,
    titelVor: zeile.titel_vor ?? undefined,
    zusatzNach: zeile.zusatz_nach ?? undefined,
    vatersname: zeile.vatersname ?? undefined,
    sprache: zeile.sprache ?? undefined,
    gueltigVon: zeile.gueltig_von ?? undefined,
    gueltigBis: zeile.gueltig_bis ?? undefined,
  })
}

export function nameAnlegenMitRufname(db: Tx, personId: string, typ: 'geburtsname' | 'ehename'): string {
  return fuehreAus(db, 'name.anlegen', { personId, typ, vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Müller' }).id
}

export { nameStand }

const nameAendern: AutosaveSzenario = {
  befehl: 'name.aendern',
  zweiSpaltenMoeglich: true,
  ohneFeldMoeglich: true,
  aufbauen: (db) => {
    const p = neuePerson(db)
    const a = nameAnlegenMitRufname(db, p, 'geburtsname')
    const b = nameAnlegenMitRufname(db, p, 'ehename')
    const ein = (i: number, ziel: Ziel): NameAendernEin => {
      switch (ziel) {
        case 'feld':
          return { ...nameStand(db, a), nachname: `Müller${i}`, feld: 'nachname' }
        case 'ohneFeld':
          return { ...nameStand(db, a), nachname: `Müller${i}` }
        case 'anderesFeld':
          return { ...nameStand(db, a), vornamen: `Karl${i} Friedrich`, feld: 'vornamen' }
        case 'anderesSubjekt':
          return { ...nameStand(db, b), nachname: `Müller${i}`, feld: 'nachname' }
        case 'zweiSpalten':
          return { ...nameStand(db, a), nachname: `Müller${i}`, praefix: `von${i}`, feld: 'nachname' }
      }
    }
    return {
      schreiben: (i, ziel) => fuehreAus(db, 'name.aendern', ein(i, ziel)),
      schluessel: (i, ziel) => schluesselVon(db, 'name.aendern', ein(i, ziel)),
      erwarteterSchluessel: `name.aendern:${a}:nachname`,
    }
  },
}

const ereignisAendern: AutosaveSzenario = {
  befehl: 'ereignis.aendern',
  zweiSpaltenMoeglich: true,
  ohneFeldMoeglich: true,
  aufbauen: (db) => {
    const p = neuePerson(db)
    const anlegen = (): string =>
      fuehreAus(db, 'ereignis.anlegen', { typ: 'beruf', beschreibung: 'Start', beteiligungen: [{ personId: p, rolle: 'hauptperson' }], konfidenz: 3 }).id
    const a = anlegen()
    const b = anlegen()
    const stand = new Map<string, EreignisAendernEin>([
      [a, { id: a, typ: 'beruf', beschreibung: 'Start' }],
      [b, { id: b, typ: 'beruf', beschreibung: 'Start' }],
    ])
    const von = (id: string): EreignisAendernEin => {
      const s = stand.get(id)
      if (s === undefined) throw new Error('autosave-szenarien: Ereignis fehlt.')
      return s
    }
    const ein = (i: number, ziel: Ziel): EreignisAendernEin => {
      switch (ziel) {
        case 'feld':
          return { ...von(a), beschreibung: `Beschreibung ${i}`, feld: 'beschreibung' }
        case 'ohneFeld':
          return { ...von(a), beschreibung: `Beschreibung ${i}`, feld: undefined }
        case 'anderesFeld':
          return { ...von(a), notiz: `Notiz ${i}`, feld: 'notiz' }
        case 'anderesSubjekt':
          return { ...von(b), beschreibung: `Beschreibung ${i}`, feld: 'beschreibung' }
        case 'zweiSpalten':
          return { ...von(a), beschreibung: `Beschreibung ${i}`, notiz: `Notiz ${i}`, feld: 'beschreibung' }
      }
    }
    return {
      schreiben: (i, ziel) => {
        const e = ein(i, ziel)
        fuehreAus(db, 'ereignis.aendern', e)
        stand.set(e.id, e)
      },
      schluessel: (i, ziel) => schluesselVon(db, 'ereignis.aendern', ein(i, ziel)),
      erwarteterSchluessel: `ereignis.aendern:${a}:beschreibung`,
    }
  },
}

const partnerschaftAendern: AutosaveSzenario = {
  befehl: 'partnerschaft.aendern',
  zweiSpaltenMoeglich: true,
  ohneFeldMoeglich: true,
  aufbauen: (db) => {
    const x = neuePerson(db)
    const y = neuePerson(db)
    const z = neuePerson(db)
    const anlegen = (partner: string): string =>
      fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [
          { personId: x, rolle: 'ehepartner' },
          { personId: partner, rolle: 'ehepartner' },
        ],
        konfidenz: 3,
      }).id
    const a = anlegen(y)
    const b = anlegen(z)
    const stand = new Map<string, PartnerschaftAendernEin>([
      [a, { id: a, typ: 'ehe_zivil' }],
      [b, { id: b, typ: 'ehe_zivil' }],
    ])
    const von = (id: string): PartnerschaftAendernEin => {
      const s = stand.get(id)
      if (s === undefined) throw new Error('autosave-szenarien: Partnerschaft fehlt.')
      return s
    }
    const ein = (i: number, ziel: Ziel): PartnerschaftAendernEin => {
      switch (ziel) {
        case 'feld':
          return { ...von(a), notiz: `Notiz ${i}`, feld: 'notiz' }
        case 'ohneFeld':
          return { ...von(a), notiz: `Notiz ${i}`, feld: undefined }
        case 'anderesFeld':
          return { ...von(a), reihenfolge: i, feld: 'reihenfolge' }
        case 'anderesSubjekt':
          return { ...von(b), notiz: `Notiz ${i}`, feld: 'notiz' }
        case 'zweiSpalten':
          return { ...von(a), notiz: `Notiz ${i}`, reihenfolge: i, feld: 'notiz' }
      }
    }
    return {
      schreiben: (i, ziel) => {
        const e = ein(i, ziel)
        fuehreAus(db, 'partnerschaft.aendern', e)
        stand.set(e.id, e)
      },
      schluessel: (i, ziel) => schluesselVon(db, 'partnerschaft.aendern', ein(i, ziel)),
      erwarteterSchluessel: `partnerschaft.aendern:${a}:notiz`,
    }
  },
}

const elternschaftAendern: AutosaveSzenario = {
  befehl: 'elternschaft.aendern',
  zweiSpaltenMoeglich: true,
  ohneFeldMoeglich: true,
  aufbauen: (db) => {
    const elternteil = neuePerson(db)
    const kind1 = neuePerson(db)
    const kind2 = neuePerson(db)
    const a = fuehreAus(db, 'elternschaft.anlegen', { elternteilId: elternteil, kindId: kind1, typ: 'biologisch', konfidenz: 3 }).id
    const b = fuehreAus(db, 'elternschaft.anlegen', { elternteilId: elternteil, kindId: kind2, typ: 'biologisch', konfidenz: 3 }).id
    const stand = new Map<string, ElternschaftAendernEin>([
      [a, { id: a, typ: 'biologisch' }],
      [b, { id: b, typ: 'biologisch' }],
    ])
    const von = (id: string): ElternschaftAendernEin => {
      const s = stand.get(id)
      if (s === undefined) throw new Error('autosave-szenarien: Elternschaft fehlt.')
      return s
    }
    const ein = (i: number, ziel: Ziel): ElternschaftAendernEin => {
      switch (ziel) {
        case 'feld':
          return { ...von(a), notiz: `Notiz ${i}`, feld: 'notiz' }
        case 'ohneFeld':
          return { ...von(a), notiz: `Notiz ${i}`, feld: undefined }
        case 'anderesFeld':
          return { ...von(a), typ: i % 2 === 1 ? 'adoptiv' : 'biologisch', feld: 'typ' }
        case 'anderesSubjekt':
          return { ...von(b), notiz: `Notiz ${i}`, feld: 'notiz' }
        case 'zweiSpalten':
          return { ...von(a), notiz: `Notiz ${i}`, typ: i % 2 === 1 ? 'adoptiv' : 'biologisch', feld: 'notiz' }
      }
    }
    return {
      schreiben: (i, ziel) => {
        const e = ein(i, ziel)
        fuehreAus(db, 'elternschaft.aendern', e)
        stand.set(e.id, e)
      },
      schluessel: (i, ziel) => schluesselVon(db, 'elternschaft.aendern', ein(i, ziel)),
      erwarteterSchluessel: `elternschaft.aendern:${a}:notiz`,
    }
  },
}

const aussageAendern: AutosaveSzenario = {
  befehl: 'aussage.aendern',
  zweiSpaltenMoeglich: true,
  ohneFeldMoeglich: true,
  aufbauen: (db) => {
    const p = neuePerson(db)
    const anlegen = (): string => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'Bauer', konfidenz: 3 }).id
    const a = anlegen()
    const b = anlegen()
    const stand = new Map<string, AussageAendernEin>([
      [a, { id: a, wertText: 'Bauer', konfidenz: 3 }],
      [b, { id: b, wertText: 'Bauer', konfidenz: 3 }],
    ])
    const von = (id: string): AussageAendernEin => {
      const s = stand.get(id)
      if (s === undefined) throw new Error('autosave-szenarien: Aussage fehlt.')
      return s
    }
    const ein = (i: number, ziel: Ziel): AussageAendernEin => {
      switch (ziel) {
        case 'feld':
          return { ...von(a), wertText: `Bauer ${i}`, feld: 'wertText' }
        case 'ohneFeld':
          return { ...von(a), wertText: `Bauer ${i}`, feld: undefined }
        case 'anderesFeld':
          return { ...von(a), begruendung: `Grund ${i}`, feld: 'begruendung' }
        case 'anderesSubjekt':
          return { ...von(b), wertText: `Bauer ${i}`, feld: 'wertText' }
        case 'zweiSpalten':
          return { ...von(a), wertText: `Bauer ${i}`, begruendung: `Grund ${i}`, feld: 'wertText' }
      }
    }
    return {
      schreiben: (i, ziel) => {
        const e = ein(i, ziel)
        fuehreAus(db, 'aussage.aendern', e)
        stand.set(e.id, e)
      },
      schluessel: (i, ziel) => schluesselVon(db, 'aussage.aendern', ein(i, ziel)),
      erwarteterSchluessel: `aussage.aendern:${a}:wertText`,
    }
  },
}

export const SZENARIEN: { readonly [N in AutosaveBefehl]: AutosaveSzenario } = {
  'person.feldSetzen': personFeldSetzen,
  'name.aendern': nameAendern,
  'ereignis.aendern': ereignisAendern,
  'partnerschaft.aendern': partnerschaftAendern,
  'elternschaft.aendern': elternschaftAendern,
  'aussage.aendern': aussageAendern,
}
