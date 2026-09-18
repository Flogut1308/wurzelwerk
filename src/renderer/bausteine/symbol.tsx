import { SYMBOLE_FILL, SYMBOLE_REGULAR } from '../gestaltung/symbole/registrierung.generiert'
import type { SymbolName } from '../gestaltung/symbole/namen'
import './symbol.css'

/** Drei Größen aus docs/71_Designsystem.md §2.1. */
export type SymbolGroesse = 16 | 20 | 24
export type SymbolGewicht = 'regular' | 'fill'

export interface SymbolProps {
  readonly name: SymbolName
  readonly groesse?: SymbolGroesse
  /** Grundgewicht Regular, Fill nur für ausgewählte/aktive Zustände (ADR-027). */
  readonly gewicht?: SymbolGewicht
  /** Bedeutungstragend (das Symbol steht allein, ohne begleitenden Text) → `role="img"` +
   * `aria-label` (i18n vom Aufrufer). Ohne Angabe dekorativ: `aria-hidden="true"` — der Normalfall,
   * wenn eine sichtbare Beschriftung ohnehin danebensteht (z. B. `SchaltflaecheSymbol`). */
  readonly titel?: string
}

/**
 * `Symbol` — Atom (docs/71_Designsystem.md §2.1, AP-1.11, ADR-027). Inlined SVG aus der generierten
 * Registry über eine typisierte Namensliste (`SymbolName`) — ein Tippfehler ist ein Typfehler, kein
 * leeres Kästchen. `dangerouslySetInnerHTML` ist hier unbedenklich: der Inhalt kommt ausschließlich
 * aus `registrierung.generiert.ts` (eigener, versionierter, geprüfter Quellcode — `test/gestaltung/
 * symbole-sauber.test.ts` schließt `<script>`/externe Verweise aus), nie aus Nutzereingaben.
 * Größe und Farbe kommen aus Tokens (Größenklasse → `--wz-abstand-*`, Farbe → `currentColor`, das
 * die umgebende Textfarbe übernimmt) statt aus Festwerten.
 */
export function Symbol({ name, groesse = 20, gewicht = 'regular', titel }: SymbolProps) {
  const markup = gewicht === 'fill' ? SYMBOLE_FILL[name] : SYMBOLE_REGULAR[name]
  const klasse = `wz-symbol wz-symbol--${String(groesse)}`

  if (titel === undefined) {
    return <span className={klasse} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
  }
  return <span className={klasse} role="img" aria-label={titel} dangerouslySetInnerHTML={{ __html: markup }} />
}
