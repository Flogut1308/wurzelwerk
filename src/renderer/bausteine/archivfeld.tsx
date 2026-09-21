import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ArchivTreffer } from '../../shared/schemata/archiv-suche'
import { Eingabekoerper } from './eingabekoerper'
import { archivfeldNaechsterIndex, archivfeldZeileAktivieren, archivfeldZeilenAufbauen, type ArchivfeldZeile } from './archivfeld-logik'
import { Text } from './text'
import './archivfeld.css'

export type ArchivfeldZustand = 'leer' | 'laedt' | 'bereit'

export interface ArchivfeldProps {
  /** Die rohe Sucheingabe. */
  readonly text: string
  readonly aufAenderung: (text: string) => void
  /** `'leer'`: noch nichts eingegeben, kein Listbox. `'laedt'`: `abfrage:archiv.suche` läuft (der
   * Aufrufer verdrahtet `useArchivSuche`, `src/renderer/brücke/abfrage-hooks.ts`). `'bereit'`:
   * `treffer` ist das aktuelle Ergebnis (auch bei 0 Treffern). */
  readonly zustand: ArchivfeldZustand
  /** `ArchivSucheAus.treffer` unverändert (`src/shared/schemata/archiv-suche.ts`) — keine eigene
   * Suchlogik im Baustein. */
  readonly treffer: readonly ArchivTreffer[]
  /** Vollständig kontrolliert wie jeder Baustein hier (kein `useState`) — der Aufrufer hält den
   * per Pfeiltaste hervorgehobenen Index. `null` = nichts hervorgehoben. */
  readonly hervorgehobenerIndex: number | null
  readonly aufHervorgehobenerIndexAenderung?: (index: number | null) => void
  /** Ein Treffer wurde gewählt (Klick oder Enter auf der hervorgehobenen Zeile). */
  readonly aufAusgewaehlt: (archivId: string) => void
  /** Schlusszeile „... als neues Archiv anlegen" — der Aufrufer ruft
   * `useArchivAnlegen().mutate(archivfeldNeuAnlegenEin(text))` (`archivfeld-logik.ts`). */
  readonly aufNeuAnlegen: () => void
  readonly gesperrt?: boolean
  /** Zugänglicher Name des Suchfelds, wenn keine sichtbare Beschriftung danebensteht (ADR-011). */
  readonly ariaLabel?: string
  readonly id?: string
}

/**
 * `Archivfeld` — Molekül (docs/71_Designsystem.md §2.2, AP-1.17 PR-C1): Eingabekörper +
 * Vorschlagsliste + eine feste Schlusszeile „... als neues Archiv anlegen" — die DRITTE Instanz
 * desselben Musters wie `Personenwaehler`/`Ortsfeld` (§3.2/§3.3), hier für die Archiv-Auswahl der
 * Quelle-Pflege-Ansicht (`quelle-bearbeiten.tsx`). KEIN neuer visueller Baustein (CLAUDE.md §14) —
 * dieselbe Form, nur an `abfrage:archiv.suche`/`befehl:archiv.anlegen` verdrahtet. Vollständig
 * kontrolliert, die eigentliche Verdrahtung liegt beim Aufrufer.
 */
export function Archivfeld({
  text,
  aufAenderung,
  zustand,
  treffer,
  hervorgehobenerIndex,
  aufHervorgehobenerIndexAenderung,
  aufAusgewaehlt,
  aufNeuAnlegen,
  gesperrt = false,
  ariaLabel,
  id,
}: ArchivfeldProps) {
  const { t } = useTranslation('felder')

  const zeilen: readonly ArchivfeldZeile[] = zustand === 'bereit' ? archivfeldZeilenAufbauen(treffer) : []
  const listboxId = id === undefined ? 'wz-archivfeld-liste' : `${id}-liste`

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (zustand !== 'bereit' || zeilen.length === 0) return
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(archivfeldNaechsterIndex(hervorgehobenerIndex, 'runter', zeilen.length))
    } else if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(archivfeldNaechsterIndex(hervorgehobenerIndex, 'hoch', zeilen.length))
    } else if (ereignis.key === 'Enter') {
      if (hervorgehobenerIndex === null) return
      const zeile = zeilen[hervorgehobenerIndex]
      if (zeile === undefined) return
      ereignis.preventDefault()
      archivfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })
    }
  }

  function zeileText(zeile: ArchivfeldZeile): string {
    switch (zeile.art) {
      case 'treffer':
        return zeile.treffer.name
      case 'neuAnlegen':
        return t('archivfeld_neu_anlegen', { text })
    }
  }

  function zeileSchluessel(zeile: ArchivfeldZeile): string {
    return zeile.art === 'treffer' ? zeile.treffer.id : zeile.art
  }

  return (
    <div className="wz-archivfeld" onKeyDown={tastendruck}>
      <Eingabekoerper
        typ="search"
        wert={text}
        aufAenderung={aufAenderung}
        platzhalter={t('archivfeld_platzhalter')}
        ariaLabel={ariaLabel ?? t('archivfeld_beschriftung')}
        gesperrt={gesperrt}
        {...(id === undefined ? {} : { id })}
      />
      {zustand === 'leer' ? null : (
        <ul id={listboxId} className="wz-archivfeld__liste" role="listbox" aria-label={t('archivfeld_beschriftung')}>
          {zustand === 'laedt' ? (
            <li className="wz-archivfeld__hinweis" role="presentation">
              <Text rolle="hilfe">{t('archivfeld_laedt')}</Text>
            </li>
          ) : null}
          {zustand === 'bereit' && treffer.length === 0 ? (
            <li className="wz-archivfeld__hinweis" role="presentation">
              <Text rolle="hilfe">{t('archivfeld_keine_treffer')}</Text>
            </li>
          ) : null}
          {zeilen.map((zeile, index) => (
            <li
              key={zeileSchluessel(zeile)}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === hervorgehobenerIndex}
              className={`wz-archivfeld__zeile wz-archivfeld__zeile--${zeile.art}${index === hervorgehobenerIndex ? ' wz-archivfeld__zeile--hervorgehoben' : ''}`}
              onMouseDown={(ereignis) => {
                ereignis.preventDefault()
                archivfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })
              }}
            >
              <Text rolle="koerper">{zeileText(zeile)}</Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
