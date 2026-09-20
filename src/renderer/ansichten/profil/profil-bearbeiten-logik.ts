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
import type { NameAendernEin, NameAnlegenEin, PersonFeldSetzenEin } from '../../../shared/schemata/befehle'
import type { NameTypEnum, SchriftEnum } from '../../../shared/schemata/name'
import type { GeschlechtEnum, PlatzhalterGrundEnum } from '../../../shared/schemata/person'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import type { KontrollkaestchenZustand } from '../../bausteine/kontrollkaestchen'

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
