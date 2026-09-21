// AP-1.16 PR-A — reine Zyklusfreiheits-Funktion für den Ortszugehörigkeits-Graphen
// (`ortszugehoerigkeit`, 50_Datenmodell.md §2.4). Analog zu `src/core/graph/zyklus.ts`
// (Elternschaftsgraph), hier für die Ort-Hierarchie: `befehl:ortszugehoerigkeit.anlegen`
// (`src/main/befehle/ortszugehoerigkeit-anlegen.ts`) prüft damit VOR dem Schreiben, ob eine neue
// Kante innerhalb derselben `art` (politisch/kirchlich getrennt, NIE gemischt geprüft — s.
// `src/core/ort/zeitbezug.ts`) einen Zyklus erzeugen würde.
//
// Richtungssemantik (analog zum Kopfkommentar von `src/core/graph/zyklus.ts`, leicht zu
// verwechseln): eine `Ortskante` zeigt vom UNTERGEORDNETEN Ort (`ortId`) auf den ÜBERGEORDNETEN
// Ort (`uebergeordnetId`), gelesen als "ortId gehört (in dieser art) zu uebergeordnetId" — genau
// die Spalten `ort_id`/`uebergeordnet_id` aus `docs/schema/0002_kern.sql` §2.4. Der Graph, den
// `hatZyklus`/`wuerdeZyklusErzeugen` auf Zyklen prüft, ist also der gerichtete Graph "gehört zu"
// (Ort -> Übergeordneter). Ein Zyklus bedeutet: folgt man von einem Ort aus wiederholt "gehört
// zu", kommt man irgendwann wieder beim Start-Ort an — er wäre sein eigener (Ur-…)Übergeordneter.
//
// Reine Funktion (CLAUDE.md §4): kein Node, kein Electron, kein SQL, kein Math.random/Date.now/
// new Date()/process/globalThis. Nur benannte Exporte. Bewusst KEIN Import aus `src/core/graph`
// (eigener, in sich abgeschlossener Graph — Ortszugehörigkeit und Elternschaft sind fachlich
// unabhängige Domänen, auch wenn der Algorithmus identisch ist).

/**
 * Eine gerichtete Ortszugehörigkeits-Kante: `ortId` gehört zu `uebergeordnetId`.
 * `uebergeordnetId` zeigt in Richtung "übergeordnet" (z. B. Kreis, Provinz, Bistum),
 * `ortId` in Richtung "untergeordnet" (z. B. Dorf, Kirchspiel).
 */
export interface Ortskante {
  readonly ortId: string
  readonly uebergeordnetId: string
}

/** Baut für gegebene Kanten eine Adjazenzliste "Ort -> sein Übergeordneter" (ortId -> uebergeordnetId[]). */
function uebergeordneteAdjazenz(kanten: readonly Ortskante[]): ReadonlyMap<string, readonly string[]> {
  const adjazenz = new Map<string, string[]>()
  for (const kante of kanten) {
    const bisherige = adjazenz.get(kante.ortId)
    if (bisherige === undefined) {
      adjazenz.set(kante.ortId, [kante.uebergeordnetId])
    } else {
      bisherige.push(kante.uebergeordnetId)
    }
  }
  return adjazenz
}

/**
 * true, wenn der gerichtete Graph "gehört zu" (Ort -> Übergeordneter) aus `kanten` einen Zyklus
 * enthält — d. h. mindestens ein Ort wäre (transitiv) sein eigener Übergeordneter. Robust gegen
 * Mehrfachkanten und Selbstkanten (`ortId === uebergeordnetId`, sofort ein Zyklus der Länge 1).
 *
 * Umsetzung: dieselbe Tiefensuche mit drei Zuständen je Knoten wie
 * `src/core/graph/zyklus.ts::hatZyklus` (unbesucht / auf dem aktuellen Pfad / abgeschlossen).
 */
export function hatZyklus(kanten: readonly Ortskante[]): boolean {
  const adjazenz = uebergeordneteAdjazenz(kanten)

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
    const uebergeordnete = adjazenz.get(knoten) ?? []
    for (const uebergeordnet of uebergeordnete) {
      if (besuchen(uebergeordnet)) {
        return true
      }
    }
    zustand.set(knoten, ABGESCHLOSSEN)
    return false
  }

  for (const kante of kanten) {
    if (zustand.get(kante.ortId) !== ABGESCHLOSSEN && besuchen(kante.ortId)) {
      return true
    }
  }
  return false
}

/**
 * true, wenn das Hinzufügen von `neu` zu den (als zyklenfrei angenommenen) `kanten` einen Zyklus
 * erzeugen würde. Das ist genau dann der Fall, wenn `neu.uebergeordnetId` bereits (transitiv)
 * ein Untergeordneter von `neu.ortId` ist, oder wenn `neu` eine Selbstkante ist
 * (`neu.uebergeordnetId === neu.ortId`) — dann wäre der Ort unmittelbar sein eigener Übergeordneter.
 *
 * Voraussetzung/Vertrag: `kanten` ist bereits zyklenfrei — das stellt der aufrufende Befehl
 * (`ortszugehoerigkeit.anlegen`) sicher, indem er NUR die bestehenden Kanten DERSELBEN `art`
 * übergibt (politisch/kirchlich getrennt geprüft, s. Modul-Kommentar). Unter dieser Voraussetzung
 * gilt `wuerdeZyklusErzeugen(kanten, neu) === hatZyklus([...kanten, neu])`, hier ohne den vollen
 * Graphen erneut aufzubauen: es genügt zu prüfen, ob `neu.ortId` von `neu.uebergeordnetId` aus
 * erreichbar ist (Vorwärtssuche über "gehört zu" ab `neu.uebergeordnetId`).
 */
export function wuerdeZyklusErzeugen(kanten: readonly Ortskante[], neu: Ortskante): boolean {
  if (neu.uebergeordnetId === neu.ortId) {
    return true
  }

  const adjazenz = uebergeordneteAdjazenz(kanten)
  const besucht = new Set<string>()
  const zuPruefen: string[] = [neu.uebergeordnetId]

  while (zuPruefen.length > 0) {
    // Nicht-null: die Schleifenbedingung garantiert length > 0, `pop()` liefert daher immer einen Wert.
    const knoten = zuPruefen.pop()
    if (knoten === undefined) {
      break // Unerreichbar (length > 0 garantiert), aber ohne `!` formuliert (CLAUDE.md §4).
    }
    if (knoten === neu.ortId) {
      return true // neu.uebergeordnetId ist (transitiv) Untergeordneter von neu.ortId -> Rückkante, Zyklus.
    }
    if (besucht.has(knoten)) {
      continue
    }
    besucht.add(knoten)
    const uebergeordnete = adjazenz.get(knoten) ?? []
    for (const uebergeordnet of uebergeordnete) {
      zuPruefen.push(uebergeordnet)
    }
  }
  return false
}
