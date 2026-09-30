// AP-1.30 PR 10b (docs/80 §33 V-130-10b; A-02, A-19) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Invariante: `name_part.sortier_index` ist je (Form, Art) eindeutig, und jede Form trägt höchstens EINEN
// Rufname-Teil (nur an einem Vornamen) — in JEDEM Zustand, den die Befehle und ihre Rücknahme erreichen.
//
// WARUM EINE EIGENE INVARIANTE (U-130-10-sortierindex-constraint, E1): das Schema erzwingt die
// Eindeutigkeit des `sortier_index` NICHT (kein UNIQUE-Index in 0006 — nur `idx_name_part_ein_rufname`
// für den Rufnamen). Die Befehle `namensteil.anlegen`/`.loeschen`/`.verschieben` halten sie durch die
// Reihenfolge ihrer Einzelschritte (Aufrücken von hinten, Nachnummerieren von vorn, Parkwert MAX + 1);
// die FTS-Trigger `abl_name_part_*` rekonstruieren den indizierten Text per `ORDER BY sortier_index` —
// ein Doppel, auch nur für einen Zwischenschritt, macht diese Folge unbestimmt. `undo-bitgleich` sähe
// einen solchen Zwischenzustand nicht (Endzustände stimmen), die Orakel in `_befehlsfolge-namensteile.ts`
// sehen nur den Zustand nach jedem Befehl.
//
// Vorgehen, je Lauf (Befehlsfolge mit `mitNamensteilen: true`, `_befehlsfolge-generator.ts`):
// 1. Frische migrierte Datenbank (Vorlagen-Klon, `_frische-datenbank.ts`) und ein WÄCHTER: zwei
//    TEMP-Trigger auf `name_part` (INSERT und UPDATE von `sortier_index`/`art`/`name_form_id`), die mit
//    `RAISE(ABORT)` abbrechen, sobald die geschriebene Zeile einen `sortier_index` mit einem anderen Teil
//    derselben (Form, Art) teilt — mitten im Befehl bzw. mitten in der Rücknahme. TEMP-Trigger liegen im
//    `temp`-Schema, nicht in `sqlite_master` der Datenbank: kein Abzug, keine Migration, kein Journal
//    sieht sie. Gegenprobe, dass der Wächter scharf ist: der zweite Testfall.
// 2. Nach jedem Befehl (jede Aktion, jeder Serien-/Vorlaufschritt über `zwischenSchritt`) und nach jedem
//    einzelnen `undo()` bis zum leeren Journal: das Orakel per eigener SQL über ALLE Formen.
// Deckungszähler (Mindesttreffer = halber Messwert mit diesem Seed/`numRuns`, ADR-009-Nachtrag): geprüfte
// Zustände mit einer Form, die zwei oder mehr Teile derselben Art trägt, bzw. mit einem Rufnamen; und je
// granularem Teil-Befehl die Rücknahmen, unter denen der Wächter scharf war.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

// Mocks wie `undo-bitgleich.test.ts` (Befehlsbus ohne Electron, Protokoll und Ereignisse).
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { fuehreAus } from '../../src/main/befehle/bus'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { frischeMigrierteDatenbank } from './_frische-datenbank'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

/** Seed und Laufzahl (Erstwahl: lokal ≤ ~10 s). Dieselben Werte stehen in
 * `befehlsfolge-namensteile-einflechtung.test.ts`. */
const SEED = 20260930
const NUM_RUNS = 300

const WAECHTER_MELDUNG = 'Waechter: doppelter sortier_index je (name_form_id, art)'

/** Die Bedingung der Wächter: die gerade geschriebene Zeile teilt ihren `sortier_index` mit einem anderen
 * Teil derselben (Form, Art). Feste SQL (benannte Werte gibt es in Triggern nicht; kein Eingabewert). */
const WAECHTER_WENN = `EXISTS (SELECT 1 FROM name_part p
  WHERE p.name_form_id = NEW.name_form_id AND p.art = NEW.art AND p.sortier_index = NEW.sortier_index AND p.id <> NEW.id)`

function waechterEinbauen(db: Database.Database): void {
  db.exec(`
    CREATE TEMP TRIGGER waechter_name_part_ai AFTER INSERT ON main.name_part WHEN ${WAECHTER_WENN}
    BEGIN SELECT RAISE(ABORT, '${WAECHTER_MELDUNG}'); END;
    CREATE TEMP TRIGGER waechter_name_part_au AFTER UPDATE OF sortier_index, art, name_form_id ON main.name_part WHEN ${WAECHTER_WENN}
    BEGIN SELECT RAISE(ABORT, '${WAECHTER_MELDUNG}'); END;
  `)
}

interface DoppelZeile {
  readonly name_form_id: string
  readonly art: string
  readonly sortier_index: number
  readonly anzahl: number
}

interface RufnameZeile {
  readonly name_form_id: string
  readonly anzahl: number
  readonly nicht_vorname: number
}

type Zaehlschluessel =
  | 'zustand.geprueft'
  | 'zustand.mehrteilig'
  | 'zustand.rufname'
  | 'undo.geprueft'
  | 'undo.namensteil_angelegt'
  | 'undo.namensteil_geloescht'
  | 'undo.namensteil_verschoben'
  | 'undo.rufname_gesetzt'

/** Gemessen mit `{ seed: SEED, numRuns: NUM_RUNS }` (AP-1.30 PR 10b): geprüfte Zustände 17565, davon mit
 * einer mehrteiligen Art 5029 bzw. mit einem Rufnamen 1194; Rücknahmen 6778, davon von `namensteil.anlegen`
 * 593, `.loeschen` 67, `.verschieben` 59, `namensform.rufnameSetzen` 123. Schwelle je die Hälfte. */
const MINDESTTREFFER: readonly (readonly [Zaehlschluessel, number])[] = [
  ['zustand.geprueft', 8782],
  ['zustand.mehrteilig', 2514],
  ['zustand.rufname', 597],
  ['undo.geprueft', 3389],
  ['undo.namensteil_angelegt', 296],
  ['undo.namensteil_geloescht', 33],
  ['undo.namensteil_verschoben', 29],
  ['undo.rufname_gesetzt', 61],
]

const zaehler = new Map<Zaehlschluessel, number>()

function zaehle(schluessel: Zaehlschluessel): void {
  zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1)
}

/** Das Orakel (eigene SQL, über alle Formen); `wo` für die Meldung. */
function orakel(db: Database.Database, wo: string): void {
  const doppelt = db
    .prepare<[], DoppelZeile>(
      `SELECT name_form_id, art, sortier_index, COUNT(*) AS anzahl FROM name_part
        GROUP BY name_form_id, art, sortier_index HAVING COUNT(*) > 1`,
    )
    .all()
  expect(doppelt, `${wo}: doppelter sortier_index je (name_form_id, art)`).toEqual([])
  const rufnamen = db
    .prepare<[], RufnameZeile>(
      `SELECT name_form_id, COUNT(*) AS anzahl, SUM(art <> 'vorname') AS nicht_vorname FROM name_part
        WHERE ist_rufname = 1 GROUP BY name_form_id HAVING COUNT(*) > 1 OR SUM(art <> 'vorname') > 0`,
    )
    .all()
  expect(rufnamen, `${wo}: mehr als ein Rufname je Form bzw. Rufname an einem Nicht-Vornamen`).toEqual([])
  const deckung = db
    .prepare<[], { readonly mehrteilig: number; readonly rufname: number }>(
      `SELECT
         EXISTS (SELECT 1 FROM name_part GROUP BY name_form_id, art HAVING COUNT(*) > 1) AS mehrteilig,
         EXISTS (SELECT 1 FROM name_part WHERE ist_rufname = 1) AS rufname`,
    )
    .get()
  if (deckung?.mehrteilig === 1) zaehle('zustand.mehrteilig')
  if (deckung?.rufname === 1) zaehle('zustand.rufname')
}

/** Die Rücknahme welches granularen Teil-Befehls? (am `beschreibung`-Schlüssel des Undo-Ziels). */
function undoArt(beschreibung: string | null): Zaehlschluessel | undefined {
  switch (beschreibung) {
    case 'journal.namensteil_angelegt':
      return 'undo.namensteil_angelegt'
    case 'journal.namensteil_geloescht':
      return 'undo.namensteil_geloescht'
    case 'journal.namensteil_verschoben':
      return 'undo.namensteil_verschoben'
    case 'journal.rufname_gesetzt':
      return 'undo.rufname_gesetzt'
    default:
      return undefined
  }
}

describe('Invariante: sortier_index je (Form, Art) eindeutig, höchstens ein Rufname je Form — nach jedem Schritt und jeder Rücknahme (E1, U-130-10-sortierindex-constraint)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('Befehlsfolgen mit den granularen Namensbefehlen und ihre vollständige Rücknahme', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary({ profil: 'bestand', mitNamensteilen: true }), (folge) => {
        const db = frischeMigrierteDatenbank()
        try {
          waechterEinbauen(db)
          const pruefen = (wo: string): void => {
            orakel(db, wo)
            zaehle('zustand.geprueft')
          }
          const zustand = neuerZustand()
          folge.forEach((aktion, i) => {
            aktionAusfuehren(db, zustand, aktion, () => {
              pruefen(`Zwischenschritt in Aktion ${String(i)} (${aktion.art})`)
            })
            pruefen(`nach Aktion ${String(i)} (${aktion.art})`)
          })
          let schritt = 0
          for (let ziel = undoZiel(db); ziel !== undefined; ziel = undoZiel(db)) {
            const art = undoArt(ziel.beschreibung)
            undo(db)
            schritt += 1
            orakel(db, `nach Undo-Schritt ${String(schritt)} (${String(ziel.beschreibung)})`)
            zaehle('undo.geprueft')
            if (art !== undefined) zaehle(art)
          }
        } finally {
          db.close()
        }
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    )
    for (const [z, mindestens] of MINDESTTREFFER) {
      expect(zaehler.get(z) ?? 0, `Deckungszweig ${z}`).toBeGreaterThanOrEqual(mindestens)
    }
  }, 120_000)

  it('Gegenprobe: der Wächter bricht einen doppelten sortier_index mitten in einem Schreibvorgang ab', () => {
    const db = frischeMigrierteDatenbank()
    try {
      waechterEinbauen(db)
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: formId } = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Anna' })
      const { id: zweiter } = fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Maria' })
      // Roh (ohne Befehl): genau der Zwischenzustand, den ein Verschieben ohne Parkwert erzeugte.
      expect(() => db.prepare('UPDATE name_part SET sortier_index = 0 WHERE id = @id').run({ id: zweiter })).toThrow(WAECHTER_MELDUNG)
      // Eine andere Art derselben Form darf dieselbe Stelle tragen.
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Müller' })
      orakel(db, 'Gegenprobe')
    } finally {
      db.close()
    }
  })

  // AP-1.30 PR 11-0b (hueter #198 H4): die Gegenprobe oben trifft nur den UPDATE-Wächter. Ein neuer Teil auf
  // einer besetzten Stelle (der Zwischenzustand eines Anlegens ohne vorheriges Aufrücken) muss schon beim
  // INSERT abbrechen — und nur dort: dieselbe Stelle in einer anderen Art bzw. Form geht durch (über den
  // Befehl; ein rohes INSERT außerhalb des Busses scheitert sonst an den Journal-Triggern).
  it('Gegenprobe: der Wächter bricht auch ein INSERT auf einer besetzten Stelle ab', () => {
    const db = frischeMigrierteDatenbank()
    try {
      waechterEinbauen(db)
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: formId } = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' })
      const { id: andereForm } = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Anna' })
      // Roh (ohne Befehl): genau der Zwischenzustand, den ein Anlegen an Stelle 0 ohne Aufrücken erzeugte.
      expect(() =>
        db
          .prepare(
            `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
             VALUES ('waechter-insert', @formId, 'vorname', 'Maria', 0, 0, NULL, 0, 0)`,
          )
          .run({ formId }),
      ).toThrow(WAECHTER_MELDUNG)
      expect(db.prepare(`SELECT COUNT(*) AS anzahl FROM name_part WHERE id = 'waechter-insert'`).get()).toEqual({ anzahl: 0 })
      // Andere Art derselben Form bzw. dieselbe Art einer anderen Form: Stelle 0 ist dort frei.
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Müller', position: 0 })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: andereForm, art: 'vorname', wert: 'Maria', position: 0 })
      orakel(db, 'Gegenprobe INSERT')
    } finally {
      db.close()
    }
  })
})
