import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { WurzelFehler } from '../../../shared/fehler/wurzel-fehler'
import { generierteTriggerAnwenden } from './trigger-anwenden'
import { journalAn, journalAus } from '../../journal/kontext'
import { MIGRATIONEN, migrationsRohInhaltLesen, pruefsummeBerechnen, type MigrationEintrag } from './registrierung'

/** Eine Zeile aus `schema_migration` (nur die für die Prüfsummenprüfung relevanten Spalten). */
interface SchemaMigrationZeile {
  readonly version: number
  readonly pruefsumme: string
}

export interface LaeufenOptionen {
  /** Test-Seam: Standard ist die echte Registry `MIGRATIONEN`. */
  readonly migrationen?: readonly MigrationEintrag[]
  /** Test-Seam: Standard liest die echte Datei über `migrationsRohInhaltLesen`. */
  readonly inhaltLesen?: (eintrag: MigrationEintrag) => Buffer
  /**
   * Basisverzeichnis der Migrations-SQL (AP-0.17). Standard `join(process.cwd(), 'docs',
   * 'schema')` — gilt für Vitest (cwd = Repo-Root) und Skripte unter `skripte/`. Der einzige
   * Aufrufer, der abweicht, ist `src/main/projekt/projekt-dienst.ts` mit
   * `schemaBasisverzeichnis()` (`app.getAppPath()`) — `laeufer.ts` importiert `electron` bewusst
   * nicht selbst, s. u.
   */
  readonly schemaBasis?: string
  /** Test-Seam für `angewendet_am` (§4, Reproduzierbarkeit). Standard `Date.now`. */
  readonly jetzt?: () => number
  /** Für `schema_migration.app_version`. `laeufer.ts` importiert `electron` bewusst nicht selbst. */
  readonly appVersion?: string
  /**
   * Schnappschuss-Seam (§9.2, Umsetzung erst AP-0.11): wird genau einmal aufgerufen, bevor die
   * erste ausstehende Migration beginnt — nie, wenn die Datei schon aktuell ist. `laeufer.ts`
   * kennt keinen Projektordner und macht daher selbst keinen Schnappschuss; das übernimmt der
   * Aufrufer (`src/main/projekt/projekt-dienst.ts`), der die Pfade kennt.
   */
  readonly schnappschussVor?: (db: Database.Database) => void
}

function tabelleExistiert(db: Database.Database, name: string): boolean {
  const zeile = db
    .prepare<{ readonly typ: string; readonly name: string }, { readonly name: string }>(
      'SELECT name FROM sqlite_master WHERE type = @typ AND name = @name',
    )
    .get({ typ: 'table', name })
  return zeile !== undefined
}

function liesUserVersion(db: Database.Database): number {
  const wert = db.pragma('user_version', { simple: true })
  if (typeof wert !== 'number' || !Number.isInteger(wert)) {
    throw new WurzelFehler('INTERN_UNERWARTET', 'PRAGMA user_version lieferte keinen Integer')
  }
  return wert
}

function zielVersionErmitteln(migrationen: readonly MigrationEintrag[]): number {
  return migrationen.reduce((hoechste, eintrag) => Math.max(hoechste, eintrag.version), 0)
}

/**
 * Vergleicht für bereits angewendete Migrationen (Zeilen in `schema_migration`) die dort
 * eingetragene Prüfsumme gegen die frisch berechnete der zugehörigen Registry-Datei (§9.3). Bei
 * `user_version = 0` existiert die Tabelle noch nicht — dann gibt es nichts zu vergleichen.
 */
function pruefeAngewendeteMigrationenPruefsummen(
  db: Database.Database,
  migrationen: readonly MigrationEintrag[],
  inhaltLesen: (eintrag: MigrationEintrag) => Buffer,
): void {
  if (!tabelleExistiert(db, 'schema_migration')) {
    return
  }

  const angewendet = db
    .prepare<[], SchemaMigrationZeile>('SELECT version, pruefsumme FROM schema_migration')
    .all()

  for (const zeile of angewendet) {
    const eintrag = migrationen.find((kandidat) => kandidat.version === zeile.version)
    if (eintrag === undefined) {
      // Migrationen laufen nur vorwärts (§6): eine einmal angewendete Version verschwindet nie
      // aus der Registry. Dieser Zweig ist defensiv und sollte praktisch nie greifen.
      continue
    }
    const berechnet = pruefsummeBerechnen(inhaltLesen(eintrag))
    if (berechnet !== zeile.pruefsumme) {
      throw new WurzelFehler('PROJEKT_MIGRATION_GEAENDERT')
    }
  }
}

interface AnwendenKontext {
  readonly inhaltLesen: (eintrag: MigrationEintrag) => Buffer
  readonly jetzt: () => number
  readonly appVersion: string
}

/** Wendet genau eine Migration an: BEGIN → SQL → schema_migration-Zeile → user_version → COMMIT. */
function einzelneMigrationAnwenden(db: Database.Database, eintrag: MigrationEintrag, ktx: AnwendenKontext): void {
  const rohInhalt = ktx.inhaltLesen(eintrag)
  const berechnet = pruefsummeBerechnen(rohInhalt)
  if (berechnet !== eintrag.pruefsumme) {
    throw new WurzelFehler('PROJEKT_MIGRATION_GEAENDERT')
  }
  if (!Number.isInteger(eintrag.version) || eintrag.version < 1) {
    throw new WurzelFehler('INTERN_UNERWARTET', `Ungültige Migrationsversion: ${String(eintrag.version)}`)
  }

  db.exec('BEGIN')
  try {
    // `journal_kontext` wird bereits in Migration 0001 angelegt (docs/schema/0001_grundgeruest.sql);
    // 0004 fügt nur die Zeile id=1, aktiv=1 ein. Der Wächter `tabelleExistiert(journal_kontext)`
    // überspringt `journalAus()` deshalb nur während 0001 SELBST: diese Klammer läuft VOR
    // `db.exec(rohInhalt)`, die Tabelle wird von 0001s SQL also erst danach erzeugt. Ab 0002 ist der
    // Wächter wahr (das UPDATE trifft bis zur 0004-Zeile schlicht 0 Zeilen, harmlos).
    // Der eigentliche Zweck: sobald eine Datenbank die `jrn_*`-Trigger trägt (sie werden am Ende
    // eines abgeschlossenen Migrationslaufs auf v4+ angewendet, `generierteTriggerAnwenden`), würde
    // eine spätere datenverändernde Migration (INSERT/UPDATE auf eine journalisierte Tabelle) ohne
    // diese Klammer an `aenderung.transaktion_id NOT NULL` scheitern: der `jrn_*`-Trigger feuert
    // (`WHEN aktiv = 1`) außerhalb einer armierten Transaktion. `journalAus()` setzt `aktiv = 0` und
    // schaltet die Trigger im "scharfen Ruhezustand" (55_Architektur.md §4.3) still
    // (AP-0.24, AP-0.8-Restpunkt).
    // `grund` ist bewusst ein reines Zeichenkettenliteral OHNE Interpolation (kein Template mit
    // `${eintrag.version}`): der Scanner in test/invarianten/_journal-aufrufer.ts erkennt nur
    // `ts.StringLiteralLike` (String- oder No-Substitution-Template-Literal) als `grund` - ein
    // `TemplateExpression` mit Platzhalter zählt dort als "kein Zeichenkettenliteral" (grund=null,
    // Kategorie nicht erkannt). `eintrag.version` steht stattdessen in diesem Kommentar.
    const journalfaehig = tabelleExistiert(db, 'journal_kontext')
    if (journalfaehig) {
      journalAus(
        db,
        'migration: datenverändernde Migration (Version siehe schema_migration.version dieser Transaktion) läuft ohne Journal (55_Architektur.md §4.3) - sonst füllten die jrn_*-Trigger aenderung.transaktion_id (NOT NULL) außerhalb einer armierten Transaktion',
      )
    }
    db.exec(rohInhalt.toString('utf8'))
    db.prepare(
      'INSERT INTO schema_migration (version, datei, pruefsumme, angewendet_am, app_version) ' +
        'VALUES (@version, @datei, @pruefsumme, @angewendetAm, @appVersion)',
    ).run({
      version: eintrag.version,
      datei: eintrag.datei,
      pruefsumme: eintrag.pruefsumme,
      angewendetAm: ktx.jetzt(),
      appVersion: ktx.appVersion,
    })
    // PRAGMA user_version erlaubt kein Parameter-Binding (SQLite-Einschränkung) — die Zahl wird
    // deshalb direkt interpoliert. Kein Injektionsrisiko: `eintrag.version` kommt aus der
    // `as const`-Registry (registrierung.ts) bzw. aus einem oben geprüften Integer, nie aus einer
    // Nutzereingabe.
    db.pragma(`user_version = ${eintrag.version}`)
    if (journalfaehig) {
      journalAn(db)
    }
    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }
}

/**
 * Migriert `db` auf die Zielversion (Standard: `SCHEMA_VERSION` aus der echten Registry,
 * 55_Architektur.md §9.3). Ablauf: `user_version` lesen → neuer als Ziel? abbrechen → Prüfsummen
 * bereits angewendeter Migrationen vergleichen → für jede fehlende Version in genau einer
 * Transaktion anwenden. Läuft `db` bereits auf Zielversion, ist der Aufruf ein No-op (kein
 * Schnappschuss, keine Transaktion).
 */
export function migrieren(db: Database.Database, opts: LaeufenOptionen = {}): void {
  const migrationen = opts.migrationen ?? MIGRATIONEN
  const schemaBasis = opts.schemaBasis ?? join(process.cwd(), 'docs', 'schema')
  const inhaltLesen = opts.inhaltLesen ?? ((eintrag: MigrationEintrag) => migrationsRohInhaltLesen(schemaBasis, eintrag))
  const jetzt = opts.jetzt ?? Date.now
  const appVersion = opts.appVersion ?? ''
  const zielVersion = zielVersionErmitteln(migrationen)

  const userVersion = liesUserVersion(db)

  if (userVersion > zielVersion) {
    throw new WurzelFehler('PROJEKT_NEUERE_SCHEMAVERSION')
  }

  pruefeAngewendeteMigrationenPruefsummen(db, migrationen, inhaltLesen)

  if (userVersion === zielVersion) {
    return
  }

  opts.schnappschussVor?.(db)

  const ausstehend = migrationen
    .filter((eintrag) => eintrag.version > userVersion && eintrag.version <= zielVersion)
    .slice()
    .sort((a, b) => a.version - b.version)

  for (const eintrag of ausstehend) {
    einzelneMigrationAnwenden(db, eintrag, { inhaltLesen, jetzt, appVersion })
  }

  // 55_Architektur.md §4.4: "als letzter Schritt jeder Migration" - einmal nach der gesamten
  // Schleife, nicht je Einzelmigration (AP-0.8). Läuft nur, wenn oben tatsächlich mindestens eine
  // Migration angewendet wurde (early returns oberhalb decken den No-op-Fall bereits ab) - die
  // Trigger einer bereits vollständig migrierten Datei bleiben unangetastet, sie stehen als
  // physische Schemaobjekte weiter in der Datei.
  generierteTriggerAnwenden(db, schemaBasis)
}
