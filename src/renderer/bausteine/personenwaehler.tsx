import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { SucheTreffer } from '../../shared/schemata/person-liste'
import { Eingabekoerper } from './eingabekoerper'
import { KonfidenzPunkt, type KonfidenzStufe } from './konfidenz-punkt'
import { personennameIstErsatz, personennameText } from './personenname-anzeige'
import {
  personenwaehlerLebensdatenText,
  personenwaehlerNaechsterIndex,
  personenwaehlerZeileAktivieren,
  personenwaehlerZeilenAufbauen,
  type PersonenwaehlerZeile,
} from './personenwaehler-logik'
import { Text } from './text'
import './personenwaehler.css'

export type PersonenwaehlerZustand = 'leer' | 'laedt' | 'bereit'

export interface PersonenwaehlerProps {
  /** Die rohe Sucheingabe. */
  readonly text: string
  readonly aufAenderung: (text: string) => void
  /** `'leer'`: noch nichts eingegeben, kein Listbox. `'laedt'`: `abfrage:suche` läuft (der
   * Aufrufer verdrahtet `useSuche`, `src/renderer/brücke/abfrage-hooks.ts`). `'bereit'`: `treffer`
   * ist das aktuelle Ergebnis (auch bei 0 Treffern). */
  readonly zustand: PersonenwaehlerZustand
  /** `SucheAus.treffer` unverändert (`src/shared/schemata/person-liste.ts`) — keine eigene
   * Suchlogik, derselbe Kanal wie die Liste (§3.3). */
  readonly treffer: readonly SucheTreffer[]
  /** Vollständig kontrolliert wie jeder Baustein hier (kein `useState`, s. `datumsfeld.tsx`
   * Kommentar zu `kalenderErweitert`): der Aufrufer hält den per Pfeiltaste hervorgehobenen Index.
   * `null` = nichts hervorgehoben. Zählung über ALLE sichtbaren Zeilen (Treffer + die zwei festen
   * Schlusszeilen, `personenwaehlerZeilenAufbauen`). */
  readonly hervorgehobenerIndex: number | null
  readonly aufHervorgehobenerIndexAenderung?: (index: number | null) => void
  /** Ein Treffer wurde gewählt (Klick oder Enter auf der hervorgehobenen Zeile). */
  readonly aufAusgewaehlt: (personId: string) => void
  /** Schlusszeile „als neue Person anlegen" (§3.3) — der Aufrufer ruft
   * `usePersonAnlegen().mutate(personenwaehlerNeuAnlegenEin())` (`personenwaehler-logik.ts`). */
  readonly aufNeuAnlegen: () => void
  /** Schlusszeile „als Platzhalter anlegen" (§3.3, A-17) — der Aufrufer ruft
   * `usePersonAnlegen().mutate(personenwaehlerPlatzhalterAnlegenEin())`. */
  readonly aufPlatzhalterAnlegen: () => void
  readonly gesperrt?: boolean
  /** Zugänglicher Name des Suchfelds, wenn keine sichtbare Beschriftung danebensteht (ADR-011). */
  readonly ariaLabel?: string
  readonly id?: string
}

/** `konfidenz_min` als `number | null` aus der Datenbank — dieselbe kleine, lokale Prüfung wie in
 * `tabellenzeile.tsx`/`feld-konfidenz.tsx` (bewusst dupliziert, s. Kommentar dort). */
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
 * `Personenwaehler` — Molekül (docs/71_Designsystem.md §2.2/§3.3, A-13 „aus jedem Kontext
 * anlegen"): Eingabekörper + Trefferliste + zwei feste Schlusszeilen „als neue Person anlegen" /
 * „als Platzhalter anlegen" (A-17). Vollständig kontrolliert wie jeder Baustein hier — die
 * eigentliche `abfrage:suche`/`befehl:person.anlegen`-Verdrahtung (`src/renderer/brücke/*-hooks.ts`)
 * liegt beim Aufrufer, analog zu `Suchfeld`+`Datentabelle` in `listen-ansicht.tsx`. Tastatur:
 * Pfeil-runter/-hoch bewegt `hervorgehobenerIndex` (mit Umlauf, `personenwaehlerNaechsterIndex`),
 * Enter aktiviert die hervorgehobene Zeile (`personenwaehlerZeileAktivieren`) — EIN
 * `onKeyDown`-Handler auf der Hülle genügt, `KeyboardEvent`s blubbern vom `Eingabekoerper`-`<input>`
 * nach oben.
 */
export function Personenwaehler({
  text,
  aufAenderung,
  zustand,
  treffer,
  hervorgehobenerIndex,
  aufHervorgehobenerIndexAenderung,
  aufAusgewaehlt,
  aufNeuAnlegen,
  aufPlatzhalterAnlegen,
  gesperrt = false,
  ariaLabel,
  id,
}: PersonenwaehlerProps) {
  const { t } = useTranslation('felder')
  const { t: tAllgemein } = useTranslation('allgemein')

  const zeilen: readonly PersonenwaehlerZeile[] = zustand === 'bereit' ? personenwaehlerZeilenAufbauen(treffer) : []
  const listboxId = id === undefined ? 'wz-personenwaehler-liste' : `${id}-liste`

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (zustand !== 'bereit' || zeilen.length === 0) return
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(personenwaehlerNaechsterIndex(hervorgehobenerIndex, 'runter', zeilen.length))
    } else if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      aufHervorgehobenerIndexAenderung?.(personenwaehlerNaechsterIndex(hervorgehobenerIndex, 'hoch', zeilen.length))
    } else if (ereignis.key === 'Enter') {
      if (hervorgehobenerIndex === null) return
      const zeile = zeilen[hervorgehobenerIndex]
      if (zeile === undefined) return
      ereignis.preventDefault()
      personenwaehlerZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen, aufPlatzhalterAnlegen })
    }
  }

  function zeileText(zeile: PersonenwaehlerZeile): string {
    switch (zeile.art) {
      case 'treffer':
        return personennameText(zeile.treffer, tAllgemein)
      case 'neuAnlegen':
        return t('personenwaehler_neu_anlegen')
      case 'platzhalterAnlegen':
        return t('personenwaehler_platzhalter_anlegen')
    }
  }

  function zeileSchluessel(zeile: PersonenwaehlerZeile): string {
    return zeile.art === 'treffer' ? zeile.treffer.person_id : zeile.art
  }

  return (
    <div className="wz-personenwaehler" onKeyDown={tastendruck}>
      <Eingabekoerper
        typ="search"
        wert={text}
        aufAenderung={aufAenderung}
        platzhalter={t('personenwaehler_platzhalter')}
        ariaLabel={ariaLabel ?? t('personenwaehler_beschriftung')}
        gesperrt={gesperrt}
        {...(id === undefined ? {} : { id })}
      />
      {zustand === 'leer' ? null : (
        <ul id={listboxId} className="wz-personenwaehler__liste" role="listbox" aria-label={t('personenwaehler_beschriftung')}>
          {zustand === 'laedt' ? (
            <li className="wz-personenwaehler__hinweis" role="presentation">
              <Text rolle="hilfe">{t('personenwaehler_laedt')}</Text>
            </li>
          ) : null}
          {zustand === 'bereit' && treffer.length === 0 ? (
            <li className="wz-personenwaehler__hinweis" role="presentation">
              <Text rolle="hilfe">{t('personenwaehler_keine_treffer')}</Text>
            </li>
          ) : null}
          {zeilen.map((zeile, index) => {
            const stufe = zeile.art === 'treffer' ? konfidenzStufe(zeile.treffer.konfidenz_min) : null
            const lebensdaten = zeile.art === 'treffer' ? personenwaehlerLebensdatenText(zeile.treffer.geburt_jahr, zeile.treffer.tod_jahr) : ''
            return (
              <li
                key={zeileSchluessel(zeile)}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === hervorgehobenerIndex}
                className={`wz-personenwaehler__zeile wz-personenwaehler__zeile--${zeile.art}${index === hervorgehobenerIndex ? ' wz-personenwaehler__zeile--hervorgehoben' : ''}`}
                onMouseDown={(ereignis) => {
                  ereignis.preventDefault()
                  personenwaehlerZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen, aufPlatzhalterAnlegen })
                }}
              >
                <Text rolle="koerper" farbe={zeile.art === 'treffer' && personennameIstErsatz(zeile.treffer) ? 'tertiaer' : 'primaer'}>
                  {zeileText(zeile)}
                </Text>
                {zeile.art === 'treffer' ? (
                  <span className="wz-personenwaehler__zeile-meta">
                    <Text rolle="koerper-klein" farbe="sekundaer">
                      {lebensdaten}
                    </Text>
                    <Text rolle="koerper-klein" farbe="sekundaer">
                      {zeile.treffer.geburt_ort_name ?? ''}
                    </Text>
                    {stufe !== null ? <KonfidenzPunkt stufe={stufe} /> : null}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
