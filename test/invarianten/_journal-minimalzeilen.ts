// AP-0.8 PR-B, Hilfsdatei für test/invarianten/journal-vollstaendig.test.ts (geschützter Prüfpfad,
// CLAUDE.md §13/ADR-025). Baut für JEDE Tabelle aus JOURNALISIERT (src/main/journal/
// journalisierung.ts) eine minimal gültige INSERT-Zeile - inklusive der nötigen
// Fremdschlüssel-Vorstufen (name→person, ortsname/ortszugehoerigkeit/ort_externe_id→ort,
// zitat→quelle, aussage_zitat→aussage+zitat, persona→zitat, import_herkunft→import_lauf, …).
//
// `vorstufeAnlegen()` legt diese Vorstufen-Zeilen selbst über eine korrekt armierte
// Bus-Emulation an (exakt das Muster aus test/einheit/journal-trigger.test.ts:
// transaktionAnlegen → armieren → INSERT → entwaffnen, alles in einer BEGIN IMMEDIATE-Transaktion)
// - danach steht `journal_kontext` wieder im "scharfen Ruhezustand" (aktiv=1, transaktion_id=NULL).
// `minimalZeileFuer()` liefert dann je Zieltabelle GENAU das INSERT, das der eigentliche Test ohne
// erneutes `armieren()` gegen diesen Ruhezustand abfeuert.
import type Database from 'better-sqlite3'
import { v7 as uuidv7 } from 'uuid'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import type { JournalisierteTabelle } from '../../src/main/journal/journalisierung'
import { transaktionAnlegen } from '../../src/main/repositories/journal-repo'

export interface Vorstufe {
  readonly transaktionId: string
  readonly personId: string
  readonly ortId: string
  readonly partnerschaftId: string
  readonly ereignisId: string
  readonly mediumId: string
  readonly feldDefinitionId: string
  readonly quelleId: string
  readonly aussageId: string
  readonly zitatId: string
  readonly importLaufId: string
}

/**
 * Legt genau eine Zeile je "Basis"-Tabelle an, die als Fremdschlüsselziel für andere journalisierte
 * Tabellen gebraucht wird. `transaktion` selbst ist NICHT_JOURNALISIERT (journalisierung.ts) - ihr
 * INSERT braucht kein `armieren()`, läuft hier aber ohnehin innerhalb der schon armierten
 * Vorstufen-Transaktion mit (Reihenfolge ist ihm egal). Endet mit `entwaffnen()`: `aktiv` bleibt 1
 * ("scharfer Ruhezustand", 55_Architektur.md §4.3), `transaktion_id` wird NULL - der Zustand, den
 * jede von `minimalZeileFuer()` erzeugte Direktschreibung ohne Bus vorfindet.
 */
export function vorstufeAnlegen(db: Database.Database): Vorstufe {
  const vorstufe: Vorstufe = {
    transaktionId: uuidv7(),
    personId: uuidv7(),
    ortId: uuidv7(),
    partnerschaftId: uuidv7(),
    ereignisId: uuidv7(),
    mediumId: uuidv7(),
    feldDefinitionId: uuidv7(),
    quelleId: uuidv7(),
    aussageId: uuidv7(),
    zitatId: uuidv7(),
    importLaufId: uuidv7(),
  }

  db.transaction(() => {
    transaktionAnlegen(db, { id: vorstufe.transaktionId, zeitpunkt: 1_700_000_000_000, art: 'nutzer', lfd: 1 })
    armieren(db, vorstufe.transaktionId)

    db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: vorstufe.personId })
    db.prepare('INSERT INTO ort (id) VALUES (@id)').run({ id: vorstufe.ortId })
    db.prepare("INSERT INTO partnerschaft (id, typ) VALUES (@id, 'ehe_zivil')").run({ id: vorstufe.partnerschaftId })
    db.prepare("INSERT INTO ereignis (id, typ) VALUES (@id, 'geburt')").run({ id: vorstufe.ereignisId })
    db.prepare('INSERT INTO medium (id) VALUES (@id)').run({ id: vorstufe.mediumId })
    db.prepare('INSERT INTO feld_definition (id, schluessel) VALUES (@id, @schluessel)').run({
      id: vorstufe.feldDefinitionId,
      schluessel: `journal-vollstaendig-vorstufe-${vorstufe.feldDefinitionId}`,
    })
    db.prepare("INSERT INTO quelle (id, typ) VALUES (@id, 'kirchenbuch')").run({ id: vorstufe.quelleId })
    db.prepare('INSERT INTO zitat (id, quelle_id) VALUES (@id, @quelleId)').run({
      id: vorstufe.zitatId,
      quelleId: vorstufe.quelleId,
    })
    db.prepare("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat) VALUES (@id, 'person', @personId, 'test')").run({
      id: vorstufe.aussageId,
      personId: vorstufe.personId,
    })
    db.prepare('INSERT INTO import_lauf (id, transaktion_id) VALUES (@id, @transaktionId)').run({
      id: vorstufe.importLaufId,
      transaktionId: vorstufe.transaktionId,
    })

    entwaffnen(db)
  }).immediate()

  return vorstufe
}

export interface MinimalZeile {
  readonly sql: string
  readonly params: Readonly<Record<string, string | number>>
}

/**
 * Minimal gültige INSERT-Zeile für `tabelle` (nur NOT-NULL-Spalten + gültige CHECK-Werte, alle
 * Fremdschlüssel aus `vorstufe`). Bewusst je Tabelle explizit ausgeschrieben statt generisch aus
 * `PRAGMA table_info` abgeleitet - das macht sichtbar, WELCHE Spalte je Tabelle Pflicht ist (Bezug
 * zu docs/schema/0002_kern.sql), und der `never`-Zweig am Ende zwingt einen Compile-Fehler, sobald
 * `JOURNALISIERT` um eine hier nicht behandelte Tabelle wächst (CLAUDE.md §4: kein stillschweigend
 * übersprungener Fall).
 */
export function minimalZeileFuer(tabelle: JournalisierteTabelle, v: Vorstufe): MinimalZeile {
  switch (tabelle) {
    case 'person':
      return { sql: 'INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)', params: { id: uuidv7() } }
    case 'name':
      return {
        sql: "INSERT INTO name (id, person_id, typ) VALUES (@id, @personId, 'geburtsname')",
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'ort':
      return { sql: 'INSERT INTO ort (id) VALUES (@id)', params: { id: uuidv7() } }
    case 'ortsname':
      return { sql: 'INSERT INTO ortsname (id, ort_id) VALUES (@id, @ortId)', params: { id: uuidv7(), ortId: v.ortId } }
    case 'ortszugehoerigkeit':
      return {
        sql: "INSERT INTO ortszugehoerigkeit (id, ort_id, uebergeordnet_id, art) VALUES (@id, @ortId, @ortId, 'politisch')",
        params: { id: uuidv7(), ortId: v.ortId },
      }
    case 'ort_externe_id':
      return {
        sql: "INSERT INTO ort_externe_id (ort_id, system, wert) VALUES (@ortId, 'gov', 'journal-vollstaendig-test')",
        params: { ortId: v.ortId },
      }
    case 'ereignis':
      return { sql: "INSERT INTO ereignis (id, typ) VALUES (@id, 'geburt')", params: { id: uuidv7() } }
    case 'beteiligung':
      return {
        sql: "INSERT INTO beteiligung (id, ereignis_id, person_id, rolle) VALUES (@id, @ereignisId, @personId, 'hauptperson')",
        params: { id: uuidv7(), ereignisId: v.ereignisId, personId: v.personId },
      }
    case 'elternschaft':
      // elternteil_id = kind_id (dieselbe Vorstufen-Person): die Zeile wird nie committet (der
      // Trigger-Fehlschlag rollt den ganzen Direktschreibversuch zurück, siehe Testdatei) - eine
      // fachliche Zyklusfreiheit (CLAUDE.md §5) ist hier nicht das Prüfziel, nur die FK-Gültigkeit.
      return {
        sql: "INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @personId, @personId, 'biologisch')",
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'partnerschaft':
      return { sql: "INSERT INTO partnerschaft (id, typ) VALUES (@id, 'ehe_zivil')", params: { id: uuidv7() } }
    case 'partnerschaft_person':
      return {
        sql: 'INSERT INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@partnerschaftId, @personId)',
        params: { partnerschaftId: v.partnerschaftId, personId: v.personId },
      }
    case 'assoziation':
      return {
        sql: 'INSERT INTO assoziation (id, person_a_id, person_b_id) VALUES (@id, @personId, @personId)',
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'archiv':
      return { sql: 'INSERT INTO archiv (id) VALUES (@id)', params: { id: uuidv7() } }
    case 'quelle':
      return { sql: "INSERT INTO quelle (id, typ) VALUES (@id, 'kirchenbuch')", params: { id: uuidv7() } }
    case 'zitat':
      return {
        sql: 'INSERT INTO zitat (id, quelle_id) VALUES (@id, @quelleId)',
        params: { id: uuidv7(), quelleId: v.quelleId },
      }
    case 'aussage':
      return {
        sql: "INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat) VALUES (@id, 'person', @personId, 'test')",
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'aussage_zitat':
      return {
        sql: 'INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)',
        params: { aussageId: v.aussageId, zitatId: v.zitatId },
      }
    case 'negativbefund':
      return {
        sql: 'INSERT INTO negativbefund (id, gesuchte_person_id) VALUES (@id, @personId)',
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'persona':
      return {
        sql: 'INSERT INTO persona (id, zitat_id) VALUES (@id, @zitatId)',
        params: { id: uuidv7(), zitatId: v.zitatId },
      }
    case 'medium':
      return { sql: 'INSERT INTO medium (id) VALUES (@id)', params: { id: uuidv7() } }
    case 'medium_zuordnung':
      return {
        sql: "INSERT INTO medium_zuordnung (medium_id, subjekt_typ, subjekt_id) VALUES (@mediumId, 'person', @personId)",
        params: { mediumId: v.mediumId, personId: v.personId },
      }
    case 'medium_region':
      return {
        sql: 'INSERT INTO medium_region (id, medium_id) VALUES (@id, @mediumId)',
        params: { id: uuidv7(), mediumId: v.mediumId },
      }
    case 'aufgabe':
      return { sql: 'INSERT INTO aufgabe (id) VALUES (@id)', params: { id: uuidv7() } }
    case 'diagnose':
      return {
        sql: 'INSERT INTO diagnose (id, person_id) VALUES (@id, @personId)',
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'risikofaktor':
      return {
        sql: 'INSERT INTO risikofaktor (id, person_id) VALUES (@id, @personId)',
        params: { id: uuidv7(), personId: v.personId },
      }
    case 'feld_definition':
      return {
        sql: 'INSERT INTO feld_definition (id, schluessel) VALUES (@id, @schluessel)',
        params: { id: uuidv7(), schluessel: `journal-vollstaendig-ziel-${uuidv7()}` },
      }
    case 'feld_auswahloption':
      return {
        sql: 'INSERT INTO feld_auswahloption (id, feld_definition_id) VALUES (@id, @feldDefinitionId)',
        params: { id: uuidv7(), feldDefinitionId: v.feldDefinitionId },
      }
    case 'feld_wert':
      return {
        sql: "INSERT INTO feld_wert (id, feld_definition_id, subjekt_typ, subjekt_id) VALUES (@id, @feldDefinitionId, 'person', @personId)",
        params: { id: uuidv7(), feldDefinitionId: v.feldDefinitionId, personId: v.personId },
      }
    case 'interview_sitzung':
      return { sql: 'INSERT INTO interview_sitzung (id) VALUES (@id)', params: { id: uuidv7() } }
    case 'import_lauf':
      return {
        sql: 'INSERT INTO import_lauf (id, transaktion_id) VALUES (@id, @transaktionId)',
        params: { id: uuidv7(), transaktionId: v.transaktionId },
      }
    case 'import_herkunft':
      return {
        sql: "INSERT INTO import_herkunft (id, import_lauf_id, datensatz_id, datensatz_typ) VALUES (@id, @importLaufId, 'x', 'person')",
        params: { id: uuidv7(), importLaufId: v.importLaufId },
      }
    case 'ansicht_zustand':
      return { sql: 'INSERT INTO ansicht_zustand (id) VALUES (@id)', params: { id: uuidv7() } }
    default: {
      const nieErreicht: never = tabelle
      throw new Error(
        `minimalZeileFuer(): unbehandelte Tabelle "${String(nieErreicht)}" - JOURNALISIERT (journalisierung.ts) wurde erweitert, diese Datei nicht nachgezogen.`,
      )
    }
  }
}
