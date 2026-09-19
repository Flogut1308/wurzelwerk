import { useTranslation } from 'react-i18next'
import type { PersonListeFilter } from '../../shared/schemata/person-liste'
import { Auswahlfeld, type AuswahlfeldOption } from './auswahlfeld'
import { Eingabekoerper } from './eingabekoerper'
import { Schaltflaeche } from './schaltflaeche'
import { Text } from './text'
import { Umschalter } from './umschalter'
import {
  boolZuUmschalterZustand,
  filterWertZuKonfidenzMin,
  konfidenzMinZuFilterWert,
  ortWertZuString,
  stringZuOrtWert,
  stringZuZeitraumWert,
  tristateFilterZuZustand,
  umschalterZustandZuBool,
  zeitraumWertZuString,
  zustandZuTristateFilter,
  type KonfidenzFilterWert,
} from './filterleiste-logik'
import './filterleiste.css'

export interface FilterleisteProps {
  readonly filter: PersonListeFilter
  readonly aufFilterGeaendert: (filter: PersonListeFilter) => void
  readonly aufZuruecksetzen: () => void
}

/**
 * `Filterleiste` — Molekül (docs/71_Designsystem.md §2.2/S-05): sechs der sieben Filter, die
 * `PersonListeFilter` (src/shared/schemata/person-liste.ts) kennt — Platzhalter/Privat als
 * Tristate-`Umschalter`, Konfidenz als `Auswahlfeld`, „hat Widerspruch" als boolescher `Umschalter`,
 * Zeitraum als Von/Bis-Zahlenfeld, Ort als Textfeld. Strang aus der S-05-Beschreibung fehlt bewusst:
 * proband-relativ und graphabgeleitet, keine Spalte, die eine flache Personenzeile trägt
 * (docs/80_Offene_Fragen.md, U-1.6-filterleiste-vier-filter — CLAUDE.md §10 „nicht vorgreifen").
 * AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite): kein `gesperrt`-Zustand mehr — seit
 * `abfrage:suche` Filter/Sortierung/Seite selbst trägt, bleiben die Kontrollen immer wirksam.
 */
export function Filterleiste({ filter, aufFilterGeaendert, aufZuruecksetzen }: FilterleisteProps) {
  const { t } = useTranslation('liste')

  const konfidenzOptionen: readonly AuswahlfeldOption<KonfidenzFilterWert>[] = [
    { wert: 'alle', beschriftung: t('filter_konfidenz_alle') },
    { wert: '1', beschriftung: t('filter_konfidenz_ab_1') },
    { wert: '2', beschriftung: t('filter_konfidenz_ab_2') },
    { wert: '3', beschriftung: t('filter_konfidenz_ab_3') },
    { wert: '4', beschriftung: t('filter_konfidenz_ab_4') },
  ]

  return (
    <div className="wz-filterleiste">
      <div className="wz-filterleiste__gruppe">
        <Umschalter
          zustand={tristateFilterZuZustand(filter.platzhalter)}
          bezeichnung={t('filter_platzhalter')}
          aufZustandGeaendert={(naechsterZustand) =>
            aufFilterGeaendert({ ...filter, platzhalter: zustandZuTristateFilter(naechsterZustand) })
          }
        />
        <Text rolle="beschriftung" als="span">
          {t('filter_platzhalter')}
        </Text>
      </div>

      <div className="wz-filterleiste__gruppe">
        <Umschalter
          zustand={tristateFilterZuZustand(filter.privat)}
          bezeichnung={t('filter_privat')}
          aufZustandGeaendert={(naechsterZustand) => aufFilterGeaendert({ ...filter, privat: zustandZuTristateFilter(naechsterZustand) })}
        />
        <Text rolle="beschriftung" als="span">
          {t('filter_privat')}
        </Text>
      </div>

      <label className="wz-filterleiste__gruppe">
        <Text rolle="beschriftung" als="span">
          {t('filter_konfidenzMin_beschriftung')}
        </Text>
        <Auswahlfeld
          wert={konfidenzMinZuFilterWert(filter.konfidenzMin)}
          optionen={konfidenzOptionen}
          aufAenderung={(wert) => aufFilterGeaendert({ ...filter, konfidenzMin: filterWertZuKonfidenzMin(wert) })}
        />
      </label>

      <div className="wz-filterleiste__gruppe">
        <Umschalter
          zustand={boolZuUmschalterZustand(filter.nurWiderspruch)}
          bezeichnung={t('filter_nurWiderspruch')}
          aufZustandGeaendert={(naechsterZustand) =>
            aufFilterGeaendert({ ...filter, nurWiderspruch: umschalterZustandZuBool(naechsterZustand) })
          }
        />
        <Text rolle="beschriftung" als="span">
          {t('filter_nurWiderspruch')}
        </Text>
      </div>

      <label className="wz-filterleiste__gruppe">
        <Text rolle="beschriftung" als="span">
          {t('filter_zeitraum_beschriftung')}
        </Text>
        <Eingabekoerper
          typ="number"
          wert={zeitraumWertZuString(filter.zeitraumVon)}
          ariaLabel={t('filter_zeitraum_von_aria')}
          platzhalter={t('filter_zeitraum_von_platzhalter')}
          aufAenderung={(text) => aufFilterGeaendert({ ...filter, zeitraumVon: stringZuZeitraumWert(text) })}
        />
        <Eingabekoerper
          typ="number"
          wert={zeitraumWertZuString(filter.zeitraumBis)}
          ariaLabel={t('filter_zeitraum_bis_aria')}
          platzhalter={t('filter_zeitraum_bis_platzhalter')}
          aufAenderung={(text) => aufFilterGeaendert({ ...filter, zeitraumBis: stringZuZeitraumWert(text) })}
        />
      </label>

      <label className="wz-filterleiste__gruppe">
        <Text rolle="beschriftung" als="span">
          {t('filter_ort_beschriftung')}
        </Text>
        <Eingabekoerper
          typ="text"
          wert={ortWertZuString(filter.ort)}
          platzhalter={t('filter_ort_platzhalter')}
          aufAenderung={(text) => aufFilterGeaendert({ ...filter, ort: stringZuOrtWert(text) })}
        />
      </label>

      <Schaltflaeche variante="unauffaellig" aufKlick={aufZuruecksetzen}>
        {t('filter_zuruecksetzen')}
      </Schaltflaeche>
    </div>
  )
}
