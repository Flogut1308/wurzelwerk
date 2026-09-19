// AP-1.4a, 56_Import_Vertrag.md §4 Stufe 3 (IMP-301…IMP-310, Hinweise): Plausibilitätsprüfung auf
// der bereits geprüften (Stufe 1+2 akzeptierten) Importdatei, VOR dem Schreiben. Reine Funktionen —
// KEIN Node, KEINE Datenbank, KEIN `Date.now()`/`Math.random()` (CLAUDE.md §4), KEIN Import aus
// `src/shared` (CLAUDE.md §2: `src/core` darf nur sich selbst importieren) — deshalb sind alle
// Eingabe-/Ausgabetypen hier core-lokal, auch wenn sie inhaltlich den Vertrags-/Berichtstypen aus
// `src/shared/schemata/import-v1.ts` bzw. `src/shared/import/imp-codes.ts` entsprechen. Der
// main-Adapter (`src/main/import/trockenlauf.ts`) baut `PlausibilitaetEingabe` aus der
// `ImportDatei` und füllt dabei insbesondere die JDN-Intervalle (`sortIntervall()`,
// `src/core/datum/sortierschluessel.ts` — core-zu-core, deshalb hier NICHT nochmal verdrahtet)
// sowie die `pfad`-Angabe je Eintrag (für die Berichtsspalte „JSON-Pfad", §5).
//
// Datumsvergleiche laufen ausschließlich über die bereits aufgelösten JDN-Intervalle (`von`/`bis`),
// nie über Kalenderstrings — Kalenderumrechnung passiert vorher, in `sortIntervall()`. Für
// Altersabstände/Lebensdauer wird die JDN-Differenz durch 365.2425 geteilt (mittlere
// gregorianische Jahreslänge) — eine bewusst grobe, aber deterministische Näherung; Stufe-3-Funde
// sind Hinweise, keine harten Fehler (§4), eine Unschärfe von Bruchteilen eines Jahres ist hier
// ohne Belang.

/** Geschlecht, wie im Vertrag (`$defs.Person.geschlecht`, §3.3) — lokal nachgebaut, kein Import aus shared. */
export type PlausGeschlecht = 'M' | 'F' | 'U' | 'X'

/** Ein bereits aufgelöstes JDN-Intervall (`sortVon`/`sortBis` aus `sortIntervall()`, garantiert `von <= bis`). */
export interface JdnIntervall {
  readonly von: number
  readonly bis: number
}

export interface PlausPerson {
  readonly kennung: string
  readonly pfad: string
  readonly geschlecht?: PlausGeschlecht | undefined
  readonly geburt?: JdnIntervall | undefined
  readonly tod?: JdnIntervall | undefined
  readonly beerdigung?: JdnIntervall | undefined
}

export interface PlausNamenEintrag {
  readonly personKennung: string
  readonly personPfad: string
  readonly pfad: string
  readonly schrift?: 'latn' | 'cyrl' | undefined
  readonly istTransliteriert: boolean
  readonly umschriftVonSchrift?: 'latn' | 'cyrl' | undefined
  readonly istBevorzugt: boolean
}

export interface PlausOrtKoordinate {
  readonly herkunftVorhanden: boolean
}

export interface PlausOrt {
  readonly kennung: string
  readonly pfad: string
  readonly koordinate?: PlausOrtKoordinate | undefined
  readonly existiert?: JdnIntervall | undefined
}

export interface PlausEreignis {
  readonly kennung: string
  readonly pfad: string
  readonly ort?: string | undefined
  readonly datum?: JdnIntervall | undefined
  readonly beteiligte: readonly string[]
}

export interface PlausElternschaft {
  readonly pfad: string
  readonly elternteil: string
  readonly kind: string
}

export interface PlausPartnerschaft {
  readonly pfad: string
  readonly beginn?: JdnIntervall | undefined
  readonly beteiligte: readonly string[]
}

export interface PlausAussage {
  readonly pfad: string
  readonly praedikat: string
}

export interface PlausDiagnose {
  readonly pfad: string
  readonly personKennung: string
  readonly konfidenz: number
  /** `true`, wenn JEDER Beleg dieser Diagnose auf eine Quelle vom Typ `muendlich` zeigt (IMP-306). */
  readonly nurMuendlicheQuellen: boolean
}

export interface PlausibilitaetEingabe {
  readonly personen: readonly PlausPerson[]
  readonly namen: readonly PlausNamenEintrag[]
  readonly orte: readonly PlausOrt[]
  readonly ereignisse: readonly PlausEreignis[]
  readonly elternschaften: readonly PlausElternschaft[]
  readonly partnerschaften: readonly PlausPartnerschaft[]
  readonly aussagen: readonly PlausAussage[]
  readonly diagnosen: readonly PlausDiagnose[]
  readonly notizenUnverarbeitetAnzahl: number
  readonly pruefsummeVorhanden: boolean
}

/** Die zehn Stufe-3-Codes (56_Import_Vertrag.md §4) — lokal nachgebaut (kein Import aus
 * `src/shared/import/imp-codes.ts`, CLAUDE.md §2). `src/main/import/trockenlauf.ts` bildet diesen
 * String 1:1 auf `ImpCode` ab. */
export type PlausCode =
  | 'IMP-301'
  | 'IMP-302'
  | 'IMP-303'
  | 'IMP-304'
  | 'IMP-305'
  | 'IMP-306'
  | 'IMP-307'
  | 'IMP-308'
  | 'IMP-309'
  | 'IMP-310'

export interface PlausHinweis {
  readonly code: PlausCode
  readonly pfad: string
  readonly kennung?: string
}

/** Mittlere gregorianische Jahreslänge in Tagen — s. Kopfkommentar (grobe, deterministische Näherung für Altersabstände). */
const TAGE_PRO_JAHR = 365.2425

function jahreZwischen(frueherJdn: number, spaeterJdn: number): number {
  return (spaeterJdn - frueherJdn) / TAGE_PRO_JAHR
}

/** §3.6: bekannte Prädikate, für die IMP-304 NICHT feuert (freie Restmenge bleibt zulässig, wird aber gemeldet). */
const BEKANNTE_PRAEDIKATE: ReadonlySet<string> = new Set([
  'beruf',
  'konfession',
  'wohnort',
  'todesdatum',
  'todesursache',
  'alter_bei_tod',
  'hofname',
  'ausbildung',
  'militaerdienst',
  'auswanderung',
  'vermoegen',
  'mitgliedschaft',
  'existenz', // ADR-026: importintern erzeugte Existenz-Aussage, aber ein zulässiges Prädikat
])

function pruefeTodVorGeburtUndBestattung(personen: readonly PlausPerson[]): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const person of personen) {
    if (person.geburt !== undefined && person.tod !== undefined && person.tod.von < person.geburt.von) {
      hinweise.push({ code: 'IMP-301', pfad: person.pfad, kennung: person.kennung })
    }
    if (person.tod !== undefined && person.beerdigung !== undefined && person.beerdigung.von < person.tod.von) {
      hinweise.push({ code: 'IMP-301', pfad: person.pfad, kennung: person.kennung })
    }
  }
  return hinweise
}

function pruefeEheVorGeburt(partnerschaften: readonly PlausPartnerschaft[], personenNachKennung: ReadonlyMap<string, PlausPerson>): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const partnerschaft of partnerschaften) {
    if (partnerschaft.beginn === undefined) continue
    for (const kennung of partnerschaft.beteiligte) {
      const person = personenNachKennung.get(kennung)
      if (person?.geburt === undefined) continue
      if (partnerschaft.beginn.von < person.geburt.von) {
        hinweise.push({ code: 'IMP-301', pfad: partnerschaft.pfad, kennung })
      }
    }
  }
  return hinweise
}

/** IMP-302: Elternteil bei Geburt des Kindes jünger als 12, oder älter als 55 (Mutter)/80 (Vater). */
function pruefeElternAlter(elternschaften: readonly PlausElternschaft[], personenNachKennung: ReadonlyMap<string, PlausPerson>): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const elternschaft of elternschaften) {
    const elternteil = personenNachKennung.get(elternschaft.elternteil)
    const kind = personenNachKennung.get(elternschaft.kind)
    if (elternteil?.geburt === undefined || kind?.geburt === undefined) continue

    const altersabstand = jahreZwischen(elternteil.geburt.von, kind.geburt.von)
    const zuJung = altersabstand < 12
    const zuAlt = elternteil.geschlecht === 'F' ? altersabstand > 55 : elternteil.geschlecht === 'M' ? altersabstand > 80 : false
    if (zuJung || zuAlt) {
      hinweise.push({ code: 'IMP-302', pfad: elternschaft.pfad, kennung: elternschaft.kind })
    }
  }
  return hinweise
}

/** IMP-303: Koordinate ohne `herkunft`. */
function pruefeKoordinatenHerkunft(orte: readonly PlausOrt[]): readonly PlausHinweis[] {
  return orte
    .filter((ort) => ort.koordinate !== undefined && !ort.koordinate.herkunftVorhanden)
    .map((ort) => ({ code: 'IMP-303' as const, pfad: `${ort.pfad}.koordinaten`, kennung: ort.kennung }))
}

/** IMP-304: unbekanntes `praedikat`. */
function pruefeUnbekanntePraedikate(aussagen: readonly PlausAussage[]): readonly PlausHinweis[] {
  return aussagen.filter((aussage) => !BEKANNTE_PRAEDIKATE.has(aussage.praedikat)).map((aussage) => ({ code: 'IMP-304' as const, pfad: aussage.pfad }))
}

/** IMP-305: kyrillischer Name ohne Originaleintrag, oder Umschrift als `ist_bevorzugt` (ADR-014). */
function pruefeUmschriften(namen: readonly PlausNamenEintrag[]): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const name of namen) {
    if (!name.istTransliteriert) continue
    if (name.umschriftVonSchrift !== 'cyrl') {
      hinweise.push({ code: 'IMP-305', pfad: name.pfad, kennung: name.personKennung })
    }
    if (name.istBevorzugt) {
      hinweise.push({ code: 'IMP-305', pfad: name.pfad, kennung: name.personKennung })
    }
  }
  return hinweise
}

/** IMP-306: Diagnose mit `konfidenz >= 3` aus einer rein mündlichen Quelle. */
function pruefeDiagnoseKonfidenz(diagnosen: readonly PlausDiagnose[]): readonly PlausHinweis[] {
  return diagnosen
    .filter((diagnose) => diagnose.konfidenz >= 3 && diagnose.nurMuendlicheQuellen)
    .map((diagnose) => ({ code: 'IMP-306' as const, pfad: diagnose.pfad, kennung: diagnose.personKennung }))
}

/** IMP-307: Lebensdauer über 110 Jahre. */
function pruefeLebensdauer(personen: readonly PlausPerson[]): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const person of personen) {
    if (person.geburt === undefined || person.tod === undefined) continue
    if (jahreZwischen(person.geburt.von, person.tod.von) > 110) {
      hinweise.push({ code: 'IMP-307', pfad: person.pfad, kennung: person.kennung })
    }
  }
  return hinweise
}

/** IMP-308: Ereignisdatum außerhalb der Existenz des Ortes. */
function pruefeEreignisOrtExistenz(ereignisse: readonly PlausEreignis[], orteNachKennung: ReadonlyMap<string, PlausOrt>): readonly PlausHinweis[] {
  const hinweise: PlausHinweis[] = []
  for (const ereignis of ereignisse) {
    if (ereignis.ort === undefined || ereignis.datum === undefined) continue
    const ort = orteNachKennung.get(ereignis.ort)
    if (ort?.existiert === undefined) continue
    if (ereignis.datum.von < ort.existiert.von || ereignis.datum.von > ort.existiert.bis) {
      hinweise.push({ code: 'IMP-308', pfad: ereignis.pfad, kennung: ereignis.kennung })
    }
  }
  return hinweise
}

/** IMP-309: Person ohne jede Beziehung und ohne Ereignis (erlaubt nach A-12, aber meist ein Versehen). */
function pruefeIsoliertePersonen(
  personen: readonly PlausPerson[],
  elternschaften: readonly PlausElternschaft[],
  partnerschaften: readonly PlausPartnerschaft[],
  ereignisse: readonly PlausEreignis[],
): readonly PlausHinweis[] {
  const verknuepft = new Set<string>()
  for (const elternschaft of elternschaften) {
    verknuepft.add(elternschaft.elternteil)
    verknuepft.add(elternschaft.kind)
  }
  for (const partnerschaft of partnerschaften) {
    for (const kennung of partnerschaft.beteiligte) verknuepft.add(kennung)
  }
  for (const ereignis of ereignisse) {
    for (const kennung of ereignis.beteiligte) verknuepft.add(kennung)
  }
  return personen.filter((person) => !verknuepft.has(person.kennung)).map((person) => ({ code: 'IMP-309' as const, pfad: person.pfad, kennung: person.kennung }))
}

/** IMP-310: `notizen_unverarbeitet` ist leer, obwohl das Ausgangsmaterial umfangreich war (§7.3).
 * Deterministischer Proxy (kein Zugriff auf das Ausgangsmaterial selbst möglich): `pruefsumme_quelltext`
 * gesetzt (Anzeichen für ein tatsächlich vorhandenes, umfangreiches Quelldokument) UND
 * `notizen_unverarbeitet` leer. */
function pruefeLeererNotizblock(notizenUnverarbeitetAnzahl: number, pruefsummeVorhanden: boolean): readonly PlausHinweis[] {
  if (pruefsummeVorhanden && notizenUnverarbeitetAnzahl === 0) {
    return [{ code: 'IMP-310', pfad: 'notizen_unverarbeitet' }]
  }
  return []
}

/**
 * Führt alle zehn Stufe-3-Regeln (56_Import_Vertrag.md §4) gegen eine bereits Stufe-1/2-geprüfte
 * Importdatei aus. Reine Funktion — die Reihenfolge der zurückgegebenen Hinweise folgt der
 * Reihenfolge der Codes (IMP-301…IMP-310), nicht ihrer Fundstelle in der Datei.
 */
export function pruefePlausibilitaet(eingabe: PlausibilitaetEingabe): readonly PlausHinweis[] {
  const personenNachKennung = new Map(eingabe.personen.map((person) => [person.kennung, person] as const))
  const orteNachKennung = new Map(eingabe.orte.map((ort) => [ort.kennung, ort] as const))

  return [
    ...pruefeTodVorGeburtUndBestattung(eingabe.personen),
    ...pruefeEheVorGeburt(eingabe.partnerschaften, personenNachKennung),
    ...pruefeElternAlter(eingabe.elternschaften, personenNachKennung),
    ...pruefeKoordinatenHerkunft(eingabe.orte),
    ...pruefeUnbekanntePraedikate(eingabe.aussagen),
    ...pruefeUmschriften(eingabe.namen),
    ...pruefeDiagnoseKonfidenz(eingabe.diagnosen),
    ...pruefeLebensdauer(eingabe.personen),
    ...pruefeEreignisOrtExistenz(eingabe.ereignisse, orteNachKennung),
    ...pruefeIsoliertePersonen(eingabe.personen, eingabe.elternschaften, eingabe.partnerschaften, eingabe.ereignisse),
    ...pruefeLeererNotizblock(eingabe.notizenUnverarbeitetAnzahl, eingabe.pruefsummeVorhanden),
  ]
}

// ---------------------------------------------------------------------------------------------
// AP-1.8, F-07 (57_Phase0_Arbeitspakete.md „AP-1.8"): Plausibilitätsprüfungen über den GESAMTEN
// Bestand (nicht nur die gerade importierte Datei) — dieselbe Art Regel wie oben, aber gegen den
// bereits geschriebenen Datenbankinhalt, geladen von `src/main/abfragen/pruefhinweise.ts`.
// Eigenständige Typen (KEINE Wiederverwendung von `PlausibilitaetEingabe`/`PlausHinweis`): die
// Bestandsprüfung braucht andere Bezugsgrößen (echte `person.id` statt Import-`kennung`, echte
// `ort.id`/`ereignis.id` statt JSON-`pfad`) und einen eigenen, NICHT mit den IMP-3xx-Codes
// verwechselbaren Hinweis-Code (§Auftrag AP-1.8: „Eigenes Hinweis-Code-Union, NICHT die
// IMP-3xx-Codes"). Bleibt reine Funktion — kein Node, kein SQL, kein Import aus `src/shared`/
// `src/main` (CLAUDE.md §2/§4), Datumsvergleiche wie oben ausschließlich über JDN-Intervalle.
import { findeZyklusKnoten, type Elternkante } from '../graph/zyklus'

export interface BestandPerson {
  readonly id: string
  /** A-17, `50_Datenmodell.md` §2.14: Platzhalter werden von JEDER Regel unten übersprungen. */
  readonly istPlatzhalter: boolean
  readonly geschlecht?: PlausGeschlecht | undefined
  readonly geburt?: JdnIntervall | undefined
  readonly tod?: JdnIntervall | undefined
  /** Datum des Bestattungsereignisses (`ereignis.typ = 'beerdigung'`, Rolle `verstorbener`) — anders
   * benannt als `PlausPerson.beerdigung` oben, um die beiden unabhängigen Eingabetypen beim Lesen
   * nicht zu verwechseln; inhaltlich dasselbe Konzept. */
  readonly bestattung?: JdnIntervall | undefined
}

/** Wie `Elternkante` (`src/core/graph/zyklus.ts`), mit den Bestands-Feldnamen. */
export interface BestandElternschaft {
  readonly elternteilId: string
  readonly kindId: string
}

export interface BestandPartnerschaft {
  readonly beginn?: JdnIntervall | undefined
  readonly beteiligteIds: readonly string[]
}

export interface BestandOrt {
  readonly id: string
  readonly existiert?: JdnIntervall | undefined
}

export interface BestandEreignis {
  readonly ortId?: string | undefined
  readonly datum?: JdnIntervall | undefined
  readonly beteiligteIds: readonly string[]
}

export interface BestandEingabe {
  readonly personen: readonly BestandPerson[]
  readonly elternschaften: readonly BestandElternschaft[]
  readonly partnerschaften: readonly BestandPartnerschaft[]
  readonly orte: readonly BestandOrt[]
  readonly ereignisse: readonly BestandEreignis[]
}

/** Die acht Bestandsregeln (AP-1.8-Abnahme, 57_Phase0_Arbeitspakete.md Z.1307) — bewusst NICHT die
 * IMP-3xx-Codes (die gelten nur für die gerade importierte Datei, s. Kopfkommentar). */
export type BestandHinweisCode =
  | 'tod_vor_geburt'
  | 'bestattung_vor_tod'
  | 'mutter_alter'
  | 'vater_alter'
  | 'kind_vor_ehe'
  | 'alter_ueber_110'
  | 'zyklus'
  | 'ereignis_vor_ortsexistenz'

export interface BestandHinweis {
  readonly code: BestandHinweisCode
  /** Die Person, zu der der Hinweis in der Liste springt (Auftrag AP-1.8: „Sprung zur betroffenen
   * Person"). Bei Regeln mit mehreren Beteiligten (Zyklus, Ereignis) EIN Hinweis JE betroffener
   * Person — die Liste zeigt dann mehrere Zeilen mit demselben `code`. */
  readonly personId: string
}

function bestandPersonenKarte(personen: readonly BestandPerson[]): ReadonlyMap<string, BestandPerson> {
  return new Map(personen.map((person) => [person.id, person] as const))
}

/** tod_vor_geburt / bestattung_vor_tod: Platzhalter werden übersprungen (A-17). */
function pruefeBestandTodUndBestattung(personen: readonly BestandPerson[]): readonly BestandHinweis[] {
  const hinweise: BestandHinweis[] = []
  for (const person of personen) {
    if (person.istPlatzhalter) continue
    if (person.geburt !== undefined && person.tod !== undefined && person.tod.von < person.geburt.von) {
      hinweise.push({ code: 'tod_vor_geburt', personId: person.id })
    }
    if (person.tod !== undefined && person.bestattung !== undefined && person.bestattung.von < person.tod.von) {
      hinweise.push({ code: 'bestattung_vor_tod', personId: person.id })
    }
  }
  return hinweise
}

/** mutter_alter / vater_alter: Elternteil bei Geburt des Kindes jünger als 12, oder älter als 55
 * (Mutter)/80 (Vater). Ohne bekanntes Geschlecht des Elternteils ist keine der beiden Regeln
 * anwendbar (welcher Code? — die Grenzen unterscheiden sich, ein Raten wäre falsch). Platzhalter
 * (Elternteil ODER Kind) werden übersprungen. */
function pruefeBestandElternAlter(elternschaften: readonly BestandElternschaft[], personenKarte: ReadonlyMap<string, BestandPerson>): readonly BestandHinweis[] {
  const hinweise: BestandHinweis[] = []
  for (const elternschaft of elternschaften) {
    const elternteil = personenKarte.get(elternschaft.elternteilId)
    const kind = personenKarte.get(elternschaft.kindId)
    if (elternteil === undefined || kind === undefined) continue
    if (elternteil.istPlatzhalter || kind.istPlatzhalter) continue
    if (elternteil.geburt === undefined || kind.geburt === undefined) continue

    const altersabstand = jahreZwischen(elternteil.geburt.von, kind.geburt.von)
    const zuJung = altersabstand < 12
    if (elternteil.geschlecht === 'F') {
      if (zuJung || altersabstand > 55) hinweise.push({ code: 'mutter_alter', personId: elternteil.id })
    } else if (elternteil.geschlecht === 'M') {
      if (zuJung || altersabstand > 80) hinweise.push({ code: 'vater_alter', personId: elternteil.id })
    }
  }
  return hinweise
}

/** kind_vor_ehe (nur Hinweis, nicht Fehler — 57_Phase0_Arbeitspakete.md AP-1.8): ein Kind eines
 * Paares, geboren VOR dem Beginn von dessen Partnerschaft. Ein Kind zählt zu einem Paar, wenn
 * mindestens ein Elternteil laut `elternschaften` zu den `beteiligteIds` der Partnerschaft gehört
 * (deckt sowohl "beide Elternteile bekannt" als auch "nur ein Elternteil erfasst" ab). Platzhalter-
 * Kinder werden übersprungen. */
function pruefeBestandKindVorEhe(
  elternschaften: readonly BestandElternschaft[],
  partnerschaften: readonly BestandPartnerschaft[],
  personenKarte: ReadonlyMap<string, BestandPerson>,
): readonly BestandHinweis[] {
  const hinweise: BestandHinweis[] = []
  for (const partnerschaft of partnerschaften) {
    if (partnerschaft.beginn === undefined) continue
    const beteiligteMenge = new Set(partnerschaft.beteiligteIds)
    const kinderIds = new Set(elternschaften.filter((el) => beteiligteMenge.has(el.elternteilId)).map((el) => el.kindId))
    for (const kindId of kinderIds) {
      const kind = personenKarte.get(kindId)
      if (kind === undefined || kind.istPlatzhalter || kind.geburt === undefined) continue
      if (kind.geburt.von < partnerschaft.beginn.von) {
        hinweise.push({ code: 'kind_vor_ehe', personId: kind.id })
      }
    }
  }
  return hinweise
}

/** alter_ueber_110: Lebensdauer über 110 Jahre. Platzhalter werden übersprungen. */
function pruefeBestandLebensdauer(personen: readonly BestandPerson[]): readonly BestandHinweis[] {
  const hinweise: BestandHinweis[] = []
  for (const person of personen) {
    if (person.istPlatzhalter) continue
    if (person.geburt === undefined || person.tod === undefined) continue
    if (jahreZwischen(person.geburt.von, person.tod.von) > 110) {
      hinweise.push({ code: 'alter_ueber_110', personId: person.id })
    }
  }
  return hinweise
}

/** zyklus: niemand ist eigener Vorfahre (ADR-009 Punkt 2). Elternschaftskanten mit einer
 * Platzhalter-Person auf irgendeiner Seite werden VOR der Zyklussuche entfernt (A-17) — ein
 * Platzhalter ist per Definition unsicher zugeordnet, ein "Zyklus" über ihn wäre kein verlässlicher
 * Befund. Ein Hinweis JE Person auf dem gefundenen Zyklus (`findeZyklusKnoten`,
 * `src/core/graph/zyklus.ts`) — mehrere unabhängige Zyklen werden nicht alle gefunden (s. Kommentar
 * dort), das ist für einen Prüfhinweis ausreichend. */
function pruefeBestandZyklus(elternschaften: readonly BestandElternschaft[], personenKarte: ReadonlyMap<string, BestandPerson>): readonly BestandHinweis[] {
  const kanten: Elternkante[] = elternschaften
    .filter((el) => {
      const elternteil = personenKarte.get(el.elternteilId)
      const kind = personenKarte.get(el.kindId)
      return elternteil !== undefined && kind !== undefined && !elternteil.istPlatzhalter && !kind.istPlatzhalter
    })
    .map((el) => ({ elternteilId: el.elternteilId, kindId: el.kindId }))

  return findeZyklusKnoten(kanten).map((personId) => ({ code: 'zyklus' as const, personId }))
}

/** ereignis_vor_ortsexistenz: Ereignisdatum außerhalb der Existenz des Ortes. Ein Hinweis JE
 * beteiligter, nicht-platzhalter Person (ein Ereignis kann mehrere Beteiligte haben — A-17 gilt
 * pro Person, nicht pro Ereignis). */
function pruefeBestandEreignisOrtExistenz(ereignisse: readonly BestandEreignis[], orteKarte: ReadonlyMap<string, BestandOrt>, personenKarte: ReadonlyMap<string, BestandPerson>): readonly BestandHinweis[] {
  const hinweise: BestandHinweis[] = []
  for (const ereignis of ereignisse) {
    if (ereignis.ortId === undefined || ereignis.datum === undefined) continue
    const ort = orteKarte.get(ereignis.ortId)
    if (ort?.existiert === undefined) continue
    if (ereignis.datum.von < ort.existiert.von || ereignis.datum.von > ort.existiert.bis) {
      for (const personId of ereignis.beteiligteIds) {
        const person = personenKarte.get(personId)
        if (person === undefined || person.istPlatzhalter) continue
        hinweise.push({ code: 'ereignis_vor_ortsexistenz', personId })
      }
    }
  }
  return hinweise
}

/**
 * Führt alle acht Bestandsregeln (AP-1.8-Abnahme) gegen den GESAMTEN Bestand aus. Reine Funktion —
 * die Reihenfolge der zurückgegebenen Hinweise folgt der Reihenfolge der Regeln in der Abnahme, nicht
 * ihrer Fundstelle im Bestand. Platzhalterpersonen werden von jeder Regel übersprungen (A-17).
 */
export function pruefeBestand(eingabe: BestandEingabe): readonly BestandHinweis[] {
  const personenKarte = bestandPersonenKarte(eingabe.personen)
  const orteKarte = new Map(eingabe.orte.map((ort) => [ort.id, ort] as const))

  return [
    ...pruefeBestandTodUndBestattung(eingabe.personen),
    ...pruefeBestandElternAlter(eingabe.elternschaften, personenKarte),
    ...pruefeBestandKindVorEhe(eingabe.elternschaften, eingabe.partnerschaften, personenKarte),
    ...pruefeBestandLebensdauer(eingabe.personen),
    ...pruefeBestandZyklus(eingabe.elternschaften, personenKarte),
    ...pruefeBestandEreignisOrtExistenz(eingabe.ereignisse, orteKarte, personenKarte),
  ]
}
