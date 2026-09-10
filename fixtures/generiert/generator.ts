// AP-0.12 — deterministischer Massendaten-Generator für Leistungs-/Lasttests
// (57_Phase0_Arbeitspakete.md „AP-0.12": "Generator liefert 200 / 2.000 / 20.000 Personen, mit
// festem Seed reproduzierbar: zwei Läufe erzeugen bitgleiche Datenbanken"). Baut synthetische
// Generationen aus Wurzelpersonen (keine Eltern) und Nachkommen, deren Elternkanten IMMER auf eine
// echt frühere Generation zeigen — dadurch ist der erzeugte Elterngraph per Konstruktion ein
// zyklenfreier DAG, ganz ohne zusätzliche Laufzeitprüfung. (Eine `hatZyklus`-Prüfung über bis zu
// 20.000 Knoten würde zudem, je nach zufällig entstehender Kettenlänge, eine sehr tiefe Rekursion
// riskieren — `src/core/graph/zyklus.ts` ist bewusst rein rekursiv implementiert. Die tatsächliche
// Zyklenfreiheits-INVARIANTE für den ganzen Korpus prüft ohnehin `test/invarianten/
// zyklusfreiheit.test.ts`, geschützter Prüfpfad, nicht dieser Generator.)
//
// Determinismus (Abnahme "zwei Läufe mit gleichem Seed -> bitgleiche Datenbank"): JEDE Entscheidung
// hier (Generationsgröße, Elternzahl, Elternauswahl, Namenswahl) kommt aus genau einem
// `SeedPrng`-Strom in fester Aufrufreihenfolge — kein `Math.random`/`Date.now`/`crypto` beteiligt.
import type Database from 'better-sqlite3'
import { SeedPrng } from '../../src/core/zufall/seed-prng'
import {
  baueFixture,
  type FixtureBeschreibung,
  type FixtureElternschaft,
  type FixtureNamenzeile,
  type FixturePerson,
} from '../../test/hilfsmittel/fixture-bauen'

const VORNAMEN_M = ['Johann', 'Wilhelm', 'Karl', 'Friedrich', 'Heinrich', 'Otto', 'Hermann', 'Gustav', 'August', 'Paul', 'Ernst', 'Franz'] as const
const VORNAMEN_F = ['Anna', 'Maria', 'Emilie', 'Auguste', 'Frieda', 'Gertrud', 'Luise', 'Clara', 'Martha', 'Ida', 'Berta', 'Wilhelmine'] as const
const NACHNAMEN = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch'] as const

/** Die drei erlaubten Korpusgrößen (AP-0.12-Abnahme). */
export type GeneratorGroesse = 200 | 2000 | 20000

interface GenerationsBereich {
  readonly start: number
  readonly ende: number
}

/** Wählt deterministisch ein Element aus einer nichtleeren `as const`-Liste über einen Zufallswert. */
function ausListe<T>(liste: readonly T[], zufallswert: number): T {
  const treffer = liste[zufallswert % liste.length]
  if (treffer === undefined) {
    // Unerreichbar: alle Listen in dieser Datei sind nichtleere `as const`-Literale
    // (noUncheckedIndexedAccess-Absicherung statt `!`, CLAUDE.md §4).
    throw new RangeError('ausListe: leere Liste')
  }
  return treffer
}

/**
 * Generationsgrenzen als aufsteigende, lückenlose Indexbereiche `[start, ende)` — Summe der
 * Bereichsgrößen ergibt genau `gesamt`. Die Größe je Generation wächst mit einem aus `prng`
 * gezogenen Faktor (1.5 … 1.9) gegenüber der vorherigen — rein für glaubwürdige Baumform
 * (schmale Wurzel, breitere jüngere Generationen), ohne fachliche Bedeutung.
 */
function generationsGrenzen(gesamt: number, prng: SeedPrng): readonly GenerationsBereich[] {
  const grenzen: GenerationsBereich[] = []
  let start = 0
  let groesse = Math.max(5, Math.round(gesamt * 0.02))
  while (start < gesamt) {
    const ende = Math.min(gesamt, start + groesse)
    grenzen.push({ start, ende })
    start = ende
    const wachstumFaktorTausendstel = 1500 + (prng.naechsteZahl() % 400) // 1.500 … 1.899
    groesse = Math.max(1, Math.round((groesse * wachstumFaktorTausendstel) / 1000))
  }
  return grenzen
}

/** Generationsindex (0-basiert) des Personenindex `index` in `grenzen`. */
function generationsIndexFuer(grenzen: readonly GenerationsBereich[], index: number): number {
  for (let g = 0; g < grenzen.length; g += 1) {
    const bereich = grenzen[g]
    if (bereich !== undefined && index >= bereich.start && index < bereich.ende) {
      return g
    }
  }
  // Unerreichbar: `grenzen` deckt per Konstruktion in `generationsGrenzen` lückenlos [0, gesamt) ab.
  throw new RangeError(`generationsIndexFuer: kein Bereich für Index ${String(index)}`)
}

/** 0, 1 oder 2 Elternteile — deterministisch gewichtet (85 % zwei, 10 % eins, 5 % keins bekannt). */
function anzahlElternWaehlen(prng: SeedPrng): 0 | 1 | 2 {
  const wuerfel = prng.naechsteZahl() % 100
  if (wuerfel < 85) {
    return 2
  }
  if (wuerfel < 95) {
    return 1
  }
  return 0
}

/** Einen von `spanne` Indizes ab `bereich.start`, deterministisch aus `prng`. */
function elternIndexWaehlen(bereich: GenerationsBereich, prng: SeedPrng): number {
  const spanne = bereich.ende - bereich.start
  return bereich.start + (prng.naechsteZahl() % spanne)
}

function personenUndElternschaftenBauen(
  groesse: GeneratorGroesse,
  strukturPrng: SeedPrng,
): { readonly personen: readonly FixturePerson[]; readonly elternschaften: readonly FixtureElternschaft[] } {
  const grenzen = generationsGrenzen(groesse, strukturPrng)
  const personen: FixturePerson[] = []
  const elternschaften: FixtureElternschaft[] = []

  for (let i = 0; i < groesse; i += 1) {
    const schluessel = `p${i}`
    const istWeiblich = strukturPrng.naechsteZahl() % 2 === 0
    personen.push({
      schluessel,
      privat: 0,
      ist_platzhalter: 0,
      geschlecht: istWeiblich ? 'F' : 'M',
      lebend_status: 'verstorben',
    })

    const generation = generationsIndexFuer(grenzen, i)
    if (generation === 0) {
      continue // Wurzelperson dieser Generation - keine Elternkante.
    }
    const vorherigeGeneration = grenzen[generation - 1]
    if (vorherigeGeneration === undefined) {
      continue // Unerreichbar (generation > 0 garantiert einen Vorgängerbereich), defensiv statt `!`.
    }

    const anzahlEltern = anzahlElternWaehlen(strukturPrng)
    if (anzahlEltern === 0) {
      continue
    }
    const ersterElternIndex = elternIndexWaehlen(vorherigeGeneration, strukturPrng)
    elternschaften.push({
      schluessel: `e${i}a`,
      elternteilSchluessel: `p${ersterElternIndex}`,
      kindSchluessel: schluessel,
      typ: 'biologisch',
    })

    const spanne = vorherigeGeneration.ende - vorherigeGeneration.start
    if (anzahlEltern === 2 && spanne >= 2) {
      let zweiterElternIndex = elternIndexWaehlen(vorherigeGeneration, strukturPrng)
      if (zweiterElternIndex === ersterElternIndex) {
        // Kollision: nächsten Index im selben Bereich nehmen (zyklisch) statt denselben Elternteil doppelt einzutragen.
        zweiterElternIndex = vorherigeGeneration.start + ((zweiterElternIndex - vorherigeGeneration.start + 1) % spanne)
      }
      elternschaften.push({
        schluessel: `e${i}b`,
        elternteilSchluessel: `p${zweiterElternIndex}`,
        kindSchluessel: schluessel,
        typ: 'biologisch',
      })
    }
  }

  return { personen, elternschaften }
}

function namenBauen(personen: readonly FixturePerson[], strukturPrng: SeedPrng): readonly FixtureNamenzeile[] {
  return personen.map((person, index): FixtureNamenzeile => {
    const istWeiblich = person.geschlecht === 'F'
    const vorname = istWeiblich
      ? ausListe(VORNAMEN_F, strukturPrng.naechsteZahl())
      : ausListe(VORNAMEN_M, strukturPrng.naechsteZahl())
    const nachname = ausListe(NACHNAMEN, strukturPrng.naechsteZahl())
    return {
      schluessel: `n${index}`,
      personSchluessel: person.schluessel,
      typ: 'geburtsname',
      schrift: 'latn',
      vornamen: vorname,
      nachname,
      ist_bevorzugt: 1,
    }
  })
}

/**
 * Baut deterministisch einen synthetischen Korpus aus `groesse` Personen (mit Namen und
 * plausiblen, garantiert zyklenfreien Elternschaften) und liefert die geöffnete In-Memory-Datenbank.
 * Zwei Aufrufe mit gleichem `groesse` UND gleichem `seed` erzeugen eine bitgleiche Datenbank
 * (`test/einheit/generator-deterministisch.test.ts`). Aufrufer schließt die Verbindung selbst
 * (`db.close()`).
 */
export function generiere(groesse: GeneratorGroesse, seed: number): Database.Database {
  const strukturPrng = new SeedPrng(seed)
  const { personen, elternschaften } = personenUndElternschaftenBauen(groesse, strukturPrng)
  const namen = namenBauen(personen, strukturPrng)

  const beschreibung: FixtureBeschreibung = { personen, namen, elternschaften }
  return baueFixture(beschreibung, seed)
}
