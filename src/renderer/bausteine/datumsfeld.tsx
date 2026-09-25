import { useTranslation } from 'react-i18next'
import type { Kalender } from '../../core/datum/typen'
import { Auswahlfeld, type AuswahlfeldOption } from './auswahlfeld'
import { datumsfeldInterpretation } from './datumsfeld-logik'
import { Eingabekoerper } from './eingabekoerper'
import { Symbol } from './symbol'
import { Text } from './text'
import './datumsfeld.css'

const KALENDER_REIHENFOLGE: readonly Kalender[] = ['gregorian', 'julian', 'hebrew', 'french_r']

/** i18n-Schlüssel je Kalender (Namensraum `felder`) — dieselbe geschlossene-`switch`-Form wie
 * `konfidenzSchluessel` in `konfidenz-punkt.tsx`. */
function kalenderSchluessel(kalender: Kalender): string {
  switch (kalender) {
    case 'gregorian':
      return 'datumsfeld_kalender_gregorianisch'
    case 'julian':
      return 'datumsfeld_kalender_julianisch'
    case 'hebrew':
      return 'datumsfeld_kalender_hebraeisch'
    case 'french_r':
      return 'datumsfeld_kalender_franzoesisch_republikanisch'
  }
}

export interface DatumsfeldProps {
  /** Die freie, rohe Eingabe — unverändert, wie der Nutzer sie getippt hat. */
  readonly text: string
  readonly aufAenderung: (text: string) => void
  readonly kalender: Kalender
  readonly aufKalenderAenderung: (kalender: Kalender) => void
  /** Die Kalenderwahl ist eingeklappt (§3.1 Regel 5) — dieser Baustein bleibt vollständig
   * kontrolliert (kein interner Zustand, wie jeder andere Baustein hier), der Auf-/Zuklapp-Zustand
   * gehört darum dem Aufrufer. */
  readonly kalenderErweitert: boolean
  readonly aufKalenderErweitertAenderung: (wert: boolean) => void
  readonly gesperrt?: boolean
  readonly name?: string
  readonly id?: string
  /** Zugänglicher Name des Eingabefelds — im Regelfall trägt stattdessen `Formularfeld` die
   * sichtbare Beschriftung. */
  readonly ariaLabel?: string
  /** Das Eingabefeld wird verlassen (Blur) — AP-1.30 PR 9b: der Autosave schreibt dann sofort. */
  readonly aufVerlassen?: () => void
}

/**
 * `Datumsfeld` — Molekül (docs/71_Designsystem.md §2.2/§3.1): „Eingabekörper + Interpretationszeile
 * + Kalenderwahl". Die wichtigste Komponente der App (A-03). Die Interpretationszeile ist IMMER im
 * Markup (nie erst nach Verlassen des Felds, §3.1 Regel 1) — `datumsfeldInterpretation()`
 * (`datumsfeld-logik.ts`) ruft ausschließlich `parse()`/`formatiere()` aus `src/core/datum` auf,
 * keine zweite Parselogik hier. Ein Doppeljahr/eine unaufgelöste liturgische Datierung erscheint
 * unverändert als Originaltext, nicht auf ein Jahr gerundet (§3.1 Regel 6) — das übernimmt
 * `formatiere()` selbst (`datum:originaltext` gewinnt immer), diese Komponente hängt dafür keine
 * „· Genauigkeit …"-Ergänzung an, die eine Rundung vortäuschen würde.
 */
export function Datumsfeld({
  text,
  aufAenderung,
  kalender,
  aufKalenderAenderung,
  kalenderErweitert,
  aufKalenderErweitertAenderung,
  gesperrt = false,
  name,
  id,
  ariaLabel,
  aufVerlassen,
}: DatumsfeldProps) {
  const { t } = useTranslation('felder')
  const { t: tDatum } = useTranslation('datum')
  const interpretation = datumsfeldInterpretation(text)

  const kalenderOptionen: readonly AuswahlfeldOption<Kalender>[] = KALENDER_REIHENFOLGE.map((eintrag) => ({
    wert: eintrag,
    beschriftung: t(kalenderSchluessel(eintrag)),
  }))

  // `exactOptionalPropertyTypes` (CLAUDE.md §4): ein destrukturiertes `name`/`id`/`ariaLabel` ist
  // `string | undefined`, ein explizit gesetztes `undefined` verletzt aber `EingabekoerperProps`
  // (dort optional heißt „fehlt", nicht „ist undefined") — darum nur weiterreichen, was gesetzt ist.
  const eingabekoerperExtra = {
    ...(name !== undefined ? { name } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    ...(aufVerlassen !== undefined ? { aufVerlassen } : {}),
  }

  return (
    <div className="wz-datumsfeld">
      <Eingabekoerper
        typ="text"
        wert={text}
        aufAenderung={aufAenderung}
        gesperrt={gesperrt}
        ungueltig={interpretation.art === 'nicht_aufloesbar'}
        {...eingabekoerperExtra}
      />
      <div className="wz-datumsfeld__interpretation" aria-live="polite">
        {interpretation.art === 'nicht_aufloesbar' ? (
          <Text rolle="hilfe" farbe="akzent" als="p">
            {t('datumsfeld_nicht_aufloesbar', { grund: t(interpretation.grundSchluessel) })}
          </Text>
        ) : interpretation.art === 'originaltext' ? (
          <Text rolle="hilfe" als="p">
            {t('datumsfeld_verstanden_als', { text: tDatum(interpretation.schluessel, interpretation.werte) })}
          </Text>
        ) : interpretation.art === 'formatiert' ? (
          <Text rolle="hilfe" als="p">
            {t('datumsfeld_verstanden_als_mit_genauigkeit', {
              text: tDatum(interpretation.schluessel, interpretation.werte),
              genauigkeit: t(interpretation.genauigkeitSchluessel),
            })}
          </Text>
        ) : null}
      </div>
      <button
        type="button"
        className="wz-datumsfeld__kalenderKnopf"
        aria-expanded={kalenderErweitert}
        disabled={gesperrt}
        onClick={() => aufKalenderErweitertAenderung(!kalenderErweitert)}
      >
        <Symbol name={kalenderErweitert ? 'caret-up' : 'caret-down'} groesse={16} />
        <Text rolle="hilfe" als="span">
          {t('datumsfeld_kalender_umschalten')}
        </Text>
      </button>
      {kalenderErweitert ? (
        <div className="wz-datumsfeld__kalenderzeile">
          <Auswahlfeld
            wert={kalender}
            optionen={kalenderOptionen}
            aufAenderung={aufKalenderAenderung}
            ariaLabel={t('datumsfeld_kalender_beschriftung')}
            gesperrt={gesperrt}
          />
        </div>
      ) : null}
    </div>
  )
}
