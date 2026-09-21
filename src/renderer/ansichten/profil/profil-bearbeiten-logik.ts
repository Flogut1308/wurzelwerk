// AP-1.14a (S-20, erste echte Schreibmaske): reine Umrechnungen zwischen `PersonDetailName`/
// `PersonDetailKopf` (Lesemodell, `shared/schemata/person-detail.ts`) und den Zuständen der Atome,
// die die Kernfelder-Bearbeitung zusammensetzt, PLUS den Bau der `befehl:*`-Nutzlasten selbst.
// Getrennt von den Komponenten (analog `filterleiste-logik.ts`, `ortsfeld-logik.ts`), damit die
// Zuordnung ohne React/DOM geprüft werden kann — kein `useState`, kein JSX, reines TypeScript.
//
// KEIN Konfidenz-/Belegslot an Namen (ADR-026: Name trägt keine Aussage) — anders als die
// Grunddaten-Felder aus `abfrage:person.detail` tragen `NamenEintragWerte` darum keine
// `konfidenz`/`begruendung`.
import type { z } from 'zod'
import { parse } from '../../../core/datum/parser'
import type { Kalender } from '../../../core/datum/typen'
import type { BeteiligungRolleEnum } from '../../../shared/schemata/beteiligung'
import type { EreignisAnlegenEin, NameAendernEin, NameAnlegenEin, PersonFeldSetzenEin } from '../../../shared/schemata/befehle'
import type { EreignisTypEnum } from '../../../shared/schemata/ereignis'
import type { Datumswert as VertragsDatumswert } from '../../../shared/schemata/import-v1'
import type { NameTypEnum, SchriftEnum } from '../../../shared/schemata/name'
import type { GeschlechtEnum, PlatzhalterGrundEnum } from '../../../shared/schemata/person'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import type { SucheEin } from '../../../shared/schemata/person-liste'
import type { KontrollkaestchenZustand } from '../../bausteine/kontrollkaestchen'
import type { KonfidenzStufe } from '../../bausteine/konfidenz-punkt'

/** Lokaler Bearbeitungszustand EINER Namenszeile — alle Textfelder als `string` (nie `null`), wie
 * es jedes kontrollierte `Textfeld` verlangt; `''` bedeutet „nicht gepflegt" und wird beim Bau der
 * Befehlsnutzlast wieder zu `undefined`/`null` (s. `nameEintragTextOderUndefined`). */
export interface NamenEintragWerte {
  readonly typ: z.infer<typeof NameTypEnum>
  readonly schrift: z.infer<typeof SchriftEnum> | null
  readonly vornamen: string
  readonly nachname: string
  readonly praefix: string
  readonly titelVor: string
  readonly zusatzNach: string
  readonly rufname: string
}

/** Startwert des „neuen Namen erfassen"-Formulars — `typ: 'sonstiges'`, weil ein neu ergänzter
 * Name (anders als der beim Import gesetzte `geburtsname`) keine Standardbedeutung hat, die
 * dieses Formular erraten dürfte. */
export const NAMEN_EINTRAG_LEER: NamenEintragWerte = {
  typ: 'sonstiges',
  schrift: null,
  vornamen: '',
  nachname: '',
  praefix: '',
  titelVor: '',
  zusatzNach: '',
  rufname: '',
}

export function namenEintragAusPersonDetailName(name: PersonDetailName): NamenEintragWerte {
  return {
    typ: name.typ,
    schrift: name.schrift,
    vornamen: name.vornamen ?? '',
    nachname: name.nachname ?? '',
    praefix: name.praefix ?? '',
    titelVor: name.titel_vor ?? '',
    zusatzNach: name.zusatz_nach ?? '',
    rufname: name.rufname_text ?? '',
  }
}

/** `''` → `undefined` (Befehlsnutzlast kennt optionale Felder, keinen leeren String, s.
 * `nameAnlegenEinSchema`/`nameAendernEinSchema`). */
function textOderUndefined(wert: string): string | undefined {
  const getrimmt = wert.trim()
  return getrimmt === '' ? undefined : wert
}

export function nameAnlegenEinAusEintrag(personId: string, eintrag: NamenEintragWerte): NameAnlegenEin {
  return {
    personId,
    typ: eintrag.typ,
    schrift: eintrag.schrift ?? undefined,
    vornamen: textOderUndefined(eintrag.vornamen),
    nachname: textOderUndefined(eintrag.nachname),
    praefix: textOderUndefined(eintrag.praefix),
    titelVor: textOderUndefined(eintrag.titelVor),
    zusatzNach: textOderUndefined(eintrag.zusatzNach),
    rufnameText: textOderUndefined(eintrag.rufname),
  }
}

export function nameAendernEinAusEintrag(id: string, eintrag: NamenEintragWerte): NameAendernEin {
  return {
    id,
    typ: eintrag.typ,
    schrift: eintrag.schrift ?? undefined,
    vornamen: textOderUndefined(eintrag.vornamen),
    nachname: textOderUndefined(eintrag.nachname),
    praefix: textOderUndefined(eintrag.praefix),
    titelVor: textOderUndefined(eintrag.titelVor),
    zusatzNach: textOderUndefined(eintrag.zusatzNach),
    rufnameText: textOderUndefined(eintrag.rufname),
  }
}

/** Gate für die „Hinzufügen"-Schaltfläche des Neu-Formulars: mindestens EIN Textfeld muss
 * tatsächlich Inhalt tragen, sonst legt ein Klick eine vollständig leere `name`-Zeile an, die im
 * Lesezweig keinen Anzeigenamen ergäbe (Leerzustand-Falle, C-04). */
export function namenEintragHatInhalt(eintrag: NamenEintragWerte): boolean {
  return [eintrag.vornamen, eintrag.nachname, eintrag.praefix, eintrag.titelVor, eintrag.zusatzNach, eintrag.rufname].some(
    (wert) => wert.trim() !== '',
  )
}

/** `name.schrift` ist optional — das `Auswahlfeld` (immer eine String-Union, HTML-`<select>`)
 * bekommt zusätzlich den lokalen, KEIN `SchriftEnum`-Wert `''` für „nicht angegeben"
 * (`profil-schluessel.ts::schriftSchluessel` deckt nur die beiden echten Enum-Werte ab, `''`
 * bekommt die eigene Beschriftung `schrift_unbestimmt` direkt am Aufrufer). */
export type SchriftAuswahlWert = '' | z.infer<typeof SchriftEnum>

export function schriftZuAuswahlWert(schrift: z.infer<typeof SchriftEnum> | null): SchriftAuswahlWert {
  return schrift ?? ''
}

export function auswahlWertZuSchrift(wert: SchriftAuswahlWert): z.infer<typeof SchriftEnum> | null {
  return wert === '' ? null : wert
}

// -----------------------------------------------------------------------------------------------
// Grunddaten (geschlecht/notiz/ist_platzhalter/platzhalter_grund) — `befehl:person.feldSetzen`
// -----------------------------------------------------------------------------------------------

export function personFeldGeschlechtEin(id: string, wert: z.infer<typeof GeschlechtEnum>): PersonFeldSetzenEin {
  return { id, feld: 'geschlecht', wert }
}

export function personFeldNotizEin(id: string, wert: string): PersonFeldSetzenEin {
  return { id, feld: 'notiz', wert }
}

export function personFeldIstPlatzhalterEin(id: string, wert: boolean): PersonFeldSetzenEin {
  return { id, feld: 'ist_platzhalter', wert: wert ? 1 : 0 }
}

export function personFeldPlatzhalterGrundEin(id: string, wert: z.infer<typeof PlatzhalterGrundEnum>): PersonFeldSetzenEin {
  return { id, feld: 'platzhalter_grund', wert }
}

/** Boolesche Person-Flags (hier: `ist_platzhalter`) als `Kontrollkaestchen`-Zustand — das Atom
 * selbst zyklisiert nur zwischen `ein`/`aus` (nie `unbestimmt`, das ist ein von außen berechneter
 * Anzeigezustand, `kontrollkaestchen.tsx`-Kopfkommentar), darum genügt eine einfache Abbildung. */
export function boolZuKontrollkaestchenZustand(wert: boolean): KontrollkaestchenZustand {
  return wert ? 'ein' : 'aus'
}

export function kontrollkaestchenZustandZuBool(zustand: KontrollkaestchenZustand): boolean {
  return zustand === 'ein'
}

// -----------------------------------------------------------------------------------------------
// Ereignisse (AP-1.15 PR-A, Variante A) — NUR das Neu-Formular schreibt (`befehl:ereignis.anlegen`
// MIT allen gesammelten Beteiligten in einem Aufruf); bestehende Ereignisse werden ausschließlich
// über `befehl:beteiligung.loeschen`/`befehl:ereignis.loeschen` verändert (kein `ereignis.aendern`
// hier, s. `docs/80_Offene_Fragen.md` §27).
// -----------------------------------------------------------------------------------------------

/** EIN weiterer Beteiligter im Neu-Formular, zusätzlich zur aktuellen Profilperson (die IMMER als
 * `hauptperson` mitgeschickt wird, s. `ereignisAnlegenEinAusEntwurf`). `personId` ist `null`, bis
 * der `Personenwaehler` eine Auswahl (Treffer, neu angelegt oder Platzhalter) geliefert hat —
 * `schluessel` ist ein reiner React-Listenschlüssel (clientseitig vergeben), KEINE fachliche ID. */
export interface WeitererBeteiligterEntwurf {
  readonly schluessel: string
  readonly personId: string | null
  readonly rolle: z.infer<typeof BeteiligungRolleEnum>
}

/** Vorgabe-Rolle einer neu hinzugefügten Zeile — ein bewusst neutraler Wert (kein "kind"/"vater"
 * mit familiärer Vorbedeutung), der Nutzer wählt die tatsächliche Rolle sofort über das
 * Rollen-Auswahlfeld der Zeile. Ein generisches "zeuge" fehlt im Enum (s. §27) — `informant`
 * kommt dem am nächsten. */
const WEITERER_BETEILIGTER_ROLLE_STANDARD: z.infer<typeof BeteiligungRolleEnum> = 'informant'

export function weitererBeteiligterLeer(schluessel: string): WeitererBeteiligterEntwurf {
  return { schluessel, personId: null, rolle: WEITERER_BETEILIGTER_ROLLE_STANDARD }
}

/** Lokaler Bearbeitungszustand des Ereignis-Neu-Formulars — `Datumsfeld`/`Ortsfeld` bleiben wie
 * überall vollständig kontrolliert (`text`/`kalenderErweitert` gehören dem Aufrufer, s.
 * `datumsfeld.tsx`-Kopfkommentar). */
export interface EreignisEntwurfWerte {
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly datumText: string
  readonly kalender: Kalender
  readonly kalenderErweitert: boolean
  readonly ortId: string | null
  readonly ortText: string
  /** `null` = kein Vorgabewert (§3.4, wie `Konfidenzwaehler` selbst dokumentiert) — Pflichtfeld
   * (`EreignisAnlegenEin.konfidenz`), das Absenden bleibt darum gesperrt, bis gewählt wurde. */
  readonly konfidenz: KonfidenzStufe | null
  readonly weitereBeteiligte: readonly WeitererBeteiligterEntwurf[]
}

export const EREIGNIS_ENTWURF_LEER: EreignisEntwurfWerte = {
  typ: 'sonstiges',
  datumText: '',
  kalender: 'gregorian',
  kalenderErweitert: false,
  ortId: null,
  ortText: '',
  konfidenz: null,
  weitereBeteiligte: [],
}

/** `true`, wenn `text` entweder leer ist (kein Datum angegeben — erlaubt, `EreignisAnlegenEin.datum`
 * ist optional) oder von `parse()` (`src/core/datum/parser.ts`) aufgelöst werden kann. Dieselbe
 * Prüfung, die `Datumsfeld` selbst als "nicht auflösbar" anzeigt (`datumsfeld-logik.ts`) — hier
 * zusätzlich als Absende-Sperre genutzt, damit kein unlesbarer Text stillschweigend verworfen wird. */
export function ereignisEntwurfDatumIstGueltig(text: string): boolean {
  return text.trim() === '' || parse(text).ok
}

/** Baut den Vertrags-`Datumswert` (`src/shared/schemata/import-v1.ts`, von `befehl:ereignis.anlegen`
 * verwendet) aus der rohen Texteingabe. `undefined` bei leerem/nicht auflösbarem Text (der Aufrufer
 * sperrt das Absenden ohnehin über `ereignisEntwurfDatumIstGueltig`, s. `ereignisEntwurfAbsendbar`).
 * `kalender` kommt von der Kalenderwahl der Komponente selbst — `parse()` löst ausschließlich
 * gregorianische Schreibweisen auf (s. Kopfkommentar `datumsfeld-logik.ts`), die Kalenderwahl der
 * Komponente markiert das Ergebnis darum nur als "in diesem Kalender gemeint", ohne die Ziffern
 * selbst neu zu berechnen — dieselbe Grenze, die `Datumsfeld` bereits mitbringt. */
export function ereignisDatumwertAusEntwurf(text: string, kalender: Kalender): VertragsDatumswert | undefined {
  if (text.trim() === '') return undefined
  const ergebnis = parse(text)
  if (!ergebnis.ok) return undefined
  return {
    kalender,
    modifikator: ergebnis.wert.modifikator,
    praezision: ergebnis.wert.praezision,
    wert1: ergebnis.wert.wert1,
    wert2: ergebnis.wert.wert2,
    original_text: ergebnis.wert.originaltext,
    doppeljahr: ergebnis.wert.doppeljahr,
  }
}

/** JDN (`sortVon`) des Ereignis-Datumstexts, für `abfrage:ort.suche`s `jdn`-Parameter (AP-1.16
 * PR-C, docs/71 §3.2: die Ortsfeld-Hierarchiezeile braucht einen konkreten Gültigkeitszeitpunkt).
 * `undefined` bei leerem/nicht auflösbarem Text — dann sucht `Ortsfeld` ohne `jdn` (bevorzugter
 * Name, keine Hierarchiezeile, s. `OrtTreffer`-Kopfkommentar in `src/shared/schemata/ort-suche.ts`).
 * Dieselbe `parse()`-Quelle wie `ereignisDatumwertAusEntwurf` oben — kein zweiter Parsevorgang. */
export function ereignisEntwurfJdn(text: string): number | undefined {
  if (text.trim() === '') return undefined
  const ergebnis = parse(text)
  return ergebnis.ok ? ergebnis.wert.sortVon : undefined
}

/** Nutzlast für `abfrage:suche` (`useSuche`), Personensuche INNERHALB des Ereignis-Neu-Formulars
 * (`Personenwaehler`-Zeile je weiterem Beteiligten). Feste, kleine Ergebnismenge und keine
 * aktiven Filter — dies ist eine schmale Tippsuche zum Auffinden EINER Person, keine Listenansicht
 * mit Filter-/Sortier-/Seitenbedienung. */
export function ereignisPersonSucheEin(text: string): SucheEin {
  return {
    text,
    grenze: 20,
    filter: { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false },
    sortierung: 'nachname',
    richtung: 'auf',
    seite: 1,
    proSeite: 20,
  }
}

function weitererBeteiligterAufgeloest(eintrag: WeitererBeteiligterEntwurf): eintrag is WeitererBeteiligterEntwurf & { readonly personId: string } {
  return eintrag.personId !== null
}

/** Gate für die "Ereignis anlegen"-Schaltfläche: Konfidenz gewählt, Datum leer oder auflösbar, UND
 * jede hinzugefügte weitere Beteiligten-Zeile hat bereits eine Person (sonst über "entfernen"
 * wieder rausnehmen, statt mit einer unvollständigen Zeile abzusenden). */
export function ereignisEntwurfAbsendbar(entwurf: EreignisEntwurfWerte): boolean {
  return entwurf.konfidenz !== null && ereignisEntwurfDatumIstGueltig(entwurf.datumText) && entwurf.weitereBeteiligte.every(weitererBeteiligterAufgeloest)
}

/** Baut `befehl:ereignis.anlegen` — `personId` (die aktuelle Profilperson) IMMER zuerst mit
 * Rolle `hauptperson`, danach alle aufgelösten weiteren Beteiligten (Variante A, EIN Aufruf für
 * alle Beteiligten). `null`, wenn `ereignisEntwurfAbsendbar` nicht zutrifft — der Aufrufer ruft
 * diese Funktion nur, wenn die Schaltfläche aktiv ist, die Prüfung hier ist zusätzlich defensiv
 * (CLAUDE.md §4: kein `!`, kein unbegründetes Vertrauen in den Aufrufer). */
export function ereignisAnlegenEinAusEntwurf(personId: string, entwurf: EreignisEntwurfWerte): EreignisAnlegenEin | null {
  if (!ereignisEntwurfAbsendbar(entwurf)) return null
  const konfidenz = entwurf.konfidenz
  if (konfidenz === null) return null
  return {
    typ: entwurf.typ,
    ortId: entwurf.ortId ?? undefined,
    datum: ereignisDatumwertAusEntwurf(entwurf.datumText, entwurf.kalender),
    beteiligungen: [
      { personId, rolle: 'hauptperson' },
      ...entwurf.weitereBeteiligte.filter(weitererBeteiligterAufgeloest).map((eintrag) => ({ personId: eintrag.personId, rolle: eintrag.rolle })),
    ],
    konfidenz,
  }
}
