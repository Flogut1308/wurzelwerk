// Core-lokale Zeitbezug-Logik für Ortsnamen und Ortszugehörigkeiten (AP-1.2, 50_Datenmodell.md
// §2.4). Reines TypeScript, KEIN Import aus src/shared (CLAUDE.md §2). Die Typen hier bilden nur
// die für den Zeitbezug relevanten Felder von `ortsname`/`ortszugehoerigkeit` ab, bewusst OHNE
// DB-Felder (keine `id`, kein `ort_id`) — der Kern bleibt frei von Datenbank-Konzepten. `art`
// spiegelt `OrtszugehoerigkeitArtEnum` (src/shared/schemata/ortszugehoerigkeit.ts).
//
// AP-1.16 PR-C (docs/71_Designsystem.md §3.2, "Zwingend": der zeitliche Geltungsbereich steht
// rechts neben jedem Ortsfeld-Vorschlag, z. B. "bis 1945"/"ab 1945"): `geltungszeitraumJahre()`
// wandelt die JDN-Grenzen EINES `OrtsnameEintrag` in Kalenderjahre — gregorianisch, über
// `vonJdn()` (`src/core/datum/kalender.ts`), wie jede andere JDN->Kalender-Wandlung dieser
// Codebasis (s. `src/renderer/ansichten/orte/ort-bearbeiten-logik.ts::jdnZuIsoText`). Das ist der
// EINZIGE Ort, an dem ein Ortsname-Geltungszeitraum in ein Jahr gewandelt wird — kein zweiter
// Auflösungsweg in `src/main/abfragen/ort-suche.ts` oder im Renderer.
import { vonJdn } from '../datum/kalender'

/** Deckt sich mit `OrtszugehoerigkeitArtEnum` (src/shared/schemata/ortszugehoerigkeit.ts). */
export type OrtszugehoerigkeitArt = 'politisch' | 'kirchlich'

export interface OrtsnameEintrag {
  readonly name: string
  /** julianische Tageszahl (JDN), inklusive. `undefined` = nach unten offen. */
  readonly gueltigVon?: number
  /** julianische Tageszahl (JDN), inklusive. `undefined` = nach oben offen. */
  readonly gueltigBis?: number
  readonly istBevorzugt?: boolean
}

export interface ZugehoerigkeitEintrag {
  readonly uebergeordnetId: string
  readonly art: OrtszugehoerigkeitArt
  /** julianische Tageszahl (JDN), inklusive. `undefined` = nach unten offen. */
  readonly gueltigVon?: number
  /** julianische Tageszahl (JDN), inklusive. `undefined` = nach oben offen. */
  readonly gueltigBis?: number
}

/** `undefined` an einer Grenze bedeutet "offen" in diese Richtung. */
function istGueltigBei(gueltigVon: number | undefined, gueltigBis: number | undefined, jdn: number): boolean {
  const vonPasst = gueltigVon === undefined || gueltigVon <= jdn
  const bisPasst = gueltigBis === undefined || jdn <= gueltigBis
  return vonPasst && bisPasst
}

/**
 * Findet den zu `jdn` gültigen Ortsnamen (Grenzen inklusive, offene Enden über `undefined`).
 * Ohne `jdn` wird stattdessen der als `istBevorzugt` markierte Name geliefert — für Ansichten
 * ohne Datumsbezug (z. B. eine Ortsliste).
 */
export function gueltigerOrtsname(namen: readonly OrtsnameEintrag[], jdn?: number): OrtsnameEintrag | undefined {
  if (jdn === undefined) {
    return namen.find((eintrag) => eintrag.istBevorzugt === true)
  }
  return namen.find((eintrag) => istGueltigBei(eintrag.gueltigVon, eintrag.gueltigBis, jdn))
}

/** Geltungsgrenze (JDN, inklusiv) -> Kalenderjahr, gregorianisch (`vonJdn()`). Reine Arithmetik,
 * s. Kopfkommentar. */
function jdnZuJahr(jdn: number): number {
  return vonJdn(jdn, 'gregorian').jahr
}

/** Geltungszeitraum EINES `OrtsnameEintrag` als Kalenderjahre statt JDN (docs/71_Designsystem.md
 * §3.2: "bis 1945"/"ab 1945") — für die Anzeige rechts neben einem Ortsfeld-Vorschlag. `undefined`
 * an einer Grenze bleibt `undefined` (offen in diese Richtung, keine Anzeige an dieser Seite). */
export function geltungszeitraumJahre(eintrag: Pick<OrtsnameEintrag, 'gueltigVon' | 'gueltigBis'>): {
  readonly von?: number
  readonly bis?: number
} {
  return {
    ...(eintrag.gueltigVon === undefined ? {} : { von: jdnZuJahr(eintrag.gueltigVon) }),
    ...(eintrag.gueltigBis === undefined ? {} : { bis: jdnZuJahr(eintrag.gueltigBis) }),
  }
}

/**
 * Filtert Ortszugehörigkeiten zuerst nach `art` (politisch/kirchlich werden NIE gemischt — ein
 * Ort kann am selben Tag zu einem anderen politischen Kreis UND einem anderen kirchlichen
 * Sprengel gehören), erst danach nach Gültigkeit zu `jdn`.
 */
export function zugehoerigkeitsketteZuDatum(
  zugehoerigkeiten: readonly ZugehoerigkeitEintrag[],
  art: OrtszugehoerigkeitArt,
  jdn: number,
): readonly ZugehoerigkeitEintrag[] {
  return zugehoerigkeiten.filter((eintrag) => eintrag.art === art && istGueltigBei(eintrag.gueltigVon, eintrag.gueltigBis, jdn))
}

/** Maximale Stufenzahl von `hierarchieZuDatum()` — reine Absicherung gegen einen (eigentlich durch
 * `src/core/ort/zyklus.ts::wuerdeZyklusErzeugen` schon verhinderten) Zyklus, keine fachliche
 * Obergrenze der Ort-Hierarchie. */
const HIERARCHIE_MAX_STUFEN = 50

/**
 * Baut die VOLLE, mehrstufige Zugehörigkeitskette EINER `art` zu einem Datum (docs/71_Designsystem.md
 * §3.2: "Kreis Marienwerder · Westpreußen · Preußen") — läuft vom Ort `startOrtId` beliebig weit
 * nach oben, solange `zugehoerigkeitenNachOrt` für den jeweils aktuellen Ort einen zum Datum
 * gültigen Eintrag DIESER `art` liefert. Jede Stufe geht ausschließlich über
 * `zugehoerigkeitsketteZuDatum()` (KEIN zweiter Auflösungsweg) — ein Grenzwechsel kann darum auf
 * jeder Stufe unabhängig wirken (Kreis wechselt an einem anderen Tag als die Provinz).
 *
 * Liefert NUR die `uebergeordnetId`-Kette (nächster Vorfahre zuerst), OHNE `startOrtId` selbst.
 * Leer, wenn `startOrtId` keinen Eintrag dieser `art` hat (kein Übergeordneter bekannt). Der
 * Besucht-Schutz ist eine reine Absicherung — die Datenbank verhindert Zyklen bereits beim
 * Schreiben (`ortszugehoerigkeit.anlegen`), diese Funktion setzt sich dem NICHT als zweite
 * Zyklusprüfung entgegen, sondern bricht nur ab, statt endlos zu laufen.
 */
export function hierarchieZuDatum(
  zugehoerigkeitenNachOrt: ReadonlyMap<string, readonly ZugehoerigkeitEintrag[]>,
  startOrtId: string,
  art: OrtszugehoerigkeitArt,
  jdn: number,
): readonly string[] {
  const kette: string[] = []
  const besucht = new Set<string>([startOrtId])
  let aktuellerOrtId = startOrtId

  for (let stufe = 0; stufe < HIERARCHIE_MAX_STUFEN; stufe += 1) {
    const eintraege = zugehoerigkeitenNachOrt.get(aktuellerOrtId) ?? []
    const treffer = zugehoerigkeitsketteZuDatum(eintraege, art, jdn)[0]
    if (treffer === undefined) break
    if (besucht.has(treffer.uebergeordnetId)) break
    kette.push(treffer.uebergeordnetId)
    besucht.add(treffer.uebergeordnetId)
    aktuellerOrtId = treffer.uebergeordnetId
  }

  return kette
}
