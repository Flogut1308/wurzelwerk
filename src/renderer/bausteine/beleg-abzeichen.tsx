import { useTranslation } from 'react-i18next'
import './beleg-abzeichen.css'

export interface BelegAbzeichenProps {
  readonly anzahl: number
  /** Ohne Angabe ein reines `role="img"` (nichts zu öffnen); mit Angabe ein `<button>`, der das
   * Belegdetail öffnet (S-08, `72_Screens_und_Flows.md`). */
  readonly aufKlick?: () => void
}

/**
 * `BelegAbzeichen` — Atom (docs/71_Designsystem.md §2.2 nennt „Belegabzeichen" als Molekül aus
 * Zähler+Konfidenzpunkt; hier bewusst nur der Zähler-Teil, weil `FeldKonfidenz`
 * (`feld-konfidenz.tsx`) den `KonfidenzPunkt` bereits separat davor setzt — dieselben drei Zeichen
 * am Feld, nur mit einer anderen internen Bauteilgrenze). Zeigt die Belegzahl (§1: „ein kleines
 * Symbol am Feld genügt: Anzahl Belege + Konfidenzfarbe") — bewusst auch bei `0`, weil „keine
 * Belege für diese Aussage" selbst eine Aussage ist, kein Grund, das Zeichen wegzulassen.
 */
export function BelegAbzeichen({ anzahl, aufKlick }: BelegAbzeichenProps) {
  const { t } = useTranslation('profil')
  const beschriftung = t('beleg_abzeichen_beschriftung', { anzahl })

  if (aufKlick === undefined) {
    return (
      <span className="wz-beleg-abzeichen" role="img" aria-label={beschriftung} title={beschriftung}>
        {anzahl}
      </span>
    )
  }
  return (
    <button type="button" className="wz-beleg-abzeichen wz-beleg-abzeichen--klickbar" onClick={aufKlick} aria-label={beschriftung} title={beschriftung}>
      {anzahl}
    </button>
  )
}
