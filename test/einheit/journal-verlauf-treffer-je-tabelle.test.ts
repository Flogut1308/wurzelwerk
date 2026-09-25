// AP-1.30 (PR 5, Auflage hueter #155): Treffertest je Tabelle der Personenbezugsliste
// (src/main/abfragen/journal-personenbezug.ts). Für JEDE Tabelle aus `PERSONENBEZUG` gilt:
//  - eine Änderung, die die Person über genau diese Spalte / diesen Anker betrifft, erscheint im
//    Verlauf der Person;
//  - dieselbe Änderung mit einer ANDEREN Person in dieser Spalte erscheint dort NICHT.
// Die gemessene Transaktion enthält nur Zeilen genau dieser Tabelle — der Treffer kann also über
// keinen anderen Eintrag der Liste zustande kommen. Eine Spalte der Liste, die auf eine andere
// (existierende) Spalte verbogen wird, macht den zugehörigen Fall rot (Mutationsprobe im PR).
//
// Befüllt wird über `rohTransaktion()` (armierte Transaktion, die `aenderung`-Zeilen schreiben die
// echten `jrn_*`-Trigger): für die meisten dieser Tabellen gibt es noch keinen Befehl, und ein Befehl
// schriebe oft mehrere Tabellen in einer Transaktion (z. B. ereignis.anlegen: ereignis + beteiligung
// + aussage) — genau das soll hier ausgeschlossen sein.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { PERSONENBEZUG } from '../../src/main/abfragen/journal-personenbezug'
import { journalVerlauf } from '../../src/main/abfragen/journal-verlauf'
import { fuehreAus } from '../../src/main/befehle/bus'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'

interface Umgebung {
  readonly db: Database.Database
  /** Unbeteiligte dritte Person — Gegenstück in zweispaltigen Kanten (Elternschaft, Assoziation). */
  readonly carl: string
  /** Eine armierte Transaktion; gibt ihre ID zurück. */
  readonly roh: (schreiben: () => void) => string
  /** Einfügen mit benannten Parametern (Kurzform für die Fälle unten). */
  readonly sql: (text: string, werte: Readonly<Record<string, string | number>>) => void
}

function umgebungAufbauen(): Umgebung & { readonly anna: string; readonly bernd: string } {
  const db = oeffnen(':memory:')
  migrieren(db)
  const anna = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  const bernd = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  const carl = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  const roh = (schreiben: () => void): string => {
    const txId = neueId()
    db.transaction((): void => {
      transaktionAnlegen(db, { id: txId, zeitpunkt: 1, art: 'nutzer', beschreibung: 'test.roh', lfd: naechsteLfd(db) })
      armieren(db, txId)
      try {
        schreiben()
      } finally {
        entwaffnen(db)
      }
    })()
    return txId
  }
  const sql = (text: string, werte: Readonly<Record<string, string | number>>): void => {
    db.prepare<Readonly<Record<string, string | number>>>(text).run(werte)
  }
  return { db, anna, bernd, carl, roh, sql }
}

/** Legt (in einer eigenen Transaktion) ein Ereignis mit der Person als Hauptperson an. */
function ereignisDerPerson(u: Umgebung, person: string): string {
  const ereignis = neueId()
  u.roh(() => {
    u.sql("INSERT INTO ereignis (id, typ) VALUES (@id, 'geburt')", { id: ereignis })
    u.sql("INSERT INTO beteiligung (id, ereignis_id, person_id, rolle) VALUES (@id, @e, @p, 'hauptperson')", { id: neueId(), e: ereignis, p: person })
  })
  return ereignis
}

function mediumAnlegen(u: Umgebung): string {
  const medium = neueId()
  u.roh(() => u.sql("INSERT INTO medium (id, dateiname) VALUES (@id, 'bild.jpg')", { id: medium }))
  return medium
}

function zitatAnlegen(u: Umgebung): string {
  const quelle = neueId()
  const zitat = neueId()
  u.roh(() => {
    u.sql("INSERT INTO quelle (id, typ, titel) VALUES (@id, 'kirchenbuch', 'KB')", { id: quelle })
    u.sql("INSERT INTO zitat (id, quelle_id, seite) VALUES (@id, @q, '12')", { id: zitat, q: quelle })
  })
  return zitat
}

function feldDefinitionAnlegen(u: Umgebung, giltFuer: string): string {
  const feld = neueId()
  u.roh(() =>
    u.sql("INSERT INTO feld_definition (id, schluessel, bezeichnung, gilt_fuer, datentyp) VALUES (@id, @s, 'Feld', @g, 'text')", {
      id: feld,
      s: `feld_${feld}`,
      g: giltFuer,
    }),
  )
  return feld
}

function importLaufAnlegen(u: Umgebung): string {
  const lauf = neueId()
  const laufTx = u.roh(() => undefined)
  u.roh(() =>
    u.sql("INSERT INTO import_lauf (id, datei, pruefsumme, vertragsversion, zeitpunkt, transaktion_id) VALUES (@id, 'x.json', 'sha256-0', 'v1', 1, @tx)", {
      id: lauf,
      tx: laufTx,
    }),
  )
  return lauf
}

interface Fall {
  readonly tabelle: string
  /** Über welche Spalte / welchen Anker die Zeile die Person trifft. */
  readonly weg: string
  /** Führt die Vorbereitung (eigene Transaktionen) und dann die gemessene Änderung aus; gibt deren Transaktions-ID zurück. */
  readonly aendern: (u: Umgebung, person: string) => string
}

const FAELLE: readonly Fall[] = [
  {
    tabelle: 'person',
    weg: 'id',
    aendern: (u, p) => u.roh(() => u.sql("UPDATE person SET notiz = 'geändert' WHERE id = @p", { p })),
  },
  {
    tabelle: 'name_form',
    weg: 'person_id',
    aendern: (u, p) =>
      u.roh(() => u.sql("INSERT INTO name_form (id, person_id, rolle, ist_bevorzugt) VALUES (@id, @p, 'aka', 0)", { id: neueId(), p })),
  },
  {
    tabelle: 'name_part',
    weg: 'name_form_id → Anker name (name_form.person_id)',
    aendern: (u, p) => {
      const form = neueId()
      u.roh(() => u.sql("INSERT INTO name_form (id, person_id, rolle, ist_bevorzugt) VALUES (@id, @p, 'aka', 0)", { id: form, p }))
      return u.roh(() =>
        u.sql("INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index) VALUES (@id, @f, 'nachname', 'Meier', 0, 0)", {
          id: neueId(),
          f: form,
        }),
      )
    },
  },
  {
    tabelle: 'ereignis',
    weg: 'id → Anker ereignis (beteiligung.person_id)',
    aendern: (u, p) => {
      const ereignis = ereignisDerPerson(u, p)
      return u.roh(() => u.sql("UPDATE ereignis SET beschreibung = 'Hausgeburt' WHERE id = @e", { e: ereignis }))
    },
  },
  {
    tabelle: 'beteiligung',
    weg: 'person_id',
    aendern: (u, p) => {
      const ereignis = neueId()
      u.roh(() => u.sql("INSERT INTO ereignis (id, typ) VALUES (@id, 'taufe')", { id: ereignis }))
      return u.roh(() =>
        u.sql("INSERT INTO beteiligung (id, ereignis_id, person_id, rolle) VALUES (@id, @e, @p, 'hauptperson')", { id: neueId(), e: ereignis, p }),
      )
    },
  },
  {
    tabelle: 'elternschaft',
    weg: 'elternteil_id',
    aendern: (u, p) =>
      u.roh(() =>
        u.sql("INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @p, @k, 'biologisch')", { id: neueId(), p, k: u.carl }),
      ),
  },
  {
    tabelle: 'elternschaft',
    weg: 'kind_id',
    aendern: (u, p) =>
      u.roh(() =>
        u.sql("INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @e, @p, 'biologisch')", { id: neueId(), e: u.carl, p }),
      ),
  },
  {
    tabelle: 'partnerschaft',
    weg: 'id → Anker partnerschaft (partnerschaft_person.person_id)',
    aendern: (u, p) => {
      const partnerschaft = neueId()
      u.roh(() => {
        u.sql("INSERT INTO partnerschaft (id, typ) VALUES (@id, 'ehe_zivil')", { id: partnerschaft })
        u.sql('INSERT INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@pa, @p)', { pa: partnerschaft, p })
      })
      return u.roh(() => u.sql("UPDATE partnerschaft SET typ = 'ehe_kirchlich' WHERE id = @pa", { pa: partnerschaft }))
    },
  },
  {
    tabelle: 'partnerschaft_person',
    weg: 'person_id',
    aendern: (u, p) => {
      const partnerschaft = neueId()
      u.roh(() => u.sql("INSERT INTO partnerschaft (id, typ) VALUES (@id, 'ehe_zivil')", { id: partnerschaft }))
      return u.roh(() => u.sql('INSERT INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@pa, @p)', { pa: partnerschaft, p }))
    },
  },
  {
    tabelle: 'assoziation',
    weg: 'person_a_id',
    aendern: (u, p) =>
      u.roh(() => u.sql("INSERT INTO assoziation (id, person_a_id, person_b_id, art) VALUES (@id, @p, @b, 'nachbar')", { id: neueId(), p, b: u.carl })),
  },
  {
    tabelle: 'assoziation',
    weg: 'person_b_id',
    aendern: (u, p) =>
      u.roh(() => u.sql("INSERT INTO assoziation (id, person_a_id, person_b_id, art) VALUES (@id, @a, @p, 'nachbar')", { id: neueId(), a: u.carl, p })),
  },
  {
    tabelle: 'quelle',
    weg: 'informant_person_id',
    aendern: (u, p) =>
      u.roh(() => u.sql("INSERT INTO quelle (id, typ, titel, informant_person_id) VALUES (@id, 'muendlich', 'Gespräch', @p)", { id: neueId(), p })),
  },
  {
    tabelle: 'aussage',
    weg: "subjekt_typ = 'person', subjekt_id",
    aendern: (u, p) =>
      u.roh(() =>
        u.sql("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz) VALUES (@id, 'person', @p, 'beruf', 'Weber', 3)", {
          id: neueId(),
          p,
        }),
      ),
  },
  {
    tabelle: 'aussage',
    weg: "subjekt_typ = 'ereignis' → Anker ereignis",
    aendern: (u, p) => {
      const ereignis = ereignisDerPerson(u, p)
      return u.roh(() =>
        u.sql("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz) VALUES (@id, 'ereignis', @e, 'existenz', 'ja', 3)", {
          id: neueId(),
          e: ereignis,
        }),
      )
    },
  },
  {
    tabelle: 'aussage_zitat',
    weg: 'aussage_id → Anker aussage (aussage.subjekt_id)',
    aendern: (u, p) => {
      const zitat = zitatAnlegen(u)
      const aussage = neueId()
      u.roh(() =>
        u.sql("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz) VALUES (@id, 'person', @p, 'beruf', 'Weber', 3)", {
          id: aussage,
          p,
        }),
      )
      return u.roh(() => u.sql('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@a, @z)', { a: aussage, z: zitat }))
    },
  },
  {
    tabelle: 'negativbefund',
    weg: 'gesuchte_person_id',
    aendern: (u, p) =>
      u.roh(() =>
        u.sql("INSERT INTO negativbefund (id, gesuchte_person_id, gesuchtes_praedikat) VALUES (@id, @p, 'geburtsdatum')", { id: neueId(), p }),
      ),
  },
  {
    tabelle: 'persona',
    weg: 'person_id',
    aendern: (u, p) => {
      const zitat = zitatAnlegen(u)
      return u.roh(() => u.sql('INSERT INTO persona (id, zitat_id, person_id) VALUES (@id, @z, @p)', { id: neueId(), z: zitat, p }))
    },
  },
  {
    tabelle: 'medium_zuordnung',
    weg: "subjekt_typ = 'person', subjekt_id",
    aendern: (u, p) => {
      const medium = mediumAnlegen(u)
      return u.roh(() => u.sql("INSERT INTO medium_zuordnung (medium_id, subjekt_typ, subjekt_id) VALUES (@m, 'person', @p)", { m: medium, p }))
    },
  },
  {
    tabelle: 'medium_zuordnung',
    weg: "subjekt_typ = 'ereignis' → Anker ereignis",
    aendern: (u, p) => {
      const medium = mediumAnlegen(u)
      const ereignis = ereignisDerPerson(u, p)
      return u.roh(() => u.sql("INSERT INTO medium_zuordnung (medium_id, subjekt_typ, subjekt_id) VALUES (@m, 'ereignis', @e)", { m: medium, e: ereignis }))
    },
  },
  {
    tabelle: 'medium_region',
    weg: 'person_id',
    aendern: (u, p) => {
      const medium = mediumAnlegen(u)
      return u.roh(() => u.sql('INSERT INTO medium_region (id, medium_id, person_id, x, y, w, h) VALUES (@id, @m, @p, 0, 0, 1, 1)', { id: neueId(), m: medium, p }))
    },
  },
  {
    tabelle: 'aufgabe',
    weg: 'person_id',
    aendern: (u, p) => u.roh(() => u.sql("INSERT INTO aufgabe (id, person_id, titel) VALUES (@id, @p, 'Taufe suchen')", { id: neueId(), p })),
  },
  {
    tabelle: 'diagnose',
    weg: 'person_id',
    aendern: (u, p) => u.roh(() => u.sql("INSERT INTO diagnose (id, person_id, kategorie) VALUES (@id, @p, 'stoffwechsel')", { id: neueId(), p })),
  },
  {
    tabelle: 'risikofaktor',
    weg: 'person_id',
    aendern: (u, p) => u.roh(() => u.sql("INSERT INTO risikofaktor (id, person_id, art) VALUES (@id, @p, 'rauchen')", { id: neueId(), p })),
  },
  {
    tabelle: 'feld_wert',
    weg: "subjekt_typ = 'person', subjekt_id",
    aendern: (u, p) => {
      const feld = feldDefinitionAnlegen(u, 'person')
      return u.roh(() =>
        u.sql("INSERT INTO feld_wert (id, feld_definition_id, subjekt_typ, subjekt_id, wert_text) VALUES (@id, @f, 'person', @p, 'x')", {
          id: neueId(),
          f: feld,
          p,
        }),
      )
    },
  },
  {
    tabelle: 'feld_wert',
    weg: "subjekt_typ = 'ereignis' → Anker ereignis",
    aendern: (u, p) => {
      const feld = feldDefinitionAnlegen(u, 'ereignis')
      const ereignis = ereignisDerPerson(u, p)
      return u.roh(() =>
        u.sql("INSERT INTO feld_wert (id, feld_definition_id, subjekt_typ, subjekt_id, wert_text) VALUES (@id, @f, 'ereignis', @e, 'x')", {
          id: neueId(),
          f: feld,
          e: ereignis,
        }),
      )
    },
  },
  {
    tabelle: 'interview_sitzung',
    weg: 'informant_person_id',
    aendern: (u, p) => u.roh(() => u.sql("INSERT INTO interview_sitzung (id, informant_person_id, status) VALUES (@id, @p, 'offen')", { id: neueId(), p })),
  },
  {
    tabelle: 'import_herkunft',
    weg: "datensatz_typ = 'person', datensatz_id",
    aendern: (u, p) => {
      const lauf = importLaufAnlegen(u)
      return u.roh(() =>
        u.sql("INSERT INTO import_herkunft (id, import_lauf_id, datensatz_id, datensatz_typ) VALUES (@id, @l, @p, 'person')", { id: neueId(), l: lauf, p }),
      )
    },
  },
  {
    tabelle: 'import_herkunft',
    weg: "datensatz_typ = 'ereignis' → Anker ereignis",
    aendern: (u, p) => {
      const lauf = importLaufAnlegen(u)
      const ereignis = ereignisDerPerson(u, p)
      return u.roh(() =>
        u.sql("INSERT INTO import_herkunft (id, import_lauf_id, datensatz_id, datensatz_typ) VALUES (@id, @l, @e, 'ereignis')", {
          id: neueId(),
          l: lauf,
          e: ereignis,
        }),
      )
    },
  },
]

function tabellenDer(db: Database.Database, txId: string): readonly string[] {
  return db
    .prepare<{ readonly t: string }, { readonly tabelle: string }>('SELECT DISTINCT tabelle FROM aenderung WHERE transaktion_id = @t ORDER BY tabelle')
    .all({ t: txId })
    .map((z) => z.tabelle)
}

function ids(verlauf: readonly { readonly id: string }[]): readonly string[] {
  return verlauf.map((eintrag) => eintrag.id)
}

describe('Personenverlauf: Treffer je Tabelle der Personenbezugsliste (AP-1.30 PR 5, hueter #155)', () => {
  it('jede Tabelle aus PERSONENBEZUG hat mindestens einen Fall', () => {
    const abgedeckt = new Set(FAELLE.map((fall) => fall.tabelle))
    expect(Object.keys(PERSONENBEZUG).filter((tabelle) => !abgedeckt.has(tabelle))).toEqual([])
  })

  it.each(FAELLE.map((fall) => [`${fall.tabelle} über ${fall.weg}`, fall] as const))('%s', (_titel, fall) => {
    const u = umgebungAufbauen()
    try {
      const txAnna = fall.aendern(u, u.anna)
      const txBernd = fall.aendern(u, u.bernd)
      // Die gemessenen Transaktionen ändern nur diese Tabelle — der Treffer kommt aus ihrem Eintrag.
      expect(tabellenDer(u.db, txAnna)).toEqual([fall.tabelle])
      expect(tabellenDer(u.db, txBernd)).toEqual([fall.tabelle])

      const verlaufAnna = ids(journalVerlauf(u.db, 50, u.anna))
      const verlaufBernd = ids(journalVerlauf(u.db, 50, u.bernd))
      expect(verlaufAnna).toContain(txAnna)
      expect(verlaufAnna).not.toContain(txBernd)
      expect(verlaufBernd).toContain(txBernd)
      expect(verlaufBernd).not.toContain(txAnna)
    } finally {
      u.db.close()
    }
  })
})
