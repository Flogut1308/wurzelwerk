// AP-1.30 (PR 5): `abfrage:journal.verlauf` mit optionalem Filter `personId` — DIE Verlaufsabfrage,
// die die rechte Spalte des Personenprofils (letzte drei Einträge) und später S-16 (AP-1.23, ohne
// Filter) gemeinsam nutzen. Befüllt über den echten Befehlsbus bzw. den echten Import; nur wo es
// keinen Befehl gibt (reine `name_part`-Änderung, Gesundheitsdaten), schreibt `rohTransaktion()` eine
// armierte Transaktion von Hand — die `aenderung`-Zeilen entstehen auch dort durch die echten
// `jrn_*`-Trigger, nicht durch handgebaute Zeilenbilder.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { journalVerlauf } from '../../src/main/abfragen/journal-verlauf'
import { fuehreAus } from '../../src/main/befehle/bus'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen, journalAn, journalAus } from '../../src/main/journal/kontext'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'

const BEISPIEL_IMPORT = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json', import.meta.url))

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Die jüngste Transaktion (nach `lfd`) — der Bus gibt die Transaktions-ID nicht zurück. */
function letzteTx(db: Database.Database): string {
  const zeile = db.prepare<[], { readonly id: string }>('SELECT id FROM transaktion ORDER BY lfd DESC LIMIT 1').get()
  if (zeile === undefined) throw new Error('letzteTx: keine Transaktion vorhanden.')
  return zeile.id
}

function aenderungAnzahl(db: Database.Database, txId: string): number {
  const zeile = db
    .prepare<{ readonly txId: string }, { readonly n: number }>('SELECT COUNT(*) AS n FROM aenderung WHERE transaktion_id = @txId')
    .get({ txId })
  return zeile?.n ?? -1
}

/** Eine armierte Transaktion ohne Befehl (für Fälle, für die es noch keinen Befehl gibt). */
function rohTransaktion(db: Database.Database, beschreibung: string, schreiben: () => void): string {
  const txId = neueId()
  db.transaction((): void => {
    transaktionAnlegen(db, { id: txId, zeitpunkt: 1, art: 'nutzer', beschreibung, lfd: naechsteLfd(db) })
    armieren(db, txId)
    try {
      schreiben()
    } finally {
      entwaffnen(db)
    }
  })()
  return txId
}

function ids(verlauf: readonly { readonly id: string }[]): readonly string[] {
  return verlauf.map((eintrag) => eintrag.id)
}

interface Bestand {
  readonly db: Database.Database
  readonly anna: string
  readonly bernd: string
  readonly carl: string
  /** Transaktionen, die Anna betreffen — in Anlagereihenfolge (älteste zuerst). */
  readonly annaTx: readonly string[]
  /** Transaktionen, die NUR Bernd betreffen. */
  readonly berndTx: readonly string[]
  readonly elternschaftTx: string
  readonly nameAnnaZweit: string
  readonly geburtAnna: string
  readonly beteiligungAnna: string
}

/**
 * Anna (Elternteil) und Carl (Kind) sind über eine Elternschaft verbunden; Bernd ist fremd. Anna
 * bekommt: Anlage, zwei Namen, Geburt (Ereignis + Beteiligung + Existenz-Aussage), Beruf-Aussage.
 */
function baueBestand(): Bestand {
  const db = neueTestDatenbank()
  const annaTx: string[] = []
  const berndTx: string[] = []

  const anna = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  annaTx.push(letzteTx(db))
  const bernd = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  berndTx.push(letzteTx(db))
  const carl = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id

  fuehreAus(db, 'name.anlegen', { personId: anna, typ: 'geburtsname', vornamen: 'Anna', nachname: "O'Brien", istBevorzugt: 1 })
  annaTx.push(letzteTx(db))
  const nameAnnaZweit = fuehreAus(db, 'name.anlegen', { personId: anna, typ: 'ehename', vornamen: 'Anna', nachname: 'Meier', istBevorzugt: 0 }).id
  annaTx.push(letzteTx(db))
  fuehreAus(db, 'name.anlegen', { personId: bernd, typ: 'geburtsname', vornamen: 'Bernd', nachname: 'Fremd', istBevorzugt: 1 })
  berndTx.push(letzteTx(db))

  const geburtAnna = fuehreAus(db, 'ereignis.anlegen', {
    typ: 'geburt',
    beteiligungen: [{ personId: anna, rolle: 'kind' }],
    konfidenz: 3,
  }).id
  annaTx.push(letzteTx(db))
  const beteiligung = db
    .prepare<{ readonly e: string }, { readonly id: string }>('SELECT id FROM beteiligung WHERE ereignis_id = @e')
    .get({ e: geburtAnna })
  if (beteiligung === undefined) throw new Error('baueBestand: Beteiligung fehlt.')

  fuehreAus(db, 'elternschaft.anlegen', { elternteilId: anna, kindId: carl, typ: 'biologisch', konfidenz: 3 })
  const elternschaftTx = letzteTx(db)
  annaTx.push(elternschaftTx)

  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: anna, praedikat: 'beruf', wertText: 'Weberin', konfidenz: 3 })
  annaTx.push(letzteTx(db))
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: bernd, praedikat: 'beruf', wertText: 'Bäcker', konfidenz: 3 })
  berndTx.push(letzteTx(db))

  return { db, anna, bernd, carl, annaTx, berndTx, elternschaftTx, nameAnnaZweit, geburtAnna, beteiligungAnna: beteiligung.id }
}

describe('journalVerlauf() mit Filter personId (AP-1.30 PR 5)', () => {
  it('liefert genau die Transaktionen der Person, neueste zuerst — fremde Person erscheint nicht', () => {
    const { db, anna, annaTx, berndTx } = baueBestand()
    try {
      const verlauf = journalVerlauf(db, 50, anna)
      expect(ids(verlauf)).toEqual([...annaTx].reverse())
      for (const fremd of berndTx) expect(ids(verlauf)).not.toContain(fremd)
    } finally {
      db.close()
    }
  })

  it('Elternschaft erscheint aus Sicht des Kindes und des Elternteils', () => {
    const { db, anna, carl, bernd, elternschaftTx } = baueBestand()
    try {
      expect(ids(journalVerlauf(db, 50, anna))).toContain(elternschaftTx)
      expect(ids(journalVerlauf(db, 50, carl))).toContain(elternschaftTx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(elternschaftTx)
    } finally {
      db.close()
    }
  })

  it('findet eine reine name_part-Änderung über die Namensform — auch nachdem die Namensform gelöscht ist', () => {
    const { db, anna, bernd, nameAnnaZweit } = baueBestand()
    try {
      const partTx = rohTransaktion(db, 'journal.name_geaendert', () => {
        db.prepare<{ readonly f: string }>("UPDATE name_part SET wert = 'Meyer' WHERE name_form_id = @f AND art = 'nachname'").run({ f: nameAnnaZweit })
      })
      expect(db.prepare<{ readonly t: string }, { readonly n: number }>("SELECT COUNT(*) AS n FROM aenderung WHERE transaktion_id = @t AND tabelle <> 'name_part'").get({ t: partTx })?.n).toBe(0)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(partTx)

      fuehreAus(db, 'name.loeschen', { id: nameAnnaZweit })
      const loeschTx = letzteTx(db)
      const nachLoeschen = ids(journalVerlauf(db, 50, anna))
      expect(nachLoeschen).toContain(loeschTx)
      expect(nachLoeschen).toContain(partTx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(partTx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(loeschTx)
    } finally {
      db.close()
    }
  })

  it('findet eine reine Ereignisänderung über die Beteiligung — auch nachdem die Beteiligung gelöscht ist', () => {
    const { db, anna, bernd, geburtAnna, beteiligungAnna } = baueBestand()
    try {
      fuehreAus(db, 'ereignis.aendern', { id: geburtAnna, typ: 'geburt', beschreibung: 'Hausgeburt' })
      const aendernTx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(aendernTx)

      fuehreAus(db, 'beteiligung.loeschen', { id: beteiligungAnna })
      const loeschTx = letzteTx(db)
      fuehreAus(db, 'ereignis.aendern', { id: geburtAnna, typ: 'geburt', beschreibung: 'Klinik' })
      const spaeterTx = letzteTx(db)

      const verlauf = ids(journalVerlauf(db, 50, anna))
      expect(verlauf).toContain(loeschTx)
      expect(verlauf).toContain(aendernTx)
      expect(verlauf).toContain(spaeterTx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(aendernTx)
    } finally {
      db.close()
    }
  })

  it('findet eine Änderung der Existenz-Aussage eines Ereignisses der Person', () => {
    const { db, anna, bernd, geburtAnna } = baueBestand()
    try {
      const existenz = db
        .prepare<{ readonly e: string }, { readonly id: string }>("SELECT id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @e")
        .get({ e: geburtAnna })
      if (existenz === undefined) throw new Error('Existenz-Aussage fehlt.')
      fuehreAus(db, 'aussage.aendern', { id: existenz.id, wertText: 'ja', konfidenz: 4, begruendung: 'Kirchenbuch' })
      const tx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
    } finally {
      db.close()
    }
  })

  it('findet einen Beleg an der Existenz-Aussage eines Ereignisses der Person — auch nachdem die Aussage gelöscht ist', () => {
    const { db, anna, bernd, geburtAnna } = baueBestand()
    try {
      const existenz = db
        .prepare<{ readonly e: string }, { readonly id: string }>("SELECT id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @e")
        .get({ e: geburtAnna })
      if (existenz === undefined) throw new Error('Existenz-Aussage fehlt.')
      const quelle = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'KB' }).id
      const zitat = fuehreAus(db, 'zitat.anlegen', { quelleId: quelle, seite: '3' }).id
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: existenz.id, zitatId: zitat })
      const tx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      rohTransaktion(db, 'journal.aussage_geloescht', () => {
        db.prepare<{ readonly a: string }>('DELETE FROM aussage WHERE id = @a').run({ a: existenz.id })
      })
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
    } finally {
      db.close()
    }
  })

  it('findet einen Beleg (aussage_zitat) an einer Aussage der Person', () => {
    const { db, anna, bernd } = baueBestand()
    try {
      const quelle = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'KB' }).id
      const zitat = fuehreAus(db, 'zitat.anlegen', { quelleId: quelle, seite: '12' }).id
      const beruf = db
        .prepare<{ readonly p: string }, { readonly id: string }>("SELECT id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @p AND praedikat = 'beruf'")
        .get({ p: anna })
      if (beruf === undefined) throw new Error('Beruf-Aussage fehlt.')
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: beruf.id, zitatId: zitat })
      const tx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
    } finally {
      db.close()
    }
  })

  it('findet eine reine Partnerschaftsänderung über partnerschaft_person', () => {
    const { db, anna, bernd, carl } = baueBestand()
    try {
      const partnerschaft = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [{ personId: anna }, { personId: carl }],
        konfidenz: 3,
      }).id
      const anlegenTx = letzteTx(db)
      fuehreAus(db, 'partnerschaft.aendern', { id: partnerschaft, typ: 'ehe_kirchlich' })
      const aendernTx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, anna))).toEqual(expect.arrayContaining([anlegenTx, aendernTx]))
      expect(ids(journalVerlauf(db, 50, carl))).toEqual(expect.arrayContaining([anlegenTx, aendernTx]))
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(aendernTx)
    } finally {
      db.close()
    }
  })

  it('eine gelöschte Person behält ihren Verlauf (Zeilenbild), inklusive der Löschung', () => {
    const db = neueTestDatenbank()
    try {
      const p = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const anlegenTx = letzteTx(db)
      fuehreAus(db, 'person.loeschen', { id: p })
      const loeschTx = letzteTx(db)
      expect(ids(journalVerlauf(db, 50, p))).toEqual([loeschTx, anlegenTx])
    } finally {
      db.close()
    }
  })

  it('respektiert grenze und Reihenfolge (lfd DESC) — die rechte Spalte braucht die drei neuesten', () => {
    const { db, anna, annaTx } = baueBestand()
    try {
      const verlauf = journalVerlauf(db, 3, anna)
      expect(ids(verlauf)).toEqual([...annaTx].reverse().slice(0, 3))
    } finally {
      db.close()
    }
  })

  it('liefert je Eintrag die Anzahl der Änderungen', () => {
    const { db, anna } = baueBestand()
    try {
      for (const eintrag of journalVerlauf(db, 50, anna)) {
        expect(eintrag.anzahl).toBe(aenderungAnzahl(db, eintrag.id))
        expect(eintrag.anzahl).toBeGreaterThan(0)
      }
    } finally {
      db.close()
    }
  })

  it('Gesundheit: eine Transaktion nur auf diagnose erscheint ohne jeden Inhalt (nur Art/Zeit/Anzahl)', () => {
    const { db, anna, bernd } = baueBestand()
    try {
      const txId = rohTransaktion(db, 'journal.diagnose_angelegt', () => {
        db.prepare<{ readonly id: string; readonly p: string }>(
          "INSERT INTO diagnose (id, person_id, kategorie, bezeichnung) VALUES (@id, @p, 'stoffwechsel', 'Diabetes mellitus')",
        ).run({ id: neueId(), p: anna })
      })
      for (const verlauf of [journalVerlauf(db, 50, anna), journalVerlauf(db, 50)]) {
        const eintrag = verlauf.find((e) => e.id === txId)
        expect(eintrag).toMatchObject({ art: 'nutzer', beschreibung: null, anzahl: 1 })
        const text = JSON.stringify(eintrag)
        expect(text).not.toContain('Diabetes')
        expect(text).not.toContain('diagnose')
      }
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(txId)
    } finally {
      db.close()
    }
  })
})

describe('journalVerlauf() — Aussagen und Belege an Gesundheitsdaten (M-08, hueter #155)', () => {
  // `aussage.subjekt_typ` erlaubt seit 0005 auch 'diagnose'/'risikofaktor' (Belege an
  // Gesundheitsdaten, ADR-026). Solche Aussagen und ihre `aussage_zitat`-Zeilen gehören über
  // `diagnose.person_id`/`risikofaktor.person_id` zur Person UND sind selbst Gesundheitsdaten.
  const GEHEIM = 'Diabetes mellitus'

  function gesundheitAnlegen(db: Database.Database, tabelle: 'diagnose' | 'risikofaktor', personId: string): string {
    const id = neueId()
    rohTransaktion(db, `journal.${tabelle}_angelegt`, () => {
      if (tabelle === 'diagnose') {
        db.prepare<{ readonly id: string; readonly p: string; readonly b: string }>(
          "INSERT INTO diagnose (id, person_id, kategorie, bezeichnung) VALUES (@id, @p, 'stoffwechsel', @b)",
        ).run({ id, p: personId, b: GEHEIM })
      } else {
        db.prepare<{ readonly id: string; readonly p: string; readonly b: string }>(
          "INSERT INTO risikofaktor (id, person_id, art, detail) VALUES (@id, @p, 'rauchen', @b)",
        ).run({ id, p: personId, b: GEHEIM })
      }
    })
    return id
  }

  function aussageAn(db: Database.Database, subjektTyp: string, subjektId: string): string {
    const id = neueId()
    db.prepare<{ readonly id: string; readonly t: string; readonly s: string; readonly w: string }>(
      "INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz) VALUES (@id, @t, @s, 'befund', @w, 3)",
    ).run({ id, t: subjektTyp, s: subjektId, w: GEHEIM })
    return id
  }

  function zitatAnlegen(db: Database.Database): string {
    const quelle = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'KB' }).id
    return fuehreAus(db, 'zitat.anlegen', { quelleId: quelle, seite: '12' }).id
  }

  function belegAn(db: Database.Database, aussageId: string, zitatId: string): void {
    db.prepare<{ readonly a: string; readonly z: string }>('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@a, @z)').run({ a: aussageId, z: zitatId })
  }

  /** Die Transaktion steht im Verlauf der Person und ohne Filter — jeweils ohne Beschreibung und ohne Inhalt. */
  function erwarteVerborgen(db: Database.Database, personId: string, txId: string): void {
    for (const verlauf of [journalVerlauf(db, 50, personId), journalVerlauf(db, 50)]) {
      const eintrag = verlauf.find((e) => e.id === txId)
      expect(eintrag).toMatchObject({ beschreibung: null, anzahl: aenderungAnzahl(db, txId) })
      const text = JSON.stringify(eintrag)
      expect(text).not.toContain('Diabetes')
      expect(text).not.toContain('journal.')
    }
  }

  it.each(['diagnose', 'risikofaktor'] as const)('eine Aussage an %s gehört zur Person und erscheint ohne Beschreibung', (tabelle) => {
    const { db, anna, bernd } = baueBestand()
    try {
      const ziel = gesundheitAnlegen(db, tabelle, anna)
      const tx = rohTransaktion(db, 'journal.aussage_angelegt', () => aussageAn(db, tabelle, ziel))
      expect(aenderungAnzahl(db, tx)).toBe(1)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
      erwarteVerborgen(db, anna, tx)
    } finally {
      db.close()
    }
  })

  it.each(['diagnose', 'risikofaktor'] as const)('ein Beleg (aussage_zitat) an einer Aussage an %s gehört zur Person und erscheint ohne Beschreibung', (tabelle) => {
    const { db, anna, bernd } = baueBestand()
    try {
      const ziel = gesundheitAnlegen(db, tabelle, anna)
      let aussage = ''
      rohTransaktion(db, 'journal.aussage_angelegt', () => {
        aussage = aussageAn(db, tabelle, ziel)
      })
      const zitat = zitatAnlegen(db)
      const tx = rohTransaktion(db, 'journal.beleg_angelegt', () => belegAn(db, aussage, zitat))
      expect(aenderungAnzahl(db, tx)).toBe(1)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
      erwarteVerborgen(db, anna, tx)
    } finally {
      db.close()
    }
  })

  it('eine Transaktion aus Diagnose, Aussage und Beleg an ihr ist reine Gesundheit (ohne Beschreibung)', () => {
    const { db, anna } = baueBestand()
    try {
      const zitat = zitatAnlegen(db)
      const tx = rohTransaktion(db, 'journal.diagnose_angelegt', () => {
        const diagnose = neueId()
        db.prepare<{ readonly id: string; readonly p: string }>("INSERT INTO diagnose (id, person_id, kategorie) VALUES (@id, @p, 'krebs')").run({ id: diagnose, p: anna })
        belegAn(db, aussageAn(db, 'diagnose', diagnose), zitat)
      })
      expect(aenderungAnzahl(db, tx)).toBe(3)
      erwarteVerborgen(db, anna, tx)
    } finally {
      db.close()
    }
  })

  it('Gegenprobe: ein Beleg an einer gewöhnlichen Aussage der Person behält seine Beschreibung', () => {
    const { db, anna } = baueBestand()
    try {
      const zitat = zitatAnlegen(db)
      let aussage = ''
      rohTransaktion(db, 'journal.aussage_angelegt', () => {
        aussage = aussageAn(db, 'person', anna)
      })
      const tx = rohTransaktion(db, 'journal.beleg_angelegt', () => belegAn(db, aussage, zitat))
      expect(journalVerlauf(db, 50, anna).find((e) => e.id === tx)?.beschreibung).toBe('journal.beleg_angelegt')
      expect(journalVerlauf(db, 50).find((e) => e.id === tx)?.beschreibung).toBe('journal.beleg_angelegt')
    } finally {
      db.close()
    }
  })

  it('nach dem Löschen der Diagnose (samt Aussage) bleibt der frühere Beleg der Person zugeordnet und verborgen (Zeilenbild)', () => {
    const { db, anna, bernd } = baueBestand()
    try {
      const diagnose = gesundheitAnlegen(db, 'diagnose', anna)
      let aussage = ''
      rohTransaktion(db, 'journal.aussage_angelegt', () => {
        aussage = aussageAn(db, 'diagnose', diagnose)
      })
      const zitat = zitatAnlegen(db)
      const tx = rohTransaktion(db, 'journal.beleg_angelegt', () => belegAn(db, aussage, zitat))
      rohTransaktion(db, 'journal.diagnose_geloescht', () => {
        db.prepare<{ readonly a: string }>('DELETE FROM aussage WHERE id = @a').run({ a: aussage })
        db.prepare<{ readonly d: string }>('DELETE FROM diagnose WHERE id = @d').run({ d: diagnose })
      })
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
      erwarteVerborgen(db, anna, tx)
    } finally {
      db.close()
    }
  })

  it('Diagnose und Aussage ohne Journal (Großimport, ADR-019): ein späterer Beleg findet über den heutigen Bestand zur Person und bleibt verborgen', () => {
    const { db, anna, bernd } = baueBestand()
    try {
      // Journal aus wie beim Großimport: Diagnose und Aussage stehen nur im heutigen Bestand.
      const diagnose = neueId()
      journalAus(db, 'Test: Bestand wie nach einem Großimport ohne Journal (ADR-019)')
      db.prepare<{ readonly id: string; readonly p: string }>("INSERT INTO diagnose (id, person_id, kategorie) VALUES (@id, @p, 'krebs')").run({ id: diagnose, p: anna })
      const aussage = aussageAn(db, 'diagnose', diagnose)
      journalAn(db)
      const zitat = zitatAnlegen(db)
      const tx = rohTransaktion(db, 'journal.beleg_angelegt', () => belegAn(db, aussage, zitat))
      expect(aenderungAnzahl(db, tx)).toBe(1)
      expect(ids(journalVerlauf(db, 50, anna))).toContain(tx)
      expect(ids(journalVerlauf(db, 50, bernd))).not.toContain(tx)
      erwarteVerborgen(db, anna, tx)
    } finally {
      db.close()
    }
  })
})

describe('journalVerlauf() — Import erscheint als EIN Eintrag mit Anzahl (AP-1.30 PR 5)', () => {
  it('kleiner (journalisierter) Import: ein Eintrag art=import, anzahl = Zahl der Journalzeilen', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-verlauf-import-'))
    const db = oeffnen(join(ordner, 'baum.sqlite'))
    try {
      migrieren(db)
      importAusfuehren(db, { pfad: BEISPIEL_IMPORT })
      const importTx = letzteTx(db)
      const personen = db.prepare<[], { readonly id: string }>('SELECT id FROM person ORDER BY id').all()
      expect(personen.length).toBe(3)
      for (const { id } of personen) {
        const verlauf = journalVerlauf(db, 50, id)
        expect(verlauf).toHaveLength(1)
        expect(verlauf[0]).toMatchObject({ id: importTx, art: 'import', anzahl: aenderungAnzahl(db, importTx) })
        expect(verlauf[0]?.anzahl).toBeGreaterThan(10)
      }
    } finally {
      db.close()
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  it('Großimport (ohne Journal): die Person findet ihren Import über import_herkunft, anzahl 0', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-verlauf-grossimport-'))
    const importPfad = join(ordner, 'gross.json')
    const anzahl = 800
    writeFileSync(
      importPfad,
      JSON.stringify({
        vertrag: 'wurzelwerk-import/v1',
        erzeugt: { am: '2026-09-25', werkzeug: 'test' },
        zusammenfassung: { personen: anzahl, notizen_unverarbeitet: 0 },
        quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Generierte Testquelle' }],
        personen: Array.from({ length: anzahl }, (_, i) => ({
          id: `tmp:p${i}`,
          geschlecht: 'F',
          lebend_status: 'verstorben',
          namen: [{ typ: 'geburtsname', vornamen: `Vorname${i}`, nachname: `Nachname${i}`, ist_bevorzugt: true }],
          konfidenz: 4,
          belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
        })),
        notizen_unverarbeitet: [],
      }),
      'utf8',
    )
    const db = oeffnen(join(ordner, 'baum.sqlite'))
    try {
      migrieren(db)
      const bericht = importAusfuehren(db, { pfad: importPfad })
      expect(bericht.importGesperrt).toBe(false)
      expect(bericht.zusammenfassung.ruecknahmeArt).toBe('schnappschuss')
      const importTx = letzteTx(db)
      const person = db.prepare<[], { readonly id: string }>('SELECT id FROM person ORDER BY id LIMIT 1').get()
      if (person === undefined) throw new Error('keine Person importiert')
      fuehreAus(db, 'person.feldSetzen', { id: person.id, feld: 'geschlecht', wert: 'M' })
      const aendernTx = letzteTx(db)
      const verlauf = journalVerlauf(db, 50, person.id)
      expect(ids(verlauf)).toEqual([aendernTx, importTx])
      expect(verlauf[1]).toMatchObject({ art: 'import', anzahl: 0 })

      // Die Namensform der Person steht NICHT im Journal (Großimport) — eine reine name_part-Änderung
      // findet nur über den heutigen Bestand (Ersatzweg) zur Person.
      const partTx = rohTransaktion(db, 'journal.name_geaendert', () => {
        db.prepare<{ readonly p: string }>(
          "UPDATE name_part SET wert = 'Neu' WHERE art = 'nachname' AND name_form_id IN (SELECT id FROM name_form WHERE person_id = @p)",
        ).run({ p: person.id })
      })
      expect(aenderungAnzahl(db, partTx)).toBe(1)
      expect(ids(journalVerlauf(db, 50, person.id))).toEqual([partTx, aendernTx, importTx])
    } finally {
      db.close()
      rmSync(ordner, { recursive: true, force: true })
    }
    // 60 s wie test/einheit/import-undo-gross.test.ts: Schnappschuss-Roundtrip auf dem Windows-Runner.
  }, 60_000)
})

describe('journalVerlauf() ohne Filter bleibt wie bisher (Regression, AP-1.30 PR 5)', () => {
  it('liefert alle Transaktionen in lfd-Reihenfolge mit denselben Feldern wie die Tabelle transaktion (+ anzahl)', () => {
    const { db } = baueBestand()
    try {
      const erwartet = db
        .prepare<[], { readonly id: string; readonly zeitpunkt: number; readonly art: string; readonly status: string; readonly beschreibung: string | null; readonly rueckgaengig_moeglich: number }>(
          'SELECT id, zeitpunkt, art, status, beschreibung, rueckgaengig_moeglich FROM transaktion ORDER BY lfd DESC LIMIT 5',
        )
        .all()
      const verlauf = journalVerlauf(db, 5)
      expect(verlauf).toEqual(
        erwartet.map((z) => ({
          id: z.id,
          zeitpunkt: z.zeitpunkt,
          art: z.art,
          status: z.status,
          beschreibung: z.beschreibung,
          rueckgaengigMoeglich: z.rueckgaengig_moeglich === 1,
          anzahl: aenderungAnzahl(db, z.id),
        })),
      )
    } finally {
      db.close()
    }
  })

  it('zurückgenommene Transaktionen bleiben mit ihrem Status sichtbar — mit und ohne Filter', () => {
    const { db, anna } = baueBestand()
    try {
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: anna, praedikat: 'religion', wertText: 'ev.', konfidenz: 3 })
      const tx = letzteTx(db)
      db.prepare<{ readonly t: string }>("UPDATE transaktion SET status = 'zurueckgenommen' WHERE id = @t").run({ t: tx })
      expect(journalVerlauf(db, 50, anna).find((e) => e.id === tx)?.status).toBe('zurueckgenommen')
      expect(journalVerlauf(db, 50).find((e) => e.id === tx)?.status).toBe('zurueckgenommen')
    } finally {
      db.close()
    }
  })
})
