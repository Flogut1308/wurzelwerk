import type { SchaltflaecheVariante } from './schaltflaeche'
import './schaltflaeche.css'
import { Symbol } from './symbol'
import type { SymbolName } from '../gestaltung/symbole/namen'
import './schaltflaeche-symbol.css'

export interface SchaltflaecheSymbolProps {
  readonly name: SymbolName
  readonly variante?: SchaltflaecheVariante
  readonly gesperrt?: boolean
  readonly ladend?: boolean
  readonly aufKlick?: () => void
  /** Zugänglicher Name — IMMER vom Aufrufer über i18n befüllt (ADR-011). Ohne sichtbaren Text ist
   * das `aria-label` des Knopfs der einzige Name, den ein Screenreader vorliest. */
  readonly beschriftung: string
}

/**
 * `SchaltflaecheSymbol` — Atom (docs/71_Designsystem.md §2.1): dieselben vier Varianten und sechs
 * Zustände wie `Schaltflaeche` (Wiederverwendung derselben CSS-Klassen, `schaltflaeche.css`), aber
 * genau EIN `Symbol` statt Text — der zugängliche Name kommt vom Knopf selbst (`aria-label`), das
 * `Symbol` bleibt darum dekorativ (kein `titel`, kein doppelter Name).
 */
export function SchaltflaecheSymbol({ name, variante = 'sekundaer', gesperrt = false, ladend = false, aufKlick, beschriftung }: SchaltflaecheSymbolProps) {
  return (
    <button
      type="button"
      className={`wz-schaltflaeche wz-schaltflaeche--${variante} wz-schaltflaeche-symbol`}
      disabled={gesperrt || ladend}
      aria-busy={ladend}
      aria-label={beschriftung}
      onClick={aufKlick}
    >
      <Symbol name={name} groesse={20} />
    </button>
  )
}
