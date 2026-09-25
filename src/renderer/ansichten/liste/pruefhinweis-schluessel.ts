// AP-1.8 (F-07): i18n-Schlüsselzuordnung für den Prüfhinweis-Code — ein `switch` mit
// vollständiger Abdeckung, analog `src/renderer/ansichten/profil/profil-schluessel.ts`: ein
// künftig ergänzter Code in `src/core/plausibilitaet/regeln.ts` (gespiegelt in
// `PruefhinweisEintrag['code']`, `src/shared/schemata/pruefhinweise.ts`) erzeugt hier einen
// Typfehler, keinen stillen Fall (`pnpm typen` fängt das). Reines TypeScript, kein JSX.
import type { PruefhinweisEintrag } from '../../../shared/schemata/pruefhinweise'

export function pruefhinweisCodeSchluessel(code: PruefhinweisEintrag['code']): string {
  switch (code) {
    case 'tod_vor_geburt':
      return 'code_tod_vor_geburt'
    case 'bestattung_vor_tod':
      return 'code_bestattung_vor_tod'
    case 'mutter_alter':
      return 'code_mutter_alter'
    case 'vater_alter':
      return 'code_vater_alter'
    case 'kind_vor_ehe':
      return 'code_kind_vor_ehe'
    case 'alter_ueber_110':
      return 'code_alter_ueber_110'
    case 'zyklus':
      return 'code_zyklus'
    case 'ereignis_vor_ortsexistenz':
      return 'code_ereignis_vor_ortsexistenz'
    case 'ort_mit_datum':
      return 'code_ort_mit_datum'
  }
}

/** Handlungsanweisung zum Code, wo eine nötig ist (Vorarbeiten AP-1.30 Teil 3, E5: bei
 * `ort_mit_datum` ist ohne sie unklar, wohin das Datum gehört); sonst `null` — die übrigen Codes
 * benennen den Widerspruch bereits selbst. Ebenfalls vollständiger `switch`. */
export function pruefhinweisWasTunSchluessel(code: PruefhinweisEintrag['code']): string | null {
  switch (code) {
    case 'ort_mit_datum':
      return 'code_ort_mit_datum_was_tun'
    case 'tod_vor_geburt':
    case 'bestattung_vor_tod':
    case 'mutter_alter':
    case 'vater_alter':
    case 'kind_vor_ehe':
    case 'alter_ueber_110':
    case 'zyklus':
    case 'ereignis_vor_ortsexistenz':
      return null
  }
}
