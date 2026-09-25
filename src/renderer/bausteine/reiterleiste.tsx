import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Zaehler } from './zaehler'
import './reiterleiste.css'

export interface ReiterleisteReiter {
  /** Stabile, DOM-taugliche Kennung (Buchstaben, Ziffern, `-`) — wird Teil der Element-IDs. */
  readonly id: string
  /** Sichtbarer Name — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly beschriftung: string
  /** Optionaler Zähler (Anzahl, nie Prozent — Entwicklungsvorgaben §3.1). */
  readonly anzahl?: number
  /** Optionaler Punkt „offener Punkt in diesem Reiter" (Entwicklungsvorgaben §3.1/§5.5). */
  readonly offenerPunkt?: boolean
}

export interface ReiterleisteProps {
  /** Präfix für die Element-IDs, eindeutig je Seite (z. B. `person-bearbeiten`). */
  readonly idPraefix: string
  /** Zugänglicher Name der `tablist` — vom Aufrufer über i18n befüllt. */
  readonly beschriftung: string
  readonly reiter: readonly ReiterleisteReiter[]
  /** `id` des aktiven Reiters (kontrolliert — die Reiterwahl gehört dem Aufrufer). */
  readonly aktiv: string
  readonly aufWechsel: (id: string) => void
}

/** Element-ID eines Reiters — der Aufrufer braucht sie für `aria-labelledby` am Inhaltsbereich. */
export function reiterElementId(idPraefix: string, id: string): string {
  return `${idPraefix}-reiter-${id}`
}

/** Element-ID des zugehörigen Inhaltsbereichs (`role="tabpanel"`, liegt beim Aufrufer). */
export function reiterInhaltId(idPraefix: string, id: string): string {
  return `${idPraefix}-inhalt-${id}`
}

/** Zielindex für eine Taste innerhalb der Leiste, `null` = Taste gehört nicht der Leiste. Pfeile
 * laufen am Rand um (WAI-ARIA APG „Tabs"), Pos1/Ende springen an die Enden. */
function zielIndex(taste: string, index: number, anzahl: number): number | null {
  switch (taste) {
    case 'ArrowRight':
      return (index + 1) % anzahl
    case 'ArrowLeft':
      return (index - 1 + anzahl) % anzahl
    case 'Home':
      return 0
    case 'End':
      return anzahl - 1
    default:
      return null
  }
}

/**
 * `Reiterleiste` — Molekül `Reiter` (docs/71_Designsystem.md §2.2), Vorlage Artboard 1a
 * (docs/design/Wurzelwerk Person bearbeiten.dc.html, „Reiter"): Beschriftung, optionaler
 * `Zaehler`, optionaler Punkt „offener Punkt". WAI-ARIA-Tabs-Muster mit Roving-Tabindex und
 * automatischer Aktivierung (Pfeil = Wechsel): ein Reiterwechsel speichert und hält nichts zurück
 * (Entwicklungsvorgaben §1), also gibt es keinen Grund, Fokus und Auswahl zu trennen.
 *
 * Die Tasten innerhalb der Leiste sind Komponentenverhalten (APG), keine App-Tastenkürzel —
 * CLAUDE.md §11 betrifft `Cmd`/`Ctrl`-Kombinationen über `src/main/menue/tastenkuerzel.ts`. Die
 * Ziffern `1…8` (Entwicklungsvorgaben §6) sind App-Ebene und gehören nicht hierher.
 *
 * Der Punkt ist farbig und darum allein nicht ausreichend (WCAG 1.4.1): er ist `aria-hidden`, die
 * Bedeutung trägt visuell verborgener Text im Reiter, der so Teil des Reiternamens wird.
 */
export function Reiterleiste({ idPraefix, beschriftung, reiter, aktiv, aufWechsel }: ReiterleisteProps) {
  const { t } = useTranslation('allgemein')
  const knoepfe = useRef(new Map<string, HTMLButtonElement>())

  function tastendruck(ereignis: KeyboardEvent<HTMLButtonElement>, index: number) {
    const ziel = zielIndex(ereignis.key, index, reiter.length)
    if (ziel === null) return
    const eintrag = reiter[ziel]
    if (eintrag === undefined) return
    ereignis.preventDefault()
    aufWechsel(eintrag.id)
    knoepfe.current.get(eintrag.id)?.focus()
  }

  return (
    <div className="wz-reiterleiste" role="tablist" aria-label={beschriftung} aria-orientation="horizontal">
      {reiter.map((eintrag, index) => {
        const istAktiv = eintrag.id === aktiv
        return (
          <button
            key={eintrag.id}
            ref={(element) => {
              if (element === null) knoepfe.current.delete(eintrag.id)
              else knoepfe.current.set(eintrag.id, element)
            }}
            type="button"
            role="tab"
            id={reiterElementId(idPraefix, eintrag.id)}
            aria-selected={istAktiv}
            // Nur der aktive Reiter verweist auf einen Inhaltsbereich: der Aufrufer rendert nur den
            // aktiven Bereich, ein Verweis auf nicht vorhandene IDs wäre ungültig (hueter #157, 1).
            {...(istAktiv ? { 'aria-controls': reiterInhaltId(idPraefix, eintrag.id) } : {})}
            tabIndex={istAktiv ? 0 : -1}
            className={`wz-reiterleiste__reiter${istAktiv ? ' wz-reiterleiste__reiter--aktiv' : ''}`}
            onClick={() => aufWechsel(eintrag.id)}
            onKeyDown={(ereignis) => tastendruck(ereignis, index)}
          >
            <span className="wz-reiterleiste__beschriftung">{eintrag.beschriftung}</span>
            {eintrag.anzahl === undefined ? null : <Zaehler anzahl={eintrag.anzahl} />}
            {eintrag.offenerPunkt === true ? (
              <>
                <span className="wz-reiterleiste__punkt" aria-hidden="true" />
                <span className="wz-reiterleiste__verborgen">{t('reiter_offener_punkt')}</span>
              </>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
