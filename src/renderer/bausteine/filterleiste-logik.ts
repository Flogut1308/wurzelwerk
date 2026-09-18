// AP-1.6 Stufe 3 (C-16/C-17): reine Umrechnungen zwischen `PersonListeFilter`
// (src/shared/schemata/person-liste.ts) und den Zuständen der Atome, die die `Filterleiste`
// zusammensetzt. Getrennt von der Komponente, damit die Zuordnung ohne React/DOM geprüft werden
// kann — genau die Stelle, an der ein Vorzeichenfehler (aus↔ein vertauscht) sonst erst beim Klicken
// auffiele.
import type { z } from 'zod'
import type { TristateFilterEnum } from '../../shared/schemata/person-liste'
import type { UmschalterZustand } from './umschalter'

export type TristateFilterWert = z.infer<typeof TristateFilterEnum>

/**
 * Platzhalter-/Privat-Filter als Tristate-`Umschalter` (71 §2.1/§3.4-Nachbarschaft). Reihenfolge
 * exakt wie im Kopfkommentar von `umschalter.tsx` dokumentiert: aus→ohne, ein→nur, unbestimmt→alle.
 */
const ZUSTAND_ZU_FILTER: Readonly<Record<UmschalterZustand, TristateFilterWert>> = {
  aus: 'ohne',
  ein: 'nur',
  unbestimmt: 'alle',
}
const FILTER_ZU_ZUSTAND: Readonly<Record<TristateFilterWert, UmschalterZustand>> = {
  ohne: 'aus',
  nur: 'ein',
  alle: 'unbestimmt',
}

export function tristateFilterZuZustand(wert: TristateFilterWert): UmschalterZustand {
  return FILTER_ZU_ZUSTAND[wert]
}

export function zustandZuTristateFilter(zustand: UmschalterZustand): TristateFilterWert {
  return ZUSTAND_ZU_FILTER[zustand]
}

/**
 * „Hat Widerspruch" ist im Vertrag ein einfaches `boolean` (`PersonListeFilter.nurWiderspruch`),
 * aber der Auftrag verlangt dafür denselben `Umschalter` wie für die Tristate-Filter (kein eigenes
 * zweites Kontrollelement für einen Sonderfall). Der `Umschalter` selbst kennt nur seinen eigenen
 * Drei-Zustands-Zyklus (aus→ein→unbestimmt→aus, `umschalter.tsx`) — die Filterleiste zeigt „aus"/
 * „ein" nur für `false`/`true` und wandelt den jeweils NÄCHSTEN Zustand aus dem Klick in `boolean`
 * um. Da `unbestimmt` nach `ein` kommt, ergibt „nächster Zustand ist ein" ein sauberes Umschalten:
 * aus(false) → Klick → ein(true) → Klick → unbestimmt→als false gelesen → aus(false) angezeigt.
 */
export function boolZuUmschalterZustand(wert: boolean): UmschalterZustand {
  return wert ? 'ein' : 'aus'
}

export function umschalterZustandZuBool(naechsterZustand: UmschalterZustand): boolean {
  return naechsterZustand === 'ein'
}

/** Konfidenz-Mindestwert (1–4 oder „keine Einschränkung") als Optionswert des `Auswahlfeld`-
 * Moleküls. `Auswahlfeld` verlangt eine String-Union (HTML-`<select>`-Werte sind immer Strings) —
 * `PersonListeFilter.konfidenzMin` ist dagegen `1 | 2 | 3 | 4 | undefined`. Ein vollständiger
 * `switch` statt einer `Number(wert) as …`-Umwandlung: kein `as` nötig (CLAUDE.md §4), und ein
 * künftiger fünfter Wert erzeugt hier einen Typfehler statt eines stillen Falls. */
export type KonfidenzFilterWert = 'alle' | '1' | '2' | '3' | '4'

export function konfidenzMinZuFilterWert(min: 1 | 2 | 3 | 4 | undefined): KonfidenzFilterWert {
  if (min === undefined) return 'alle'
  switch (min) {
    case 1:
      return '1'
    case 2:
      return '2'
    case 3:
      return '3'
    case 4:
      return '4'
  }
}

export function filterWertZuKonfidenzMin(wert: KonfidenzFilterWert): 1 | 2 | 3 | 4 | undefined {
  switch (wert) {
    case 'alle':
      return undefined
    case '1':
      return 1
    case '2':
      return 2
    case '3':
      return 3
    case '4':
      return 4
  }
}
