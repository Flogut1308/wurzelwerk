// AP-1.30 PR 9d (Beleg-Wähler im Reiter „Person", B-01/B-02/B-03/S-08; docs/80 §33 V-130-9d E1–E11):
// reine Logik — kein React, kein i18n (CLAUDE.md §2, Muster `reiter-person-logik.ts`). Die Ansicht
// (`beleg-waehler.tsx`, `reiter-person.tsx`) übersetzt und verdrahtet.
//
// - Ziel einer Verknüpfung (E1) ist dieselbe Aussage, die der Reiter für Sicherheit und Zähler nutzt:
//   `lebensdatumFeld(...)` mit `art = 'aussage'`. Datum und Ort sind getrennte Prädikate, also
//   getrennte Aussagen — der Wähler zeigt darum je Gruppe „belegt: Datum ☑ Ort ☑".
// - Werte aus einem Ereignis (E3) sind kein Ziel („am Ereignis belegen", eigener PR 9d-2); ohne Wert
//   (E4) gibt es nichts zu belegen.
// - Jede Verknüpfung ist ein eigener `aussage_zitat.anlegen` (E2) ohne `feld` (E6) und ohne
//   Textanker (E5). Bereits verknüpfte Paare werden nie erneut geschickt (E9, kein
//   `KONFLIKT_BEREITS_VORHANDEN`).
import type { LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { AussageZitatAnlegenEin, AussageZitatLoeschenEin, ZitatAnlegenEin } from '../../../shared/schemata/befehle'
import type { PersonDetailBeleg, PersonDetailGrunddatenFeld } from '../../../shared/schemata/person-detail'
import type { LebensdatumFeld } from './reiter-person-logik'

// ── Gruppen ────────────────────────────────────────────────────────────────────────────────────

export type BelegGruppe = 'geburt' | 'tod'

/** Die beiden Angaben einer Gruppe, in Anzeigereihenfolge (Datum vor Ort). */
export const GRUPPEN_ANGABEN: { readonly [G in BelegGruppe]: readonly [LebensdatumAngabe, LebensdatumAngabe] } = {
  geburt: ['geburtsdatum', 'geburtsort'],
  tod: ['todesdatum', 'todesort'],
}

export function gruppeVon(angabe: LebensdatumAngabe): BelegGruppe {
  return angabe === 'geburtsdatum' || angabe === 'geburtsort' ? 'geburt' : 'tod'
}

export function istOrtAngabe(angabe: LebensdatumAngabe): boolean {
  return angabe === 'geburtsort' || angabe === 'todesort'
}

// ── Ziele (E1/E3/E4) ───────────────────────────────────────────────────────────────────────────

/** Eine Aussage, an die verknüpft werden kann, mit den Zitaten, die schon an ihr hängen. */
export interface AussageZiel {
  readonly angabe: LebensdatumAngabe
  readonly aussageId: string
  readonly zitatIds: readonly string[]
}

export type BelegZiel =
  | ({ readonly art: 'aussage' } & AussageZiel)
  | { readonly art: 'ereignis'; readonly angabe: LebensdatumAngabe }
  | { readonly art: 'leer'; readonly angabe: LebensdatumAngabe }

export function belegZiel(feld: LebensdatumFeld): BelegZiel {
  switch (feld.art) {
    case 'aussage':
      return { art: 'aussage', angabe: feld.angabe, aussageId: feld.aussage.aussage_id, zitatIds: feld.aussage.belege.map((beleg) => beleg.zitat_id) }
    case 'ereignis':
      return { art: 'ereignis', angabe: feld.angabe }
    case 'leer':
      return { art: 'leer', angabe: feld.angabe }
  }
}

/** Zustand der Beleg-Zeile einer Gruppe bzw. des Wählers:
 * - `waehlbar`: mindestens eine Aussage als Ziel; `ereignisAngaben` sind die Angaben der Auswahl,
 *   deren Wert aus einem Ereignis kommt (Hinweis „am Ereignis belegen", E3).
 * - `nur_ereignis`: kein Aussage-Ziel, aber mindestens ein Wert aus einem Ereignis (E3).
 * - `ohne_wert`: nichts erfasst — „Beleg verknüpfen" gesperrt mit Hinweis (E4). */
export type BelegZeileZustand =
  | { readonly art: 'waehlbar'; readonly ziele: readonly AussageZiel[]; readonly ereignisAngaben: readonly LebensdatumAngabe[] }
  | { readonly art: 'nur_ereignis' }
  | { readonly art: 'ohne_wert' }

export function belegZeileZustand(ziele: readonly BelegZiel[]): BelegZeileZustand {
  const aussageZiele: AussageZiel[] = []
  const ereignisAngaben: LebensdatumAngabe[] = []
  for (const ziel of ziele) {
    if (ziel.art === 'aussage') aussageZiele.push({ angabe: ziel.angabe, aussageId: ziel.aussageId, zitatIds: ziel.zitatIds })
    else if (ziel.art === 'ereignis') ereignisAngaben.push(ziel.angabe)
  }
  if (aussageZiele.length > 0) return { art: 'waehlbar', ziele: aussageZiele, ereignisAngaben }
  return ereignisAngaben.length > 0 ? { art: 'nur_ereignis' } : { art: 'ohne_wert' }
}

/** Die angekreuzten Ziele (E1): alle, deren Angabe nicht abgewählt ist. */
export function aktiveZiele(ziele: readonly AussageZiel[], abgewaehlt: ReadonlySet<LebensdatumAngabe>): readonly AussageZiel[] {
  return ziele.filter((ziel) => !abgewaehlt.has(ziel.angabe))
}

// ── Verknüpfen (E2/E5/E6/E9) ───────────────────────────────────────────────────────────────────

/** Ein bereits geschriebenes, im Lesemodell aber vielleicht noch nicht angekommenes Paar. */
export interface VerknuepfungsPaar {
  readonly aussageId: string
  readonly zitatId: string
}

function schonVerknuepft(ziel: AussageZiel, zitatId: string, unterwegs: readonly VerknuepfungsPaar[]): boolean {
  return ziel.zitatIds.includes(zitatId) || unterwegs.some((paar) => paar.aussageId === ziel.aussageId && paar.zitatId === zitatId)
}

/** Ein Zitat erscheint im Wähler, solange mindestens ein angekreuztes Ziel es noch nicht trägt (E9:
 * bereits verknüpfte ausblenden). Ohne angekreuztes Ziel erscheint keins. */
export function zitatWaehlbar(zitatId: string, ziele: readonly AussageZiel[], unterwegs: readonly VerknuepfungsPaar[] = []): boolean {
  return ziele.some((ziel) => !schonVerknuepft(ziel, zitatId, unterwegs))
}

/** Je angekreuztem Ziel, das das Zitat noch nicht trägt, EIN `aussage_zitat.anlegen` (E2) — ohne
 * `feld` (E6: ganze Aussage) und ohne Textanker (E5). */
export function verknuepfungsBefehle(zitatId: string, ziele: readonly AussageZiel[], unterwegs: readonly VerknuepfungsPaar[] = []): readonly AussageZitatAnlegenEin[] {
  return ziele.filter((ziel) => !schonVerknuepft(ziel, zitatId, unterwegs)).map((ziel) => ({ aussageId: ziel.aussageId, zitatId }))
}

/** `zitat.anlegen` aus dem Kurzformular „neues Zitat" (E7): leere bzw. nur aus Leerzeichen
 * bestehende Felder werden weggelassen, nicht als leere Zeichenkette geschrieben. */
export function neuesZitatEin(quelleId: string, seite: string, eintragsnummer: string): ZitatAnlegenEin {
  const seiteBereinigt = seite.trim()
  const nummerBereinigt = eintragsnummer.trim()
  return {
    quelleId,
    ...(seiteBereinigt === '' ? {} : { seite: seiteBereinigt }),
    ...(nummerBereinigt === '' ? {} : { eintragsnummer: nummerBereinigt }),
  }
}

/** „Verknüpfung entfernen" (E10): nur die Verknüpfung, das Zitat bleibt. */
export function verknuepfungEntfernenEin(aussageId: string, zitatId: string): AussageZitatLoeschenEin {
  return { aussageId, zitatId }
}

/** Das Feld ohne eben entfernte Verknüpfungen (hueter #176 H3): bis zum nächsten Lesestand gilt ein
 * entferntes Paar als weg, damit ein zweiter Klick es nicht erneut zu entfernen versucht. */
export function ohneEntfernte(feld: PersonDetailGrunddatenFeld, entfernt: readonly VerknuepfungsPaar[]): PersonDetailGrunddatenFeld {
  if (entfernt.length === 0) return feld
  return {
    ...feld,
    aussagen: feld.aussagen.map((aussage) => ({
      ...aussage,
      belege: aussage.belege.filter((beleg) => !entfernt.some((paar) => paar.aussageId === aussage.aussage_id && paar.zitatId === beleg.zitat_id)),
    })),
  }
}

// ── Chips (Beleg-Zeile) ────────────────────────────────────────────────────────────────────────

/** Ein Chip je Zitat der Gruppe; `angaben` = an welchen Zielen es hängt (Anzeigereihenfolge). */
export interface BelegChip {
  readonly zitatId: string
  readonly beleg: PersonDetailBeleg
  readonly angaben: readonly LebensdatumAngabe[]
}

/** Chips der Beleg-Zeile: die Belege der Ziel-Aussagen (dieselben, die der Wähler beschreibt), je
 * Zitat einmal, in Reihenfolge des ersten Auftretens (Datum vor Ort, Ladereihenfolge der Belege). */
export function belegChips(felder: readonly LebensdatumFeld[]): readonly BelegChip[] {
  const chips: { zitatId: string; beleg: PersonDetailBeleg; angaben: LebensdatumAngabe[] }[] = []
  for (const feld of felder) {
    if (feld.art !== 'aussage') continue
    for (const beleg of feld.aussage.belege) {
      const vorhanden = chips.find((chip) => chip.zitatId === beleg.zitat_id)
      if (vorhanden === undefined) chips.push({ zitatId: beleg.zitat_id, beleg, angaben: [feld.angabe] })
      else if (!vorhanden.angaben.includes(feld.angabe)) vorhanden.angaben.push(feld.angabe)
    }
  }
  return chips
}

/** Nennt der Chip, woran er hängt? Nur wenn die Gruppe mehr als ein Ziel hat und der Beleg nicht an
 * allen hängt — sonst wäre die Angabe überflüssig. */
export function chipAngabenZeigen(chip: BelegChip, anzahlZiele: number): boolean {
  return anzahlZiele > 1 && chip.angaben.length < anzahlZiele
}

// ── Beschriftung eines Zitats ──────────────────────────────────────────────────────────────────

export type ZitatBeschriftung =
  | { readonly art: 'seite_eintrag'; readonly seite: string; readonly eintragsnummer: string }
  | { readonly art: 'seite'; readonly seite: string }
  | { readonly art: 'eintrag'; readonly eintragsnummer: string }
  | { readonly art: 'ohne' }

/** Welche Teile ein Zitat nennt (Seite, Eintragsnummer) — die Ansicht wählt daraus den i18n-Schlüssel. */
export function zitatBeschriftung(seite: string | null, eintragsnummer: string | null): ZitatBeschriftung {
  const s = seite === null || seite.trim() === '' ? null : seite
  const n = eintragsnummer === null || eintragsnummer.trim() === '' ? null : eintragsnummer
  if (s !== null && n !== null) return { art: 'seite_eintrag', seite: s, eintragsnummer: n }
  if (s !== null) return { art: 'seite', seite: s }
  if (n !== null) return { art: 'eintrag', eintragsnummer: n }
  return { art: 'ohne' }
}
