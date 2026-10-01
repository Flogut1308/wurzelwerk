// AP-1.30 PR 12a (docs/80_Offene_Fragen.md §33 V-130-12-geschwister-regel/-typen): Geschwister einer
// Person aus den Elternkanten ableiten. Geschwister sind keine gespeicherte Beziehung, sondern
// Folge gemeinsamer Eltern — Anzeigen, nicht raten.
//
// Regel: Stiftend sind nur biologisch, adoptiv, anerkannt, unbekannt (Kindschaft). stief, pflege, zieh,
// leihmutter stiften keine Geschwisterschaft. E(X) = Eltern mit mindestens einer stiftenden Kante
// zu X (Doppelkanten zur selben Person = ein Elternteil). Kandidat = jede andere Person, die mit P
// über IRGENDEINEN Typ einen Elternteil teilt. C = E(P) ∩ E(S).
//  - |C| >= 2                          → voll
//  - |C| = 1, |E(P)| >= 2, |E(S)| >= 2 → halb
//  - |C| = 1 sonst                     → offen (ein Elternteil fehlt, „halb" wäre geraten)
//  - |C| = 0                           → sozial (nur über nicht stiftende Kanten)
// Ein Platzhalter-Elternteil zählt als gemeinsamer Elternteil (wie U-1.34-E6).
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe.

import type { ElternschaftTyp } from '../layout/vertrag'

/** Die Kern-Spiegelung von `elternschaft.typ` (Drift fängt `elternschaft-typ-konsistenz.test.ts`). */
export type GeschwisterKantentyp = ElternschaftTyp

export const GESCHWISTER_ARTEN = ['voll', 'halb', 'offen', 'sozial'] as const

export type GeschwisterArt = (typeof GESCHWISTER_ARTEN)[number]

export interface GeschwisterKante {
  readonly elternteilId: string
  readonly kindId: string
  readonly typ: GeschwisterKantentyp
}

export interface Geschwister {
  readonly personId: string
  readonly art: GeschwisterArt
  /** Gemeinsame stiftende Eltern, aufsteigend sortiert (bei `sozial` leer). */
  readonly gemeinsameElternIds: readonly string[]
}

const STIFTEND: ReadonlySet<GeschwisterKantentyp> = new Set<GeschwisterKantentyp>(['biologisch', 'adoptiv', 'anerkannt', 'unbekannt'])

function vergleiche(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function artFuer(gemeinsam: number, elternP: number, elternS: number): GeschwisterArt {
  if (gemeinsam >= 2) return 'voll'
  if (gemeinsam === 1) return elternP >= 2 && elternS >= 2 ? 'halb' : 'offen'
  return 'sozial'
}

export function geschwisterAbleiten(personId: string, kanten: readonly GeschwisterKante[]): readonly Geschwister[] {
  const alleEltern = new Map<string, Set<string>>() // Kind → Eltern über jeden Typ
  const stiftendeEltern = new Map<string, Set<string>>() // Kind → Eltern über stiftende Typen
  const kinderJeElternteil = new Map<string, Set<string>>()
  const eintragen = (karte: Map<string, Set<string>>, schluessel: string, wert: string): void => {
    const menge = karte.get(schluessel)
    if (menge === undefined) karte.set(schluessel, new Set([wert]))
    else menge.add(wert)
  }
  for (const kante of kanten) {
    eintragen(alleEltern, kante.kindId, kante.elternteilId)
    eintragen(kinderJeElternteil, kante.elternteilId, kante.kindId)
    if (STIFTEND.has(kante.typ)) eintragen(stiftendeEltern, kante.kindId, kante.elternteilId)
  }

  const elternP = stiftendeEltern.get(personId) ?? new Set<string>()
  const kandidaten = new Set<string>()
  for (const elternId of alleEltern.get(personId) ?? []) {
    for (const kindId of kinderJeElternteil.get(elternId) ?? []) {
      if (kindId !== personId) kandidaten.add(kindId)
    }
  }

  const ergebnis: Geschwister[] = []
  for (const kandidat of kandidaten) {
    const elternS = stiftendeEltern.get(kandidat) ?? new Set<string>()
    const gemeinsam = [...elternP].filter((id) => elternS.has(id)).sort(vergleiche)
    ergebnis.push({ personId: kandidat, art: artFuer(gemeinsam.length, elternP.size, elternS.size), gemeinsameElternIds: gemeinsam })
  }
  return ergebnis.sort((a, b) => GESCHWISTER_ARTEN.indexOf(a.art) - GESCHWISTER_ARTEN.indexOf(b.art) || vergleiche(a.personId, b.personId))
}
