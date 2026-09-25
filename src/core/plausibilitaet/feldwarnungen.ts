// AP-1.34 PR-C2b (F-07, docs/80_Offene_Fragen.md §31 U-1.34-C2-O1): Feldwarnungen der
// Bearbeitungsansicht. Die Bestandsregeln aus AP-1.8 (`pruefeBestand`, ./regeln.ts) liefern je
// Hinweis nur `{code, personId}`; hier bekommt jeder Code sein Sprungziel `{reiter, feld}`
// (Entwicklungsvorgaben §3.1 Reiter, §5.5 `tab`/`field`). Eine Warnung blockiert nie (Vorgaben §1):
// sie entsteht nur beim Lesen, kein Befehl prüft sie.
//
// Die Zuordnung ist Gestaltungsfüllung (CLAUDE.md §14, §31): das Design nennt für die
// Plausibilitätsregeln kein Feld. Gewählt ist das Feld, an dem der Nutzer den Fehler behebt.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, Eingaben werden nicht verändert.
import type { ReiterId } from '../person/reiter'
import { BESTAND_HINWEIS_CODES, type BestandHinweis, type BestandHinweisCode } from './regeln'

/** Felder, an denen eine Feldwarnung hängen kann. `todesdatum` ist das Grunddatenfeld (Prädikat),
 * `kinder`/`eltern` die Beziehungsgruppen, `ereignisse` die Ereignisliste im Reiter „Leben". */
export const FELDWARNUNG_FELDER = ['todesdatum', 'kinder', 'eltern', 'ereignisse'] as const

export type FeldwarnungFeld = (typeof FELDWARNUNG_FELDER)[number]

export interface FeldZiel {
  readonly reiter: ReiterId
  readonly feld: FeldwarnungFeld
}

export interface Feldwarnung extends FeldZiel {
  readonly code: BestandHinweisCode
}

/** Vollständige Zuordnung; ein neuer Code in `BESTAND_HINWEIS_CODES` ist hier ein Typfehler. */
export function feldZielFuer(code: BestandHinweisCode): FeldZiel {
  switch (code) {
    case 'tod_vor_geburt':
    case 'bestattung_vor_tod':
    case 'alter_ueber_110':
      return { reiter: 'person', feld: 'todesdatum' }
    case 'mutter_alter':
    case 'vater_alter':
      return { reiter: 'beziehungen', feld: 'kinder' }
    case 'kind_vor_ehe':
    case 'zyklus':
      return { reiter: 'beziehungen', feld: 'eltern' }
    case 'ereignis_vor_ortsexistenz':
      return { reiter: 'leben', feld: 'ereignisse' }
    default: {
      const unbekannt: never = code
      throw new RangeError(`feldZielFuer: unbekannter Hinweiscode "${String(unbekannt)}".`)
    }
  }
}

function rang(code: BestandHinweisCode): number {
  return BESTAND_HINWEIS_CODES.indexOf(code)
}

/** Die Feldwarnungen EINER Person: nur Hinweise mit `personId`, geordnet nach der Regelreihenfolge
 * (`BESTAND_HINWEIS_CODES`; stabil, also unabhängig von der Reihenfolge der Eingabe bis auf
 * gleiche Codes, die ohnehin gleich aussehen). Mehrfachfunde (z. B. zwei Kinder mit
 * `mutter_alter`) bleiben erhalten — die Anzahl zählt (Vorgaben §3.1: Zähler je Reiter). */
export function feldwarnungenFuer(hinweise: readonly BestandHinweis[], personId: string): readonly Feldwarnung[] {
  return hinweise
    .filter((hinweis) => hinweis.personId === personId)
    .map((hinweis) => ({ code: hinweis.code, ...feldZielFuer(hinweis.code) }))
    .sort((a, b) => rang(a.code) - rang(b.code))
}
