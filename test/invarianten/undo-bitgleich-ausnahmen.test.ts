// AP-1.34 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, ADR-009-Nachtrag 24.09.2026).
// Pinnt, WAS der kanonische Abzug (`_kanonischer-abzug.ts`) der Undo-Bitgleich-Invariante vergleicht.
//
// Anlass: die frühere Fassung des Abzugs nahm `...NICHT_JOURNALISIERT` pauschal aus. Dadurch fielen
// `schema_migration`, `merge_protokoll` und `id_alias` still aus dem Vergleich, obwohl
// 55_Architektur.md §4.9 Punkt 5 nur Journal + abgeleitete Tabellen ausnimmt. Eine solche stille
// Ausnahme ist genau die Art Lücke, die eine Invariante leer macht, ohne dass ein Test rot wird.
//
// Diese Datei hält darum eine EIGENE, wörtliche Erwartungsliste (bewusst NICHT aus
// `_kanonischer-abzug.ts` importiert — sonst prüfte sich die Liste gegen sich selbst) und gleicht
// sie gegen das tatsächliche Verhalten von `kanonischerAbzug()` ab:
//
// - B-T1: Schema-Tabellen minus Tabellen im Abzug == genau die Erwartungsliste; die fachliche
//         Ausnahme ist exakt ['kennung_zaehler'].
// - B-T2: keine journalisierte Tabelle steht auf der Liste; jeder Eintrag existiert im Schema
//         (keine toten Einträge, die eine künftige Tabelle gleichen Namens still ausnähmen).
// - B-T3: jede NICHT_JOURNALISIERT-Tabelle, die nicht auf der Liste steht, erscheint im Abzug.
// - B-T4: Mutationsprobe — eine Zeile in jeder journalisierten Tabelle bzw. in schema_migration,
//         id_alias, merge_protokoll verändert den Abzug.
// - B-T5: eine Änderung an kennung_zaehler verändert den Abzug NICHT (das ist die Ausnahme).
// - B-T6: eine neu angelegte Tabelle wird automatisch verglichen (fail-closed).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { JOURNALISIERT, NICHT_JOURNALISIERT } from '../../src/main/journal/journalisierung'
import { transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import { kanonischerAbzug } from './_kanonischer-abzug'
import { minimalZeileFuer, vorstufeAnlegen } from './_journal-minimalzeilen'

/** Journal (ADR-018): dort soll sich durch Undo/Redo etwas ändern. */
const ERWARTET_JOURNAL = ['aenderung', 'journal_kontext', 'transaktion'] as const
/** Abgeleitet (55_Architektur.md §5.3): gegen Neuaufbau geprüft in abgeleitet-gleich.test.ts. */
const ERWARTET_ABGELEITET = [
  'name_phonetik',
  'person_flach',
  'suche_fts',
  'suche_fts_config',
  'suche_fts_data',
  'suche_fts_docsize',
  'suche_fts_idx',
  'suche_fts_quelle',
] as const
/** Fachlich (AP-1.34, E14): Kennung wird nie neu vergeben, Zähler bleibt nach Undo stehen. */
const ERWARTET_FACHLICH = ['kennung_zaehler'] as const

const ERWARTET_AUSGENOMMEN: readonly string[] = [...ERWARTET_JOURNAL, ...ERWARTET_ABGELEITET, ...ERWARTET_FACHLICH].sort()

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function schemaTabellen(db: Db): readonly string[] {
  return db
    .prepare<[], { readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((zeile) => zeile.name)
}

/** Tabellennamen aus den Kopfzeilen `## <tabelle> (n)` (bzw. `## <tabelle>`) des Abzugs. */
function tabellenImAbzug(abzug: string): readonly string[] {
  const namen: string[] = []
  for (const treffer of abzug.matchAll(/^## (\S+)/gm)) {
    const name = treffer[1]
    if (name !== undefined) {
      namen.push(name)
    }
  }
  return namen
}

function ausgenommeneTabellen(db: Db): readonly string[] {
  const imAbzug = new Set(tabellenImAbzug(kanonischerAbzug(db)))
  return schemaTabellen(db)
    .filter((name) => !imAbzug.has(name))
    .sort()
}

describe('Undo-Bitgleich: Ausnahmen des kanonischen Abzugs sind fest gepinnt (ADR-009-Nachtrag, AP-1.34)', () => {
  it('B-T1: Schema-Tabellen minus Abzug-Tabellen sind genau die wörtliche Ausnahmeliste; fachliche Ausnahme exakt kennung_zaehler', () => {
    const db = neueTestDatenbank()
    try {
      expect(ausgenommeneTabellen(db)).toEqual(ERWARTET_AUSGENOMMEN)
      const fachlich = ausgenommeneTabellen(db).filter(
        (name) => !(ERWARTET_JOURNAL as readonly string[]).includes(name) && !(ERWARTET_ABGELEITET as readonly string[]).includes(name),
      )
      expect(fachlich).toEqual(['kennung_zaehler'])
    } finally {
      db.close()
    }
  })

  it('B-T2: keine journalisierte Tabelle ist ausgenommen, und jeder Listeneintrag existiert im Schema', () => {
    const db = neueTestDatenbank()
    try {
      const journalisiert: ReadonlySet<string> = new Set(JOURNALISIERT)
      expect(ERWARTET_AUSGENOMMEN.filter((name) => journalisiert.has(name))).toEqual([])
      const schema = new Set(schemaTabellen(db))
      expect(ERWARTET_AUSGENOMMEN.filter((name) => !schema.has(name))).toEqual([])
    } finally {
      db.close()
    }
  })

  it('B-T3: jede NICHT_JOURNALISIERT-Tabelle außerhalb der Ausnahmeliste erscheint im Abzug', () => {
    const db = neueTestDatenbank()
    try {
      const imAbzug = new Set(tabellenImAbzug(kanonischerAbzug(db)))
      const erwartetImAbzug = NICHT_JOURNALISIERT.filter((name) => !ERWARTET_AUSGENOMMEN.includes(name))
      // Nicht leer: sonst prüfte die Schleife unten nichts. Heute schema_migration, merge_protokoll, id_alias.
      expect([...erwartetImAbzug].sort()).toEqual(['id_alias', 'merge_protokoll', 'schema_migration'])
      for (const name of erwartetImAbzug) {
        expect(imAbzug.has(name), `${name} fehlt im kanonischen Abzug`).toBe(true)
      }
    } finally {
      db.close()
    }
  })
})

describe('Undo-Bitgleich: Mutationsprobe — eine Änderung an einer verglichenen Tabelle verändert den Abzug (AP-1.34)', () => {
  it.each(JOURNALISIERT)('B-T4: eine zusätzliche Zeile in "%s" verändert den Abzug', (tabelle) => {
    const db = neueTestDatenbank()
    try {
      const vorstufe = vorstufeAnlegen(db)
      const vorher = kanonischerAbzug(db)
      const { sql, params } = minimalZeileFuer(tabelle, vorstufe)
      db.transaction(() => {
        const transaktionId = uuidv7()
        transaktionAnlegen(db, { id: transaktionId, zeitpunkt: 1_700_000_000_001, art: 'nutzer', lfd: 2 })
        armieren(db, transaktionId)
        db.prepare(sql).run(params)
        entwaffnen(db)
      }).immediate()
      expect(kanonischerAbzug(db)).not.toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('B-T4: eine Änderung an schema_migration verändert den Abzug', () => {
    const db = neueTestDatenbank()
    try {
      const vorher = kanonischerAbzug(db)
      db.prepare("UPDATE schema_migration SET app_version = app_version || '-probe' WHERE version = 1").run()
      expect(kanonischerAbzug(db)).not.toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('B-T4: eine zusätzliche Zeile in id_alias verändert den Abzug', () => {
    const db = neueTestDatenbank()
    try {
      const vorher = kanonischerAbzug(db)
      db.prepare("INSERT INTO id_alias (alte_id, neue_id, typ) VALUES (@alteId, @neueId, 'person')").run({
        alteId: uuidv7(),
        neueId: uuidv7(),
      })
      expect(kanonischerAbzug(db)).not.toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('B-T4: eine zusätzliche Zeile in merge_protokoll verändert den Abzug', () => {
    const db = neueTestDatenbank()
    try {
      // FK-Vorstufen: transaktion + zwei Personen (vorstufe.personId als Ziel, eine zweite als Quelle).
      const vorstufe = vorstufeAnlegen(db)
      const quellPersonId = uuidv7()
      db.transaction(() => {
        const transaktionId = uuidv7()
        transaktionAnlegen(db, { id: transaktionId, zeitpunkt: 1_700_000_000_001, art: 'nutzer', lfd: 2 })
        armieren(db, transaktionId)
        const { sql, params } = minimalZeileFuer('person', vorstufe)
        db.prepare(sql).run({ ...params, id: quellPersonId })
        entwaffnen(db)
      }).immediate()
      const vorher = kanonischerAbzug(db)
      db.prepare(
        'INSERT INTO merge_protokoll (id, transaktion_id, ziel_person_id, quell_person_id) VALUES (@id, @transaktionId, @zielPersonId, @quellPersonId)',
      ).run({ id: uuidv7(), transaktionId: vorstufe.transaktionId, zielPersonId: vorstufe.personId, quellPersonId })
      expect(kanonischerAbzug(db)).not.toBe(vorher)
    } finally {
      db.close()
    }
  })
})

describe('Undo-Bitgleich: die fachliche Ausnahme und fail-closed (AP-1.34)', () => {
  it('B-T5: ein Vorrücken von kennung_zaehler verändert den Abzug nicht', () => {
    const db = neueTestDatenbank()
    try {
      const vorher = kanonischerAbzug(db)
      const naechsteVorher = db
        .prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
        .get()?.naechste
      db.prepare("UPDATE kennung_zaehler SET naechste = naechste + 1 WHERE bereich = 'person'").run()
      const naechsteNachher = db
        .prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
        .get()?.naechste
      // Gegenprobe: die Änderung hat tatsächlich stattgefunden — sonst wäre "Abzug gleich" leer.
      expect(naechsteVorher).toBeDefined()
      expect(naechsteNachher).toBe((naechsteVorher ?? 0) + 1)
      expect(kanonischerAbzug(db)).toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('B-T6: eine neu angelegte Tabelle erscheint automatisch im Abzug', () => {
    const db = neueTestDatenbank()
    try {
      const vorher = kanonischerAbzug(db)
      db.prepare('CREATE TABLE probe_neu (id TEXT PRIMARY KEY) STRICT').run()
      db.prepare("INSERT INTO probe_neu (id) VALUES ('probe-1')").run()
      const nachher = kanonischerAbzug(db)
      expect(tabellenImAbzug(nachher)).toContain('probe_neu')
      expect(nachher).toContain('## probe_neu (1)')
      expect(nachher).not.toBe(vorher)
    } finally {
      db.close()
    }
  })
})
