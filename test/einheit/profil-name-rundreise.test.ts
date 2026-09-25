// AP-1.30 PR 2a (Bugfix Namens-Rundreise): `befehl:name.aendern` ersetzt die GANZE Form — ein nicht
// mitgeschicktes optionales Feld wird NULL (bzw. `original_text` wird neu montiert). Die Profil-
// Oberfläche liest `abfrage:person.detail` (`PersonDetailName`), baut daraus ihren Bearbeitungszustand
// (`namenEintragAusPersonDetailName`) und schickt ihn per `nameAendernEinAusEintrag` zurück. Vor dem
// Fix trug das Lesemodell nur die sichtbaren Felder — jede Namensänderung im Profil löschte `sprache`,
// `umschriftVon`/`umschriftNorm`, `rufnameIndex`, `gueltigVon`/`gueltigBis` still und überschrieb eine
// wortgetreu erfasste Schreibung (`original_text`) mit der Montage der Bestandteile.
//
// Eiserne Regel §5: rot gegen den unveränderten Stand, grün nach dem Fix. Der Vollständigkeitstest
// läuft über die Schlüssel des Vertragsschemas von `name.aendern` — ein neuer Vertragsschlüssel ohne
// Rundreise (Lesemodell → Profil → Befehl) macht ihn rot.
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
import * as nameRepo from '../../src/main/repositories/name-repo'
import * as nameFormRepo from '../../src/main/repositories/name-form-repo'
import * as namePartRepo from '../../src/main/repositories/name-part-repo'
import { nameAendernEinSchema, type NameAendernEin, type NameAnlegenEin } from '../../src/shared/schemata/befehle'
import {
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

/** Schlüssel, die `name.aendern` BEWUSST nicht schreibt — mit Begründung. Alles andere muss rundreisen.
 * - `id`: Identität der Form, kein Wert; wird nicht geändert, sondern adressiert.
 * - `istBevorzugt`: AP-1.33 — der Hauptname-Wechsel läuft über `befehl:hauptname.wechseln`
 *   (`name-aendern.ts`, `name-repo.aktualisieren`: „`ist_bevorzugt` bleibt unberührt"). */
const BEWUSST_IGNORIERT: ReadonlySet<string> = new Set(['id', 'istBevorzugt'])

/** Vertragsschlüssel OHNE eigene Spalte — sie tragen keinen Wert der Form:
 * - `id`: s. oben.
 * - `feld`: AP-1.30 PR 4 — nennt nur, welches Feld ein Autosave-Aufruf ändern will (Koaleszenz-
 *   schlüssel, `src/main/befehle/koaleszenz-schluessel.ts`); wird nicht gespeichert. */
const KEIN_SPALTENWERT: ReadonlySet<string> = new Set(['id', 'feld'])

/** Je Vertragsschlüssel ein Nicht-Standardwert. Der Typ erzwingt Vollständigkeit schon beim Übersetzen
 * (ein neuer optionaler Schlüssel in `NameAendernEin` fehlt hier -> `pnpm typen` rot); die Laufzeit-
 * prüfung unten gleicht zusätzlich gegen die Schema-`shape` ab. Werte so gewählt, dass keiner davon
 * aus den anderen folgt: `rufnameIndex` 2 zeigt auf den ZWEITEN „Johann" (ohne Index markierte die
 * Zerlegung den ersten), `originalText` ist eine wortgetreue Schreibung, die NICHT der Montage entspricht.
 * `umschriftVon` verweist auf eine andere `name_form` (Selbstverweis, 0006) — darum als Parameter. */
function nichtStandard(umschriftVon: string): { readonly [K in Exclude<keyof NameAendernEin, 'id' | 'feld'>]-?: Exclude<NameAendernEin[K], undefined> } {
  return {
  typ: 'aka',
  schrift: 'cyrl',
  umschriftVon,
  umschriftNorm: 'iso9',
  vornamen: 'Johann Georg Johann',
  rufnameIndex: 2,
  rufnameText: 'Johann',
  nachname: 'Müller',
  praefix: 'von',
  titelVor: 'Dr.',
  zusatzNach: 'd. Ä.',
  originalText: 'Joh. Georg Müller alias Miller',
  sprache: 'de',
  istBevorzugt: 1,
  gueltigVon: 17500101,
  gueltigBis: 17991231,
  vatersname: 'Petrowitsch',
  }
}

/** camelCase-Vertragsschlüssel -> snake_case-Spalte der flachen Namenssicht (`nameRepo.lesen`). */
function spalteFuer(schluessel: string): string {
  return schluessel.replace(/[A-Z]/gu, (buchstabe) => `_${buchstabe.toLowerCase()}`)
}

function vertragsSchluessel(): readonly string[] {
  if (!(nameAendernEinSchema instanceof z.ZodObject)) {
    throw new Error('nameAendernEinSchema ist kein z.object — Schlüssel nicht bestimmbar.')
  }
  return Object.keys(nameAendernEinSchema.shape)
}

function flachLesen(db: Db, id: string): Readonly<Record<string, unknown>> {
  const zeile = nameRepo.lesen(db, id)
  if (zeile === undefined) throw new Error(`Form ${id} fehlt.`)
  return { ...zeile }
}

function teileOhneNachname(db: Db, id: string): readonly string[] {
  return namePartRepo
    .teileFuerForm(db, id)
    .filter((teil) => teil.art !== 'nachname')
    .map((teil) => JSON.stringify([teil.art, teil.wert, teil.ist_rufname, teil.sortier_index, teil.feminine_variante]))
    .sort()
}

/** Die Profil-Rundreise: Lesen (personDetail) -> Bearbeitungszustand -> EINE sichtbare Änderung -> Befehl. */
function profilAendern(db: Db, personId: string, nameId: string, aendern: (eintrag: ReturnType<typeof namenEintragAusPersonDetailName>) => ReturnType<typeof namenEintragAusPersonDetailName>): void {
  const name = personDetail(db, { personId }).namen.find((kandidat) => kandidat.id === nameId)
  if (name === undefined) throw new Error(`Name ${nameId} fehlt im Lesemodell.`)
  const eintrag = aendern(namenEintragAusPersonDetailName(name))
  fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(name.id, eintrag))
}

function formAnlegen(db: Db, personId: string, werte: Omit<NameAnlegenEin, 'personId'>): string {
  return fuehreAus(db, 'name.anlegen', { personId, ...werte }).id
}

/** Eine Ausgangsform, auf die `umschriftVon` verweisen kann (die spätere Umschrift ist NICHT bevorzugt). */
function quellformAnlegen(db: Db, personId: string): string {
  return formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Иван', nachname: 'Мюллер', schrift: 'cyrl' })
}

describe('Profil-Namensänderung erhält alle Felder der Form (AP-1.30 PR 2a)', () => {
  it('Vollständigkeit: jeder Vertragsschlüssel von name.aendern hat einen Nicht-Standardwert und eine Spalte', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const werte = nichtStandard(quellformAnlegen(db, personId))
      const id = formAnlegen(db, personId, werte)
      const flach = flachLesen(db, id)
      for (const schluessel of vertragsSchluessel()) {
        if (KEIN_SPALTENWERT.has(schluessel)) continue
        expect(Object.keys(werte), `kein Nicht-Standardwert für ${schluessel}`).toContain(schluessel)
        expect(Object.keys(flach), `keine Spalte in der flachen Namenssicht für ${schluessel}`).toContain(spalteFuer(schluessel))
      }
    } finally {
      db.close()
    }
  })

  it('Vollständigkeit: nach einer Nachnamen-Änderung im Profil sind alle übrigen Vertragsfelder bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, nichtStandard(quellformAnlegen(db, personId)))
      const vorher = flachLesen(db, id)
      const formVorher = nameFormRepo.lesen(db, id)
      const teileVorher = teileOhneNachname(db, id)

      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))

      const nachher = flachLesen(db, id)
      expect(nachher['nachname']).toBe('Miller')
      for (const schluessel of vertragsSchluessel()) {
        if (BEWUSST_IGNORIERT.has(schluessel) || schluessel === 'nachname') continue
        const spalte = spalteFuer(schluessel)
        expect(nachher[spalte], `Feld ${schluessel} (${spalte}) nach Profil-Änderung verändert`).toStrictEqual(vorher[spalte])
      }
      // Rohzeilen zusätzlich: die ganze name_form (auch Spalten außerhalb des flachen Vertrags) und
      // alle Bestandteile außer dem geänderten Nachnamen.
      const formNachher = nameFormRepo.lesen(db, id)
      expect(formNachher).toStrictEqual(formVorher)
      expect(teileOhneNachname(db, id)).toStrictEqual(teileVorher)
    } finally {
      db.close()
    }
  })

  it('Einzelfelder: sprache, umschriftVon, umschriftNorm, gueltigVon/Bis bleiben nach Nachnamen-Änderung', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const quelle = quellformAnlegen(db, personId)
      const id = formAnlegen(db, personId, {
        typ: 'geburtsname',
        vornamen: 'Anna',
        nachname: 'Müller',
        sprache: 'pl',
        umschriftVon: quelle,
        umschriftNorm: 'din1460',
        gueltigVon: 18000101,
        gueltigBis: 18501231,
      })
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))
      const zeile = nameRepo.lesen(db, id)
      expect(zeile?.sprache).toBe('pl')
      expect(zeile?.umschrift_von).toBe(quelle)
      expect(zeile?.umschrift_norm).toBe('din1460')
      expect(zeile?.gueltig_von).toBe(18000101)
      expect(zeile?.gueltig_bis).toBe(18501231)
    } finally {
      db.close()
    }
  })

  it('Einzelfeld rufnameIndex: der Rufname bleibt auf dem zweiten von zwei gleichen Vornamen', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Johann Georg Johann', rufnameIndex: 2, nachname: 'Müller' })
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))
      expect(nameRepo.lesen(db, id)?.rufname_index).toBe(2)
    } finally {
      db.close()
    }
  })

  it('Einzelfeld originalText: eine wortgetreue Schreibung bleibt nach Nachnamen-Änderung erhalten', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, {
        typ: 'geburtsname',
        vornamen: 'Johann Georg',
        nachname: 'Müller',
        originalText: 'Joh. Georg Müller alias Miller',
      })
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Joh. Georg Müller alias Miller')
    } finally {
      db.close()
    }
  })

  it('originalText automatisch montiert: wird bei geänderten Teilen neu montiert', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, { typ: 'geburtsname', titelVor: 'Dr.', vornamen: 'Johann  Georg', nachname: 'Müller' })
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Dr. Johann  Georg Müller')
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Dr. Johann Georg Miller')
    } finally {
      db.close()
    }
  })

  it('originalText automatisch montiert mit angehängtem Rufnamen: wird bei geänderten Teilen neu montiert', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      // `rufnameText` ist kein vorhandener Vorname -> die Zerlegung hängt ihn als markierten Vornamen an,
      // die Montage beim Anlegen kannte ihn aber nicht („Johann Müller").
      const id = formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Johann', rufnameText: 'Hans', nachname: 'Müller' })
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Johann Müller')
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Miller' }))
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Johann Hans Miller')
    } finally {
      db.close()
    }
  })

  it('rufnameIndex folgt einer Rufname-Änderung im Profil (der alte Index gewinnt nicht gegen den neuen Text)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Johann Georg', rufnameText: 'Georg', nachname: 'Müller' })
      expect(nameRepo.lesen(db, id)?.rufname_index).toBe(1)
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, rufname: 'Johann' }))
      const zeile = nameRepo.lesen(db, id)
      expect(zeile?.rufname_index).toBe(0)
      expect(zeile?.rufname_text).toBe('Johann')
    } finally {
      db.close()
    }
  })
})

// AP-1.30 PR 3 (docs/80 §32 V-3-flache-bruecke-vatersname): der Vatersname übersteht die Profil-
// Rundreise — auch ein Altbestands-Teil, der NICHT über die Brücke geschrieben wurde.
function vatersnameWerte(db: Db, id: string): readonly string[] {
  return namePartRepo
    .teileFuerForm(db, id)
    .filter((teil) => teil.art === 'vatersname')
    .map((teil) => teil.wert)
}

describe('Profil-Namensänderung erhält den Vatersnamen (AP-1.30 PR 3)', () => {
  it('über name.anlegen geschriebener Vatersname bleibt nach Nachnamen-Änderung im Profil', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' })
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Iwanowa' }))
      expect(vatersnameWerte(db, id)).toStrictEqual(['Petrowitsch'])
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Iwan Petrowitsch Iwanowa')
    } finally {
      db.close()
    }
  })

  it('Altbestand: ein direkt eingefügter Vatersname-Teil bleibt nach Nachnamen-Änderung im Profil', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const id = formAnlegen(db, personId, { typ: 'geburtsname', vornamen: 'Iwan', nachname: 'Iwanow', originalText: 'Iwan Petrowitsch Iwanow' })
      journalAus(db, 'Testvorbereitung (AP-1.30 PR 3): Altbestands-Vatersname ohne Befehl einfügen.')
      namePartRepo.einfuegen(db, {
        id: 'altbestand-vatersname',
        nameFormId: id,
        art: 'vatersname',
        wert: 'Petrowitsch',
        istRufname: 0,
        sortierIndex: 0,
        feminineVariante: null,
        erstelltAm: 1,
        geaendertAm: 1,
      })
      journalAn(db)
      profilAendern(db, personId, id, (eintrag) => ({ ...eintrag, nachname: 'Iwanowa' }))
      expect(vatersnameWerte(db, id)).toStrictEqual(['Petrowitsch'])
      expect(nameRepo.lesen(db, id)?.original_text).toBe('Iwan Petrowitsch Iwanowa')
    } finally {
      db.close()
    }
  })
})
