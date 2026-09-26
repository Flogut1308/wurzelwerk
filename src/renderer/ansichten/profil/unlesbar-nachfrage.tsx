import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { tabImContainerHalten } from './fokusfang'
import type { UnlesbareEingabe } from './unlesbare-eingaben'
import './unlesbar-nachfrage.css'

export interface UnlesbarNachfrageProps {
  readonly eingabe: UnlesbareEingabe
  /** Nachfrage schließen und den Fokus ins Feld setzen — nichts verlassen, nichts schreiben. */
  readonly aufZurueck: () => void
  /** Feld auf den gespeicherten Wert setzen, dann die angefragte Aktion ausführen. */
  readonly aufVerwerfen: () => void
  /** „etwa JJJJ" mit Originaltext speichern, dann die Aktion ausführen (nur bei erkennbarem Jahr). */
  readonly aufAlsEtwa: () => void
}

/**
 * Nachfrage vor dem Verlassen des Editors mit einem unlesbaren Datum (AP-1.30 U-130-9b-unlesbar,
 * docs/80 §33 V-130-unlesbar, Entscheidung B). Es gibt keinen Bestätigungsdialog-Baustein; gebaut
 * aus `Text` und `Schaltflaeche` mit den Modal-Tokens (`--wz-radius-modal`, `--wz-schatten-modal`) —
 * CLAUDE.md §14, zum Design-Review markiert. Liegt in der Ansicht (kein neuer Baustein), weil es
 * bisher genau diese eine Nachfrage gibt.
 *
 * Zugänglichkeit: `role="alertdialog"` mit `aria-modal`, Titel und Text als Name/Beschreibung; der
 * Fokus steht beim Öffnen auf „Zurück zum Feld" (die sichere Wahl), Tab bleibt im Dialog, Escape
 * wirkt wie „Zurück zum Feld" und schließt nicht den Editor dahinter.
 */
export function UnlesbarNachfrage({ eingabe, aufZurueck, aufVerwerfen, aufAlsEtwa }: UnlesbarNachfrageProps) {
  const { t } = useTranslation('profil')
  const titelId = useId()
  const textId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Escape') {
      ereignis.stopPropagation()
      aufZurueck()
      return
    }
    if (ereignis.key === 'Tab') {
      tabImContainerHalten(ereignis, containerRef.current)
      ereignis.stopPropagation()
    }
  }

  return (
    <div className="wz-unlesbar-nachfrage">
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={textId}
        className="wz-unlesbar-nachfrage__karte"
        onKeyDown={tastendruck}
      >
        <Text rolle="titel-klein" als="h2" id={titelId}>
          {t('unlesbar_nachfrage_titel')}
        </Text>
        <Text rolle="koerper" als="p" id={textId}>
          {t('unlesbar_nachfrage_text', { text: eingabe.text, feld: eingabe.beschriftung })}
        </Text>
        <div className="wz-unlesbar-nachfrage__aktionen">
          <Schaltflaeche variante="primaer" aufKlick={aufZurueck}>
            {t('unlesbar_zurueck_zum_feld')}
          </Schaltflaeche>
          {eingabe.jahr === null ? null : (
            <Schaltflaeche variante="sekundaer" aufKlick={aufAlsEtwa}>
              {t('unlesbar_als_etwa_speichern', { jahr: eingabe.jahr })}
            </Schaltflaeche>
          )}
          <Schaltflaeche variante="unauffaellig" aufKlick={aufVerwerfen}>
            {t('unlesbar_verwerfen')}
          </Schaltflaeche>
        </div>
      </div>
    </div>
  )
}
