import { useTranslation } from 'react-i18next'
import './konfidenz-punkt.css'

/** Die vier Konfidenzstufen (E21, `docs/datenmodell.md` §2.16) — keine fünfte Stufe für
 * „widersprüchlich": das ist ein eigener, getrennter Zustand (`WiderspruchZeichen`). */
export type KonfidenzStufe = 1 | 2 | 3 | 4

export interface KonfidenzPunktProps {
  readonly stufe: KonfidenzStufe
}

/** i18n-Schlüssel je Stufe (wie `anbieterSchluessel` in `start-ansicht.tsx`): ein `switch` mit
 * vollständiger Abdeckung, damit eine fünfte Stufe hier einen Typfehler erzeugt, keinen stillen
 * Fall — statt einer dynamisch zusammengesetzten Schlüsselzeichenkette. */
function konfidenzSchluessel(stufe: KonfidenzStufe): string {
  switch (stufe) {
    case 1:
      return 'konfidenz_1'
    case 2:
      return 'konfidenz_2'
    case 3:
      return 'konfidenz_3'
    case 4:
      return 'konfidenz_4'
  }
}

/**
 * `KonfidenzPunkt` — Atom (§2.1): EIN Punkt für EINE Stufe, getrennt von `WiderspruchZeichen`
 * (§2.1: „wer daraus eine fünfte Konfidenzstufe macht, hat das Datenmodell missverstanden").
 */
export function KonfidenzPunkt({ stufe }: KonfidenzPunktProps) {
  const { t } = useTranslation('liste')
  const beschriftung = t(konfidenzSchluessel(stufe))
  return <span className={`wz-konfidenzpunkt wz-konfidenzpunkt--${stufe}`} role="img" aria-label={beschriftung} title={beschriftung} />
}
