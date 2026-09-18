import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersonListeZeile } from '../../shared/schemata/person-liste'
import { lebensdatenAnzeige } from './datentabelle-format'
import { spaltenRasterVorlage, type DatentabelleSpalte } from './datentabelle-spalten'
import { KonfidenzPunkt, type KonfidenzStufe } from './konfidenz-punkt'
import { Text } from './text'
import { WiderspruchZeichen } from './widerspruch-zeichen'
import './tabellenzeile.css'

export interface TabellenzeileProps {
  readonly zeile: PersonListeZeile
  readonly spalten: readonly DatentabelleSpalte[]
  readonly ausgewaehlt?: boolean
  /** Explizit `| undefined` (`exactOptionalPropertyTypes`): `Datentabelle` reicht ihren eigenen
   * optionalen `aufZeileAusgewaehlt`-Prop unverändert durch. */
  readonly aufAusgewaehlt?: ((personId: string) => void) | undefined
  /** 1-basiert, Kopfzeile mitgezählt (ARIA-Tabellenmuster) — wichtig bei Virtualisierung, weil nie
   * alle Zeilen gleichzeitig im DOM stehen und ein Screenreader sonst nicht weiß, wo er ist. */
  readonly ariaRowIndex?: number
}

/** `konfidenz_min` kommt aus der Datenbank als `number | null` — hier auf die geschlossene
 * `KonfidenzStufe`-Union geprüft, statt sie ungeprüft weiterzureichen (kein `as`, CLAUDE.md §4). */
function konfidenzStufe(wert: number | null): KonfidenzStufe | null {
  switch (wert) {
    case 1:
    case 2:
    case 3:
    case 4:
      return wert
    default:
      return null
  }
}

/**
 * `Tabellenzeile` — Molekül (docs/71_Designsystem.md §2.2), drei Zustände: normal · ausgewählt ·
 * Platzhalter (gestrichelt). Platzhalterzeilen zeigen **nie** `anzeigename` (A-17) — unabhängig
 * davon, was der Abfragevertrag dort liefert, ist die Anzeige hier bewusst generisch.
 */
export function Tabellenzeile({ zeile, spalten, ausgewaehlt = false, aufAusgewaehlt, ariaRowIndex }: TabellenzeileProps) {
  const { t } = useTranslation('liste')
  const anklickbar = aufAusgewaehlt !== undefined
  const stufe = konfidenzStufe(zeile.konfidenz_min)

  function klick() {
    aufAusgewaehlt?.(zeile.person_id)
  }

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Enter' || ereignis.key === ' ') {
      ereignis.preventDefault()
      klick()
    }
  }

  return (
    <div
      role="row"
      aria-selected={ausgewaehlt}
      aria-rowindex={ariaRowIndex}
      className={`wz-tabellenzeile${zeile.ist_platzhalter ? ' wz-tabellenzeile--platzhalter' : ''}${ausgewaehlt ? ' wz-tabellenzeile--ausgewaehlt' : ''}`}
      style={{ gridTemplateColumns: spaltenRasterVorlage(spalten) }}
      tabIndex={anklickbar ? 0 : undefined}
      onClick={anklickbar ? klick : undefined}
      onKeyDown={anklickbar ? tastendruck : undefined}
    >
      {spalten.includes('name') ? (
        <span role="gridcell" className="wz-tabellenzeile__zelle">
          <Text rolle="koerper" farbe={zeile.ist_platzhalter ? 'tertiaer' : 'primaer'}>
            {zeile.ist_platzhalter ? t('platzhalter_bezeichnung') : zeile.anzeigename}
          </Text>
        </span>
      ) : null}

      {spalten.includes('lebensdaten') ? (
        <span role="gridcell" className="wz-tabellenzeile__zelle">
          <Text rolle="zahl-tabelle">{lebensdatenAnzeige(zeile.geburt_jahr, zeile.tod_jahr)}</Text>
        </span>
      ) : null}

      {spalten.includes('geburtsort') ? (
        <span role="gridcell" className="wz-tabellenzeile__zelle">
          <Text rolle="koerper-klein">{zeile.geburt_ort_name ?? ''}</Text>
        </span>
      ) : null}

      {spalten.includes('konfidenz') ? (
        <span role="gridcell" className="wz-tabellenzeile__zelle wz-tabellenzeile__zelle--konfidenz">
          {stufe !== null ? <KonfidenzPunkt stufe={stufe} /> : null}
          {zeile.hat_widerspruch ? <WiderspruchZeichen /> : null}
        </span>
      ) : null}
    </div>
  )
}
