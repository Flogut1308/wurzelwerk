// AP-1.17 PR-C1: i18n-Schlüsselzuordnungen für die Quelle/Zitat/Archiv-Pflege-Ansicht, in einer
// eigenen `.ts`-Datei statt JSX-Inline-Schaltern (analog `profil-schluessel.ts` — ein `switch` mit
// vollständiger Abdeckung, damit ein künftiger Enum-Wert hier einen Typfehler erzeugt, keinen
// stillen Fall). Reines TypeScript, kein JSX, kein DOM.
//
// `quelleTypSchluessel`/`unmittelbarkeitSchluessel` werden aus `profil-schluessel.ts`
// WIEDERVERWENDET (dieselbe Schalter-LOGIK, keine zweite Fallunterscheidung für dieselben zwei
// Enums) — die zurückgegebenen Schlüssel werden hier trotzdem gegen den EIGENEN `quellen`-
// Namespace aufgelöst (`quellen.json` führt dieselben Schlüsselnamen wie `profil.json`, exakt wie
// z. B. `entfernen`/`schliessen` bereits in mehreren Namespaces nebeneinander stehen) — kein
// Cross-Namespace-`t()`-Aufruf in `quelle-bearbeiten.tsx` nötig.
import type { z } from 'zod'
import type { InformationsartEnum, QuelleArtEnum, QuelleFormEnum } from '../../../shared/schemata/quelle'

export { quelleTypSchluessel, unmittelbarkeitSchluessel } from '../profil/profil-schluessel'

/** `quelle.art` (§2.7: original/derivat/verfasst). */
export function quelleArtSchluessel(art: z.infer<typeof QuelleArtEnum>): string {
  switch (art) {
    case 'original':
      return 'quelle_art_original'
    case 'derivat':
      return 'quelle_art_derivat'
    case 'verfasst':
      return 'quelle_art_verfasst'
  }
}

/** `quelle.informationsart` (§2.7: primaer/sekundaer/unbestimmt). */
export function informationsartSchluessel(wert: z.infer<typeof InformationsartEnum>): string {
  switch (wert) {
    case 'primaer':
      return 'informationsart_primaer'
    case 'sekundaer':
      return 'informationsart_sekundaer'
    case 'unbestimmt':
      return 'informationsart_unbestimmt'
  }
}

/** `quelle.form` (§2.15, mündlich-Block: gespraech/telefonat/brief/email/audio/video). */
export function quelleFormSchluessel(form: z.infer<typeof QuelleFormEnum>): string {
  switch (form) {
    case 'gespraech':
      return 'quelle_form_gespraech'
    case 'telefonat':
      return 'quelle_form_telefonat'
    case 'brief':
      return 'quelle_form_brief'
    case 'email':
      return 'quelle_form_email'
    case 'audio':
      return 'quelle_form_audio'
    case 'video':
      return 'quelle_form_video'
  }
}
