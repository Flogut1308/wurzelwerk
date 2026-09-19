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
  }
}
