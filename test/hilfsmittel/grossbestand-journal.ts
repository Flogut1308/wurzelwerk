// AP-1.30 (PR 5): der 2000er-Bestand (grossbestand.ts) MIT einem realistischen Journal für das
// Leistungsbudget `abfrage:journal.verlauf (Person)` (test/budget/leistung.test.ts).
//
// Der Bestand entsteht in `baueFixture()` ohne Journal. Hier kommt dazu:
//  1. EINE Import-Transaktion (`art = 'import'`), deren `aenderung`-Zeilen die insert-Zeilenbilder
//     ALLER Zeilen der befüllten journalisierten Tabellen sind (~20.000 Zeilen). Ein echter Import
//     dieser Größe liefe als Großimport ohne Journal (ADR-019) — als Obergrenze für die Menge, die
//     die Abfrage lesen muss, ist das journalisierte Bild aber der ungünstigere und damit richtige
//     Messfall (z. B. ein über viele kleine Importe/Bearbeitungen gewachsenes Journal). Dazu
//     `import_lauf` + `import_herkunft` je Person (über die echten `jrn_*`-Trigger journalisiert).
//  2. Einige Dutzend Nutzeränderungen über den echten Befehlsbus.
// Deterministisch bis auf die IDs der Journalzeilen (`uuid7()`), die für die Messung keine Rolle
// spielen.
import type Database from 'better-sqlite3'
import { fuehreAus } from '../../src/main/befehle/bus'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen, journalAn } from '../../src/main/journal/kontext'
import { JOURNALISIERT } from '../../src/main/journal/journalisierung'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import { grossbestandAufbauen } from './grossbestand'

interface Spalte {
  readonly name: string
  readonly pk: number
}

function zeilenbildEinfuegen(db: Database.Database, txId: string, tabelle: string): void {
  const spalten = db.prepare<{ readonly t: string }, Spalte>('SELECT name, pk FROM pragma_table_info(@t) ORDER BY cid').all({ t: tabelle })
  const schluessel = spalten
    .filter((s) => s.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((s) => s.name)
  const objekt = spalten.map((s) => `'${s.name}', ${s.name}`).join(', ')
  // Nur Schema-Bezeichner aus pragma_table_info werden eingesetzt (Testhelfer, keine Nutzerwerte).
  db.prepare<{ readonly tx: string; readonly t: string }>(
    `INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
     SELECT uuid7(), @tx,
            (SELECT COALESCE(MAX(reihenfolge), 0) FROM aenderung WHERE transaktion_id = @tx) + ROW_NUMBER() OVER (),
            @t, ${schluessel.join(" || '|' || ")}, NULL, json_object(${objekt}), 'insert'
     FROM ${tabelle}`,
  ).run({ tx: txId, t: tabelle })
}

/** Aufrufer schließt die Verbindung (`db.close()`). */
export function grossbestandMitJournalAufbauen(): Database.Database {
  const db = grossbestandAufbauen()
  journalAn(db)

  const txId = neueId()
  db.transaction((): void => {
    transaktionAnlegen(db, { id: txId, zeitpunkt: 1, art: 'import', beschreibung: 'Import grossbestand.json', lfd: naechsteLfd(db) })
    for (const tabelle of JOURNALISIERT) zeilenbildEinfuegen(db, txId, tabelle)
    armieren(db, txId)
    try {
      const laufId = neueId()
      db.prepare<{ readonly id: string; readonly tx: string }>(
        "INSERT INTO import_lauf (id, datei, pruefsumme, vertragsversion, zeitpunkt, transaktion_id) VALUES (@id, 'grossbestand.json', 'sha256-0', 'v1', 1, @tx)",
      ).run({ id: laufId, tx: txId })
      db.prepare<{ readonly lauf: string }>(
        "INSERT INTO import_herkunft (id, import_lauf_id, datensatz_id, datensatz_typ) SELECT uuid7(), @lauf, id, 'person' FROM person",
      ).run({ lauf: laufId })
    } finally {
      entwaffnen(db)
    }
  })()

  // Nutzeränderungen: je 20 Personen eine Notiz, ein Beruf und ein zweiter Name.
  const personen = db.prepare<[], { readonly id: string }>('SELECT id FROM person ORDER BY id LIMIT 20').all()
  for (const { id } of personen) {
    fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'Notiz aus dem Budgetbestand' })
    fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: id, praedikat: 'religion', wertText: 'ev.', konfidenz: 3 })
    fuehreAus(db, 'name.anlegen', { personId: id, typ: 'aka', vornamen: 'Zweit', nachname: 'Name', istBevorzugt: 0 })
  }
  return db
}
