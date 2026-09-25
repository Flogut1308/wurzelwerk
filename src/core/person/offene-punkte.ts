// AP-1.34 PR-C2c (Entwicklungsvorgaben „Person bearbeiten" §3.1/§5.5, docs/80_Offene_Fragen.md §31
// U-1.34-C2-O2…O5, E6/E7/E8/E11): offene Punkte als Regelwerk. Jede Regel trägt ihr Sprungziel
// (`reiter`, `feld`) und ihren Meldungsschlüssel; eine neue Regel ist eine neue Zeile in
// `OFFENE_PUNKTE_REGELN` (erweiterbar, nicht hart verdrahtet). Speist rechte Spalte, gelben
// Reiterpunkt und schmale Fußleiste — der Renderer leitet den Text aus `meldungsschluessel` ab
// (`src/shared/i18n/de/profil.json`, ADR-011), hier steht kein sichtbarer Text.
//
// Ein offener Punkt blockiert nie, er entsteht nur beim Lesen (`abfrage:person.detail`).
// Platzhalterpersonen bekommen keine offenen Punkte (U-1.34-C2-O4, A-17).
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe;
// dieselbe Eingabe liefert dieselben Punkte in derselben Reihenfolge.
import type { FeldwarnungFeld } from '../plausibilitaet/feldwarnungen'
import { elternPlaetze, type ElternPlatzOffen, type ElternteilEintrag } from './eltern-plaetze'
import { REITER, type ReiterId } from './reiter'

/** Felder der Bearbeitungsansicht, an denen ein offener Punkt hängen kann (Vorgaben §5.5 `field`).
 * Bewusst ≠ `BelegFeld` (`aussage_zitat.feld`, belegtes Attribut): das hier ist ein Sprungziel im
 * Editor. Obermenge von `FeldwarnungFeld` (erzwungen in `widerspruchVorhanden`: eine Feldwarnung wird als `Ziel` mit `EditorFeld` weitergereicht). Reihenfolge = Reihenfolge im Editor,
 * sie bestimmt die Sortierung der Widerspruchspunkte. */
export const EDITOR_FELDER = ['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'ereignisse', 'angaben', 'eltern', 'kinder', 'portraet'] as const

export type EditorFeld = (typeof EDITOR_FELDER)[number]

export const OFFENE_PUNKTE_REGEL_IDS = ['sterbeort_fehlt', 'elternteil_nicht_zugeordnet', 'kein_portraet', 'kind_ohne_partnerschaft', 'widerspruch_vorhanden'] as const

export type OffenePunkteRegelId = (typeof OFFENE_PUNKTE_REGEL_IDS)[number]

/** Alle Meldungsschlüssel (auch der inaktiven Regeln) — geschlossene Liste für den i18n-Test. */
export const OFFENE_PUNKTE_SCHLUESSEL = [
  'offener_punkt_sterbeort_fehlt',
  'offener_punkt_vater_nicht_zugeordnet',
  'offener_punkt_mutter_nicht_zugeordnet',
  'offener_punkt_elternteil_nicht_zugeordnet',
  'offener_punkt_kein_portraet',
  'offener_punkt_kind_ohne_partnerschaft',
  'offener_punkt_widerspruch_vorhanden',
] as const

export type OffenerPunktSchluessel = (typeof OFFENE_PUNKTE_SCHLUESSEL)[number]

export type OffenePunkteLebendStatus = 'lebend' | 'verstorben' | 'vermutet_verstorben'

/** Ein Kind der Person mit ALLEN seinen Elternteilen (auch der Person selbst). */
export interface OffenePunkteKind {
  readonly id: string
  readonly istPlatzhalter: boolean
  readonly elternIds: readonly string[]
}

export interface OffenePunkteWarnung {
  readonly reiter: ReiterId
  readonly feld: FeldwarnungFeld
}

export interface OffenePunkteEingabe {
  readonly personId: string
  readonly istPlatzhalter: boolean
  readonly lebendStatus: OffenePunkteLebendStatus | null
  /** `person.detail.sterbeort !== null` (C2a; eine Aussage nur mit `wert_text` zählt als vorhanden). */
  readonly hatSterbeort: boolean
  readonly eltern: readonly ElternteilEintrag[]
  readonly hatPortraet: boolean
  readonly kinder: readonly OffenePunkteKind[]
  /** Personen, mit denen die Person in mindestens einer Partnerschaft steht (auch Platzhalter). */
  readonly partnerIds: readonly string[]
  /** Prädikate mit UNGELÖSTEM Widerspruch (`hat_widerspruch`, E21, src/core/aussage/widerspruch.ts). */
  readonly widerspruchPraedikate: readonly string[]
  readonly feldwarnungen: readonly OffenePunkteWarnung[]
}

/** Ein Fund einer Regel. `reiter`/`feld`/`meldungsschluessel` überschreiben die Vorgabe der Regel
 * (z. B. Widerspruch je Feld, Vater/Mutter je Platz). `bezugId` = betroffener Datensatz (Kind). */
export interface OffenerPunktFund {
  readonly bezugId: string | null
  readonly reiter?: ReiterId
  readonly feld?: EditorFeld
  readonly meldungsschluessel?: OffenerPunktSchluessel
}

export interface OffenePunkteRegel {
  readonly id: OffenePunkteRegelId
  readonly reiter: ReiterId
  readonly feld: EditorFeld
  readonly meldungsschluessel: OffenerPunktSchluessel
  /** `false` = gebaut, aber nicht ausgewertet (E8: `kein_portraet` bis AP-1.31b). */
  readonly aktiv: boolean
  readonly pruefe: (eingabe: OffenePunkteEingabe) => readonly OffenerPunktFund[]
}

export interface OffenerPunkt {
  readonly regelId: OffenePunkteRegelId
  readonly reiter: ReiterId
  readonly feld: EditorFeld
  readonly meldungsschluessel: OffenerPunktSchluessel
  readonly bezugId: string | null
}

const PLATZ_SCHLUESSEL: Readonly<Record<ElternPlatzOffen, OffenerPunktSchluessel>> = {
  vater: 'offener_punkt_vater_nicht_zugeordnet',
  mutter: 'offener_punkt_mutter_nicht_zugeordnet',
  elternteil: 'offener_punkt_elternteil_nicht_zugeordnet',
}

interface Ziel {
  readonly reiter: ReiterId
  readonly feld: EditorFeld
}

/** Sprungziel eines widersprüchlichen Prädikats. Geburt/Tod liegen im Reiter „Person" (Vorgaben
 * §3.1 Gruppen Geburt/Tod); jedes andere Prädikat (Beruf, Wohnort, freie Prädikate — offene Menge,
 * 0002_kern.sql E-6) zeigt auf die übrigen Angaben im Reiter „Leben" (Gestaltungsfüllung §14). */
export function widerspruchZielFuer(praedikat: string): Ziel {
  switch (praedikat) {
    case 'geburtsdatum':
    case 'geburtsort':
    case 'todesdatum':
    case 'todesort':
      return { reiter: 'person', feld: praedikat }
    default:
      return { reiter: 'leben', feld: 'angaben' }
  }
}

function zielRang(ziel: Ziel): number {
  return REITER.indexOf(ziel.reiter) * EDITOR_FELDER.length + EDITOR_FELDER.indexOf(ziel.feld)
}

function sterbeortFehlt(eingabe: OffenePunkteEingabe): readonly OffenerPunktFund[] {
  // Nur `verstorben` (Vorgaben §3.1: Gruppe Tod nur bei „verstorben"); `vermutet_verstorben` zählt nicht.
  return eingabe.lebendStatus === 'verstorben' && !eingabe.hatSterbeort ? [{ bezugId: null }] : []
}

function elternteilNichtZugeordnet(eingabe: OffenePunkteEingabe): readonly OffenerPunktFund[] {
  return elternPlaetze(eingabe.eltern).offen.map((platz) => ({ bezugId: null, meldungsschluessel: PLATZ_SCHLUESSEL[platz] }))
}

function keinPortraet(eingabe: OffenePunkteEingabe): readonly OffenerPunktFund[] {
  return eingabe.hatPortraet ? [] : [{ bezugId: null }]
}

function kindOhnePartnerschaft(eingabe: OffenePunkteEingabe): readonly OffenerPunktFund[] {
  // Streng (U-1.34-C2-O5): kein ANDERER Elternteil des Kindes steht mit der Person in einer
  // Partnerschaft — auch wenn die Person der einzige bekannte Elternteil ist. Ein Platzhalter-Kind
  // löst nichts aus (A-17: Platzhalter sind Lückenfüller, keine zuzuordnenden Kinder); ein
  // Platzhalter-PARTNER zählt dagegen als Partnerschaft (analog E6).
  const partner = new Set(eingabe.partnerIds)
  const gesehen = new Set<string>()
  const funde: OffenerPunktFund[] = []
  const kinder = [...eingabe.kinder].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const kind of kinder) {
    if (kind.istPlatzhalter || gesehen.has(kind.id)) continue
    gesehen.add(kind.id)
    const zugeordnet = kind.elternIds.some((elternId) => elternId !== eingabe.personId && partner.has(elternId))
    if (!zugeordnet) funde.push({ bezugId: kind.id })
  }
  return funde
}

function widerspruchVorhanden(eingabe: OffenePunkteEingabe): readonly OffenerPunktFund[] {
  // U-1.34-C2-O3: ungelöster Aussage-Widerspruch UND jede Feldwarnung, zusammengefasst je (reiter, feld).
  const ziele = new Map<string, Ziel>()
  for (const ziel of [...eingabe.widerspruchPraedikate.map(widerspruchZielFuer), ...eingabe.feldwarnungen]) {
    ziele.set(`${ziel.reiter}|${ziel.feld}`, { reiter: ziel.reiter, feld: ziel.feld })
  }
  return [...ziele.values()].sort((a, b) => zielRang(a) - zielRang(b)).map((ziel) => ({ bezugId: null, reiter: ziel.reiter, feld: ziel.feld }))
}

/** Das Regelwerk in fester Auswertungsreihenfolge. */
export const OFFENE_PUNKTE_REGELN: readonly OffenePunkteRegel[] = [
  { id: 'sterbeort_fehlt', reiter: 'person', feld: 'todesort', meldungsschluessel: 'offener_punkt_sterbeort_fehlt', aktiv: true, pruefe: sterbeortFehlt },
  {
    id: 'elternteil_nicht_zugeordnet',
    reiter: 'beziehungen',
    feld: 'eltern',
    meldungsschluessel: 'offener_punkt_elternteil_nicht_zugeordnet',
    aktiv: true,
    pruefe: elternteilNichtZugeordnet,
  },
  { id: 'kein_portraet', reiter: 'belege_medien', feld: 'portraet', meldungsschluessel: 'offener_punkt_kein_portraet', aktiv: false, pruefe: keinPortraet },
  {
    id: 'kind_ohne_partnerschaft',
    reiter: 'beziehungen',
    feld: 'kinder',
    meldungsschluessel: 'offener_punkt_kind_ohne_partnerschaft',
    aktiv: true,
    pruefe: kindOhnePartnerschaft,
  },
  {
    // Vorgabe = Ziel eines freien Prädikats; jeder Fund überschreibt reiter/feld (je betroffenem Feld).
    id: 'widerspruch_vorhanden',
    reiter: 'leben',
    feld: 'angaben',
    meldungsschluessel: 'offener_punkt_widerspruch_vorhanden',
    aktiv: true,
    pruefe: widerspruchVorhanden,
  },
]

/** Ist die Regel in der Tabelle aktiv? Der Aufrufer fragt so, ob er eine teure Eingabe überhaupt
 * laden muss (hueter-H3: Titelbild nur für aktives `kein_portraet`) — die Aktivität steht damit
 * nur in der Regeltabelle, nicht ein zweites Mal im Aufrufer. */
export function regelAktiv(id: OffenePunkteRegelId, regeln: readonly OffenePunkteRegel[] = OFFENE_PUNKTE_REGELN): boolean {
  return regeln.some((regel) => regel.id === id && regel.aktiv)
}

/** Wertet die AKTIVEN Regeln in Tabellenreihenfolge aus; Platzhalterperson → keine Punkte (O4). */
export function offenePunkteAuswerten(eingabe: OffenePunkteEingabe, regeln: readonly OffenePunkteRegel[] = OFFENE_PUNKTE_REGELN): readonly OffenerPunkt[] {
  if (eingabe.istPlatzhalter) return []
  const punkte: OffenerPunkt[] = []
  for (const regel of regeln) {
    if (!regel.aktiv) continue
    for (const fund of regel.pruefe(eingabe)) {
      punkte.push({
        regelId: regel.id,
        reiter: fund.reiter ?? regel.reiter,
        feld: fund.feld ?? regel.feld,
        meldungsschluessel: fund.meldungsschluessel ?? regel.meldungsschluessel,
        bezugId: fund.bezugId,
      })
    }
  }
  return punkte
}
