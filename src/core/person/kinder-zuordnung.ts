// AP-1.30 PR 12a (docs/80_Offene_Fragen.md §33 V-130-12-kinder-zuordnung): Kinder einer Person den
// Partnerschaften zuordnen. Das Schema kennt keine Zuordnung Kind → Partnerschaft; sie wird
// abgeleitet (U-1.34-C2-O5): Kind k gehört zu Partnerschaft X, wenn ein Elternteil von k, der nicht
// die Person selbst ist, Teilnehmer von X ist — jeder Elternschaftstyp. Mehrere passende
// Partnerschaften → das Kind steht unter jeder. `ohnePartnerschaft` enthält auch Platzhalterkinder
// (Anzeige); Hinweis/offener Punkt nur für Nicht-Platzhalter (`kindOhnePartnerschaft`, offene-punkte.ts).
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe.

export interface ZuordnungKind {
  readonly id: string
  readonly istPlatzhalter: boolean
  /** ALLE Eltern des Kindes, auch die Person selbst. */
  readonly elternIds: readonly string[]
}

export interface ZuordnungPartnerschaft {
  readonly id: string
  /** Alle Teilnehmer, auch die Person selbst. */
  readonly personIds: readonly string[]
}

export interface KinderZuordnungEingabe {
  readonly personId: string
  readonly kinder: readonly ZuordnungKind[]
  readonly partnerschaften: readonly ZuordnungPartnerschaft[]
}

export interface KinderZuordnung {
  readonly partnerschaften: readonly { readonly partnerschaftId: string; readonly kindIds: readonly string[] }[]
  readonly ohnePartnerschaft: readonly string[]
}

/** Die eine Regel (C2-O5, zwei Verbraucher): steht ein ANDERER Elternteil des Kindes in `partnerIds`? */
export function kindHatPartnerElternteil(personId: string, kind: Pick<ZuordnungKind, 'elternIds'>, partnerIds: ReadonlySet<string>): boolean {
  return kind.elternIds.some((elternId) => elternId !== personId && partnerIds.has(elternId))
}

export function kinderZuordnen(eingabe: KinderZuordnungEingabe): KinderZuordnung {
  const gesehen = new Set<string>()
  const kinder = eingabe.kinder.filter((kind) => {
    if (gesehen.has(kind.id)) return false
    gesehen.add(kind.id)
    return true
  })
  const partnerschaften = eingabe.partnerschaften.map((partnerschaft) => {
    const teilnehmer = new Set(partnerschaft.personIds)
    return {
      partnerschaftId: partnerschaft.id,
      kindIds: kinder.filter((kind) => kindHatPartnerElternteil(eingabe.personId, kind, teilnehmer)).map((kind) => kind.id),
    }
  })
  const zugeordnet = new Set(partnerschaften.flatMap((eintrag) => eintrag.kindIds))
  return { partnerschaften, ohnePartnerschaft: kinder.filter((kind) => !zugeordnet.has(kind.id)).map((kind) => kind.id) }
}
