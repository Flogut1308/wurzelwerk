// AP-1.30 PR 9d (Beleg-Wähler im Reiter „Person", B-01/B-02/B-03/S-08; docs/80 §33 V-130-9d E1–E11):
// reine Logik — kein React, kein i18n (CLAUDE.md §2, Muster `reiter-person-logik.ts`). Die Ansicht
// (`beleg-waehler.tsx`, `reiter-person.tsx`) übersetzt und verdrahtet.
//
// - Ziel einer Verknüpfung (E1) ist dieselbe Aussage, die der Reiter für Sicherheit und Zähler nutzt:
//   `lebensdatumFeld(...)` mit `art = 'aussage'`. Datum und Ort sind getrennte Prädikate, also
//   getrennte Aussagen — der Wähler zeigt darum je Gruppe „belegt: Datum ☑ Ort ☑".
// - Werte aus einem Ereignis (PR 9d-2, docs/80 §33 V-130-9d2): Ziel ist die EXISTENZ-AUSSAGE des
//   Ereignisses (ADR-026, `person.detail.ereignis_existenz`) mit `feld` = `datum` bzw. `ort` (F1) —
//   dieselbe Bedeutung, mit der die Kernangaben einen Ereignis-Rückfall als belegt zählen (`feld` NULL
//   oder gleich, `kernBelegeLaden`). Weil `aussage_zitat` je (Aussage, Zitat) nur EINE Zeile hat, wird
//   „Datum und Ort desselben Ereignisses mit demselben Zitat" eine Zeile mit `feld` NULL (F2), und ein
//   schon mit dem anderen Feld verknüpftes Zitat per `aussage_zitat.aendern` auf NULL erweitert (F3,
//   Textanker bleibt). Hängt es mit einem Feld, das weder Datum noch Ort ist (`beschreibung`,
//   Altbestand), wird es für diese Angabe nicht angeboten (F4: NULL behauptete mehr als gewählt).
//   Ohne Existenz-Aussage bleibt es beim Hinweis „am Ereignis belegen" (E3, kein neuer Befehl).
//   Ohne Wert (E4) gibt es nichts zu belegen.
// - Jede Verknüpfung an einer Personen-Aussage ist ein eigener `aussage_zitat.anlegen` (E2) ohne
//   `feld` (E6) und ohne Textanker (E5). Bereits verknüpfte Paare werden nie erneut geschickt (E9,
//   kein `KONFLIKT_BEREITS_VORHANDEN`).
import type { LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { AussageZitatAendernEin, AussageZitatAnlegenEin, AussageZitatLoeschenEin, Textanker, ZitatAnlegenEin } from '../../../shared/schemata/befehle'
import type { BelegFeld } from '../../../shared/schemata/aussage-zitat'
import type { PersonDetailBeleg, PersonDetailEreignisExistenz, PersonDetailGrunddatenFeld } from '../../../shared/schemata/person-detail'
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

/** Eine Aussage, an die verknüpft werden kann, mit den Zitaten, die diese Angabe schon belegen. */
export interface AussageZiel {
  readonly angabe: LebensdatumAngabe
  readonly aussageId: string
  readonly zitatIds: readonly string[]
}

/** Welches Attribut der Existenz-Aussage eine Angabe belegt (`BELEG_FELDER_JE_SUBJEKT.ereignis`). */
export type EreignisFeld = Extract<BelegFeld, 'datum' | 'ort'>

export function ereignisFeldVon(angabe: LebensdatumAngabe): EreignisFeld {
  return istOrtAngabe(angabe) ? 'ort' : 'datum'
}

/** Belegt eine Verknüpfung an der Existenz-Aussage diese Angabe? `feld` NULL (ganzes Ereignis) oder
 * das passende Feld — dieselbe Regel wie die Kernangaben (`kernBelegeLaden`, `felderBelegt`). */
export function belegDecktAngabe(feld: string | null, angabe: LebensdatumAngabe): boolean {
  return feld === null || feld === ereignisFeldVon(angabe)
}

/** Die Belege der Existenz-Aussage, die diese Angabe belegen — Chips, Zähler und Schublade zeigen
 * genau diese (der Zähler zählt, was die Schublade auflistet). */
export function ereignisBelegeFuer(angabe: LebensdatumAngabe, existenz: PersonDetailEreignisExistenz): readonly PersonDetailBeleg[] {
  return existenz.belege.filter((beleg) => belegDecktAngabe(beleg.feld, angabe))
}

/** Die Existenz-Aussage zum Ereignis eines Ereigniswerts, sonst `undefined` (kein Ereigniswert oder
 * das Ereignis hat keine Existenz-Aussage). */
export function existenzFuer(feld: LebensdatumFeld, existenzen: readonly PersonDetailEreignisExistenz[]): PersonDetailEreignisExistenz | undefined {
  if (feld.art !== 'ereignis') return undefined
  return existenzen.find((existenz) => existenz.ereignis_id === feld.ereignisId)
}

/** Eine bestehende Verknüpfung an der Existenz-Aussage (auch mit einem Feld, das diese Angabe nicht
 * belegt) — gebraucht für F2–F4, weil `aussage_zitat` je (Aussage, Zitat) nur eine Zeile hat. */
export interface EreignisVerknuepfung {
  readonly zitatId: string
  readonly feld: string | null
  readonly textanker: Textanker | null
}

/** Ziel an der Existenz-Aussage eines Ereignisses (PR 9d-2). `zitatIds` = die Zitate, die diese
 * Angabe schon belegen; `verknuepfungen` = ALLE Verknüpfungen der Aussage. */
export interface EreignisZiel extends AussageZiel {
  readonly ereignisFeld: EreignisFeld
  readonly verknuepfungen: readonly EreignisVerknuepfung[]
}

/** Ein Ziel im Wähler: eine Personen-Aussage oder die Existenz-Aussage eines Ereignisses. */
export type VerknuepfungsZiel = AussageZiel | EreignisZiel

function istEreignisZiel(ziel: VerknuepfungsZiel): ziel is EreignisZiel {
  return 'ereignisFeld' in ziel
}

export type BelegZiel =
  | ({ readonly art: 'aussage' } & AussageZiel)
  | ({ readonly art: 'existenz' } & EreignisZiel)
  | { readonly art: 'ereignis'; readonly angabe: LebensdatumAngabe }
  | { readonly art: 'leer'; readonly angabe: LebensdatumAngabe }

/** Ziel einer Angabe. `existenzen` = `person.detail.ereignis_existenz`; ohne passenden Eintrag ist ein
 * Ereigniswert kein Ziel (`art = 'ereignis'`, Hinweis „am Ereignis belegen"). */
export function belegZiel(feld: LebensdatumFeld, existenzen: readonly PersonDetailEreignisExistenz[]): BelegZiel {
  switch (feld.art) {
    case 'aussage':
      return { art: 'aussage', angabe: feld.angabe, aussageId: feld.aussage.aussage_id, zitatIds: feld.aussage.belege.map((beleg) => beleg.zitat_id) }
    case 'ereignis': {
      const existenz = existenzFuer(feld, existenzen)
      if (existenz === undefined) return { art: 'ereignis', angabe: feld.angabe }
      return {
        art: 'existenz',
        angabe: feld.angabe,
        aussageId: existenz.aussage_id,
        zitatIds: ereignisBelegeFuer(feld.angabe, existenz).map((beleg) => beleg.zitat_id),
        ereignisFeld: ereignisFeldVon(feld.angabe),
        verknuepfungen: existenz.belege.map((beleg) => ({ zitatId: beleg.zitat_id, feld: beleg.feld, textanker: beleg.textanker })),
      }
    }
    case 'leer':
      return { art: 'leer', angabe: feld.angabe }
  }
}

/** Zustand der Beleg-Zeile einer Gruppe bzw. des Wählers:
 * - `waehlbar`: mindestens ein Ziel (Personen- oder Existenz-Aussage); `ereignisAngaben` sind die
 *   Angaben der Auswahl, deren Wert aus einem Ereignis OHNE Existenz-Aussage kommt (Hinweis „am
 *   Ereignis belegen", E3).
 * - `nur_ereignis`: kein Ziel, aber mindestens ein Wert aus einem Ereignis ohne Existenz-Aussage (E3).
 * - `ohne_wert`: nichts erfasst — „Beleg verknüpfen" gesperrt mit Hinweis (E4). */
export type BelegZeileZustand =
  | { readonly art: 'waehlbar'; readonly ziele: readonly VerknuepfungsZiel[]; readonly ereignisAngaben: readonly LebensdatumAngabe[] }
  | { readonly art: 'nur_ereignis' }
  | { readonly art: 'ohne_wert' }

export function belegZeileZustand(ziele: readonly BelegZiel[]): BelegZeileZustand {
  const aussageZiele: VerknuepfungsZiel[] = []
  const ereignisAngaben: LebensdatumAngabe[] = []
  for (const ziel of ziele) {
    if (ziel.art === 'aussage') aussageZiele.push({ angabe: ziel.angabe, aussageId: ziel.aussageId, zitatIds: ziel.zitatIds })
    else if (ziel.art === 'existenz')
      aussageZiele.push({ angabe: ziel.angabe, aussageId: ziel.aussageId, zitatIds: ziel.zitatIds, ereignisFeld: ziel.ereignisFeld, verknuepfungen: ziel.verknuepfungen })
    else if (ziel.art === 'ereignis') ereignisAngaben.push(ziel.angabe)
  }
  if (aussageZiele.length > 0) return { art: 'waehlbar', ziele: aussageZiele, ereignisAngaben }
  return ereignisAngaben.length > 0 ? { art: 'nur_ereignis' } : { art: 'ohne_wert' }
}

/** Die angekreuzten Ziele (E1): alle, deren Angabe nicht abgewählt ist. */
export function aktiveZiele<Z extends VerknuepfungsZiel>(ziele: readonly Z[], abgewaehlt: ReadonlySet<LebensdatumAngabe>): readonly Z[] {
  return ziele.filter((ziel) => !abgewaehlt.has(ziel.angabe))
}

/** Die Angaben der Ziele, die an der Existenz-Aussage eines Ereignisses verknüpft werden (Hinweis im
 * Wähler, damit sichtbar ist, dass der Beleg ans Ereignis geht). */
export function ereignisZielAngaben(ziele: readonly VerknuepfungsZiel[]): readonly LebensdatumAngabe[] {
  return ziele.filter(istEreignisZiel).map((ziel) => ziel.angabe)
}

// ── Verknüpfen (E2/E5/E6/E9, F1–F4) ────────────────────────────────────────────────────────────

/** Ein bereits geschriebenes, im Lesemodell aber vielleicht noch nicht angekommenes Paar. `feld`
 * fehlt = NULL (ganze Aussage); bei mehreren Einträgen desselben Paars gilt der letzte (Erweiterung). */
export interface VerknuepfungsPaar {
  readonly aussageId: string
  readonly zitatId: string
  readonly feld?: BelegFeld | undefined
}

function schonVerknuepft(ziel: AussageZiel, zitatId: string, unterwegs: readonly VerknuepfungsPaar[]): boolean {
  return ziel.zitatIds.includes(zitatId) || unterwegs.some((paar) => paar.aussageId === ziel.aussageId && paar.zitatId === zitatId)
}

/** Die Verknüpfung (Aussage, Zitat), wie sie nach allem Geschriebenen steht: der letzte Eintrag
 * unterwegs, sonst das Lesemodell. Der Textanker kommt immer aus dem Lesemodell (unterwegs entstehen
 * nur Verknüpfungen ohne Anker bzw. Erweiterungen, die ihn behalten). */
function wirksameVerknuepfung(ziel: EreignisZiel, zitatId: string, unterwegs: readonly VerknuepfungsPaar[]): EreignisVerknuepfung | undefined {
  const gelesen = ziel.verknuepfungen.find((verknuepfung) => verknuepfung.zitatId === zitatId)
  const geschrieben = unterwegs.filter((paar) => paar.aussageId === ziel.aussageId && paar.zitatId === zitatId).at(-1)
  if (geschrieben === undefined) return gelesen
  return { zitatId, feld: geschrieben.feld ?? null, textanker: gelesen?.textanker ?? null }
}

/** Belegt das Zitat dieses Ziel schon? */
function deckt(ziel: VerknuepfungsZiel, zitatId: string, unterwegs: readonly VerknuepfungsPaar[]): boolean {
  if (!istEreignisZiel(ziel)) return schonVerknuepft(ziel, zitatId, unterwegs)
  const verknuepfung = wirksameVerknuepfung(ziel, zitatId, unterwegs)
  return verknuepfung !== undefined && belegDecktAngabe(verknuepfung.feld, ziel.angabe)
}

/** Kann das Zitat an diesem Ziel noch verknüpft werden? Nein, wenn es schon deckt, und (F4) nein, wenn
 * es mit einem Feld an der Existenz-Aussage hängt, das weder Datum noch Ort ist — eine Erweiterung auf
 * NULL behauptete dann auch die andere Angabe. */
function offen(ziel: VerknuepfungsZiel, zitatId: string, unterwegs: readonly VerknuepfungsPaar[]): boolean {
  if (deckt(ziel, zitatId, unterwegs)) return false
  if (!istEreignisZiel(ziel)) return true
  const verknuepfung = wirksameVerknuepfung(ziel, zitatId, unterwegs)
  return verknuepfung === undefined || verknuepfung.feld === 'datum' || verknuepfung.feld === 'ort'
}

/** Ein Zitat erscheint im Wähler, solange mindestens ein angekreuztes Ziel es noch aufnehmen kann (E9:
 * bereits verknüpfte ausblenden, F4). Ohne angekreuztes Ziel erscheint keins. */
export function zitatWaehlbar(zitatId: string, ziele: readonly VerknuepfungsZiel[], unterwegs: readonly VerknuepfungsPaar[] = []): boolean {
  return ziele.some((ziel) => offen(ziel, zitatId, unterwegs))
}

/** `aussage_zitat.anlegen` je offenem Ziel ohne bestehende Verknüpfung (E2), ohne Textanker (E5):
 * - Personen-Aussage: ohne `feld` (E6: ganze Aussage).
 * - Existenz-Aussage (F1): `feld` = `datum` bzw. `ort`; wollen Datum UND Ort desselben Ereignisses
 *   dasselbe Zitat, EINE Verknüpfung ohne `feld` (F2 — NULL = das ganze Ereignis, die einzige Form,
 *   die beides in einer Zeile belegt).
 * Ein Ziel, an dem das Zitat schon mit dem anderen Feld hängt, erweitert `erweiterungsBefehle`. */
export function verknuepfungsBefehle(zitatId: string, ziele: readonly VerknuepfungsZiel[], unterwegs: readonly VerknuepfungsPaar[] = []): readonly AussageZitatAnlegenEin[] {
  const neu = ziele.filter((ziel) => offen(ziel, zitatId, unterwegs) && (!istEreignisZiel(ziel) || wirksameVerknuepfung(ziel, zitatId, unterwegs) === undefined))
  const befehle: AussageZitatAnlegenEin[] = []
  const erledigt = new Set<string>()
  for (const ziel of neu) {
    if (erledigt.has(ziel.aussageId)) continue
    erledigt.add(ziel.aussageId)
    if (!istEreignisZiel(ziel)) {
      befehle.push({ aussageId: ziel.aussageId, zitatId })
      continue
    }
    const felder = new Set(neu.filter((kandidat) => kandidat.aussageId === ziel.aussageId && istEreignisZiel(kandidat)).map((kandidat) => ereignisFeldVon(kandidat.angabe)))
    befehle.push(felder.size > 1 ? { aussageId: ziel.aussageId, zitatId } : { aussageId: ziel.aussageId, zitatId, feld: ziel.ereignisFeld })
  }
  return befehle
}

/** `aussage_zitat.aendern` (F3) je Existenz-Aussage, an der das Zitat schon mit dem ANDEREN Feld
 * (`datum` ↔ `ort`) hängt: auf `feld` NULL erweitern, der Textanker bleibt, wie er ist. */
export function erweiterungsBefehle(zitatId: string, ziele: readonly VerknuepfungsZiel[], unterwegs: readonly VerknuepfungsPaar[] = []): readonly AussageZitatAendernEin[] {
  const befehle: AussageZitatAendernEin[] = []
  for (const ziel of ziele) {
    if (!istEreignisZiel(ziel) || !offen(ziel, zitatId, unterwegs)) continue
    const verknuepfung = wirksameVerknuepfung(ziel, zitatId, unterwegs)
    if (verknuepfung === undefined || befehle.some((befehl) => befehl.aussageId === ziel.aussageId)) continue
    befehle.push({ aussageId: ziel.aussageId, zitatId, feld: null, textanker: verknuepfung.textanker })
  }
  return befehle
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

/** Die Existenz-Aussage ohne eben entfernte Verknüpfungen (wie `ohneEntfernte`, PR 9d-2). */
export function existenzOhneEntfernte(existenz: PersonDetailEreignisExistenz, entfernt: readonly VerknuepfungsPaar[]): PersonDetailEreignisExistenz {
  if (entfernt.length === 0) return existenz
  return { ...existenz, belege: existenz.belege.filter((beleg) => !entfernt.some((paar) => paar.aussageId === existenz.aussage_id && paar.zitatId === beleg.zitat_id)) }
}

// ── Chips (Beleg-Zeile) ────────────────────────────────────────────────────────────────────────

/** Ein Chip je Zitat der Gruppe; `angaben` = an welchen Zielen es hängt (Anzeigereihenfolge). */
export interface BelegChip {
  readonly zitatId: string
  readonly beleg: PersonDetailBeleg
  readonly angaben: readonly LebensdatumAngabe[]
}

/** Die Belege, die eine Angabe als Ziel trägt: die der führenden Aussage bzw. die der Existenz-Aussage,
 * die diese Angabe belegen (PR 9d-2); sonst keine. */
function zielBelege(feld: LebensdatumFeld, existenzen: readonly PersonDetailEreignisExistenz[]): readonly PersonDetailBeleg[] {
  if (feld.art === 'aussage') return feld.aussage.belege
  const existenz = existenzFuer(feld, existenzen)
  return existenz === undefined ? [] : ereignisBelegeFuer(feld.angabe, existenz)
}

/** Chips der Beleg-Zeile: die Belege der Ziele (dieselben, die der Wähler beschreibt), je Zitat
 * einmal, in Reihenfolge des ersten Auftretens (Datum vor Ort, Ladereihenfolge der Belege). Ein
 * Zitat, das an der Existenz-Aussage mit `feld` NULL hängt, nennt Datum UND Ort des Ereignisses. */
export function belegChips(felder: readonly LebensdatumFeld[], existenzen: readonly PersonDetailEreignisExistenz[]): readonly BelegChip[] {
  const chips: { zitatId: string; beleg: PersonDetailBeleg; angaben: LebensdatumAngabe[] }[] = []
  for (const feld of felder) {
    for (const beleg of zielBelege(feld, existenzen)) {
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
