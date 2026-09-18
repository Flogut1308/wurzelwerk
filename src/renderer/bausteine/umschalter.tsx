import './umschalter.css'

/** Drei sichtbare Zustände (der vierte, „gesperrt", ist ein eigenes Bool — §2.1). */
export type UmschalterZustand = 'ein' | 'aus' | 'unbestimmt'

/**
 * Klickreihenfolge aus·ein·unbestimmt·aus — passend zum tristaten Listenfilter
 * (`TristateFilterEnum` in `src/shared/schemata/person-liste.ts`: `ohne`→aus, `nur`→ein,
 * `alle`→unbestimmt „keine Einschränkung"). Die Reihenfolge ist reines Anzeigeverhalten dieses
 * Atoms, keine Fachregel — welcher Zustand welchen Filterwert bedeutet, entscheidet der Aufrufer.
 */
const NAECHSTER_ZUSTAND: Readonly<Record<UmschalterZustand, UmschalterZustand>> = {
  aus: 'ein',
  ein: 'unbestimmt',
  unbestimmt: 'aus',
}

export interface UmschalterProps {
  readonly zustand: UmschalterZustand
  /** Zugänglicher Name — vom Aufrufer über i18n befüllt (z. B. „Platzhalter", „Privat"). */
  readonly bezeichnung: string
  readonly gesperrt?: boolean
  readonly aufZustandGeaendert: (naechsterZustand: UmschalterZustand) => void
}

/**
 * `Umschalter` — Atom (§2.1): ein echtes Tristate-Element, kein zweiter Konfidenz-Ersatz.
 * `role="checkbox"` mit `aria-checked="mixed"` ist das dokumentierte ARIA-Muster für ein
 * Kontrollelement mit einem echten dritten, unbestimmten Zustand (nicht nur an/aus).
 */
export function Umschalter({ zustand, bezeichnung, gesperrt = false, aufZustandGeaendert }: UmschalterProps) {
  const ariaChecked = zustand === 'unbestimmt' ? 'mixed' : zustand === 'ein'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={bezeichnung}
      disabled={gesperrt}
      className={`wz-umschalter wz-umschalter--${zustand}`}
      onClick={() => aufZustandGeaendert(NAECHSTER_ZUSTAND[zustand])}
    >
      <span className="wz-umschalter__schieber" aria-hidden="true" />
    </button>
  )
}
