// AP-1.30 PR 7c (docs/80 §33 V-130-7-tasten): Renderer-Hälfte der Tasten 1…8. Der Hauptprozess
// meldet jede bloße Ziffer der oberen Reihe (`src/main/menue/tastenkuerzel.ts`), ohne sie zu
// blockieren — hier fällt die Entscheidung, ob sie im Editor einen Reiter wählt. Kein `metaKey`,
// keine eigene Tastenauswertung im Renderer (CLAUDE.md §11): Modifikatoren, Wiederholung und
// IME-Komposition hat der Hauptprozess bereits ausgeschlossen.

/** Elemente, in denen eine Ziffer Text ist. `contenteditable="false"` schaltet ein Bearbeiten aus. */
const EINGABE_SELEKTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/** Alles, was über dem Editor liegt und seine Tasten für sich beansprucht (Seitenschublade, Modal). */
const MODAL_SELEKTOR = '[aria-modal="true"], dialog[open]'

/**
 * Darf eine Kontexttaste im Editor `editor` wirken? Nein, wenn der Fokus in einem Eingabeelement
 * liegt (die Ziffer wird dort getippt — auch in einem verschachtelten contenteditable) oder wenn
 * außer dem Editor selbst und ihn umschließenden Überlagerungen ein weiteres Modal offen ist (eine
 * Seitenschublade im Editor ist `aria-modal`, ebenso jeder künftige Dialog).
 */
export function darfKontexttasteWirken(editor: Element, dokument: Document): boolean {
  const fokus = dokument.activeElement
  if (fokus !== null && fokus.closest(EINGABE_SELEKTOR) !== null) return false
  for (const modal of dokument.querySelectorAll(MODAL_SELEKTOR)) {
    if (modal === editor || modal.contains(editor)) continue
    return false
  }
  return true
}
