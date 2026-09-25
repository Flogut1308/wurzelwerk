import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { OrtTreffer } from '../../shared/schemata/ort-suche'
import { Eingabekoerper } from './eingabekoerper'
import {
  ortsfeldGeltungszeitraum,
  ortsfeldHierarchieText,
  ortsfeldNaechsterIndex,
  ortsfeldZeileAktivieren,
  ortsfeldZeilenAufbauen,
  type OrtsfeldZeile,
} from './ortsfeld-logik'
import { Text } from './text'
import './ortsfeld.css'

export type OrtsfeldZustand = 'leer' | 'laedt' | 'bereit'

export interface OrtsfeldProps {
  /** Die rohe Sucheingabe. */
  readonly text: string
  readonly aufAenderung: (text: string) => void
  /** `'leer'`: noch nichts eingegeben, kein Listbox. `'laedt'`: `abfrage:ort.suche` läuft (der
   * Aufrufer verdrahtet `useOrtSuche`, `src/renderer/brücke/abfrage-hooks.ts`). `'bereit'`:
   * `treffer` ist das aktuelle Ergebnis (auch bei 0 Treffern). */
  readonly zustand: OrtsfeldZustand
  /** `OrtSucheAus.treffer` unverändert (`src/shared/schemata/ort-suche.ts`) — keine eigene
   * Suchlogik im Baustein. */
  readonly treffer: readonly OrtTreffer[]
  /** Vollständig kontrolliert wie jeder Baustein hier (kein `useState`) — der Aufrufer hält den
   * per Pfeiltaste hervorgehobenen Index. `null` = nichts hervorgehoben. Zählung über ALLE
   * sichtbaren Zeilen (Treffer + die feste Schlusszeile, `ortsfeldZeilenAufbauen`). */
  readonly hervorgehobenerIndex: number | null
  readonly aufHervorgehobenerIndexAenderung?: (index: number | null) => void
  /** Ein Treffer wurde gewählt (Klick oder Enter auf der hervorgehobenen Zeile). */
  readonly aufAusgewaehlt: (ortId: string) => void
  /** Schlusszeile „... als neuen Ort anlegen" (§3.2) — der Aufrufer ruft
   * `useOrtAnlegen().mutate(ortsfeldNeuAnlegenEin(text))` (`ortsfeld-logik.ts`). */
  readonly aufNeuAnlegen: () => void
  readonly gesperrt?: boolean
  /** Zugänglicher Name des Suchfelds, wenn keine sichtbare Beschriftung danebensteht (ADR-011). */
  readonly ariaLabel?: string
  readonly id?: string
  /** Das Suchfeld wird verlassen (Blur) — AP-1.30 PR 9b: ohne Auswahl stellt der Aufrufer den
   * gespeicherten Ort wieder her. Ein Klick auf einen Vorschlag löst keinen Blur aus (`mousedown`
   * mit `preventDefault`). */
  readonly aufVerlassen?: () => void
}

/**
 * `Ortsfeld` — Molekül (docs/71_Designsystem.md §2.2/§3.2, A-04). Eingabekörper + Vorschlagsliste
 * + eine feste Schlusszeile „... als neuen Ort anlegen". Vollständig kontrolliert wie jeder
 * Baustein hier — die eigentliche `abfrage:ort.suche`/`befehl:ort.anlegen`-Verdrahtung
 * (`src/renderer/brücke/*-hooks.ts`) liegt beim Aufrufer, analog `Personenwaehler`. Tastatur:
 * Pfeil-runter/-hoch bewegt `hervorgehobenerIndex` (mit Umlauf), Enter aktiviert die
 * hervorgehobene Zeile — EIN `onKeyDown`-Handler auf der Hülle genügt.
 *
 * §3.2 zeigt je Vorschlag zusätzlich die zum Datum gültige POLITISCHE Zugehörigkeitskette
 * (z. B. "Kreis Marienwerder · Westpreußen · Preußen", AP-1.16 PR-C) — bereits vom Hauptprozess
 * aufgelöst (`OrtTreffer.politischeKette`, `src/core/ort/zeitbezug.ts::hierarchieZuDatum`), kein
 * zweiter Auflösungsweg hier, nur die Verkettung zu EINER Zeile (`ortsfeldHierarchieText`). Die
 * Zeile erscheint nur, wenn die Kette nicht leer ist (kein `jdn` übergeben -> immer leer, s.
 * `OrtTreffer`-Kopfkommentar). Die KIRCHLICHE Kette bleibt der Detailansicht (`abfrage:ort.detail`)
 * vorbehalten — dieser Vorschlag zeigt nur EINE Kette, s. docs/80_Offene_Fragen.md.
 *
 * §3.2 verlangt außerdem ("Zwingend"): der zeitliche Geltungsbereich des Anzeigenamens steht
 * RECHTS neben jedem Vorschlag ("bis 1945"/"ab 1945"). Auch das kommt bereits berechnet vom
 * Hauptprozess (`OrtTreffer.gueltigVonJahr`/`gueltigBisJahr`,
 * `src/core/ort/zeitbezug.ts::geltungszeitraumJahre`) — `ortsfeldGeltungszeitraum` wählt hier nur
 * den passenden i18n-Schlüssel. Kein Zusatz, wenn der Name unbegrenzt gültig ist (beide Grenzen
 * offen).
 */
export function Ortsfeld({
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
  aufVerlassen,
}: OrtsfeldProps) {
  const { t } = useTranslation('felder')

  const zeilen: readonly OrtsfeldZeile[] = zustand === 'bereit' ? ortsfeldZeilenAufbauen(treffer) : []
  const listboxId = id === undefined ? 'wz-ortsfeld-liste' : `${id}-liste`

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (zustand !== 'bereit' || zeilen.length === 0) return
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(ortsfeldNaechsterIndex(hervorgehobenerIndex, 'runter', zeilen.length))
    } else if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(ortsfeldNaechsterIndex(hervorgehobenerIndex, 'hoch', zeilen.length))
    } else if (ereignis.key === 'Enter') {
      if (hervorgehobenerIndex === null) return
      const zeile = zeilen[hervorgehobenerIndex]
      if (zeile === undefined) return
      ereignis.preventDefault()
      ortsfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })
    }
  }

  function zeileText(zeile: OrtsfeldZeile): string {
    switch (zeile.art) {
      case 'treffer':
        return zeile.treffer.anzeigename
      case 'neuAnlegen':
        return t('ortsfeld_neu_anlegen', { text })
    }
  }

  function zeileSchluessel(zeile: OrtsfeldZeile): string {
    return zeile.art === 'treffer' ? zeile.treffer.id : zeile.art
  }

  /** Geltungszeitraum-Text rechts neben dem Treffer (docs/71 §3.2 "Zwingend": "bis 1945"/
   * "ab 1945") — `undefined`, wenn `ortsfeldGeltungszeitraum` keinen Zusatz liefert (unbegrenzt
   * gültig oder die feste Schlusszeile). */
  function zeileGeltungText(zeile: OrtsfeldZeile): string | undefined {
    if (zeile.art !== 'treffer') return undefined
    const geltung = ortsfeldGeltungszeitraum(zeile.treffer)
    return geltung === undefined ? undefined : t(geltung.schluessel, geltung.werte)
  }

  return (
    <div className="wz-ortsfeld" onKeyDown={tastendruck}>
      <Eingabekoerper
        typ="search"
        wert={text}
        aufAenderung={aufAenderung}
        platzhalter={t('ortsfeld_platzhalter')}
        ariaLabel={ariaLabel ?? t('ortsfeld_beschriftung')}
        gesperrt={gesperrt}
        {...(id === undefined ? {} : { id })}
        {...(aufVerlassen === undefined ? {} : { aufVerlassen })}
      />
      {zustand === 'leer' ? null : (
        <ul id={listboxId} className="wz-ortsfeld__liste" role="listbox" aria-label={t('ortsfeld_beschriftung')}>
          {zustand === 'laedt' ? (
            <li className="wz-ortsfeld__hinweis" role="presentation">
              <Text rolle="hilfe">{t('ortsfeld_laedt')}</Text>
            </li>
          ) : null}
          {zustand === 'bereit' && treffer.length === 0 ? (
            <li className="wz-ortsfeld__hinweis" role="presentation">
              <Text rolle="hilfe">{t('ortsfeld_keine_treffer')}</Text>
            </li>
          ) : null}
          {zeilen.map((zeile, index) => (
            <li
              key={zeileSchluessel(zeile)}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === hervorgehobenerIndex}
              className={`wz-ortsfeld__zeile wz-ortsfeld__zeile--${zeile.art}${index === hervorgehobenerIndex ? ' wz-ortsfeld__zeile--hervorgehoben' : ''}`}
              onMouseDown={(ereignis) => {
                ereignis.preventDefault()
                ortsfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })
              }}
            >
              <span className="wz-ortsfeld__zeile-inhalt">
                <Text rolle="koerper">{zeileText(zeile)}</Text>
                {zeile.art === 'treffer' && zeile.treffer.politischeKette.length > 0 ? (
                  <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                    {ortsfeldHierarchieText(zeile.treffer.politischeKette)}
                  </Text>
                ) : null}
              </span>
              {zeileGeltungText(zeile) === undefined ? null : (
                <span className="wz-ortsfeld__zeile-geltung">
                  <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                    {zeileGeltungText(zeile)}
                  </Text>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
