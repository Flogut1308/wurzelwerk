import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { erstesFokussierbares, tabImContainerHalten } from '../ansichten/profil/fokusfang'
import { SchaltflaecheSymbol } from './schaltflaeche-symbol'
import { Text } from './text'
import './modal.css'

/** Die drei Breiten des Templates `T-Dialog` (docs/71_Designsystem.md §2.4). */
export type ModalBreite = 'schmal' | 'mittel' | 'breit'

export interface ModalProps {
  /** Sichtbarer Titel und zugänglicher Name — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly titel: string
  readonly offen: boolean
  /** Schließen über ✕ oder Escape. Eine Nachfrage bei ungespeicherten Eingaben ist Sache des Aufrufers. */
  readonly beiSchliessen: () => void
  /** Fußaktionen (z. B. „Abbrechen" · „Übernehmen"), rechtsbündig. Ohne Angabe kein Fuß. */
  readonly fussaktionen?: ReactNode
  /** Vorgabe `mittel` (640 px). */
  readonly breite?: ModalBreite
  /**
   * Ersatzziel für den Fokus beim Schließen, falls das auslösende Element dann nicht mehr im
   * Dokument hängt (z. B. die Zeile, deren „Bearbeiten" das Modal öffnete, ist verschwunden).
   * Ohne Angabe oder bei `null` bleibt der Fokus dort, wo der Browser ihn hinlegt (`body`).
   */
  readonly fokusNachSchliessen?: () => HTMLElement | null
  readonly children: ReactNode
}

/**
 * `Modal` — Organismus (docs/71_Designsystem.md §2.3 „Titel, Inhalt, Fußaktionen", Template
 * `T-Dialog` §2.4), AP-1.30 PR 11a (C-26). Erster Verbraucher wird „Namensform bearbeiten"
 * (Vorgaben §3.5); aufgebaut nach dem Entwurf dort (Kopf mit Titel und ✕, Inhalt, abgesetzter Fuß).
 *
 * Zugänglichkeit (WAI-ARIA Dialog-Muster): `role="dialog"` mit `aria-modal`, Name über
 * `aria-labelledby` auf den Titel. Beim Öffnen liegt der Fokus auf dem ersten Bedienelement des
 * Inhalts (sonst auf dem Dialog selbst), Tab/Shift+Tab bleiben im Dialog (`fokusfang.ts`), beim
 * Schließen kehrt der Fokus zum Element zurück, das beim Öffnen fokussiert war — hängt es nicht
 * mehr im Dokument, auf `fokusNachSchliessen()`.
 *
 * Tasten: KEIN Tastendruck verlässt das Modal (`stopPropagation` für jede Taste) — weder zum Editor
 * dahinter (dessen Escape und Tab-Fang, die Pfeiltasten der `Reiterleiste`) noch zu `document`.
 * Die Kontexttasten 1…8 kommen nicht als DOM-Ereignis, sondern vom Hauptprozess
 * (`ereignis:kontexttaste`); dort sperrt `aria-modal="true"` sie über `darfKontexttasteWirken`.
 * „Escape schließt" ist kein Plattform-Tastenkürzel (CLAUDE.md §11 gilt für `Cmd`/`Ctrl`-
 * Kombinationen über `src/main/menue/tastenkuerzel.ts`), wie bei `Seitenschublade`.
 *
 * Kein Portal, `position: fixed` wie `Seitenschublade` und die Profilüberlagerung (kein Elternbaum
 * setzt `transform`). Ein Klick auf die Abdunkelung schließt NICHT — das Modal bearbeitet eine
 * zusammengesetzte Einheit mit explizitem „Übernehmen" (Vorgaben §3.5); ein Fehlklick daneben soll
 * keine Eingaben verwerfen.
 */
export function Modal({ titel, offen, beiSchliessen, fussaktionen, breite = 'mittel', fokusNachSchliessen, children }: ModalProps) {
  const { t } = useTranslation('allgemein')
  const titelId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const inhaltRef = useRef<HTMLDivElement | null>(null)
  // Über einen Ref: der Fokus-Effekt hängt nur an `offen`, sieht beim Schließen aber das aktuelle
  // Ersatzziel (Muster `verlassenRef` in `person-bearbeiten-ansicht.tsx`).
  const fokusNachSchliessenRef = useRef(fokusNachSchliessen)
  useEffect(() => {
    fokusNachSchliessenRef.current = fokusNachSchliessen
  })

  useEffect(() => {
    if (!offen) return
    const vorher = document.activeElement
    const inhalt = inhaltRef.current
    const ziel = (inhalt === null ? null : erstesFokussierbares(inhalt)) ?? dialogRef.current
    // `preventScroll`: das Modal liegt fest im Fenster; in der Zustandsbibliothek (eingebettete
    // Probe) soll das Fokussieren die lange Seite nicht mitscrollen.
    ziel?.focus({ preventScroll: true })
    return () => {
      if (vorher instanceof HTMLElement && vorher.isConnected) {
        vorher.focus()
        return
      }
      fokusNachSchliessenRef.current?.()?.focus()
    }
  }, [offen])

  if (!offen) return null

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    ereignis.stopPropagation()
    if (ereignis.key === 'Escape') {
      beiSchliessen()
      return
    }
    tabImContainerHalten(ereignis, dialogRef.current)
  }

  return (
    <div className="wz-modal">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        className={`wz-modal__dialog wz-modal__dialog--${breite}`}
        onKeyDown={tastendruck}
      >
        <div className="wz-modal__kopf">
          <Text rolle="titel-klein" als="h2" id={titelId}>
            {titel}
          </Text>
          <SchaltflaecheSymbol name="x" variante="unauffaellig" beschriftung={t('modal_schliessen')} aufKlick={beiSchliessen} />
        </div>
        <div ref={inhaltRef} className="wz-modal__inhalt">
          {children}
        </div>
        {fussaktionen === undefined ? null : <div className="wz-modal__fuss">{fussaktionen}</div>}
      </div>
    </div>
  )
}
