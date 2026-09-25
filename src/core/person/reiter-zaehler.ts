// AP-1.30 PR 7a (Abnahme: „Zähler am Reiter, keine Prozentwerte; ein Punkt heißt: dort liegt ein
// offener Punkt. Der Gesundheitsreiter trägt einen Zähler wie alle anderen — kein Schloss"):
// Zähler und Punkt je Reiter der Bearbeitungsansicht. Grundsatz: **ein Reiter zählt, was er
// auflistet.**
//
// - Person, Notizen, Verwaltung: kein Zähler (Einzelangaben bzw. Freitext, keine Liste).
// - Leben: kein Zähler, bis Stationen definiert sind (AP-1.30 PR 13).
// - Namen: Anzahl der Namensformen.
// - Beziehungen: Anzahl VERSCHIEDENER Personen unter Eltern, Partnern und Kindern. Platzhalter zählen
//   mit (sie stehen als Eintrag in der Liste, A-17 betrifft Statistik/Export, nicht die Liste der
//   eigenen Person); Geschwister nicht (abgeleitet, nicht editierbar, keine eigene Kante). Ein Kind
//   mit zwei Elternkanten zur Person (z. B. biologisch + adoptiv) ist EINE Person.
// - Belege & Medien: Zitate + Medien. `zitatAnzahl` = verschiedene Zitate an den Aussagen der Person
//   ohne Gesundheitsbelege (Lesemodell `belege_anzahl`); `medienAnzahl` = 0 bis AP-1.31.
// - Gesundheit: Diagnosen + Risikofaktoren — nur Zahlen, keine Inhalte (M-08).
// - Punkt: an genau den Reitern, auf die mindestens ein offener Punkt zeigt.
//
// Rein (CLAUDE.md §4): keine Mutation der Eingabe, gleiche Eingabe → gleiches Ergebnis.
import type { ReiterId } from './reiter'

/** Richtungen einer Beziehungszeile. `geschwister` wird im Reiter abgeleitet angezeigt, aber nicht gezählt. */
export type ReiterZaehlerRichtung = 'elternteil' | 'kind' | 'partner' | 'geschwister'

export interface ReiterZaehlerBeziehung {
  readonly personId: string
  readonly richtung: ReiterZaehlerRichtung
}

export interface ReiterZaehlerEingabe {
  readonly namenAnzahl: number
  readonly beziehungen: readonly ReiterZaehlerBeziehung[]
  readonly zitatAnzahl: number
  readonly medienAnzahl: number
  readonly diagnosenAnzahl: number
  readonly risikofaktorenAnzahl: number
  /** `reiter` jedes offenen Punkts (Mehrfachnennung erlaubt). */
  readonly offenePunkteReiter: readonly ReiterId[]
}

/** `anzahl` fehlt bei Reitern ohne Zähler — „kein Zähler" ist etwas anderes als 0. */
export interface ReiterZaehlerEintrag {
  readonly anzahl?: number
  readonly offenerPunkt: boolean
}

export type ReiterZaehler = { readonly [R in ReiterId]: ReiterZaehlerEintrag }

const GEZAEHLTE_RICHTUNGEN: ReadonlySet<ReiterZaehlerRichtung> = new Set(['elternteil', 'kind', 'partner'])

function beziehungenAnzahl(beziehungen: readonly ReiterZaehlerBeziehung[]): number {
  return new Set(beziehungen.filter((b) => GEZAEHLTE_RICHTUNGEN.has(b.richtung)).map((b) => b.personId)).size
}

function anzahlJeReiter(eingabe: ReiterZaehlerEingabe): { readonly [R in ReiterId]: number | null } {
  return {
    person: null,
    namen: eingabe.namenAnzahl,
    leben: null,
    beziehungen: beziehungenAnzahl(eingabe.beziehungen),
    belege_medien: eingabe.zitatAnzahl + eingabe.medienAnzahl,
    gesundheit: eingabe.diagnosenAnzahl + eingabe.risikofaktorenAnzahl,
    notizen: null,
    verwaltung: null,
  }
}

/** Zähler und Punkt je Reiter (AP-1.30 PR 7a). */
export function reiterZaehler(eingabe: ReiterZaehlerEingabe): ReiterZaehler {
  const anzahlen = anzahlJeReiter(eingabe)
  const mitPunkt = new Set(eingabe.offenePunkteReiter)
  const eintrag = (reiter: ReiterId): ReiterZaehlerEintrag => {
    const anzahl = anzahlen[reiter]
    const offenerPunkt = mitPunkt.has(reiter)
    return anzahl === null ? { offenerPunkt } : { anzahl, offenerPunkt }
  }
  return {
    person: eintrag('person'),
    namen: eintrag('namen'),
    leben: eintrag('leben'),
    beziehungen: eintrag('beziehungen'),
    belege_medien: eintrag('belege_medien'),
    gesundheit: eintrag('gesundheit'),
    notizen: eintrag('notizen'),
    verwaltung: eintrag('verwaltung'),
  }
}
