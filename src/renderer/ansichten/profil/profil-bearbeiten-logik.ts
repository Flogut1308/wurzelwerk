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
import type { EreignisAnlegenEin, NameAendernEin, NameAendernFeld, NameAnlegenEin, PersonFeldSetzenEin } from '../../../shared/schemata/befehle'
import type { EreignisTypEnum } from '../../../shared/schemata/ereignis'
import type { Datumswert as VertragsDatumswert } from '../../../shared/schemata/import-v1'
import { istMontierterOriginalText } from '../../../core/name/zerlegung'
import type { NameTypEnum, SchriftEnum, UmschriftNormEnum } from '../../../shared/schemata/name'
import type { GeschlechtEnum, PlatzhalterGrundEnum } from '../../../shared/schemata/person'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import type { SucheEin } from '../../../shared/schemata/person-liste'
import { datumswertAusText } from '../../bausteine/datumsfeld-logik'
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
  /** AP-1.30 PR 2a (Bugfix Namens-Rundreise): Felder, die die Maske NICHT anzeigt, die
   * `name.aendern` („ersetzt alles") aber sonst auf NULL setzte — unverändert aus dem Lesemodell
   * mitgetragen und zurückgereicht. `rufnameIndex` gilt nur, solange er noch auf den Rufnamen zeigt
   * (s. `nameAendernEinAusEintrag`). */
  readonly rufnameIndex: number | null
  /** V-130-11e-1 (U-130-11c2-rufname-verlust): die Vornamen-Einheiten (`vornamenEinheiten`), auf die
   * sich `rufnameIndex` bezieht — festgehalten beim Lesen und bei der Rufname-Auswahl. Schreibt der
   * Nutzer danach die Vornamen um, richtet `rufnamePosition` die Markierung an dieser Basis aus, statt
   * sie zu verlieren, sobald der Rufname-Text keinem Vornamen mehr gleicht. `null` = keine Basis (das
   * Neu-Formular): dann gilt nur die Textsuche. */
  readonly rufnameBasis: readonly string[] | null
  /** AP-1.30 PR 3 (V-3-flache-bruecke-vatersname): die Maske zeigt ihn noch nicht (kommt mit dem
   * Namen-Reiter) — `''` bedeutet „kein Vatersname" wie bei den sichtbaren Feldern. */
  readonly vatersname: string
  readonly umschriftVon: string | null
  readonly umschriftNorm: z.infer<typeof UmschriftNormEnum> | null
  readonly sprache: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  /** Die WORTGETREUE Schreibung (`original_text`), die erhalten bleiben muss — `null`, wenn der
   * gespeicherte Text nur die automatische Montage der Teile war (dann montiert der Befehl ihn aus
   * den neuen Teilen neu). Entschieden beim Lesen (`namenEintragAusPersonDetailName`). */
  readonly originalTextWortgetreu: string | null
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
  rufnameIndex: null,
  rufnameBasis: null,
  vatersname: '',
  umschriftVon: null,
  umschriftNorm: null,
  sprache: null,
  gueltigVon: null,
  gueltigBis: null,
  originalTextWortgetreu: null,
}

/** Die `original_text`-Regel (AP-1.30 PR 2a) steht NUR hier: ein gespeicherter Text, der der
 * Montage der gespeicherten Teile entspricht, war automatisch erzeugt und wird verworfen (der Befehl
 * montiert neu); jeder andere ist eine wortgetreue Schreibung und wird zurückgereicht. Hier statt in
 * `name-aendern.ts`, weil der Befehl seine Semantik „ersetzt alles, ein fehlender `originalText` wird
 * montiert" behält — nur der Aufrufer, der die Form gelesen hat, weiß, ob er eine Quelle zurückgibt. */
function wortgetreuerOriginalText(name: PersonDetailName): string | null {
  const flach = {
    vornamen: name.vornamen,
    rufnameIndex: name.rufname_index,
    rufnameText: name.rufname_text,
    nachname: name.nachname,
    praefix: name.praefix,
    titelVor: name.titel_vor,
    zusatzNach: name.zusatz_nach,
    vatersname: name.vatersname,
  }
  return istMontierterOriginalText(name.original_text, flach) ? null : name.original_text
}

export function namenEintragAusPersonDetailName(name: PersonDetailName): NamenEintragWerte {
  const ohneBasis: NamenEintragWerte = {
    typ: name.typ,
    schrift: name.schrift,
    vornamen: name.vornamen ?? '',
    nachname: name.nachname ?? '',
    praefix: name.praefix ?? '',
    titelVor: name.titel_vor ?? '',
    zusatzNach: name.zusatz_nach ?? '',
    rufname: name.rufname_text ?? '',
    rufnameIndex: name.rufname_index,
    rufnameBasis: null,
    vatersname: name.vatersname ?? '',
    umschriftVon: name.umschrift_von,
    umschriftNorm: name.umschrift_norm,
    sprache: name.sprache,
    gueltigVon: name.gueltig_von,
    gueltigBis: name.gueltig_bis,
    originalTextWortgetreu: wortgetreuerOriginalText(name),
  }
  return { ...ohneBasis, rufnameBasis: vornamenEinheiten(ohneBasis).einheiten }
}

function vornamenTokens(vornamen: string): readonly string[] {
  return vornamen
    .trim()
    .split(/\s+/u)
    .filter((token) => token !== '')
}

/** Die Vornamen-Kette als wählbare Einheiten. Review H1: ein Rufname, der beim Anlegen/Import kein
 * Vorname war, steht als EIN Bestandteil hinter den Vornamen (`zerlegeName` Regel 3, Migration 0006
 * (c)) — auch mehrwortig („Hans Peter"). Die flache Sicht verbindet ihn mit Leerzeichen („Karl Hans
 * Peter", Index 1). Nur dieser Bestandteil kann Leerraum enthalten (alle übrigen Vornamen zerlegt die
 * Zerlegung an Leerzeichen); endet die Kette auf die Wörter eines mehrwortigen Rufnamens, bilden sie
 * darum EINE Einheit. `rufnameAngehaengt` meldet genau diesen Fall. */
function vornamenEinheiten(eintrag: NamenEintragWerte): { readonly einheiten: readonly string[]; readonly rufnameAngehaengt: boolean } {
  const tokens = vornamenTokens(eintrag.vornamen)
  const rufnameWoerter = vornamenTokens(eintrag.rufname)
  const vorne = tokens.length - rufnameWoerter.length
  const angehaengt = rufnameWoerter.length > 1 && vorne >= 0 && rufnameWoerter.every((wort, i) => tokens[vorne + i] === wort)
  return angehaengt ? { einheiten: [...tokens.slice(0, vorne), rufnameWoerter.join(' ')], rufnameAngehaengt: true } : { einheiten: tokens, rufnameAngehaengt: false }
}

/** Die Position des Vornamens, den der Rufname markiert — `undefined`, wenn der Rufname keinem
 * Vornamen gleicht. Vorrang wie `zerlegeName`: der mitgetragene `rufnameIndex`, solange er auf einen
 * Vornamen zeigt, der dem (evtl. geänderten) Rufnamen gleicht (sonst gewönne der alte Index gegen einen
 * neu gewählten Rufnamen bzw. markierte nach geänderten Vornamen den falschen; nötig, wo der Text allein
 * mehrdeutig ist, „Johann Georg Johann"), sonst — V-130-11e-1 — die Ausrichtung an der Basis
 * (`ausgerichtetePosition`), sonst der erste gleichlautende Vorname. */
function rufnamePosition(eintrag: NamenEintragWerte): number | undefined {
  const text = vornamenTokens(eintrag.rufname).join(' ')
  if (text === '') return undefined
  const { einheiten } = vornamenEinheiten(eintrag)
  if (eintrag.rufnameIndex !== null && einheiten[eintrag.rufnameIndex] === text) return eintrag.rufnameIndex
  // Ausgerichtet wird nur, solange der Rufname-Text noch der ist, auf den Index und Basis zeigen — ein
  // neu gesetzter Rufname („Georg" → „Johann") wird über den Text gesucht, der alte Index gewinnt nicht.
  if (eintrag.rufnameIndex !== null && eintrag.rufnameBasis !== null && eintrag.rufnameBasis[eintrag.rufnameIndex] === text) {
    const ausgerichtet = ausgerichtetePosition(einheiten, eintrag.rufnameBasis, eintrag.rufnameIndex)
    if (ausgerichtet !== 'keine_ausrichtung') return ausgerichtet
  }
  const position = einheiten.indexOf(text)
  return position >= 0 ? position : undefined
}

function gleicheWoerter(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((wort, i) => wort === b[i])
}

/** V-130-11e-1 (U-130-11c2-rufname-verlust): Wohin ist der Vorname gewandert, den `index` in der `basis`
 * (den zuletzt gelesenen/gewählten Einheiten) markierte? Der Autosave schreibt Zwischenstände; beim
 * Umschreiben des markierten Worts („Karl Friedrich" → „Karl Friedric") gleicht der Rufname-Text schon
 * im ersten keinem Vornamen mehr, die Stelle selbst ist aber eindeutig:
 *  - Wörter VOR der Stelle unverändert → die Stelle bleibt (das markierte Wort oder etwas dahinter wurde
 *    bearbeitet). Ist sie nicht mehr gedeckt (weniger Wörter), wurde das markierte Wort gelöscht.
 *  - sonst Wörter HINTER der Stelle unverändert → vom Ende her gezählt (vorne eingefügt/gelöscht).
 *  - sind BEIDE Seiten unverändert und es gibt weniger Wörter, fehlt genau das markierte Wort: gelöscht
 *    (sonst spränge die Markierung beim Löschen des ersten Vornamens auf den nächsten).
 * `undefined` = die Markierung entfällt; `'keine_ausrichtung'` = keine Seite passt, die Textsuche
 * entscheidet. Gegenposition „Index im Bereich gewinnt" s. docs/80 §33 V-130-11e-1. */
function ausgerichtetePosition(einheiten: readonly string[], basis: readonly string[], index: number): number | undefined | 'keine_ausrichtung' {
  if (index < 0 || index >= basis.length) return 'keine_ausrichtung'
  const hintenAnzahl = basis.length - index - 1
  const vorneGleich = index <= einheiten.length && gleicheWoerter(einheiten.slice(0, index), basis.slice(0, index))
  const hintenGleich = hintenAnzahl <= einheiten.length && gleicheWoerter(einheiten.slice(einheiten.length - hintenAnzahl), basis.slice(index + 1))
  if (vorneGleich && hintenGleich && einheiten.length < basis.length) return undefined
  if (vorneGleich) return index < einheiten.length ? index : undefined
  if (hintenGleich) {
    const vonHinten = einheiten.length - hintenAnzahl - 1
    return vonHinten >= 0 ? vonHinten : undefined
  }
  return 'keine_ausrichtung'
}

/** A-02, AP-1.30 (Fix Rufname-Anhängen): Beim Bearbeiten einer bestehenden Zeile MARKIERT der Rufname
 * nur einen vorhandenen Vornamen (docs/20_Domaenenwissen.md §24). Ein Rufname, der keinem Vornamen
 * gleicht, geht NICHT als `rufnameText` hinaus — `zerlegeName` hängte ihn sonst als zusätzlichen
 * Vornamen an, und der Autosave schreibt Zwischenstände: jeder bliebe als Vorname stehen („Karl
 * Friedrich F Fr Fri", bzw. nach umgeschriebenen Vornamen der alte Rufname hinten dran). Das Anhängen
 * bleibt dem einmaligen Anlegen/Import vorbehalten (`nameAnlegenEinAusEintrag`, `zerlegeName`) — mit
 * EINER Ausnahme: ein bereits angehängter mehrwortiger Rufname (`vornamenEinheiten`) geht so hinaus,
 * wie er entstand (Vornamen ohne ihn + `rufnameText`), damit `zerlegeName` ihn wieder als EINEN
 * markierten Bestandteil anlegt, statt ihn in Wörter zu zerlegen und die Markierung zu verlieren. */
function rufnameFuerAenderung(eintrag: NamenEintragWerte): {
  readonly vornamen: string | undefined
  readonly rufnameText: string | undefined
  readonly rufnameIndex: number | undefined
} {
  const vornamen = textOderUndefined(eintrag.vornamen)
  const position = rufnamePosition(eintrag)
  if (position === undefined) return { vornamen, rufnameText: undefined, rufnameIndex: undefined }
  const { einheiten, rufnameAngehaengt } = vornamenEinheiten(eintrag)
  const rufnameText = einheiten[position]
  if (rufnameAngehaengt && position === einheiten.length - 1) {
    const davor = einheiten.slice(0, -1).join(' ')
    return { vornamen: davor === '' ? undefined : davor, rufnameText, rufnameIndex: undefined }
  }
  return { vornamen, rufnameText, rufnameIndex: position }
}

/** Auswahlwert des Rufname-Felds einer bestehenden Zeile: die Vornamen-Position als Zeichenkette,
 * `''` = kein Rufname angegeben. */
export function rufnameAuswahlWert(eintrag: NamenEintragWerte): string {
  const position = rufnamePosition(eintrag)
  return position === undefined ? '' : String(position)
}

/** Die wählbaren Rufnamen einer bestehenden Zeile: je Vorname (in Reihenfolge) seine Position. */
export function rufnameAuswahlVornamen(eintrag: NamenEintragWerte): readonly { readonly wert: string; readonly vorname: string }[] {
  return vornamenEinheiten(eintrag).einheiten.map((vorname, position) => ({ wert: String(position), vorname }))
}

/** Übernimmt eine Rufname-Auswahl (`rufnameAuswahlWert`) in den Eintrag: Position und Text zugleich,
 * damit auch bei gleichlautenden Vornamen („Johann Georg Johann") genau der gewählte markiert wird. Die
 * Einheiten, aus denen gewählt wurde, werden die neue Basis der Ausrichtung (V-130-11e-1). */
export function mitRufnameAusAuswahl(eintrag: NamenEintragWerte, wert: string): NamenEintragWerte {
  const position = Number(wert)
  const { einheiten } = vornamenEinheiten(eintrag)
  const vorname = wert === '' ? undefined : einheiten[position]
  return vorname === undefined
    ? { ...eintrag, rufname: '', rufnameIndex: null, rufnameBasis: einheiten }
    : { ...eintrag, rufname: vorname, rufnameIndex: position, rufnameBasis: einheiten }
}

/** Der Vorname, den der Rufname markiert (Text an der Stelle aus `rufnamePosition`), sonst `''`. Der
 * mitgetragene `rufname` kann nach der Ausrichtung an der Basis veraltet sein („Friedrich" zu „Karl
 * Friedric"); wer anlegt, schickt darum diesen Text, sonst hinge `zerlegeName` den alten als weiteren
 * Vornamen an (V-130-11e-1). */
export function markierterRufname(eintrag: NamenEintragWerte): string {
  const position = rufnamePosition(eintrag)
  return position === undefined ? '' : (vornamenEinheiten(eintrag).einheiten[position] ?? '')
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
    vatersname: textOderUndefined(eintrag.vatersname),
    rufnameText: textOderUndefined(eintrag.rufname),
  }
}

/** Die in der Maske bearbeitbaren Felder und ihr Vertragsname in `name.aendern` (AP-1.30 PR 4). */
const MASKENFELD_ZU_VERTRAGSFELD: readonly (readonly [keyof NamenEintragWerte, NameAendernFeld])[] = [
  ['typ', 'typ'],
  ['schrift', 'schrift'],
  ['vornamen', 'vornamen'],
  ['nachname', 'nachname'],
  ['praefix', 'praefix'],
  ['titelVor', 'titelVor'],
  ['zusatzNach', 'zusatzNach'],
  ['rufname', 'rufnameText'],
  ['vatersname', 'vatersname'],
]

/** AP-1.30 PR 4 (Autosave-Koaleszenz): unterscheiden sich `vorher` (zuletzt gelesen) und `nachher`
 * (Bearbeitungszustand) in GENAU einem Maskenfeld, dessen Vertragsname — sonst `undefined`. Der
 * Autosave schickt ihn als `feld` mit; nur dann fasst der Bus schnelle Folgeänderungen zu einem
 * Undo-Schritt zusammen (und prüft dort noch einmal gegen den gespeicherten Stand). */
export function geaendertesNamensFeld(vorher: NamenEintragWerte, nachher: NamenEintragWerte): NameAendernFeld | undefined {
  const geaendert = MASKENFELD_ZU_VERTRAGSFELD.filter(([maske]) => vorher[maske] !== nachher[maske])
  const einziges = geaendert[0]
  return geaendert.length === 1 && einziges !== undefined ? einziges[1] : undefined
}

/** `name.aendern` ersetzt die ganze Form — darum JEDES Vertragsfeld, auch die nicht angezeigten
 * (AP-1.30 PR 2a). `istBevorzugt` fehlt bewusst: der Befehl ignoriert es (Hauptname-Wechsel über
 * `befehl:hauptname.wechseln`, AP-1.33). `feld` (AP-1.30 PR 4) nur, wenn der Aufrufer das eine
 * geänderte Feld kennt (`geaendertesNamensFeld`). */
export function nameAendernEinAusEintrag(id: string, eintrag: NamenEintragWerte, feld?: NameAendernFeld): NameAendernEin {
  return {
    ...(feld === undefined ? {} : { feld }),
    id,
    typ: eintrag.typ,
    schrift: eintrag.schrift ?? undefined,
    ...rufnameFuerAenderung(eintrag),
    nachname: textOderUndefined(eintrag.nachname),
    praefix: textOderUndefined(eintrag.praefix),
    titelVor: textOderUndefined(eintrag.titelVor),
    zusatzNach: textOderUndefined(eintrag.zusatzNach),
    vatersname: textOderUndefined(eintrag.vatersname),
    umschriftVon: eintrag.umschriftVon ?? undefined,
    umschriftNorm: eintrag.umschriftNorm ?? undefined,
    sprache: eintrag.sprache ?? undefined,
    gueltigVon: eintrag.gueltigVon ?? undefined,
    gueltigBis: eintrag.gueltigBis ?? undefined,
    originalText: eintrag.originalTextWortgetreu ?? undefined,
  }
}

/** Gate für die „Hinzufügen"-Schaltfläche des Neu-Formulars: mindestens EIN Textfeld muss
 * tatsächlich Inhalt tragen, sonst legt ein Klick eine vollständig leere `name`-Zeile an, die im
 * Lesezweig keinen Anzeigenamen ergäbe (Leerzustand-Falle, C-04). */
export function namenEintragHatInhalt(eintrag: NamenEintragWerte): boolean {
  return [eintrag.vornamen, eintrag.nachname, eintrag.praefix, eintrag.titelVor, eintrag.zusatzNach, eintrag.vatersname, eintrag.rufname].some(
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

/** EIN weiterer Beteiligter im Neu-Formular, zusätzlich zur aktuellen Profilperson (die IMMER
 * mitgeschickt wird — am Tod als `verstorbener`, sonst als `hauptperson`, s.
 * `ereignisAnlegenEinAusEntwurf`). `personId` ist `null`, bis
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
 * selbst neu zu berechnen — dieselbe Grenze, die `Datumsfeld` bereits mitbringt. Gebaut von der
 * gemeinsamen `datumswertAusText` (`datumsfeld-logik.ts`, inkl. `original_text`-Regel, U-130-9b). */
export function ereignisDatumwertAusEntwurf(text: string, kalender: Kalender): VertragsDatumswert | undefined {
  return datumswertAusText(text, kalender)
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

/** Baut `befehl:ereignis.anlegen` — `personId` (die aktuelle Profilperson) IMMER zuerst, mit
 * Rolle `verstorbener` bei `typ === 'tod'`, sonst `hauptperson` (Migration 0009 stellt den Bestand
 * gleich um; die Geburt bleibt `hauptperson`, docs/80 V-E4-geburt), danach alle aufgelösten
 * weiteren Beteiligten (Variante A, EIN Aufruf für alle Beteiligten). `null`, wenn `ereignisEntwurfAbsendbar` nicht zutrifft — der Aufrufer ruft
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
      { personId, rolle: entwurf.typ === 'tod' ? 'verstorbener' : 'hauptperson' },
      ...entwurf.weitereBeteiligte.filter(weitererBeteiligterAufgeloest).map((eintrag) => ({ personId: eintrag.personId, rolle: eintrag.rolle })),
    ],
    konfidenz,
  }
}
