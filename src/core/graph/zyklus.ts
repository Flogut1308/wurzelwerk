// AP-0.9 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invariante aus
// ADR-009 Punkt 2: "Niemand ist eigener Vorfahre" (Zyklusfreiheit). Vorbereitung für den späteren
// Elternkanten-Befehl (AP-0.10+): der Befehl, der eine Elternkante setzt, gibt es noch nicht -
// diese Datei liefert nur die reine Prüf-Funktion, die er dann nutzen wird.
//
// Richtungssemantik (WICHTIG, leicht zu verwechseln):
// Eine `Elternkante` zeigt vom KIND auf den ELTERNTEIL, gelesen als "kindId ist Kind von
// elternteilId". Der Graph, den `hatZyklus`/`wuerdeZyklusErzeugen` auf Zyklen prüft, ist also der
// gerichtete Graph "ist Kind von" (Kind -> Elternteil). Ein Zyklus in diesem Graphen bedeutet:
// folgt man von einer Person aus wiederholt "ist Kind von", kommt man irgendwann wieder bei der
// Startperson an - sie wäre ihr eigener (Ur-…)Vorfahre. Das ist die einzige Bedeutung von
// "Zyklus" hier; es geht NICHT um einen ungerichteten Kreis im Familienbild (der bei jedem
// Ahnenimplex/Cousinenheirat auftritt und ausdrücklich KEIN Zyklus in diesem Sinn ist).
//
// Reine Funktion (CLAUDE.md §4): kein Node, kein Electron, kein SQL, kein Math.random/Date.now/
// new Date()/process/globalThis. Nur benannte Exporte.

/**
 * Eine gerichtete Elternschafts-Kante: `kindId` ist Kind von `elternteilId`.
 * `elternteilId` zeigt in Richtung "Vorfahre", `kindId` in Richtung "Nachkomme".
 */
export interface Elternkante {
  readonly elternteilId: string
  readonly kindId: string
}

/** Baut für gegebene Kanten eine Adjazenzliste "Person -> ihre Elternteile" (kindId -> elternteilId[]). */
function elternVonKindAdjazenz(kanten: readonly Elternkante[]): ReadonlyMap<string, readonly string[]> {
  const adjazenz = new Map<string, string[]>()
  for (const kante of kanten) {
    const bisherige = adjazenz.get(kante.kindId)
    if (bisherige === undefined) {
      adjazenz.set(kante.kindId, [kante.elternteilId])
    } else {
      bisherige.push(kante.elternteilId)
    }
  }
  return adjazenz
}

/**
 * true, wenn der gerichtete Graph "ist Kind von" (Kind -> Elternteil) aus `kanten` einen Zyklus
 * enthält - d. h. mindestens eine Person wäre ihr eigener (Ur-…)Vorfahre. Robust gegen
 * Mehrfachkanten (dieselbe Kante mehrfach in `kanten`) und Selbstkanten
 * (`elternteilId === kindId`, sofort ein Zyklus der Länge 1).
 *
 * Umsetzung: klassische Zyklussuche per Tiefensuche mit drei Zuständen je Knoten
 * (unbesucht / auf dem aktuellen Pfad / vollständig abgearbeitet). Ein Wiedereintritt in einen
 * Knoten, der noch auf dem aktuellen Pfad liegt ("grau"), zeigt einen Zyklus. Jeder Knoten wird
 * höchstens einmal vollständig abgearbeitet ("schwarz" markiert), das verhindert eine
 * Endlosschleife auch bei zyklenbehafteten Graphen und hält die Laufzeit linear in Knoten + Kanten.
 */
export function hatZyklus(kanten: readonly Elternkante[]): boolean {
  const adjazenz = elternVonKindAdjazenz(kanten)

  const AUF_PFAD = 1
  const ABGESCHLOSSEN = 2
  const zustand = new Map<string, typeof AUF_PFAD | typeof ABGESCHLOSSEN>()

  function besuchen(knoten: string): boolean {
    const bisherigerZustand = zustand.get(knoten)
    if (bisherigerZustand === AUF_PFAD) {
      return true // Wiedereintritt in den aktuellen Pfad -> Zyklus gefunden.
    }
    if (bisherigerZustand === ABGESCHLOSSEN) {
      return false // Bereits zyklenfrei abgearbeitet, nicht erneut prüfen.
    }

    zustand.set(knoten, AUF_PFAD)
    const elternteile = adjazenz.get(knoten) ?? []
    for (const elternteil of elternteile) {
      if (besuchen(elternteil)) {
        return true
      }
    }
    zustand.set(knoten, ABGESCHLOSSEN)
    return false
  }

  for (const kante of kanten) {
    if (zustand.get(kante.kindId) !== ABGESCHLOSSEN && besuchen(kante.kindId)) {
      return true
    }
  }
  return false
}

/**
 * true, wenn das Hinzufügen von `neu` zu den (als zyklenfrei angenommenen) `kanten` einen Zyklus
 * erzeugen würde. Das ist genau dann der Fall, wenn `neu.elternteilId` bereits (transitiv) ein
 * Nachkomme von `neu.kindId` ist, oder wenn `neu` eine Selbstkante ist
 * (`neu.elternteilId === neu.kindId`) - dann wäre die Person unmittelbar ihr eigener Elternteil.
 *
 * Voraussetzung/Vertrag: `kanten` ist bereits zyklenfrei (das ist die Invariante, die der
 * aufrufende Befehl - AP-0.10+ - vor jedem Setzen einer neuen Elternkante sicherstellt). Unter
 * dieser Voraussetzung gilt `wuerdeZyklusErzeugen(kanten, neu) === hatZyklus([...kanten, neu])`,
 * hier aber ohne den vollen Graphen erneut aufzubauen: es genügt zu prüfen, ob `neu.kindId` von
 * `neu.elternteilId` aus erreichbar ist (Vorwärtssuche über "ist Kind von" ab `neu.elternteilId`).
 */
export function wuerdeZyklusErzeugen(kanten: readonly Elternkante[], neu: Elternkante): boolean {
  if (neu.elternteilId === neu.kindId) {
    return true
  }

  const adjazenz = elternVonKindAdjazenz(kanten)
  const besucht = new Set<string>()
  const zuPruefen: string[] = [neu.elternteilId]

  while (zuPruefen.length > 0) {
    // Nicht-null: die Schleifenbedingung garantiert length > 0, `pop()` liefert daher immer einen Wert.
    const knoten = zuPruefen.pop()
    if (knoten === undefined) {
      break // Unerreichbar (length > 0 garantiert), aber ohne `!` formuliert (CLAUDE.md §4).
    }
    if (knoten === neu.kindId) {
      return true // neu.elternteilId ist (transitiv) Nachkomme von neu.kindId -> Rückkante, Zyklus.
    }
    if (besucht.has(knoten)) {
      continue
    }
    besucht.add(knoten)
    const elternteile = adjazenz.get(knoten) ?? []
    for (const elternteil of elternteile) {
      zuPruefen.push(elternteil)
    }
  }
  return false
}
