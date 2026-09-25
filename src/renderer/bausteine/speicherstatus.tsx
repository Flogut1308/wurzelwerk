import { useTranslation } from 'react-i18next'
import { relativeSpeicherzeit } from './speicherstatus-logik'
import './speicherstatus.css'

/**
 * Drei Zustände, bewusst ohne Ruhezustand: vor dem ersten Schreiben rendert der Aufrufer den
 * Baustein gar nicht (Entwicklungsvorgaben §1 nennt genau diese drei Texte).
 */
export type SpeicherstatusProps =
  | {
      readonly zustand: 'gespeichert'
      /** Zeitpunkt des letzten erfolgreichen Schreibens, ms seit Epoche. */
      readonly gespeichertUm: number
      /** Bezugszeitpunkt für die relative Angabe, ms seit Epoche — vom Aufrufer, nie `Date.now` hier. */
      readonly jetzt: number
    }
  | { readonly zustand: 'speichert' }
  | { readonly zustand: 'fehler'; readonly aufErneutVersuchen: () => void }

/**
 * `Speicherstatus` — Kopf von „Person bearbeiten" (docs/design/Entwicklungsvorgaben Person
 * bearbeiten & Medien.md §1/§3.1, Artboard 1a): „Gespeichert · gerade eben" / „Speichert …" /
 * „Nicht gespeichert — erneut versuchen". Punkt + Text wie im Artboard; der Punkt ist dekorativ
 * (`aria-hidden`), die Bedeutung trägt der Text (WCAG 1.4.1).
 *
 * Eine einzige Statusregion `role="status"` mit `aria-live="polite"` für alle drei Zustände, die
 * über Zustandswechsel hinweg bestehen bleibt (sonst sagt Hilfstechnik den Wechsel nicht an).
 * Auch der Fehler ist höflich, nicht `assertive`: Der Status wechselt im Schreibfluss (400-ms-
 * Debounce), eine unterbrechende Ansage würde das Tippecho abschneiden; der Fehler bleibt sichtbar
 * stehen, bis er behoben ist, und trägt die Aktion „erneut versuchen" als echten Knopf. Die
 * Politeness einer bestehenden Region umzuschalten, setzen Screenreader zudem unzuverlässig um.
 */
export function Speicherstatus(props: SpeicherstatusProps) {
  const { t } = useTranslation('allgemein')

  function gespeichertText(gespeichertUm: number, jetzt: number): string {
    const zeit = relativeSpeicherzeit(gespeichertUm, jetzt)
    // Vollständiger `switch` statt zusammengesetzter Schlüssel (Muster `konfidenz-punkt.tsx`).
    switch (zeit.art) {
      case 'gerade_eben':
        return t('speicherstatus_gespeichert', { zeit: t('speicherstatus_zeit_gerade_eben') })
      case 'minuten':
        return t('speicherstatus_gespeichert', { zeit: t('speicherstatus_zeit_minuten', { count: zeit.anzahl }) })
      case 'stunden':
        return t('speicherstatus_gespeichert', { zeit: t('speicherstatus_zeit_stunden', { count: zeit.anzahl }) })
    }
  }

  return (
    <span className={`wz-speicherstatus wz-speicherstatus--${props.zustand}`} role="status" aria-live="polite">
      <span className="wz-speicherstatus__punkt" aria-hidden="true" />
      {props.zustand === 'gespeichert' ? (
        <span>{gespeichertText(props.gespeichertUm, props.jetzt)}</span>
      ) : props.zustand === 'speichert' ? (
        <span>{t('speicherstatus_speichert')}</span>
      ) : (
        <>
          <span>{t('speicherstatus_fehler')}</span>
          {/* Kein `Schaltflaeche`-Baustein: dessen Körperschrift und Innenabstand sprengen die
              12,5-px-Statuszeile (Artboard 1a: „Nicht gespeichert – erneut versuchen" als eine
              Zeile). Stattdessen ein nativer Knopf im Verweisstil (Akzenttext, unterstrichen),
              Trefferfläche ≥ 32 px (§5), Fokusring global aus `basis.css`. */}
          <button type="button" className="wz-speicherstatus__aktion" onClick={props.aufErneutVersuchen}>
            {t('speicherstatus_erneut_versuchen')}
          </button>
        </>
      )}
    </span>
  )
}
