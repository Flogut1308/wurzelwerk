import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Schaltflaeche } from './schaltflaeche'
import { Text } from './text'
import './seitenschublade.css'

export interface SeitenschubladeProps {
  /** Sichtbarer Titel — vom Aufrufer über i18n befüllt (ADR-011). */
  readonly titel: string
  readonly aufSchliessen: () => void
  readonly children: ReactNode
}

/**
 * `Seitenschublade` — Organismus (docs/71_Designsystem.md §2.3: „von rechts, für
 * Detailformulare"), hier für S-08 (Belegdetail) und S-09 (Widerspruchsansicht) innerhalb der
 * Profil-Vollseitenüberlagerung (AP-1.7 PR-B). Eigenständiges `role="dialog"` — schließt über den
 * Knopf oder Escape, OHNE die darunterliegende Überlagerung (`ProfilAnsicht`) mitzuschließen
 * (`ereignis.stopPropagation()`): Escape schließt immer nur die zuletzt geöffnete Ebene.
 *
 * „Escape schließt" ist kein Plattform-Tastenkürzel (CLAUDE.md §11 gilt nur für `Cmd`/`Ctrl`-
 * Kombinationen über `src/main/menue/tastenkuerzel.ts`) — ein einzelner `key === 'Escape'`-
 * Vergleich braucht keine Zuordnung dort.
 */
export function Seitenschublade({ titel, aufSchliessen, children }: SeitenschubladeProps) {
  const { t } = useTranslation('profil')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key !== 'Escape') return
    ereignis.stopPropagation()
    aufSchliessen()
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={titel}
      tabIndex={-1}
      className="wz-seitenschublade"
      onKeyDown={tastendruck}
    >
      <header className="wz-seitenschublade__kopf">
        <Text rolle="titel-klein" als="h2">
          {titel}
        </Text>
        <Schaltflaeche variante="unauffaellig" aufKlick={aufSchliessen}>
          {t('schliessen')}
        </Schaltflaeche>
      </header>
      <div className="wz-seitenschublade__inhalt">{children}</div>
    </div>
  )
}
