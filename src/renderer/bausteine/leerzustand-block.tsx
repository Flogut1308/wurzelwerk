import { Schaltflaeche } from './schaltflaeche'
import { Symbol } from './symbol'
import type { SymbolName } from '../gestaltung/symbole/namen'
import { Text } from './text'
import './leerzustand-block.css'

export interface LeerzustandBlockAktion {
  readonly beschriftung: string
  readonly aufKlick: () => void
}

export interface LeerzustandBlockProps {
  /** Sichtbarer Titel — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly titel: string
  /** Erklärender Satz, optional. */
  readonly text?: string
  /** Z. B. „Filter zurücksetzen" (S-05: „leer (Filter ohne Treffer) mit ‚Filter zurücksetzen'").
   * Explizit `| undefined`, weil Aufrufer den Wert oft bedingt zusammensetzen
   * (`exactOptionalPropertyTypes`, wie `PersonListeFilter.konfidenzMin`). */
  readonly aktion?: LeerzustandBlockAktion | undefined
  /** Symbol über dem Titel (S-19 „Symbol + Satz + Aktion", AP-1.11-Nachzug zur AP-1.6-Abweichung
   * U-1.6-leerzustand-ohne-symbol) — dekorativ, der Titel trägt die Bedeutung bereits als Text. */
  readonly symbol?: SymbolName
}

/**
 * `LeerzustandBlock` — Molekül (docs/71_Designsystem.md §2.2: „Symbol + Satz + Aktion"). Das
 * Symbol ist seit AP-1.11 optional (Nachzug zu `docs/80_Offene_Fragen.md` U-1.6-leerzustand-ohne-
 * symbol, das die frühere Abweichung „ohne Symbol" begründet — der Symbolsatz aus §6 war zu diesem
 * Zeitpunkt noch nicht ausgeliefert). Ohne `symbol` bleibt der Block wie bisher: Satz und Aktion
 * tragen die Bedeutung allein.
 */
export function LeerzustandBlock({ titel, text, aktion, symbol }: LeerzustandBlockProps) {
  return (
    <div className="wz-leerzustand-block">
      {symbol !== undefined ? <Symbol name={symbol} groesse={24} /> : null}
      <Text rolle="titel-klein" als="h2">
        {titel}
      </Text>
      {text !== undefined ? (
        <Text rolle="hilfe" als="p">
          {text}
        </Text>
      ) : null}
      {aktion !== undefined ? (
        <Schaltflaeche variante="sekundaer" aufKlick={aktion.aufKlick}>
          {aktion.beschriftung}
        </Schaltflaeche>
      ) : null}
    </div>
  )
}
