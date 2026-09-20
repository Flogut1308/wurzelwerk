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
//
// AP-1.12 PR-B ERWEITERUNG (Mehrzeilen-Transaktionen, s. Kopfkommentar von
// `undo-bitgleich.test.ts`): der Generator deckt jetzt zusätzlich `name.anlegen/aendern/loeschen`,
// `elternschaft.anlegen/aendern/loeschen`, `partnerschaft.anlegen/aendern/loeschen`,
// `ereignis.anlegen/aendern/loeschen` und `aussage.anlegen/loeschen` ab — dasselbe
// "Index-modulo-Länge-oder-No-op"-Muster wie oben, konsequent auf alle neuen Referenzen
// (`personId`, `nameId`, `elternschaftId`, `partnerschaftId`, `ereignisId`, `aussageId`)
// ausgeweitet. Bewusste Vereinfachungen, jede für sich gültige (nicht invalide!) Eingaben:
//
// - KEINE `belege`/`zitatId`-Referenzen: optional in jedem betroffenen Schema, das Weglassen
//   bleibt darum immer schema-konform. Eine `zitat`-Fixture anzulegen bräuchte einen rohen
//   Journal-Aus/-An-Umweg (Muster `neuesZitat()` in `test/einheit/befehl-aussage.test.ts`) ohne
//   zusätzlichen Erkenntnisgewinn für DIESE Invariante (die prüft Undo-Bitgleichheit, nicht den
//   Belegpfad — der ist in `test/einheit/befehl-aussage.test.ts` bereits geprüft).
// - KEIN `ortId`/`Datumswert` (bei `ereignis`/`partnerschaft`/`aussage`): es gibt in diesem
//   Arbeitspaket keinen `ort.anlegen`-Befehl, den der Generator referenzieren könnte, und
//   `Datumswert` hat eine eigene mehrteilige `superRefine`-Gültigkeitslogik
//   (`src/shared/schemata/import-v1.ts`), die hier keinen zusätzlichen Mehrzeilen-Fall aufdeckt.
//   Alle drei Felder sind optional, das Weglassen ist schema-konform.
// - `elternschaft.anlegen`: die beiden Personen werden über `zweiVerschiedeneAusListe()`
//   IMMER verschieden gewählt (keine Selbstkante) UND vorab mit der ECHTEN Produktivfunktion
//   `wuerdeZyklusErzeugen()` (`src/core/graph/zyklus.ts`, dieselbe reine Funktion, die
//   `elternschaft-anlegen.ts` selbst aufruft) gegen die bislang erzeugten Kanten geprüft — ein
//   Kandidat, der einen Zyklus schließen würde, wird als No-op übersprungen. So bleibt jede
//   ausgeführte `elternschaft.anlegen`-Aktion eine SCHEMA- UND FACHLICH gültige Eingabe, statt
//   sich auf einen `KONFLIKT_ZYKLUS`-Wurf zu verlassen (der Handler würde dann ohnehin nichts
//   schreiben — `db.transaction()` rollt zurück —, ein Catch dafür wäre nur zusätzliche
//   Komplexität ohne zusätzliche Deckung).
// - `person.loeschen`: `elternschaft.elternteil_id`/`kind_id`, `partnerschaft_person.person_id`
//   und `beteiligung.person_id` sind alle `ON DELETE RESTRICT` (docs/schema/0002_kern.sql) — eine
//   Person, die in einer dieser drei getrackten Listen vorkommt, würde das rohe
//   `SQLITE_CONSTRAINT_FOREIGNKEY` werfen (kein `WurzelFehler`, weil `person-loeschen.ts` das
//   nicht vorab prüft). `personIstGebunden()` erkennt das VORHER anhand des mitgeführten
//   Zustands und macht die Aktion zu einem No-op — wieder: gültige statt zufällig scheiternde
//   Eingaben. `name.person_id` ist dagegen `ON DELETE CASCADE` — eine gelöschte Person nimmt ihre
//   Namen mit, `zustand.namen` wird darum nach einem erfolgreichen `person.loeschen` gefiltert,
//   sonst würde eine spätere `name.aendern/loeschen`-Aktion einen inzwischen kaskadiert
//   gelöschten `nameId` referenzieren.
// - `elternschaft.loeschen`/`partnerschaft.loeschen`/`ereignis.loeschen` räumen (E-7, polymorphe
//   `aussage.subjekt_id` ohne FK-`CASCADE`) ihre Existenz-Aussage manuell mit ab
//   (`aussageRepo.loeschenNachSubjekt`, s. Handler-Kommentare) — UND jede vom Nutzer per
//   `aussage.anlegen` zusätzlich auf dasselbe Subjekt geschriebene Aussage gleich mit (die
//   Löschung ist `DELETE ... WHERE subjekt_typ = @t AND subjekt_id = @id`, ohne
//   `praedikat`-Filter). `zustand.aussagen` wird darum nach jedem dieser drei Löschbefehle
//   entsprechend gefiltert, sonst würde ein späteres `aussage.loeschen` einen bereits
//   verschwundenen `aussageId` referenzieren. `name.loeschen`/`person.loeschen` räumen dagegen
//   KEINE `aussage`-Zeilen ab (`name-loeschen.ts` schreibt von vornherein keine Existenz-Aussage,
//   `person-loeschen.ts` prüft `aussage` gar nicht) — eine Aussage über eine inzwischen gelöschte
//   `name`/`person`-Zeile bleibt als Datensatz unverändert bestehen (nur fachlich "verwaist"), sie
//   verschwindet nicht aus der Tabelle. Für DIESE Invariante (bitgleiche Undo-Rücknahme jedes
//   einzelnen Schritts) ist das unschädlich: die Aussage-Zeile selbst wird von einem
//   `name`/`person`-Löschschritt gar nicht berührt, ihr `aussageId` bleibt darum ein gültiges,
//   weiterhin existierendes Ziel — kein Zustandsabgleich nötig.
// - Jede `anlegen`-Aktion für `elternschaft`/`partnerschaft`/`ereignis` liest sich die versteckte,
//   vom Handler selbst erzeugte Existenz-Aussage (`existenzAussageIdLesen()`, eine einzelne
//   `SELECT`-Abfrage direkt gegen `Tx` — zulässig in `test/`, das keiner der vier
//   Architekturschichten aus CLAUDE.md §2 unterliegt, Muster identisch zu
//   `test/invarianten/_kanonischer-abzug.ts`) zurück und trägt sie in `zustand.aussagen` nach:
//   das macht diese Existenz-Aussagen selbst zu gültigen `aussage.loeschen`-Zielen, statt nur die
//   per `aussage.anlegen` zusätzlich geschriebenen Aussagen zu erreichen.
// - `aussage.anlegen`/`aussage.faktAendern`: DEMOTE-DECKUNG (hueter-Befund, AP-1.12 PR-B —
//   die ursprüngliche Fassung dieses Kommentars behauptete, eine kleine feste `praedikat`-Menge
//   allein mache Wiederholungen "realistisch oft"; belegt waren es 0 von 300 Läufen, weil
//   `subjektWahlRoh % pools.length` die fünf Subjekt-Pools GLEICH oft wählte, obwohl vier davon
//   (`name`/`elternschaft`/`partnerschaft`/`ereignis`) am Anfang jeder Folge leer sind — ein
//   uniform verteilter Modulo trifft darum weit überwiegend leere Pools und damit No-ops, und
//   selbst ein Treffer auf `person` traf `subjektZielRoh % personIds.length` mit wechselnder
//   Poolgröße kaum je zweimal dieselbe Person/dasselbe Prädikat):
//   - `poolIndexBiased()` gewichtet die Poolwahl zu 80 % auf `person` (Index 0) — der einzige Pool,
//     der ab der ersten `person.anlegen`-Aktion garantiert befüllt ist — statt gleich zu verteilen.
//   - `praedikat` bleibt aus einer KLEINEN, festen Wertemenge (jetzt zwei statt vier Werten).
//   - Die eigentliche Garantie liefert die eigene Aktion `aussageFaktAendern`: sie führt Buch über
//     jedes per `aussage.anlegen`/`aussageFaktAendern` erzeugte (subjektTyp, subjektId, praedikat)
//     in `zustand.aussageTripel` und WIEDERHOLT bei jeder weiteren Ausführung eines dieser
//     Dreiklänge — mit `istBevorzugt: 1` erzwungen, sowohl beim erstmaligen Anlegen ALS AUCH bei
//     jeder Wiederholung (der Demote-Zweig in `aussage-anlegen.ts` demoted nur, was zuvor selbst
//     `istBevorzugt=1` war — ein Zufallstreffer mit `istBevorzugt` aus `fc.option()` hätte das nicht
//     zuverlässig sichergestellt). Sobald ein Dreiklang einmal existiert, bleibt jede weitere
//     `aussageFaktAendern`-Ausführung (solange `zustand.aussageTripel` nicht leer ist) ein
//     GARANTIERTER Demote-Treffer statt eines Zufallstreffers. Gelöschte Subjekte werden aus
//     `zustand.aussageTripel` entfernt (dieselben Filter wie bei `zustand.aussagen`), damit nie ein
//     `NICHT_GEFUNDEN_*`-Wurf auf ein inzwischen kaskadiert/manuell gelöschtes Subjekt entsteht.
import fc from 'fast-check'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from '../../src/shared/schemata/person'
import { NameTypEnum } from '../../src/shared/schemata/name'
import { ElternschaftTypEnum } from '../../src/shared/schemata/elternschaft'
import { PartnerschaftTypEnum, EndeGrundEnum } from '../../src/shared/schemata/partnerschaft'
import { EreignisTypEnum } from '../../src/shared/schemata/ereignis'
import { BeteiligungRolleEnum } from '../../src/shared/schemata/beteiligung'
import type {
  PersonAnlegenEin,
  PersonFeldSetzenEin,
  NameAnlegenEin,
  ElternschaftAnlegenEin,
  PartnerschaftAnlegenEin,
  EreignisAnlegenEin,
  AussageAnlegenEin,
} from '../../src/shared/schemata/befehle'
import { fuehreAus } from '../../src/main/befehle/bus'
import type { Tx } from '../../src/main/repositories/basis'
import { wuerdeZyklusErzeugen, type Elternkante } from '../../src/core/graph/zyklus'

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

// -----------------------------------------------------------------------------------------------
// AP-1.12 PR-B: Aktionstypen für die neuen Befehle (s. Kopfkommentar für die Designentscheidungen).
// -----------------------------------------------------------------------------------------------

type NameTyp = NameAnlegenEin['typ']
type ElternschaftTyp = ElternschaftAnlegenEin['typ']
type PartnerschaftTyp = PartnerschaftAnlegenEin['typ']
type EndeGrund = NonNullable<PartnerschaftAnlegenEin['endeGrund']>
type EreignisTyp = EreignisAnlegenEin['typ']
type BeteiligungRolle = EreignisAnlegenEin['beteiligungen'][number]['rolle']

export interface AktionNameAnlegen {
  readonly art: 'nameAnlegen'
  readonly personZielRoh: number
  readonly typ: NameTyp
  readonly nachname: string
  readonly vornamen: string
}

export interface AktionNameAendern {
  readonly art: 'nameAendern'
  readonly nameZielRoh: number
  readonly typ: NameTyp
  readonly nachname: string
  readonly vornamen: string
}

export interface AktionNameLoeschen {
  readonly art: 'nameLoeschen'
  readonly nameZielRoh: number
}

export interface AktionElternschaftAnlegen {
  readonly art: 'elternschaftAnlegen'
  readonly elternteilZielRoh: number
  readonly kindZielRoh: number
  readonly typ: ElternschaftTyp
  readonly konfidenz: number
  readonly notiz: string
}

export interface AktionElternschaftAendern {
  readonly art: 'elternschaftAendern'
  readonly elternschaftZielRoh: number
  readonly typ: ElternschaftTyp
  readonly notiz: string
}

export interface AktionElternschaftLoeschen {
  readonly art: 'elternschaftLoeschen'
  readonly elternschaftZielRoh: number
}

export interface AktionPartnerschaftAnlegen {
  readonly art: 'partnerschaftAnlegen'
  readonly personZielRohA: number
  readonly personZielRohB: number
  readonly typ: PartnerschaftTyp
  readonly konfidenz: number
  readonly notiz: string
}

export interface AktionPartnerschaftAendern {
  readonly art: 'partnerschaftAendern'
  readonly partnerschaftZielRoh: number
  readonly typ: PartnerschaftTyp
  readonly endeGrund: EndeGrund
  readonly notiz: string
}

export interface AktionPartnerschaftLoeschen {
  readonly art: 'partnerschaftLoeschen'
  readonly partnerschaftZielRoh: number
}

export interface AktionEreignisAnlegen {
  readonly art: 'ereignisAnlegen'
  readonly personZielRoh: number
  readonly typ: EreignisTyp
  readonly rolle: BeteiligungRolle
  readonly konfidenz: number
  readonly beschreibung: string
}

export interface AktionEreignisAendern {
  readonly art: 'ereignisAendern'
  readonly ereignisZielRoh: number
  readonly typ: EreignisTyp
  readonly beschreibung: string
}

export interface AktionEreignisLoeschen {
  readonly art: 'ereignisLoeschen'
  readonly ereignisZielRoh: number
}

/** Genau eines von `wertText`/`wertZahl` (nie `wertRefId`, s. Kopfkommentar) — als eigene
 * diskriminierte Union statt zweier optionaler Felder, damit `aussageAnlegenEinBauen()` unten nie
 * versehentlich beide gleichzeitig setzen kann (das wäre ein Zod-`superRefine`-Fehlschlag,
 * `aussageAnlegenEinSchema`). */
export type AktionAussageWert = { readonly art: 'text'; readonly wert: string } | { readonly art: 'zahl'; readonly wert: number }

export interface AktionAussageAnlegen {
  readonly art: 'aussageAnlegen'
  readonly subjektWahlRoh: number
  readonly subjektZielRoh: number
  readonly praedikat: string
  readonly wert: AktionAussageWert
  readonly konfidenz: number
  /** Bewusst ein immer vorhandener (nicht optionaler) Schlüssel mit `undefined` als möglichem
   * Wert statt eines optionalen Schlüssels: `exactOptionalPropertyTypes` (CLAUDE.md §4) verbietet
   * sonst das Zuweisen von `undefined` an einen `?`-Schlüssel. `aussageAnlegenEinBauen()` baut die
   * echte `AussageAnlegenEin`-Nutzlast über bedingtes Spreaden, damit der Schlüssel dort bei
   * `undefined` ganz FEHLT statt explizit `undefined` zu sein (dasselbe Problem in die andere
   * Richtung). */
  readonly istBevorzugt: 0 | 1 | undefined
}

export interface AktionAussageLoeschen {
  readonly art: 'aussageLoeschen'
  readonly aussageZielRoh: number
}

/** Garantiert (statt zufällig) den "Fakt ändern"-Demote-Pfad — s. Kopfkommentar dieser Datei
 * ("DEMOTE-DECKUNG"). Existiert bereits ein getrackter (subjektTyp, subjektId, praedikat)-Dreiklang
 * (`zustand.aussageTripel`), wiederholt diese Aktion GENAU DIESEN Dreiklang mit `istBevorzugt: 1`
 * (garantierter Demote-Treffer); sonst legt sie — analog zu `aussage.anlegen` — einen neuen an
 * (ebenfalls mit `istBevorzugt: 1`) und trackt ihn für spätere Wiederholungen. */
export interface AktionAussageFaktAendern {
  readonly art: 'aussageFaktAendern'
  readonly tripelWahlRoh: number
  readonly subjektWahlRoh: number
  readonly subjektZielRoh: number
  readonly praedikat: string
  readonly wert: AktionAussageWert
  readonly konfidenz: number
}

export type Aktion =
  | AktionAnlegen
  | AktionFeldSetzen
  | AktionLoeschen
  | AktionNameAnlegen
  | AktionNameAendern
  | AktionNameLoeschen
  | AktionElternschaftAnlegen
  | AktionElternschaftAendern
  | AktionElternschaftLoeschen
  | AktionPartnerschaftAnlegen
  | AktionPartnerschaftAendern
  | AktionPartnerschaftLoeschen
  | AktionEreignisAnlegen
  | AktionEreignisAendern
  | AktionEreignisLoeschen
  | AktionAussageAnlegen
  | AktionAussageLoeschen
  | AktionAussageFaktAendern

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

function nameAnlegenAktionArbitrary(): fc.Arbitrary<AktionNameAnlegen> {
  return fc
    .record({
      personZielRoh: fc.nat(),
      typ: fc.constantFrom(...NameTypEnum.options),
      nachname: fc.string(),
      vornamen: fc.string(),
    })
    .map((r): AktionNameAnlegen => ({ art: 'nameAnlegen', ...r }))
}

function nameAendernAktionArbitrary(): fc.Arbitrary<AktionNameAendern> {
  return fc
    .record({
      nameZielRoh: fc.nat(),
      typ: fc.constantFrom(...NameTypEnum.options),
      nachname: fc.string(),
      vornamen: fc.string(),
    })
    .map((r): AktionNameAendern => ({ art: 'nameAendern', ...r }))
}

function nameLoeschenAktionArbitrary(): fc.Arbitrary<AktionNameLoeschen> {
  return fc.nat().map((nameZielRoh): AktionNameLoeschen => ({ art: 'nameLoeschen', nameZielRoh }))
}

function elternschaftAnlegenAktionArbitrary(): fc.Arbitrary<AktionElternschaftAnlegen> {
  return fc
    .record({
      elternteilZielRoh: fc.nat(),
      kindZielRoh: fc.nat(),
      typ: fc.constantFrom(...ElternschaftTypEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      notiz: fc.string(),
    })
    .map((r): AktionElternschaftAnlegen => ({ art: 'elternschaftAnlegen', ...r }))
}

function elternschaftAendernAktionArbitrary(): fc.Arbitrary<AktionElternschaftAendern> {
  return fc
    .record({
      elternschaftZielRoh: fc.nat(),
      typ: fc.constantFrom(...ElternschaftTypEnum.options),
      notiz: fc.string(),
    })
    .map((r): AktionElternschaftAendern => ({ art: 'elternschaftAendern', ...r }))
}

function elternschaftLoeschenAktionArbitrary(): fc.Arbitrary<AktionElternschaftLoeschen> {
  return fc.nat().map((elternschaftZielRoh): AktionElternschaftLoeschen => ({ art: 'elternschaftLoeschen', elternschaftZielRoh }))
}

function partnerschaftAnlegenAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftAnlegen> {
  return fc
    .record({
      personZielRohA: fc.nat(),
      personZielRohB: fc.nat(),
      typ: fc.constantFrom(...PartnerschaftTypEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      notiz: fc.string(),
    })
    .map((r): AktionPartnerschaftAnlegen => ({ art: 'partnerschaftAnlegen', ...r }))
}

function partnerschaftAendernAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftAendern> {
  return fc
    .record({
      partnerschaftZielRoh: fc.nat(),
      typ: fc.constantFrom(...PartnerschaftTypEnum.options),
      endeGrund: fc.constantFrom(...EndeGrundEnum.options),
      notiz: fc.string(),
    })
    .map((r): AktionPartnerschaftAendern => ({ art: 'partnerschaftAendern', ...r }))
}

function partnerschaftLoeschenAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftLoeschen> {
  return fc.nat().map((partnerschaftZielRoh): AktionPartnerschaftLoeschen => ({ art: 'partnerschaftLoeschen', partnerschaftZielRoh }))
}

function ereignisAnlegenAktionArbitrary(): fc.Arbitrary<AktionEreignisAnlegen> {
  return fc
    .record({
      personZielRoh: fc.nat(),
      typ: fc.constantFrom(...EreignisTypEnum.options),
      rolle: fc.constantFrom(...BeteiligungRolleEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      beschreibung: fc.string(),
    })
    .map((r): AktionEreignisAnlegen => ({ art: 'ereignisAnlegen', ...r }))
}

function ereignisAendernAktionArbitrary(): fc.Arbitrary<AktionEreignisAendern> {
  return fc
    .record({
      ereignisZielRoh: fc.nat(),
      typ: fc.constantFrom(...EreignisTypEnum.options),
      beschreibung: fc.string(),
    })
    .map((r): AktionEreignisAendern => ({ art: 'ereignisAendern', ...r }))
}

function ereignisLoeschenAktionArbitrary(): fc.Arbitrary<AktionEreignisLoeschen> {
  return fc.nat().map((ereignisZielRoh): AktionEreignisLoeschen => ({ art: 'ereignisLoeschen', ereignisZielRoh }))
}

function aussageWertArbitrary(): fc.Arbitrary<AktionAussageWert> {
  return fc.oneof(
    fc.string().map((wert): AktionAussageWert => ({ art: 'text', wert })),
    fc.integer().map((wert): AktionAussageWert => ({ art: 'zahl', wert })),
  )
}

/** `praedikat` aus einer kleinen, festen Wertemenge (zwei Werte, s. Kopfkommentar "DEMOTE-
 * DECKUNG") — begünstigt Wiederholungen desselben (subjektTyp, subjektId, praedikat)-Dreiklangs.
 * Die ZUVERLÄSSIGE Demote-Deckung liefert aber `aussageFaktAendernAktionArbitrary()` unten, nicht
 * diese Funktion allein (s. Kopfkommentar). */
function aussageAnlegenAktionArbitrary(): fc.Arbitrary<AktionAussageAnlegen> {
  return fc
    .record({
      subjektWahlRoh: fc.nat(),
      subjektZielRoh: fc.nat(),
      praedikat: fc.constantFrom('beruf', 'wohnort'),
      wert: aussageWertArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      istBevorzugt: fc.option(fc.constantFrom<0 | 1>(0, 1), { nil: undefined }),
    })
    .map((r): AktionAussageAnlegen => ({ art: 'aussageAnlegen', ...r }))
}

function aussageLoeschenAktionArbitrary(): fc.Arbitrary<AktionAussageLoeschen> {
  return fc.nat().map((aussageZielRoh): AktionAussageLoeschen => ({ art: 'aussageLoeschen', aussageZielRoh }))
}

/** s. Kopfkommentar "DEMOTE-DECKUNG" und Typkommentar bei `AktionAussageFaktAendern`. Derselbe
 * kleine, feste `praedikat`-Wertevorrat wie `aussageAnlegenAktionArbitrary()` — bewusst dieselben
 * zwei Werte, damit ein per `aussage.anlegen` zufällig erzeugter Dreiklang ebenfalls als
 * Wiederholungsziel taugt, sobald `zustand.aussageTripel` ihn enthält. */
function aussageFaktAendernAktionArbitrary(): fc.Arbitrary<AktionAussageFaktAendern> {
  return fc
    .record({
      tripelWahlRoh: fc.nat(),
      subjektWahlRoh: fc.nat(),
      subjektZielRoh: fc.nat(),
      praedikat: fc.constantFrom('beruf', 'wohnort'),
      wert: aussageWertArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
    })
    .map((r): AktionAussageFaktAendern => ({ art: 'aussageFaktAendern', ...r }))
}

/**
 * Arbitrary für eine einzelne `Aktion`. Gewichte: `anlegen` (Person) bleibt mit Abstand am
 * höchsten (3), weil praktisch jede neue Aktion — die eigenen `person.*`-Aktionen ausgenommen —
 * mindestens eine bestehende Person referenziert; ohne genügend früh angelegte Personen blieben
 * `name`/`elternschaft`/`partnerschaft`/`ereignis`/`aussage`-Aktionen überwiegend No-ops. Die
 * `anlegen`-Aktionen der neuen Entitäten liegen bei 2 (mehr Gewicht als ihre `aendern`/`loeschen`-
 * Geschwister, damit über eine 40 Aktionen lange Folge hinweg genug davon existieren, an denen
 * `aendern`/`loeschen` überhaupt etwas zu tun haben). `aussageFaktAendern` liegt bewusst bei 3
 * (höher als `aussageAnlegen`/`aussageLoeschen`) — sie ist der garantierte Demote-Pfad
 * (Kopfkommentar "DEMOTE-DECKUNG") und soll darum über eine Folge hinweg mehrfach feuern, nicht
 * nur einmal zufällig.
 */
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
    { weight: 2, arbitrary: nameAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: nameAendernAktionArbitrary() },
    { weight: 1, arbitrary: nameLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: elternschaftAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: elternschaftAendernAktionArbitrary() },
    { weight: 1, arbitrary: elternschaftLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: partnerschaftAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: partnerschaftAendernAktionArbitrary() },
    { weight: 1, arbitrary: partnerschaftLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: ereignisAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ereignisAendernAktionArbitrary() },
    { weight: 1, arbitrary: ereignisLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: aussageAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: aussageLoeschenAktionArbitrary() },
    { weight: 3, arbitrary: aussageFaktAendernAktionArbitrary() },
  )
}

/** Eine Folge von `Aktion`en — die eigentliche Arbitrary, die `undo-bitgleich.test.ts` an
 * `fc.property()` übergibt. `minLength: 15` (statt der vorherigen `0`, s. Kopfkommentar "DEMOTE-
 * DECKUNG"): fast-checks eingebaute Größenheuristik hält die generierten Längen über weite Teile
 * der 300 Läufe klein, eine zu kurze Folge lässt `aussageFaktAendern` (Gewicht 3 von 28) selten
 * zweimal in DERSELBEN Folge fallen — ohne `minLength` feuerte der Demote-Pfad nur in 5 von 300
 * Läufen, mit `minLength: 15` deutlich öfter (Belegzahl im PR-Bericht). */
export function befehlsfolgeArbitrary(): fc.Arbitrary<readonly Aktion[]> {
  return fc.array(aktionArbitrary(), { minLength: 15, maxLength: 40 })
}

/** Ein angelegter Name — `personId` wird für die CASCADE-Bereinigung nach `person.loeschen`
 * gebraucht (s. Kopfkommentar). */
interface NameInfo {
  readonly id: string
  readonly personId: string
}

interface ElternschaftInfo {
  readonly id: string
  readonly elternteilId: string
  readonly kindId: string
}

interface PartnerschaftInfo {
  readonly id: string
  readonly personIds: readonly string[]
}

interface EreignisInfo {
  readonly id: string
  readonly personIds: readonly string[]
}

/** Deckungsgleich mit `SubjektTypEnum` (`src/shared/schemata/gemeinsam.ts`) MINUS `'ort'` — es
 * gibt in diesem Arbeitspaket keinen `ort.anlegen`-Befehl, den der Generator referenzieren könnte
 * (s. Kopfkommentar). */
type AussageSubjektKind = 'person' | 'name' | 'elternschaft' | 'partnerschaft' | 'ereignis'

interface AussageInfo {
  readonly id: string
  readonly subjektTyp: AussageSubjektKind
  readonly subjektId: string
}

/** Ein getrackter (subjektTyp, subjektId, praedikat)-Dreiklang — die Grundlage der garantierten
 * Demote-Wiederholung durch `aussageFaktAendern` (s. Kopfkommentar "DEMOTE-DECKUNG"). */
interface AussageTripelInfo {
  readonly subjektTyp: AussageSubjektKind
  readonly subjektId: string
  readonly praedikat: string
}

/** Mutabler Modellzustand einer einzelnen Eigenschaftslauf-Ausführung (kein Vertrags-/Ergebnistyp — bewusst kein `readonly`, analog `ModellZustand` in `_modell-abgeleitet.ts`). */
export interface Zustand {
  personIds: string[]
  namen: NameInfo[]
  elternschaften: ElternschaftInfo[]
  partnerschaften: PartnerschaftInfo[]
  ereignisse: EreignisInfo[]
  aussagen: AussageInfo[]
  aussageTripel: AussageTripelInfo[]
}

export function neuerZustand(): Zustand {
  return { personIds: [], namen: [], elternschaften: [], partnerschaften: [], ereignisse: [], aussagen: [], aussageTripel: [] }
}

/** Löst `zielRoh` gegen die aktuell lebenden Personen auf — `undefined`, wenn die Liste (noch) leer ist. */
function zielId(zustand: Zustand, zielRoh: number): string | undefined {
  if (zustand.personIds.length === 0) {
    return undefined
  }
  const index = zielRoh % zustand.personIds.length
  return zustand.personIds[index]
}

/** Generische Fassung von `zielId()` für die neuen getrackten Listen (`namen`/`elternschaften`/
 * `partnerschaften`/`ereignisse`/`aussagen`) — `undefined`, wenn `liste` (noch) leer ist. */
function zielAusListe<T>(liste: readonly T[], roh: number): T | undefined {
  if (liste.length === 0) {
    return undefined
  }
  const index = roh % liste.length
  const element = liste[index]
  if (element === undefined) {
    throw new Error('zielAusListe(): unerreichbar — der Index liegt per Modulo innerhalb der Listenlänge.')
  }
  return element
}

/** Wählt zwei VERSCHIEDENE Elemente aus `liste` (nie denselben Index zweimal) — `undefined`, wenn
 * `liste` weniger als zwei Einträge hat. Klassischer Verschiebungs-Trick: `versatz` liegt in
 * `[1, liste.length - 1]`, `(indexA + versatz) % liste.length` kann darum nie wieder `indexA`
 * ergeben. */
function zweiVerschiedeneAusListe(liste: readonly string[], rohA: number, rohB: number): readonly [string, string] | undefined {
  if (liste.length < 2) {
    return undefined
  }
  const indexA = rohA % liste.length
  const versatz = 1 + (rohB % (liste.length - 1))
  const indexB = (indexA + versatz) % liste.length
  const a = liste[indexA]
  const b = liste[indexB]
  if (a === undefined || b === undefined) {
    throw new Error('zweiVerschiedeneAusListe(): unerreichbar — beide Indizes liegen innerhalb der Listenlänge.')
  }
  return [a, b]
}

/** `true`, wenn `personId` in einer `ON DELETE RESTRICT`-Beziehung steckt (`elternschaft`,
 * `partnerschaft_person`, `beteiligung` — docs/schema/0002_kern.sql) — ein `person.loeschen`
 * darauf würde das Fremdschlüssel-`RESTRICT` verletzen (s. Kopfkommentar). */
function personIstGebunden(zustand: Zustand, personId: string): boolean {
  const inElternschaft = zustand.elternschaften.some((e) => e.elternteilId === personId || e.kindId === personId)
  const inPartnerschaft = zustand.partnerschaften.some((p) => p.personIds.includes(personId))
  const inEreignis = zustand.ereignisse.some((e) => e.personIds.includes(personId))
  return inElternschaft || inPartnerschaft || inEreignis
}

interface AussageIdZeile {
  readonly id: string
}

/** Liest die `id` der versteckten Existenz-Aussage, die `elternschaft.anlegen`/
 * `partnerschaft.anlegen`/`ereignis.anlegen` selbst schreiben (`existenz-aussage.ts`) — direkt
 * gegen `Tx`, s. Kopfkommentar. Unerreichbar, dass keine Zeile gefunden wird: jeder dieser drei
 * Handler schreibt in genau derselben Transaktion, aus der `id` gerade zurückkam, GENAU eine
 * Existenz-Aussage. */
function existenzAussageIdLesen(db: Tx, subjektTyp: AussageSubjektKind, subjektId: string): string {
  const zeile = db
    .prepare<{ readonly subjektTyp: string; readonly subjektId: string }, AussageIdZeile>(
      `SELECT id FROM aussage WHERE subjekt_typ = @subjektTyp AND subjekt_id = @subjektId AND praedikat = 'existenz' ORDER BY id LIMIT 1`,
    )
    .get({ subjektTyp, subjektId })
  if (zeile === undefined) {
    throw new Error(`existenzAussageIdLesen(): keine Existenz-Aussage für ${subjektTyp}/${subjektId} gefunden — unerreichbar.`)
  }
  return zeile.id
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

interface AussageSubjektPool {
  readonly kind: AussageSubjektKind
  readonly ids: readonly string[]
}

/** Die fünf Kandidatenlisten für `aussage.anlegen`s `subjektTyp`/`subjektId`, IN DIESER
 * REIHENFOLGE (`person` an Index 0 — `poolIndexBiased()` unten setzt das voraus, s. Kopfkommentar
 * zu `AussageSubjektKind` — kein `'ort'`, weil kein `ort.anlegen`-Befehl existiert). */
function aussageSubjektPools(zustand: Zustand): readonly AussageSubjektPool[] {
  return [
    { kind: 'person', ids: zustand.personIds },
    { kind: 'name', ids: zustand.namen.map((n) => n.id) },
    { kind: 'elternschaft', ids: zustand.elternschaften.map((e) => e.id) },
    { kind: 'partnerschaft', ids: zustand.partnerschaften.map((p) => p.id) },
    { kind: 'ereignis', ids: zustand.ereignisse.map((e) => e.id) },
  ]
}

/** Wählt den Index in `aussageSubjektPools()` BIASED zu `person` (Index 0, 80 % der Fälle) statt
 * gleichverteilt über alle fünf Pools — s. Kopfkommentar "DEMOTE-DECKUNG". `person` ist der einzige
 * Pool, der ab der ersten `person.anlegen`-Aktion garantiert befüllt ist; ein uniformer
 * `roh % 5`-Modulo hätte 80 % der `aussage.anlegen`/`aussageFaktAendern`-Aktionen auf typischerweise
 * leere Pools gelenkt und damit zu No-ops gemacht (belegter hueter-Befund: 0/300 Demote-Treffer). */
function poolIndexBiased(roh: number): number {
  const bucket = roh % 100
  if (bucket < 80) return 0
  if (bucket < 85) return 1
  if (bucket < 90) return 2
  if (bucket < 95) return 3
  return 4
}

/** Gemeinsamer Baustein für `wertText`/`wertZahl` aus `AktionAussageWert` — bedingtes Spreaden
 * (statt eines optionalen Felds mit `undefined`), damit ein weggelassenes Feld beim Zusammenbau
 * wirklich FEHLT statt explizit `undefined` zu sein (`exactOptionalPropertyTypes`). Von
 * `aussageAnlegenEinBauen()` UND dem `aussageFaktAendern`-Zweig in `aktionAusfuehren()` genutzt. */
function aussageWertFeld(wert: AktionAussageWert): { readonly wertText: string } | { readonly wertZahl: number } {
  return wert.art === 'text' ? { wertText: wert.wert } : { wertZahl: wert.wert }
}

/** Baut die `AussageAnlegenEin`-Nutzlast aus `AktionAussageAnlegen` — bedingtes Spreaden für
 * `wertText`/`wertZahl`/`istBevorzugt`, damit ein weggelassenes Feld beim Zusammenbau wirklich
 * FEHLT statt explizit `undefined` zu sein (`exactOptionalPropertyTypes`, s. Typkommentar bei
 * `AktionAussageAnlegen`). */
function aussageAnlegenEinBauen(kind: AussageSubjektKind, subjektId: string, aktion: AktionAussageAnlegen): AussageAnlegenEin {
  const bevorzugtFeld = aktion.istBevorzugt === undefined ? {} : { istBevorzugt: aktion.istBevorzugt }
  return {
    subjektTyp: kind,
    subjektId,
    praedikat: aktion.praedikat,
    konfidenz: aktion.konfidenz,
    ...aussageWertFeld(aktion.wert),
    ...bevorzugtFeld,
  }
}

/**
 * Führt eine einzelne `Aktion` über den echten Befehlsbus (`fuehreAus`, `src/main/befehle/bus.ts`)
 * aus und pflegt `zustand` nach (s. Kopfkommentar für die genauen Nachpflege-Regeln je Befehl).
 * Referenzielle Aktionen ohne gültiges Ziel (leere getrackte Liste, oder — bei `elternschaft.
 * anlegen`/`person.loeschen` — ein Kandidat, der eine fachliche Regel verletzen würde) sind
 * bewusste No-ops: kein `fuehreAus()`-Aufruf, keine Transaktion, kein Undo-Schritt.
 */
export function aktionAusfuehren(db: Tx, zustand: Zustand, aktion: Aktion): void {
  switch (aktion.art) {
    case 'anlegen': {
      const { id } = fuehreAus(db, 'person.anlegen', aktion.ein)
      zustand.personIds.push(id)
      return
    }

    case 'feldSetzen': {
      const id = zielId(zustand, aktion.zielRoh)
      if (id === undefined) {
        return
      }
      fuehreAus(db, 'person.feldSetzen', feldSetzenEin(id, aktion.feldwert))
      return
    }

    case 'loeschen': {
      const id = zielId(zustand, aktion.zielRoh)
      if (id === undefined) {
        return
      }
      if (personIstGebunden(zustand, id)) {
        return
      }
      fuehreAus(db, 'person.loeschen', { id })
      // Die `name`-Ids der gelöschten Person VOR dem Filtern merken (s. unten — CASCADE nimmt sie
      // mit, `zustand.aussageTripel` muss das für 'name'-Dreiklänge genauso nachvollziehen wie für
      // 'person'-Dreiklänge).
      const kaskadiertGeloeschteNamenIds = zustand.namen.filter((n) => n.personId === id).map((n) => n.id)
      zustand.personIds = zustand.personIds.filter((vorhandeneId) => vorhandeneId !== id)
      zustand.namen = zustand.namen.filter((n) => n.personId !== id) // CASCADE (name.person_id)
      // Kein FK-`CASCADE` auf `aussage` (s. Modul-Kommentar) — eine bereits vorhandene `aussage`-
      // ZEILE über die gelöschte Person (oder ihre kaskadiert gelöschten Namen) bleibt bestehen,
      // aber der (subjektTyp, subjektId, praedikat)-Dreiklang darf NICHT mehr für eine neue
      // `aussage.anlegen`-Wiederholung (`aussageFaktAendern`) herangezogen werden — deren Subjekt
      // existiert nicht mehr, ein erneutes Anlegen würde `NICHT_GEFUNDEN_PERSON`/`NICHT_GEFUNDEN_NAME`
      // werfen.
      zustand.aussageTripel = zustand.aussageTripel.filter(
        (t) =>
          !(t.subjektTyp === 'person' && t.subjektId === id) &&
          !(t.subjektTyp === 'name' && kaskadiertGeloeschteNamenIds.includes(t.subjektId)),
      )
      return
    }

    case 'nameAnlegen': {
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'name.anlegen', {
        personId,
        typ: aktion.typ,
        nachname: aktion.nachname,
        vornamen: aktion.vornamen,
      })
      zustand.namen.push({ id, personId })
      return
    }

    case 'nameAendern': {
      const ziel = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'name.aendern', { id: ziel.id, typ: aktion.typ, nachname: aktion.nachname, vornamen: aktion.vornamen })
      return
    }

    case 'nameLoeschen': {
      const ziel = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'name.loeschen', { id: ziel.id })
      zustand.namen = zustand.namen.filter((n) => n.id !== ziel.id)
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'name' && t.subjektId === ziel.id))
      return
    }

    case 'elternschaftAnlegen': {
      const paar = zweiVerschiedeneAusListe(zustand.personIds, aktion.elternteilZielRoh, aktion.kindZielRoh)
      if (paar === undefined) {
        return
      }
      const [elternteilId, kindId] = paar
      const kanten: readonly Elternkante[] = zustand.elternschaften.map((e) => ({ elternteilId: e.elternteilId, kindId: e.kindId }))
      if (wuerdeZyklusErzeugen(kanten, { elternteilId, kindId })) {
        return
      }
      const { id } = fuehreAus(db, 'elternschaft.anlegen', {
        elternteilId,
        kindId,
        typ: aktion.typ,
        konfidenz: aktion.konfidenz,
        notiz: aktion.notiz,
      })
      zustand.elternschaften.push({ id, elternteilId, kindId })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'elternschaft', id), subjektTyp: 'elternschaft', subjektId: id })
      return
    }

    case 'elternschaftAendern': {
      const ziel = zielAusListe(zustand.elternschaften, aktion.elternschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'elternschaft.aendern', { id: ziel.id, typ: aktion.typ, notiz: aktion.notiz })
      return
    }

    case 'elternschaftLoeschen': {
      const ziel = zielAusListe(zustand.elternschaften, aktion.elternschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'elternschaft.loeschen', { id: ziel.id })
      zustand.elternschaften = zustand.elternschaften.filter((e) => e.id !== ziel.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'elternschaft' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'elternschaft' && t.subjektId === ziel.id))
      return
    }

    case 'partnerschaftAnlegen': {
      const paar = zweiVerschiedeneAusListe(zustand.personIds, aktion.personZielRohA, aktion.personZielRohB)
      if (paar === undefined) {
        return
      }
      const [a, b] = paar
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: aktion.typ,
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: aktion.konfidenz,
        notiz: aktion.notiz,
      })
      zustand.partnerschaften.push({ id, personIds: [a, b] })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'partnerschaft', id), subjektTyp: 'partnerschaft', subjektId: id })
      return
    }

    case 'partnerschaftAendern': {
      const ziel = zielAusListe(zustand.partnerschaften, aktion.partnerschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'partnerschaft.aendern', { id: ziel.id, typ: aktion.typ, endeGrund: aktion.endeGrund, notiz: aktion.notiz })
      return
    }

    case 'partnerschaftLoeschen': {
      const ziel = zielAusListe(zustand.partnerschaften, aktion.partnerschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'partnerschaft.loeschen', { id: ziel.id })
      zustand.partnerschaften = zustand.partnerschaften.filter((p) => p.id !== ziel.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'partnerschaft' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'partnerschaft' && t.subjektId === ziel.id))
      return
    }

    case 'ereignisAnlegen': {
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'ereignis.anlegen', {
        typ: aktion.typ,
        beteiligungen: [{ personId, rolle: aktion.rolle }],
        konfidenz: aktion.konfidenz,
        beschreibung: aktion.beschreibung,
      })
      zustand.ereignisse.push({ id, personIds: [personId] })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'ereignis', id), subjektTyp: 'ereignis', subjektId: id })
      return
    }

    case 'ereignisAendern': {
      const ziel = zielAusListe(zustand.ereignisse, aktion.ereignisZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ereignis.aendern', { id: ziel.id, typ: aktion.typ, beschreibung: aktion.beschreibung })
      return
    }

    case 'ereignisLoeschen': {
      const ziel = zielAusListe(zustand.ereignisse, aktion.ereignisZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ereignis.loeschen', { id: ziel.id })
      zustand.ereignisse = zustand.ereignisse.filter((e) => e.id !== ziel.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'ereignis' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'ereignis' && t.subjektId === ziel.id))
      return
    }

    case 'aussageAnlegen': {
      const pools = aussageSubjektPools(zustand)
      const pool = pools[poolIndexBiased(aktion.subjektWahlRoh)]
      if (pool === undefined) {
        throw new Error('aktionAusfuehren(aussageAnlegen): unerreichbar — der Index liegt innerhalb der Poolanzahl.')
      }
      const subjektId = zielAusListe(pool.ids, aktion.subjektZielRoh)
      if (subjektId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'aussage.anlegen', aussageAnlegenEinBauen(pool.kind, subjektId, aktion))
      zustand.aussagen.push({ id, subjektTyp: pool.kind, subjektId })
      // `istBevorzugt === 1` macht diesen Dreiklang ebenfalls zu einem gültigen Wiederholungsziel
      // für `aussageFaktAendern` (s. dortiger Fall) — nur dann demoted eine spätere Wiederholung
      // tatsächlich etwas (`aussage-anlegen.ts` demoted nur zuvor selbst bevorzugte Aussagen).
      if (aktion.istBevorzugt === 1) {
        zustand.aussageTripel.push({ subjektTyp: pool.kind, subjektId, praedikat: aktion.praedikat })
      }
      return
    }

    case 'aussageLoeschen': {
      const ziel = zielAusListe(zustand.aussagen, aktion.aussageZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'aussage.loeschen', { id: ziel.id })
      zustand.aussagen = zustand.aussagen.filter((a) => a.id !== ziel.id)
      return
    }

    case 'aussageFaktAendern': {
      // Existiert bereits ein getrackter Dreiklang: GENAU DIESEN wiederholen — mit `istBevorzugt: 1`
      // erzwungen, garantierter Demote-Treffer (s. Kopfkommentar "DEMOTE-DECKUNG" und Typkommentar
      // bei `AktionAussageFaktAendern`). Kein No-op-Fall hier: `zielAusListe()` liefert bei
      // nichtleerer Liste immer ein Element.
      if (zustand.aussageTripel.length > 0) {
        const tripel = zielAusListe(zustand.aussageTripel, aktion.tripelWahlRoh)
        if (tripel === undefined) {
          throw new Error('aktionAusfuehren(aussageFaktAendern): unerreichbar — die Liste ist nicht leer.')
        }
        const { id } = fuehreAus(db, 'aussage.anlegen', {
          subjektTyp: tripel.subjektTyp,
          subjektId: tripel.subjektId,
          praedikat: tripel.praedikat,
          konfidenz: aktion.konfidenz,
          istBevorzugt: 1,
          ...aussageWertFeld(aktion.wert),
        })
        zustand.aussagen.push({ id, subjektTyp: tripel.subjektTyp, subjektId: tripel.subjektId })
        return
      }

      // Noch kein getrackter Dreiklang: einen neuen anlegen (analog `aussageAnlegen`, aber IMMER
      // `istBevorzugt: 1`) und für spätere Wiederholungen vormerken.
      const pools = aussageSubjektPools(zustand)
      const pool = pools[poolIndexBiased(aktion.subjektWahlRoh)]
      if (pool === undefined) {
        throw new Error('aktionAusfuehren(aussageFaktAendern): unerreichbar — der Index liegt innerhalb der Poolanzahl.')
      }
      const subjektId = zielAusListe(pool.ids, aktion.subjektZielRoh)
      if (subjektId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: pool.kind,
        subjektId,
        praedikat: aktion.praedikat,
        konfidenz: aktion.konfidenz,
        istBevorzugt: 1,
        ...aussageWertFeld(aktion.wert),
      })
      zustand.aussagen.push({ id, subjektTyp: pool.kind, subjektId })
      zustand.aussageTripel.push({ subjektTyp: pool.kind, subjektId, praedikat: aktion.praedikat })
      return
    }

    default: {
      const nieErreicht: never = aktion
      throw new Error(`aktionAusfuehren(): unbehandelte Aktion ${JSON.stringify(nieErreicht)}`)
    }
  }
}
