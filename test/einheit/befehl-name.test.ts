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
