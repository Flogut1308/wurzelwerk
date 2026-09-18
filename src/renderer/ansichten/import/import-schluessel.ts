// AP-1.4b: Abbildung eines IMP-Befundcodes (`IMP-101`, mit Bindestrich, `src/shared/import/imp-codes.ts`)
// auf den i18n-Unterschlüssel im Namespace `import` (`fehler.IMP_101`, mit Unterstrich — JSON-
// Schlüssel dürfen keinen Bindestrich in der Punktnotation tragen). Dieselbe Idee wie
// `profil-schluessel.ts`: eine geschlossene, testbare Schalter-/Tabellenfunktion statt eines
// Literals im JSX (§4). Die drei Teilschlüssel sind `.titel`, `.beschreibung`, `.was_tun`
// (vgl. `src/shared/i18n/de/import.json`).
import type { ImpCode } from '../../../shared/import/imp-codes'

/** Basis-Schlüssel eines Befunds im `import`-Namespace, z. B. `fehler.IMP_206`. */
export function impCodeSchluessel(code: ImpCode): string {
  return `fehler.${code.replace('-', '_')}`
}
