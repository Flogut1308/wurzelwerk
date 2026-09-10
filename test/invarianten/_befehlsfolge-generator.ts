// AP-0.10 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). fast-check-Arbitrary +
// Ausführungshelfer für `test/invarianten/undo-bitgleich.test.ts`: erzeugt Folgen aus den drei
// registrierten Befehlen (`person.anlegen`/`feldSetzen`/`loeschen`,
// `src/main/befehle/registrierung.ts`), schema-konform zu `src/shared/schemata/befehle.ts`.
//
// Referenzielle Aktionen (`feldSetzen`/`loeschen`) tragen nur einen rohen `fc.nat()`-Index statt
// einer echten `personId`: die echte ID entsteht erst zur AUSFÜHRUNGSZEIT über `neueId()`
// (`src/main/ipc/huelle.ts`, aufgerufen aus dem `person.anlegen`-Handler) und ist zum
// Generierungszeitpunkt nicht bekannt. Muster "Index modulo aktuelle Länge" wie in
// `test/invarianten/_modell-abgeleitet.ts` — `aktionAusfuehren()` unten löst den Index zur
// Ausführungszeit gegen `zustand.personIds` (die bislang angelegten, noch nicht gelöschten
// Personen) auf. Ist diese Liste leer, ist die Aktion ein bewusstes No-op (kein
// `fuehreAus()`-Aufruf, keine Transaktion, kein Undo-Schritt) — der Aufrufer
// (`undo-bitgleich.test.ts`) zählt Undo-Schritte ohnehin über `while (undoZiel(db) !==
// undefined)`, nicht über `folge.length`, das bleibt also robust gegen No-ops UND gegen vom
// Befehlsbus verworfene leere Transaktionen (z. B. `feldSetzen` ohne tatsächliche
// Werteänderung — `src/main/befehle/bus.ts` legt dafür gar keine `transaktion`-Zeile an).
import fc from 'fast-check'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from '../../src/shared/schemata/person'
import type { PersonAnlegenEin, PersonFeldSetzenEin } from '../../src/shared/schemata/befehle'
import { fuehreAus } from '../../src/main/befehle/bus'
import type { Tx } from '../../src/main/repositories/basis'

/**
 * Verteilendes `Omit` (`T extends unknown ? ... : never` erzwingt die Verteilung über jedes
 * Unionsmitglied einzeln): das eingebaute `Omit<T, K>` verteilt NICHT über eine diskriminierte
 * Union (`Pick<T, Exclude<keyof T, K>>` bildet stattdessen die Vereinigung aller Schlüssel/Werte
 * über ALLE Mitglieder auf einmal ab und verwirft damit genau die Kopplung `feld` ↔ `wert`, die
 * `feldSetzenEin()` unten für ihr `switch` braucht).
 */
type VerteilendesOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

/** `person.feldSetzen`-Nutzlast ohne `id` — die `id` kommt erst zur Ausführungszeit aus `zustand.personIds` (s. Modul-Kommentar). */
type FeldwertOhneId = VerteilendesOmit<PersonFeldSetzenEin, 'id'>

export interface AktionAnlegen {
  readonly art: 'anlegen'
  readonly ein: PersonAnlegenEin
}

export interface AktionFeldSetzen {
  readonly art: 'feldSetzen'
  readonly zielRoh: number
  readonly feldwert: FeldwertOhneId
}

export interface AktionLoeschen {
  readonly art: 'loeschen'
  readonly zielRoh: number
}

export type Aktion = AktionAnlegen | AktionFeldSetzen | AktionLoeschen

/** Arbitrary für eine schema-konforme `PersonAnlegenEin`-Nutzlast (`personAnlegenEinSchema`, `src/shared/schemata/befehle.ts`). */
function personAnlegenEinArbitrary(): fc.Arbitrary<PersonAnlegenEin> {
  return fc.record(
    {
      geschlecht: fc.constantFrom(...GeschlechtEnum.options),
      lebend_status: fc.constantFrom(...LebendStatusEnum.options),
      privat: fc.constantFrom<0 | 1>(0, 1),
      notiz: fc.string(),
      gesperrt_bis: fc.integer(),
      ist_platzhalter: fc.constantFrom<0 | 1>(0, 1),
      platzhalter_grund: fc.constantFrom(...PlatzhalterGrundEnum.options),
    },
    { requiredKeys: ['privat', 'ist_platzhalter'] },
  )
}

/** Arbitrary für eine schema-konforme `FeldwertOhneId` — eine der sieben Varianten aus `personFeldSetzenEinSchema` (ohne `id`). */
function feldwertArbitrary(): fc.Arbitrary<FeldwertOhneId> {
  return fc.oneof(
    fc.record({ feld: fc.constant('geschlecht' as const), wert: fc.constantFrom(...GeschlechtEnum.options) }),
    fc.record({ feld: fc.constant('lebend_status' as const), wert: fc.constantFrom(...LebendStatusEnum.options) }),
    fc.record({ feld: fc.constant('privat' as const), wert: fc.constantFrom<0 | 1>(0, 1) }),
    fc.record({ feld: fc.constant('notiz' as const), wert: fc.string() }),
    fc.record({ feld: fc.constant('gesperrt_bis' as const), wert: fc.integer() }),
    fc.record({ feld: fc.constant('ist_platzhalter' as const), wert: fc.constantFrom<0 | 1>(0, 1) }),
    fc.record({ feld: fc.constant('platzhalter_grund' as const), wert: fc.constantFrom(...PlatzhalterGrundEnum.options) }),
  )
}

/** Arbitrary für eine einzelne `Aktion` — `anlegen` überwiegt bewusst (Gewicht 3), damit `zustand.personIds` in den meisten Läufen früh nicht-leer ist und `feldSetzen`/`loeschen` echte Ziele finden statt No-ops zu bleiben. */
function aktionArbitrary(): fc.Arbitrary<Aktion> {
  return fc.oneof(
    { weight: 3, arbitrary: personAnlegenEinArbitrary().map((ein): AktionAnlegen => ({ art: 'anlegen', ein })) },
    {
      weight: 2,
      arbitrary: fc
        .record({ zielRoh: fc.nat(), feldwert: feldwertArbitrary() })
        .map((r): AktionFeldSetzen => ({ art: 'feldSetzen', zielRoh: r.zielRoh, feldwert: r.feldwert })),
    },
    { weight: 1, arbitrary: fc.nat().map((zielRoh): AktionLoeschen => ({ art: 'loeschen', zielRoh })) },
  )
}

/** Eine Folge von `Aktion`en — die eigentliche Arbitrary, die `undo-bitgleich.test.ts` an `fc.property()` übergibt. */
export function befehlsfolgeArbitrary(): fc.Arbitrary<readonly Aktion[]> {
  return fc.array(aktionArbitrary(), { maxLength: 40 })
}

/** Mutabler Modellzustand einer einzelnen Eigenschaftslauf-Ausführung (kein Vertrags-/Ergebnistyp — bewusst kein `readonly`, analog `ModellZustand` in `_modell-abgeleitet.ts`). */
export interface Zustand {
  personIds: string[]
}

export function neuerZustand(): Zustand {
  return { personIds: [] }
}

/** Löst `zielRoh` gegen die aktuell lebenden Personen auf — `undefined`, wenn die Liste (noch) leer ist. */
function zielId(zustand: Zustand, zielRoh: number): string | undefined {
  if (zustand.personIds.length === 0) {
    return undefined
  }
  const index = zielRoh % zustand.personIds.length
  return zustand.personIds[index]
}

/**
 * Baut die vollständige `PersonFeldSetzenEin`-Nutzlast aus `id` + `FeldwertOhneId` — bewusst ein
 * `switch` statt eines Objekt-Spreads (`{ id, ...feldwert }`): TypeScript narrowt eine
 * diskriminierte Union über ein `switch` auf `feldwert.feld` zuverlässig pro Zweig, ein Spread
 * eines Union-Typs wäre hier weniger offensichtlich typsicher. Der `never`-Zweig zwingt einen
 * Compile-Fehler, sobald `PersonFeldSetzenEin` (`src/shared/schemata/befehle.ts`) um eine hier
 * nicht behandelte Variante wächst (analog `minimalZeileFuer` in `_journal-minimalzeilen.ts`).
 */
function feldSetzenEin(id: string, feldwert: FeldwertOhneId): PersonFeldSetzenEin {
  switch (feldwert.feld) {
    case 'geschlecht':
      return { id, feld: 'geschlecht', wert: feldwert.wert }
    case 'lebend_status':
      return { id, feld: 'lebend_status', wert: feldwert.wert }
    case 'privat':
      return { id, feld: 'privat', wert: feldwert.wert }
    case 'notiz':
      return { id, feld: 'notiz', wert: feldwert.wert }
    case 'gesperrt_bis':
      return { id, feld: 'gesperrt_bis', wert: feldwert.wert }
    case 'ist_platzhalter':
      return { id, feld: 'ist_platzhalter', wert: feldwert.wert }
    case 'platzhalter_grund':
      return { id, feld: 'platzhalter_grund', wert: feldwert.wert }
    default: {
      const nieErreicht: never = feldwert
      throw new Error(`feldSetzenEin(): unbehandeltes Feld ${JSON.stringify(nieErreicht)}`)
    }
  }
}

/**
 * Führt eine einzelne `Aktion` über den echten Befehlsbus (`fuehreAus`, `src/main/befehle/bus.ts`)
 * aus und pflegt `zustand.personIds` nach (Anlegen fügt hinzu, Löschen entfernt) — referenzielle
 * Aktionen ohne gültiges Ziel (leere `personIds`-Liste) sind No-ops, s. Modul-Kommentar.
 */
export function aktionAusfuehren(db: Tx, zustand: Zustand, aktion: Aktion): void {
  if (aktion.art === 'anlegen') {
    const { id } = fuehreAus(db, 'person.anlegen', aktion.ein)
    zustand.personIds.push(id)
    return
  }

  if (aktion.art === 'feldSetzen') {
    const id = zielId(zustand, aktion.zielRoh)
    if (id === undefined) {
      return
    }
    fuehreAus(db, 'person.feldSetzen', feldSetzenEin(id, aktion.feldwert))
    return
  }

  const id = zielId(zustand, aktion.zielRoh)
  if (id === undefined) {
    return
  }
  fuehreAus(db, 'person.loeschen', { id })
  zustand.personIds = zustand.personIds.filter((vorhandeneId) => vorhandeneId !== id)
}
