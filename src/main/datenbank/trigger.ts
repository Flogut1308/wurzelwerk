// AP-0.7, 55_Architektur.md §5.2/§5.3: "Abgeleitete Tabellen tragen keine Wahrheit. Sie sind
// jederzeit vollständig aus den Basistabellen neu berechenbar." Diese Funktion ist genau das -
// die Wahrheit/Recovery, falls die inkrementellen `abl_*`-Trigger je einen Fall vergessen. Sie
// benutzt exakt dieselbe kanonische Projektions-SQL wie die Trigger selbst
// (`src/main/datenbank/abgeleitet-projektion.ts`, von `skripte/trigger-generieren.ts` in
// `docs/schema/0003_abgeleitet.sql` eingebettet) — das ist die Bitgleichheits-Garantie.
import type Database from 'better-sqlite3'
import {
  nameFtsNormalformSql,
  nameFtsOriginalSql,
  nameFtsUmschriftSql,
  namePhonetikCodeSql,
  personFlachProjektionSql,
  personNotizFtsSql,
  zitatTranskriptFtsSql,
} from './abgeleitet-projektion'

/**
 * Rumpf von `alleAbgeleitetenNeuAufbauen()` — OHNE eigene Transaktionsklammer. Herausgelöst
 * (AP-0.13), damit `src/main/datenbank/integritaet.ts` (`ableitungAbweichung`) denselben
 * Neuaufbau innerhalb ihrer EIGENEN `BEGIN`/`ROLLBACK`-Klammer aufrufen kann, um den
 * inkrementellen Vorher-Zustand nach dem Vergleich wieder rückgängig zu machen — ein
 * verschachteltes `BEGIN` wäre in SQLite ein Fehler. Kein Verhaltenswechsel gegenüber der
 * vorherigen Fassung: exakt derselbe SQL-Rumpf, nur ohne BEGIN/COMMIT/ROLLBACK drumherum.
 */
export function abgeleiteteNeuAufbauenInner(db: Database.Database): void {
  db.exec('DELETE FROM person_flach')
  db.exec('DELETE FROM name_phonetik')
  db.exec('DELETE FROM suche_fts_quelle')
  // 'delete-all' ist der dokumentierte FTS5-Sonderbefehl, der den Index vollständig leert -
  // funktioniert unabhängig von content='' (contentless), weil er nur die internen Schattentabellen
  // trifft, nicht die (hier ohnehin nicht vorhandene) Originalinhaltstabelle.
  db.exec("INSERT INTO suche_fts (suche_fts) VALUES ('delete-all')")

  db.exec(`INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)\n${personFlachProjektionSql('1 = 1')}`)

  db.exec(`INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT n.id, 'koelner', ${namePhonetikCodeSql('n')}
    FROM name AS n
    WHERE n.nachname IS NOT NULL AND n.nachname <> ''`)

  // Reihenfolge der drei Quellarten ist beliebig (rowid kommt aus suche_fts_quelle, unabhängig
  // von der Einfügereihenfolge über Tabellengrenzen) - wichtig ist nur: erst die Zuordnung
  // (liefert die rowid), dann der zugehörige Indexeintrag mit derselben rowid.
  db.exec(`INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'person_notiz', id FROM person`)
  db.exec(`INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, '', '', '', ${personNotizFtsSql('p')}, ''
    FROM person AS p JOIN suche_fts_quelle q ON q.quelle_typ = 'person_notiz' AND q.quelle_id = p.id`)

  db.exec(`INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'name', id FROM name`)
  db.exec(`INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, ${nameFtsOriginalSql('n')}, ${nameFtsUmschriftSql('n.id')}, ${nameFtsNormalformSql('n')}, '', ''
    FROM name AS n JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = n.id`)

  db.exec(`INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'zitat_transkript', id FROM zitat`)
  db.exec(`INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, '', '', '', '', ${zitatTranskriptFtsSql('z')}
    FROM zitat AS z JOIN suche_fts_quelle q ON q.quelle_typ = 'zitat_transkript' AND q.quelle_id = z.id`)
}

/**
 * Löscht und berechnet `person_flach`, `name_phonetik`, `suche_fts` und `suche_fts_quelle`
 * vollständig neu. Läuft in einer eigenen Transaktion (BEGIN/COMMIT gehört laut CLAUDE.md §2
 * eigentlich nur `src/main/befehle/` - diese Funktion ist aber selbst die Wartungsoperation, kein
 * Repository, und öffnet die Transaktion darum bewusst hier, analog zu
 * `src/main/datenbank/migration/laeufer.ts`). Wird über den IPC-Kanal
 * `befehl:wartung.abgeleiteteNeuAufbauen` erreichbar gemacht.
 */
export function alleAbgeleitetenNeuAufbauen(db: Database.Database): void {
  db.exec('BEGIN')
  try {
    abgeleiteteNeuAufbauenInner(db)
    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }
}
