import { KonfidenzPunkt, type KonfidenzStufe } from './konfidenz-punkt'
import './konfidenzwaehler.css'

const KONFIDENZ_STUFEN: readonly KonfidenzStufe[] = [1, 2, 3, 4]

export interface KonfidenzwaehlerProps {
  /** `null` = kein Vorgabewert (§3.4: „Kein Vorgabewert bei einer neuen Aussage" — der Kontext
   * setzt ihn, nicht diese Komponente). */
  readonly wert: KonfidenzStufe | null
  readonly aufAenderung: (stufe: KonfidenzStufe) => void
  readonly gesperrt?: boolean
  /** Zugänglicher Gruppenname (vom Aufrufer über i18n, ADR-011) — z. B. „Konfidenz: Geburtsdatum". */
  readonly ariaLabel: string
}

/**
 * `Konfidenzwaehler` — Molekül (docs/71_Designsystem.md §2.2/§3.4): vier `KonfidenzPunkt` als
 * Gruppe. **Kein** `Auswahlfeld` — die Skala ist ordinal und soll als Skala aussehen, darum eine
 * `role="radiogroup"` aus vier `role="radio"`-Knöpfen statt eines `<select>`. Bedeutung nie allein
 * über Farbe (§1.2 Regel 4): die zweite Kodierung ist die Reihenfolge (vier feste Positionen) plus
 * die Beschriftung, die `KonfidenzPunkt` selbst über `aria-label`/`title` trägt (sichtbar beim
 * Überfahren als natives Tooltip) — dieses Molekül fügt keine dritte, konkurrierende Beschriftung
 * hinzu, sondern lässt den Knopf selbst `aria-checked` tragen. Trefferfläche ≥32×32 direkt auf dem
 * `<button>` (derselbe einfache Weg wie `.wz-schaltflaeche`, `schaltflaeche.css` — kein
 * ausgemessenes kleineres Entwurfsmaß dokumentiert, das ein `::before`-Muster wie bei
 * `Kontrollkaestchen`/`Umschalter` nötig machen würde, AP-1.28 Checkpoint 1).
 */
export function Konfidenzwaehler({ wert, aufAenderung, gesperrt = false, ariaLabel }: KonfidenzwaehlerProps) {
  return (
    <div className="wz-konfidenzwaehler" role="radiogroup" aria-label={ariaLabel}>
      {KONFIDENZ_STUFEN.map((stufe) => {
        const gewaehlt = wert === stufe
        return (
          <button
            key={stufe}
            type="button"
            role="radio"
            aria-checked={gewaehlt}
            className={`wz-konfidenzwaehler__stufe${gewaehlt ? ' wz-konfidenzwaehler__stufe--gewaehlt' : ''}`}
            disabled={gesperrt}
            onClick={() => aufAenderung(stufe)}
          >
            <KonfidenzPunkt stufe={stufe} />
          </button>
        )
      })}
    </div>
  )
}
