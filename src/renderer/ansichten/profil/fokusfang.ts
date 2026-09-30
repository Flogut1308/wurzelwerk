// AP-1.30 PR 7b: der Tab-Fang der Personen-Überlagerung, geteilt von Lesesicht (`profil-ansicht.tsx`)
// und Editor (`person-bearbeiten-ansicht.tsx`). Vorher lag er nur in der Profilansicht; eine zweite
// Kopie im Editor wäre dieselbe Regel an zwei Stellen. Kein Fokusfang-Paket im Projekt — für eine
// einzelne Überlagerungsebene reicht dieser einfache, selbstgebaute Fang.
import type { KeyboardEvent } from 'react'

const FOKUSSIERBAR_SELEKTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function fokussierbareElemente(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOKUSSIERBAR_SELEKTOR))
}

/** Das erste per Tab erreichbare Element in `container` (AP-1.30 PR 11a: Anfangsfokus im `Modal`). */
export function erstesFokussierbares(container: HTMLElement): HTMLElement | null {
  return fokussierbareElemente(container)[0] ?? null
}

/**
 * Hält `Tab`/`Shift+Tab` zyklisch innerhalb von `container`. Andere Tasten bleiben unberührt.
 *
 * Liegt der Fokus auf `container` selbst (`tabIndex={-1}`: Anfangsfokus ohne Bedienelement, in
 * Chromium auch nach einem Mausklick auf Text darin), führt Shift+Tab zum letzten und Tab zum
 * ersten Element — sonst verließe Shift+Tab den Container (Review #199 V1). Bewusst NICHT für jedes
 * Element außerhalb der Tab-Liste: ein verschachtelter Container mit `tabIndex={-1}` (z. B. die
 * `Seitenschublade` in der Profilüberlagerung) behält seine eigene Tab-Folge.
 */
export function tabImContainerHalten(ereignis: KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  if (ereignis.key !== 'Tab' || container === null) return
  const fokussierbar = fokussierbareElemente(container)
  const erstes = fokussierbar[0]
  const letztes = fokussierbar[fokussierbar.length - 1]
  if (erstes === undefined || letztes === undefined) return
  const aktiv = document.activeElement
  if (aktiv === container || aktiv === null || !container.contains(aktiv)) {
    ereignis.preventDefault()
    if (ereignis.shiftKey) letztes.focus()
    else erstes.focus()
    return
  }
  if (ereignis.shiftKey && aktiv === erstes) {
    ereignis.preventDefault()
    letztes.focus()
  } else if (!ereignis.shiftKey && aktiv === letztes) {
    ereignis.preventDefault()
    erstes.focus()
  }
}
