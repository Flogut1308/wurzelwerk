// AP-1.30 PR 7b: der Tab-Fang der Personen-Überlagerung, geteilt von Lesesicht (`profil-ansicht.tsx`)
// und Editor (`person-bearbeiten-ansicht.tsx`). Vorher lag er nur in der Profilansicht; eine zweite
// Kopie im Editor wäre dieselbe Regel an zwei Stellen. Kein Fokusfang-Paket im Projekt — für eine
// einzelne Überlagerungsebene reicht dieser einfache, selbstgebaute Fang.
import type { KeyboardEvent } from 'react'

const FOKUSSIERBAR_SELEKTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function fokussierbareElemente(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOKUSSIERBAR_SELEKTOR))
}

/** Hält `Tab`/`Shift+Tab` zyklisch innerhalb von `container`. Andere Tasten bleiben unberührt. */
export function tabImContainerHalten(ereignis: KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  if (ereignis.key !== 'Tab' || container === null) return
  const fokussierbar = fokussierbareElemente(container)
  const erstes = fokussierbar[0]
  const letztes = fokussierbar[fokussierbar.length - 1]
  if (erstes === undefined || letztes === undefined) return
  if (ereignis.shiftKey && document.activeElement === erstes) {
    ereignis.preventDefault()
    letztes.focus()
  } else if (!ereignis.shiftKey && document.activeElement === letztes) {
    ereignis.preventDefault()
    erstes.focus()
  }
}
