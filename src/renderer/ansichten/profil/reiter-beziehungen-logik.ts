// AP-1.30 PR 12c (A-07, C-26; docs/80 §33 V-130-12-zeilen, -einzelpartnerschaft, -kinder-zuordnung): reine
// Aufbereitung des Reiters „Beziehungen" (Artboard „Beziehungen", Vorgaben §3.2). Reines TypeScript ohne
// React und ohne i18next (Muster `reiter-namen-logik.ts`): der Aufrufer reicht seinen Übersetzer herein.
//
// Nichts wird hier entschieden, was der Kern oder die Abfrage schon entscheidet: die Elternplätze kommen
// aus `elternPlaetze` (src/core/person/eltern-plaetze.ts, dieselbe Regel wie der offene Punkt „Elternteil
// nicht zugeordnet"), die Zuordnung der Kinder zu Partnerschaften und die Geschwister (mit Art) aus
// `abfrage:person.detail` (PR 12b). Dieses Modul ordnet nur an.
import { elternPlaetze, type ElternPlatzOffen } from '../../../core/person/eltern-plaetze'
import { ElternschaftTypEnum } from '../../../shared/schemata/elternschaft'
import type { PartnerschaftTypEnum } from '../../../shared/schemata/partnerschaft'
import type { PersonDetailAus, PersonDetailBeziehung, PersonDetailGeschwister } from '../../../shared/schemata/person-detail'
import type { z } from 'zod'

/** Was der Reiter vom Lesemodell braucht — ein Ausschnitt von `PersonDetailAus`. */
export type BeziehungenEingabe = Pick<PersonDetailAus, 'beziehungen' | 'geschwister' | 'partnerschaften' | 'kinder_ohne_partnerschaft'>

export type ElternPlatz = 'vater' | 'mutter' | 'elternteil'

/** Eine gespeicherte Kante zu einer Person — Elternkante (`elternschaft.id`) in Eltern- und Kindzeilen. */
export interface BeziehungKante {
  readonly kanteId: string
  readonly personId: string
  readonly anzeigename: string
  readonly istPlatzhalter: boolean
  readonly typ: z.infer<typeof ElternschaftTypEnum>
  /** `elternschaft.notiz` — wird beim Typwechsel IMMER zurückgeschickt (`elternschaft.aendern` ersetzt die Zeile). */
  readonly notiz: string | null
}

export type ElternZeile =
  | { readonly art: 'besetzt'; readonly platz: ElternPlatz; readonly kante: BeziehungKante }
  | { readonly art: 'offen'; readonly platz: ElternPlatz }

export interface PartnerschaftPartner {
  readonly personId: string
  readonly anzeigename: string
  readonly istPlatzhalter: boolean
}

export interface PartnerschaftKarte {
  readonly id: string
  readonly typ: z.infer<typeof PartnerschaftTypEnum>
  /** Leer, wenn die Person allein beteiligt ist („Partner nicht erfasst"). */
  readonly partner: readonly PartnerschaftPartner[]
  readonly kinder: readonly BeziehungKante[]
}

export interface GeschwisterEintrag {
  readonly personId: string
  readonly anzeigename: string
  readonly istPlatzhalter: boolean
  readonly art: PersonDetailGeschwister['art']
}

export interface BeziehungenAnsicht {
  readonly eltern: readonly ElternZeile[]
  readonly partnerschaften: readonly PartnerschaftKarte[]
  /** Alle Kinder ohne passende Partnerschaft, auch Platzhalterkinder (Anzeige), eine Zeile je Kante. */
  readonly kinderOhne: readonly BeziehungKante[]
  /** Je Kind einmal; nur Nicht-Platzhalter (C2c — dieselbe Regel wie der offene Punkt). */
  readonly kinderOhneHinweise: readonly { readonly personId: string; readonly anzeigename: string }[]
  readonly geschwister: readonly GeschwisterEintrag[]
  /** Offene Elternplätze, für die „weitere Geschwister erscheinen, sobald … zugeordnet ist" gilt. */
  readonly weitereGeschwisterPlaetze: readonly ElternPlatzOffen[]
}

function kanteAus(beziehung: PersonDetailBeziehung): BeziehungKante | null {
  // Bei Eltern-/Kind-Zeilen ist `kantentyp` ein Elternschaftstyp; die Prüfung ersetzt einen Cast.
  const typ = ElternschaftTypEnum.safeParse(beziehung.kantentyp)
  if (!typ.success) return null
  return { kanteId: beziehung.kante_id, personId: beziehung.person_id, anzeigename: beziehung.anzeigename, istPlatzhalter: beziehung.ist_platzhalter, typ: typ.data, notiz: beziehung.kante_notiz }
}

function kanten(beziehungen: readonly PersonDetailBeziehung[], richtung: 'elternteil' | 'kind'): readonly BeziehungKante[] {
  return beziehungen
    .filter((beziehung) => beziehung.richtung === richtung)
    .flatMap((beziehung) => {
      const kante = kanteAus(beziehung)
      return kante === null ? [] : [kante]
    })
}

function elternZeilen(beziehungen: readonly PersonDetailBeziehung[]): readonly ElternZeile[] {
  const kantenListe = kanten(beziehungen, 'elternteil')
  const geschlechter = new Map(beziehungen.filter((beziehung) => beziehung.richtung === 'elternteil').map((beziehung) => [beziehung.person_id, beziehung.geschlecht]))
  const plaetze = elternPlaetze([...geschlechter].map(([id, geschlecht]) => ({ id, geschlecht })))

  const besetzt = (platz: ElternPlatz, personId: string): readonly ElternZeile[] =>
    kantenListe.filter((kante) => kante.personId === personId).map((kante) => ({ art: 'besetzt', platz, kante }))
  const offen = (platz: ElternPlatz): readonly ElternZeile[] => [{ art: 'offen', platz }]

  return [
    ...(plaetze.vater === null ? (plaetze.offen.includes('vater') ? offen('vater') : []) : besetzt('vater', plaetze.vater)),
    ...(plaetze.mutter === null ? (plaetze.offen.includes('mutter') ? offen('mutter') : []) : besetzt('mutter', plaetze.mutter)),
    ...(plaetze.unbestimmt === null ? [] : besetzt('elternteil', plaetze.unbestimmt)),
    ...(plaetze.offen.includes('elternteil') ? offen('elternteil') : []),
    ...plaetze.ueberzaehlig.flatMap((personId) => besetzt('elternteil', personId)),
  ]
}

export function beziehungenAnsicht(eingabe: BeziehungenEingabe): BeziehungenAnsicht {
  const eltern = elternZeilen(eingabe.beziehungen)
  const kinderKanten = kanten(eingabe.beziehungen, 'kind')
  const kantenVon = (personIds: readonly string[]): readonly BeziehungKante[] =>
    personIds.flatMap((personId) => kinderKanten.filter((kante) => kante.personId === personId))

  const partnerschaften = eingabe.partnerschaften.map((partnerschaft) => ({
    id: partnerschaft.id,
    typ: partnerschaft.typ,
    partner: partnerschaft.partner_ids.flatMap((personId) => {
      const zeile = eingabe.beziehungen.find((beziehung) => beziehung.richtung === 'partner' && beziehung.kante_id === partnerschaft.id && beziehung.person_id === personId)
      return zeile === undefined ? [] : [{ personId, anzeigename: zeile.anzeigename, istPlatzhalter: zeile.ist_platzhalter }]
    }),
    kinder: kantenVon(partnerschaft.kind_ids),
  }))

  const kinderOhne = kantenVon(eingabe.kinder_ohne_partnerschaft)
  const hinweise = new Map<string, string>()
  for (const kante of kinderOhne) if (!kante.istPlatzhalter && !hinweise.has(kante.personId)) hinweise.set(kante.personId, kante.anzeigename)

  const geschwister = eingabe.geschwister.map((eintrag) => ({ personId: eintrag.person_id, anzeigename: eintrag.anzeigename, istPlatzhalter: eintrag.ist_platzhalter, art: eintrag.art }))

  return {
    eltern,
    partnerschaften,
    kinderOhne,
    kinderOhneHinweise: [...hinweise].map(([personId, anzeigename]) => ({ personId, anzeigename })),
    geschwister,
    weitereGeschwisterPlaetze: eltern.flatMap((zeile) => (zeile.art === 'offen' ? [zeile.platz] : [])),
  }
}

// ------------------------------------------------------------------------------------------------
// Schlüssel der Anzeige (geschlossene Abbildungen, Typfehler bei neuem Wert)
// ------------------------------------------------------------------------------------------------

export const ELTERN_PLATZ_SCHLUESSEL = {
  vater: 'reiter_beziehungen_platz_vater',
  mutter: 'reiter_beziehungen_platz_mutter',
  elternteil: 'reiter_beziehungen_platz_elternteil',
} as const satisfies Readonly<Record<ElternPlatz, string>>

export const WEITERE_GESCHWISTER_SCHLUESSEL = {
  vater: 'reiter_beziehungen_geschwister_weitere_vater',
  mutter: 'reiter_beziehungen_geschwister_weitere_mutter',
  elternteil: 'reiter_beziehungen_geschwister_weitere_elternteil',
} as const satisfies Readonly<Record<ElternPlatz, string>>

export const GESCHWISTER_ART_SCHLUESSEL = {
  voll: 'reiter_beziehungen_geschwister_art_voll',
  halb: 'reiter_beziehungen_geschwister_art_halb',
  offen: 'reiter_beziehungen_geschwister_art_offen',
  sozial: 'reiter_beziehungen_geschwister_art_sozial',
} as const satisfies Readonly<Record<PersonDetailGeschwister['art'], string>>

/** „Kind/Kinder aus dieser Verbindung · n" — Plural über i18next (`count`). Hier statt im JSX, weil die
 * Vollständigkeitsprüfung `t('…')`-Literale gegen die JSON-Datei hält und `_one`/`_other` dort keine Zeile
 * ohne Suffix sind. */
export function kinderDerVerbindungText(anzahl: number, t: (schluessel: string, werte: Readonly<Record<string, number>>) => string): string {
  return t('reiter_beziehungen_kinder_der_verbindung', { count: anzahl })
}
