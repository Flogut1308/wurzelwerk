// AP-1.12: `name.anlegen`/`name.aendern`/`name.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster identisch zu
// `test/einheit/befehl-person.test.ts`.
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
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { NameAendernFeldEnum, type NameAendernEin, type NameAendernFeld } from '../../src/shared/schemata/befehle'
import * as nameRepo from '../../src/main/repositories/name-repo'
import type { NameZeile as NameRepoZeile } from '../../src/main/repositories/name-repo'

interface NameZeile {
  readonly id: string
  readonly person_id: string
  readonly typ: string
  readonly nachname: string | null
  readonly vornamen: string | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly geaendert_am: number | null
}

interface AenderungZeile {
  readonly operation: string
}

interface AussageZahl {
  readonly anzahl: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

// AP-1.33: `befehl:name.*` bleibt als flache Kompatibilitäts-Schnittstelle über name_form +
// name_part bestehen (0006_namensformen.sql). `nameLesen` liest die Form und rekonstruiert
// nachname/vornamen aus den Bestandteilen (analog src/main/repositories/name-repo.ts).
function nameLesen(db: ReturnType<typeof oeffnen>, id: string): NameZeile | undefined {
  const form = db
    .prepare<{ readonly id: string }, { readonly id: string; readonly person_id: string; readonly rolle: string | null; readonly umschrift_von: string | null; readonly ist_bevorzugt: 0 | 1; readonly geaendert_am: number | null }>(
      'SELECT id, person_id, rolle, umschrift_von, ist_bevorzugt, geaendert_am FROM name_form WHERE id = @id',
    )
    .get({ id })
  if (form === undefined) return undefined
  const teil = (art: string): string | null => {
    const werte = db
      .prepare<{ readonly id: string; readonly art: string }, { readonly wert: string }>(
        'SELECT wert FROM name_part WHERE name_form_id = @id AND art = @art ORDER BY sortier_index',
      )
      .all({ id, art })
      .map((zeile) => zeile.wert)
    return werte.length > 0 ? werte.join(' ') : null
  }
  return {
    id: form.id,
    person_id: form.person_id,
    typ: form.rolle ?? (form.umschrift_von !== null ? 'transliteriert' : 'sonstiges'),
    nachname: teil('nachname'),
    vornamen: teil('vorname'),
    ist_bevorzugt: form.ist_bevorzugt,
    geaendert_am: form.geaendert_am,
  }
}

// AP-1.33: die „Namenszeile" ist jetzt die `name_form` (Bestandteile liegen separat in `name_part`).
function aenderungenFuerName(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'name_form' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
}

function aussageAnzahlFuerName(db: ReturnType<typeof oeffnen>, nameId: string): number {
  const zeile = db
    .prepare<{ readonly nameId: string }, AussageZahl>(
      `SELECT COUNT(*) AS anzahl FROM aussage WHERE subjekt_typ = 'name' AND subjekt_id = @nameId`,
    )
    .get({ nameId })
  if (zeile === undefined) {
    throw new Error('aussageAnzahlFuerName(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

interface TransaktionZahl {
  readonly anzahl: number
}

function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function neuePerson(db: ReturnType<typeof oeffnen>): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('name.anlegen (AP-1.12)', () => {
  it('legt eine name-Zeile an, genau eine aenderung-Zeile (operation=insert), KEINE Existenz-Aussage', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller', vornamen: 'Anna' })

      const zeile = nameLesen(db, id)
      expect(zeile).toBeDefined()
      expect(zeile?.person_id).toBe(personId)
      expect(zeile?.nachname).toBe('Müller')
      expect(zeile?.vornamen).toBe('Anna')

      expect(aenderungenFuerName(db, id)).toHaveLength(1)
      expect(aenderungenFuerName(db, id)[0]?.operation).toBe('insert')

      expect(aussageAnzahlFuerName(db, id)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende personId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() =>
        fuehreAus(db, 'name.anlegen', { personId: 'nicht-vorhanden', typ: 'geburtsname', nachname: 'X' }),
      )
      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende umschriftVon → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() =>
        fuehreAus(db, 'name.anlegen', { personId, typ: 'transliteriert', nachname: 'Muller', umschriftVon: 'nicht-vorhanden' }),
      )
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo entfernt die angelegte name-Zeile wieder, Redo legt sie bitgleich erneut an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller', vornamen: 'Anna' })
      const nachAnlegen = nameLesen(db, id)
      expect(nachAnlegen).toBeDefined()

      undo(db)
      expect(nameLesen(db, id)).toBeUndefined()

      redo(db)
      expect(nameLesen(db, id)).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })
})

describe('name.aendern (AP-1.12)', () => {
  it('ändert nachname/vornamen, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const vorher = nameLesen(db, id)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', nachname: 'Müller-Schmidt', vornamen: 'Anna' })

      const nachher = nameLesen(db, id)
      expect(nachher?.nachname).toBe('Müller-Schmidt')
      expect(nachher?.vornamen).toBe('Anna')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerName(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', nachname: 'Müller' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerName(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'name.aendern', { id: 'nicht-vorhanden', typ: 'geburtsname', nachname: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt den vorherigen Namen bitgleich wieder her, Redo den geänderten', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller', vornamen: 'Anna' })
      const vorAendern = nameLesen(db, id)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', nachname: 'Müller-Schmidt', vornamen: 'Anna' })
      const nachAendern = nameLesen(db, id)

      undo(db)
      expect(nameLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(nameLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})

describe('name.loeschen (AP-1.12)', () => {
  it('löscht die name-Zeile, trägt genau eine weitere aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })

      fuehreAus(db, 'name.loeschen', { id })

      expect(nameLesen(db, id)).toBeUndefined()
      const aenderungen = aenderungenFuerName(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'name.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die gelöschte name-Zeile bitgleich wieder her, Redo löscht sie erneut', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const vorLoeschen = nameLesen(db, id)

      fuehreAus(db, 'name.loeschen', { id })
      expect(nameLesen(db, id)).toBeUndefined()

      undo(db)
      expect(nameLesen(db, id)).toEqual(vorLoeschen)

      redo(db)
      expect(nameLesen(db, id)).toBeUndefined()
    } finally {
      db.close()
    }
  })
  // AP-1.33 PR-B-Folgepunkt (hueter E3): `loeschenMitNachruecken` (name-form-repo.ts) rückt beim
  // Löschen der bevorzugten Form DETERMINISTISCH die verbliebene Form mit der niedrigsten `id` nach.
  // Die Invariante „genau ein Hauptname" zählt nur und `undo-bitgleich` ist symmetrisch — eine
  // Mutation auf „höchste id" überlebte beide. Mit drei Formen bleiben zwei Kandidaten übrig; `typ`
  // und `nachname` laufen bewusst GEGEN die id-Reihenfolge (die früher angelegte Form hat die
  // kleinere UUIDv7, aber den alphabetisch späteren `typ`/`nachname`), damit auch ein Nachrücken nach
  // Rolle oder Nachname rot wird (hueter #110, H1).
  it('Löschen der bevorzugten Form rückt die verbliebene Form mit der niedrigsten id nach', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id: hauptform } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const { id: formB } = fuehreAus(db, 'name.anlegen', { personId, typ: 'vulgo', nachname: 'Zander' })
      const { id: formC } = fuehreAus(db, 'name.anlegen', { personId, typ: 'ehename', nachname: 'Adler' })
      expect(nameLesen(db, hauptform)?.ist_bevorzugt).toBe(1)
      const [niedrigste, hoechste] = [formB, formC].sort()
      if (niedrigste === undefined || hoechste === undefined) {
        throw new Error('unerreichbar: zwei Formen angelegt.')
      }

      fuehreAus(db, 'name.loeschen', { id: hauptform })

      expect(nameLesen(db, niedrigste)?.ist_bevorzugt).toBe(1)
      expect(nameLesen(db, hoechste)?.ist_bevorzugt).toBe(0)
    } finally {
      db.close()
    }
  })
})

describe('hauptname.wechseln (AP-1.33)', () => {
  it('erste Form ist bevorzugt, zweite nicht; der Wechsel stellt um, Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id: formA } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const { id: formB } = fuehreAus(db, 'name.anlegen', { personId, typ: 'ehename', nachname: 'Schmidt' })
      expect(nameLesen(db, formA)?.ist_bevorzugt).toBe(1) // erste Form
      expect(nameLesen(db, formB)?.ist_bevorzugt).toBe(0) // zweite Form

      fuehreAus(db, 'hauptname.wechseln', { personId, alt: formA, neu: formB })
      expect(nameLesen(db, formA)?.ist_bevorzugt).toBe(0)
      expect(nameLesen(db, formB)?.ist_bevorzugt).toBe(1)

      undo(db)
      expect(nameLesen(db, formA)?.ist_bevorzugt).toBe(1)
      expect(nameLesen(db, formB)?.ist_bevorzugt).toBe(0)

      redo(db)
      expect(nameLesen(db, formA)?.ist_bevorzugt).toBe(0)
      expect(nameLesen(db, formB)?.ist_bevorzugt).toBe(1)
    } finally {
      db.close()
    }
  })

  it('neu ist bereits bevorzugt → No-op (keine zweite Transaktion)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id: formA } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'hauptname.wechseln', { personId, alt: formA, neu: formA })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende Zielform → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id: formA } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'hauptname.wechseln', { personId, alt: formA, neu: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

// AP-1.30 PR 3 (docs/80 §32 V-3-flache-bruecke-vatersname): die flache Namensbrücke kennt den
// Vatersnamen (`name_part.art = 'vatersname'`). Semantik wie alle Felder der Brücke (Option C,
// V-130-2a): `vatersname` im Vertrag, fehlt = null (ersetzt). Gespeichert als EIN Teil (sortier_index 0),
// montiert zwischen Vornamen und Präfix/Nachname („Iwan Petrowitsch Iwanow").
interface TeilRoh {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

function vatersnameTeile(db: ReturnType<typeof oeffnen>, id: string): readonly { readonly wert: string; readonly sortier_index: number }[] {
  return db
    .prepare<{ readonly id: string }, { readonly wert: string; readonly sortier_index: number }>(
      `SELECT wert, sortier_index FROM name_part WHERE name_form_id = @id AND art = 'vatersname' ORDER BY sortier_index`,
    )
    .all({ id })
}

function originalText(db: ReturnType<typeof oeffnen>, id: string): string | null | undefined {
  return db
    .prepare<{ readonly id: string }, { readonly original_text: string | null }>('SELECT original_text FROM name_form WHERE id = @id')
    .get({ id })?.original_text
}

/** Rohzustand einer Form: alle name_form-Spalten plus alle Bestandteile (für bitgleiche Undo/Redo-Vergleiche). */
function formRoh(db: ReturnType<typeof oeffnen>, id: string): unknown {
  const form = db
    .prepare<{ readonly id: string }, Readonly<Record<string, unknown>>>(
      `SELECT id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von, umschrift_norm,
              konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text, erstellt_am, geaendert_am
       FROM name_form WHERE id = @id`,
    )
    .get({ id })
  const teile = db
    .prepare<{ readonly id: string }, TeilRoh>(
      `SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am
       FROM name_part WHERE name_form_id = @id ORDER BY id`,
    )
    .all({ id })
  return { form, teile }
}

const IWAN = { typ: 'geburtsname', vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' } as const

describe('name.anlegen/name.aendern mit Vatersname (AP-1.30 PR 3, V-3-flache-bruecke-vatersname)', () => {
  it('name.anlegen speichert den Vatersnamen als EINEN Teil und montiert original_text „Iwan Petrowitsch Iwanow"', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Petrowitsch', sortier_index: 0 }])
      expect(originalText(db, id)).toBe('Iwan Petrowitsch Iwanow')
    } finally {
      db.close()
    }
  })

  it('mehrteiliger Vatersname bleibt ein Teil (kein Zerlegen an Leerzeichen)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN, vatersname: 'Petrowitsch Sidorow' })
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Petrowitsch Sidorow', sortier_index: 0 }])
    } finally {
      db.close()
    }
  })

  it('name.aendern ändert nur den Nachnamen → der Vatersname bleibt, original_text wird neu montiert', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      fuehreAus(db, 'name.aendern', { id, ...IWAN, nachname: 'Iwanowa' })
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Petrowitsch', sortier_index: 0 }])
      expect(originalText(db, id)).toBe('Iwan Petrowitsch Iwanowa')
    } finally {
      db.close()
    }
  })

  it('nur den Vatersnamen ändern ist KEIN No-op: neue Transaktion, neuer Wert', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'name.aendern', { id, ...IWAN, vatersname: 'Pawlowitsch' })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Pawlowitsch', sortier_index: 0 }])
      expect(originalText(db, id)).toBe('Iwan Pawlowitsch Iwanow')
    } finally {
      db.close()
    }
  })

  it('nur den Vatersnamen ändern bei WORTGETREUEM original_text ist KEIN No-op (hueter #153, 6)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      // Wortgetreue Schreibung, die nicht der Montage gleicht: der No-op-Vergleich darf sich nicht allein
      // auf original_text stützen, sonst würde die Änderung des Vatersnamens still verschluckt.
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN, originalText: 'Ivan Petrovič' })
      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'name.aendern', { id, ...IWAN, vatersname: 'Pawlowitsch', originalText: 'Ivan Petrovič' })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Pawlowitsch', sortier_index: 0 }])
      expect(originalText(db, id)).toBe('Ivan Petrovič')
    } finally {
      db.close()
    }
  })

  it('identische Werte samt Vatersname bleiben ein No-op (AP-0.22)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'name.aendern', { id, ...IWAN })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Option C: ein weggelassener Vatersname wird entfernt (fehlt = null, wie jedes Feld der Brücke)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      expect(vatersnameTeile(db, id)).toHaveLength(1)
      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Iwan', nachname: 'Iwanow' })
      expect(vatersnameTeile(db, id)).toStrictEqual([])
      expect(originalText(db, id)).toBe('Iwan Iwanow')
    } finally {
      db.close()
    }
  })

  it('Undo/Redo einer Vatersnamen-Änderung stellen Form und Teile bitgleich her', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...IWAN })
      const vorAendern = formRoh(db, id)
      fuehreAus(db, 'name.aendern', { id, ...IWAN, vatersname: 'Pawlowitsch' })
      const nachAendern = formRoh(db, id)
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Pawlowitsch', sortier_index: 0 }])

      undo(db)
      expect(formRoh(db, id)).toStrictEqual(vorAendern)
      expect(vatersnameTeile(db, id)).toStrictEqual([{ wert: 'Petrowitsch', sortier_index: 0 }])

      redo(db)
      expect(formRoh(db, id)).toStrictEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})

// hueter #181 H1: seit U-130-rufname-noop ist `nameGeaenderteFelder` die No-op-Schranke des Handlers —
// fehlt dort ein Feld, wird eine Änderung NUR an diesem Feld still verworfen. Tabellengetrieben über
// ALLE Vertragsfelder (`NameAendernFeldEnum.options`): je Feld ändert der Aufruf genau dieses Feld
// gegenüber einem vollständig belegten Ausgangsstand → eine neue Transaktion, und der neue Wert steht
// in der flachen Sicht (`nameRepo.lesen`). `satisfies Record<NameAendernFeld, …>` erzwingt, dass ein
// neues Vertragsfeld hier einen Fall bekommt.
describe('name.aendern: jede Einzelfeldänderung schreibt (hueter #181 H1)', () => {
  interface Fall {
    /** Überschreibt den Ausgangsaufruf; `quelleId` ist eine zweite, existierende Form (für umschriftVon). */
    readonly aenderung: (quelleId: string) => Partial<NameAendernEin>
    readonly spalte: keyof NameRepoZeile
    readonly erwartet: (quelleId: string) => string | number
  }

  const FAELLE = {
    typ: { aenderung: () => ({ typ: 'ehename' }), spalte: 'typ', erwartet: () => 'ehename' },
    schrift: { aenderung: () => ({ schrift: 'cyrl' }), spalte: 'schrift', erwartet: () => 'cyrl' },
    umschriftVon: { aenderung: (q) => ({ umschriftVon: q }), spalte: 'umschrift_von', erwartet: (q) => q },
    umschriftNorm: { aenderung: () => ({ umschriftNorm: 'din1460' }), spalte: 'umschrift_norm', erwartet: () => 'din1460' },
    vornamen: { aenderung: () => ({ vornamen: 'Anna Maria Anna Luise' }), spalte: 'vornamen', erwartet: () => 'Anna Maria Anna Luise' },
    // Gleicher Text an anderer Stelle: nur der Index unterscheidet „Anna" (0) von „Anna" (2).
    rufnameIndex: { aenderung: () => ({ rufnameIndex: 2 }), spalte: 'rufname_index', erwartet: () => 2 },
    // Ohne Index entscheidet der Text (zerlegeName Regel 2).
    rufnameText: { aenderung: () => ({ rufnameIndex: undefined, rufnameText: 'Maria' }), spalte: 'rufname_text', erwartet: () => 'Maria' },
    nachname: { aenderung: () => ({ nachname: 'Beispiel' }), spalte: 'nachname', erwartet: () => 'Beispiel' },
    praefix: { aenderung: () => ({ praefix: 'zu' }), spalte: 'praefix', erwartet: () => 'zu' },
    titelVor: { aenderung: () => ({ titelVor: 'Prof.' }), spalte: 'titel_vor', erwartet: () => 'Prof.' },
    zusatzNach: { aenderung: () => ({ zusatzNach: 'd. J.' }), spalte: 'zusatz_nach', erwartet: () => 'd. J.' },
    vatersname: { aenderung: () => ({ vatersname: 'Iwanowna' }), spalte: 'vatersname', erwartet: () => 'Iwanowna' },
    originalText: { aenderung: () => ({ originalText: 'Anna M. Muster (Kirchenbuch)' }), spalte: 'original_text', erwartet: () => 'Anna M. Muster (Kirchenbuch)' },
    sprache: { aenderung: () => ({ sprache: 'ru' }), spalte: 'sprache', erwartet: () => 'ru' },
    gueltigVon: { aenderung: () => ({ gueltigVon: 1710 }), spalte: 'gueltig_von', erwartet: () => 1710 },
    gueltigBis: { aenderung: () => ({ gueltigBis: 1790 }), spalte: 'gueltig_bis', erwartet: () => 1790 },
  } satisfies Record<NameAendernFeld, Fall>

  for (const feld of NameAendernFeldEnum.options) {
    it(`nur ${feld} geändert → neue Transaktion, neuer Wert gespeichert`, () => {
      const db = neueTestDatenbank()
      try {
        const personId = neuePerson(db)
        const quelle = fuehreAus(db, 'name.anlegen', { personId, typ: 'sonstiges', nachname: 'Quelle' })
        const ausgang = {
          typ: 'geburtsname',
          schrift: 'latn',
          umschriftNorm: 'iso9',
          vornamen: 'Anna Maria Anna',
          rufnameIndex: 0,
          rufnameText: 'Anna',
          nachname: 'Muster',
          praefix: 'von',
          titelVor: 'Dr.',
          zusatzNach: 'd. Ä.',
          vatersname: 'Petrowna',
          // wortgetreu (keine Montage) — so schickt die Maske ihn bei jedem Aufruf mit
          originalText: 'Anna Maria Anna Petrowna von Muster, geb.',
          sprache: 'de',
          gueltigVon: 1700,
          gueltigBis: 1800,
        } as const
        const { id } = fuehreAus(db, 'name.anlegen', { personId, ...ausgang })
        // Gegenprobe: der unveränderte Ausgangsaufruf ist ein No-op.
        const anzahlVorher = transaktionAnzahl(db)
        fuehreAus(db, 'name.aendern', { id, ...ausgang })
        expect(transaktionAnzahl(db)).toBe(anzahlVorher)

        const fall = FAELLE[feld]
        fuehreAus(db, 'name.aendern', { id, ...ausgang, ...fall.aenderung(quelle.id), feld })

        expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
        expect(nameRepo.lesen(db, id)?.[fall.spalte]).toBe(fall.erwartet(quelle.id))
      } finally {
        db.close()
      }
    })
  }

  // In der Tabelle ändert `rufnameText` immer auch `rufnameIndex` mit. Einzig bei einem angehängten
  // mehrwortigen Rufnamen kann sich NUR der Text ändern: gleiche Vornamen-Kette, gleicher Index, aber
  // der markierte Bestandteil ist „Hans" statt „Hans Peter".
  it('nur rufnameText geändert (mehrwortig angehängt → ein Wort, gleiche Vornamen, gleicher Index) → neue Transaktion', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnoff' })
      const vorher = nameRepo.lesen(db, id)
      expect([vorher?.vornamen, vorher?.rufname_index, vorher?.rufname_text]).toEqual(['Karl Hans Peter', 1, 'Hans Peter'])
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Karl Hans Peter', rufnameIndex: 1, rufnameText: 'Hans', nachname: 'Gutnoff', feld: 'rufnameText' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
      const nachher = nameRepo.lesen(db, id)
      expect([nachher?.vornamen, nachher?.rufname_index, nachher?.rufname_text]).toEqual(['Karl Hans Peter', 1, 'Hans'])
    } finally {
      db.close()
    }
  })
})

// Nachreview #181 H1, zweite Achse: ein Feld LEEREN (weglassen/undefined) ist eine Änderung — die
// flache Brücke ersetzt die ganze Form, „fehlt" heißt „kein Wert", nicht „unverändert". Ein
// Rohvergleich nach dem Muster `ein.vornamen ?? vorher.vornamen` verwürfe das Leeren still.
// Je Feld außer dem Pflichtfeld `typ`: +1 Transaktion und der gespeicherte Wert danach. Meist `null`;
// wo die Zerlegung aus den übrigen Feldern etwas ableitet, steht die abgeleitete Wirkung da.
describe('name.aendern: jedes geleerte Feld schreibt (Nachreview #181 H1)', () => {
  const AUSGANG = {
    typ: 'geburtsname',
    schrift: 'latn',
    umschriftNorm: 'iso9',
    vornamen: 'Anna Maria Anna',
    rufnameIndex: 0,
    rufnameText: 'Anna',
    nachname: 'Muster',
    praefix: 'von',
    titelVor: 'Dr.',
    zusatzNach: 'd. Ä.',
    vatersname: 'Petrowna',
    originalText: 'Anna Maria Anna Petrowna von Muster, geb.',
    sprache: 'de',
    gueltigVon: 1700,
    gueltigBis: 1800,
  } as const

  interface LeerFall {
    /** Abweichender Ausgangsstand (Anlegen UND unverändertes Echo), falls nötig. */
    readonly ausgang?: (quelleId: string) => Partial<NameAendernEin>
    /** Abweichendes Echo vor dem Leeren (wenn das Anlegen anders aussieht als die flache Sicht). */
    readonly echo?: Partial<NameAendernEin>
    readonly spalte: keyof NameRepoZeile
    readonly erwartet: string | number | null
  }

  type LeerbaresFeld = Exclude<NameAendernFeld, 'typ'>

  const LEER_FAELLE = {
    schrift: { spalte: 'schrift', erwartet: null },
    umschriftVon: { ausgang: (q) => ({ umschriftVon: q }), spalte: 'umschrift_von', erwartet: null },
    umschriftNorm: { spalte: 'umschrift_norm', erwartet: null },
    // Ohne Vornamen hängt die Zerlegung den Rufnamen-Text als einzigen Vornamen an (Regel 3).
    vornamen: { spalte: 'vornamen', erwartet: 'Anna' },
    // Ohne Index entscheidet der Text: das ERSTE „Anna" statt des dritten.
    rufnameIndex: { ausgang: () => ({ rufnameIndex: 2 }), spalte: 'rufname_index', erwartet: 0 },
    // Neben einem gültigen Index ist der Text abgeleitet; ändern kann das Weglassen ihn nur beim
    // angehängten mehrwortigen Rufnamen: flache Sicht „Karl Hans Peter"/1 ohne Text → markiert „Hans".
    rufnameText: {
      ausgang: () => ({ vornamen: 'Karl', rufnameIndex: undefined, rufnameText: 'Hans Peter' }),
      echo: { vornamen: 'Karl Hans Peter', rufnameIndex: 1, rufnameText: 'Hans Peter' },
      spalte: 'rufname_text',
      erwartet: 'Hans',
    },
    nachname: { spalte: 'nachname', erwartet: null },
    praefix: { spalte: 'praefix', erwartet: null },
    titelVor: { spalte: 'titel_vor', erwartet: null },
    zusatzNach: { spalte: 'zusatz_nach', erwartet: null },
    vatersname: { spalte: 'vatersname', erwartet: null },
    // Ohne mitgegebenen Text montiert der Befehl die Teile (`montiereOriginalTextDerTeile`).
    originalText: { spalte: 'original_text', erwartet: 'Dr. Anna Maria Anna Petrowna von Muster d. Ä.' },
    sprache: { spalte: 'sprache', erwartet: null },
    gueltigVon: { spalte: 'gueltig_von', erwartet: null },
    gueltigBis: { spalte: 'gueltig_bis', erwartet: null },
  } satisfies Record<LeerbaresFeld, LeerFall>

  const LEERBAR = NameAendernFeldEnum.options.filter((feld): feld is LeerbaresFeld => feld !== 'typ')

  for (const feld of LEERBAR) {
    it(`${feld} geleert → neue Transaktion, gespeichert ${String(LEER_FAELLE[feld].erwartet)}`, () => {
      const db = neueTestDatenbank()
      try {
        const personId = neuePerson(db)
        const quelle = fuehreAus(db, 'name.anlegen', { personId, typ: 'sonstiges', nachname: 'Quelle' })
        const fall: LeerFall = LEER_FAELLE[feld]
        const ausgang: Omit<NameAendernEin, 'id'> = { ...AUSGANG, ...fall.ausgang?.(quelle.id) }
        const { id } = fuehreAus(db, 'name.anlegen', { personId, ...ausgang })
        const echo: NameAendernEin = { id, ...ausgang, ...fall.echo }
        // Gegenprobe: das unveränderte Echo ist ein No-op.
        const anzahlVorher = transaktionAnzahl(db)
        fuehreAus(db, 'name.aendern', echo)
        expect(transaktionAnzahl(db)).toBe(anzahlVorher)
        expect(nameRepo.lesen(db, id)?.[fall.spalte]).not.toBe(fall.erwartet)

        fuehreAus(db, 'name.aendern', { ...echo, [feld]: undefined })

        expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
        expect(nameRepo.lesen(db, id)?.[fall.spalte]).toBe(fall.erwartet)
      } finally {
        db.close()
      }
    })
  }
})
