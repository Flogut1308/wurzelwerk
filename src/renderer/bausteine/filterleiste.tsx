import { useTranslation } from 'react-i18next'
import type { PersonListeFilter } from '../../shared/schemata/person-liste'
import { Auswahlfeld, type AuswahlfeldOption } from './auswahlfeld'
import { Schaltflaeche } from './schaltflaeche'
import { Text } from './text'
import { Umschalter } from './umschalter'
import {
  boolZuUmschalterZustand,
  filterWertZuKonfidenzMin,
  konfidenzMinZuFilterWert,
  tristateFilterZuZustand,
  umschalterZustandZuBool,
  zustandZuTristateFilter,
  type KonfidenzFilterWert,
} from './filterleiste-logik'
import './filterleiste.css'

export interface FilterleisteProps {
  readonly filter: PersonListeFilter
  readonly aufFilterGeaendert: (filter: PersonListeFilter) => void
  readonly aufZuruecksetzen: () => void
  /** `true` während einer aktiven Suche (`docs/80_Offene_Fragen.md` §17): `abfrage:suche` kennt
   * keine Filter — die vier Filter-Kontrollen werden dann sichtbar deaktiviert dargestellt, statt
   * klickbar-aber-wirkungslos zu bleiben. */
  readonly gesperrt?: boolean
}

/**
 * `Filterleiste` — Molekül (docs/71_Designsystem.md §2.2/S-05): genau die vier Filter, die
 * `PersonListeFilter` (src/shared/schemata/person-liste.ts) heute kennt — Platzhalter/Privat als
 * Tristate-`Umschalter`, Konfidenz als `Auswahlfeld`, „hat Widerspruch" als boolescher `Umschalter`.
 * Zeitraum/Ort/Strang aus der S-05-Beschreibung fehlen bewusst: Der Filtervertrag trägt sie noch
 * nicht (CLAUDE.md §10 „nicht vorgreifen").
 */
export function Filterleiste({ filter, aufFilterGeaendert, aufZuruecksetzen, gesperrt = false }: FilterleisteProps) {
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
          gesperrt={gesperrt}
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
          gesperrt={gesperrt}
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
          gesperrt={gesperrt}
          aufAenderung={(wert) => aufFilterGeaendert({ ...filter, konfidenzMin: filterWertZuKonfidenzMin(wert) })}
        />
      </label>

      <div className="wz-filterleiste__gruppe">
        <Umschalter
          zustand={boolZuUmschalterZustand(filter.nurWiderspruch)}
          bezeichnung={t('filter_nurWiderspruch')}
          gesperrt={gesperrt}
          aufZustandGeaendert={(naechsterZustand) =>
            aufFilterGeaendert({ ...filter, nurWiderspruch: umschalterZustandZuBool(naechsterZustand) })
          }
        />
        <Text rolle="beschriftung" als="span">
          {t('filter_nurWiderspruch')}
        </Text>
      </div>

      <Schaltflaeche variante="unauffaellig" aufKlick={aufZuruecksetzen}>
        {t('filter_zuruecksetzen')}
      </Schaltflaeche>
    </div>
  )
}
