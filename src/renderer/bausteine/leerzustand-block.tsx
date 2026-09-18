import { Schaltflaeche } from './schaltflaeche'
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
  /** Z. B. „Filter zurücksetzen" (S-05: „leer (Filter ohne Treffer) mit ‚Filter zurücksetzen'"). */
  readonly aktion?: LeerzustandBlockAktion
}

/**
 * `LeerzustandBlock` — Molekül (docs/71_Designsystem.md §2.2: „Symbol + Satz + Aktion").
 *
 * ABWEICHUNG (CLAUDE.md §14 Fall 1): ohne Symbol. Der Symbolsatz aus §6 ist ein Phase-0-Asset, das
 * noch nicht ausgeliefert ist (siehe Kopfkommentar `widerspruch-zeichen.css`/`suchfeld.css`) — ein
 * erfundenes Icon wäre eine neue visuelle Sprache, die §14 ausdrücklich verbietet. Satz und Aktion
 * tragen die Bedeutung allein, bis ein Symbolsatz existiert.
 */
export function LeerzustandBlock({ titel, text, aktion }: LeerzustandBlockProps) {
  return (
    <div className="wz-leerzustand-block">
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
