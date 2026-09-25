// @vitest-environment jsdom
//
// AP-1.30 PR 7c (docs/80 §33 V-130-7-tasten): der Renderer wählt auf eine vom Hauptprozess
// gemeldete Kontexttaste nur dann einen Reiter, wenn der Fokus nicht in einem Eingabeelement liegt
// und keine Schublade / kein weiteres Modal über dem Editor offen ist. jsdom nur in dieser Datei
// (echtes `document.activeElement`, `closest`, `contains`).
import { afterEach, describe, expect, it } from 'vitest'
import { darfKontexttasteWirken } from '../../src/renderer/ansichten/profil/kontexttaste-logik'

function editorAufbauen(): HTMLElement {
  const editor = document.createElement('div')
  editor.setAttribute('role', 'dialog')
  editor.setAttribute('aria-modal', 'true')
  editor.tabIndex = -1
  document.body.append(editor)
  return editor
}

function kind<K extends keyof HTMLElementTagNameMap>(eltern: HTMLElement, tag: K): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  eltern.append(element)
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('darfKontexttasteWirken', () => {
  it('Fokus auf einem Reiter/Knopf im Editor: ja', () => {
    const editor = editorAufbauen()
    const knopf = kind(editor, 'button')
    knopf.focus()
    expect(darfKontexttasteWirken(editor, document)).toBe(true)
  })

  it('Fokus auf dem Editor selbst: ja', () => {
    const editor = editorAufbauen()
    editor.focus()
    expect(darfKontexttasteWirken(editor, document)).toBe(true)
  })

  it('Fokus in input, textarea oder select: nein', () => {
    const editor = editorAufbauen()
    for (const tag of ['input', 'textarea', 'select'] as const) {
      const feld = kind(editor, tag)
      feld.focus()
      expect(document.activeElement).toBe(feld)
      expect(darfKontexttasteWirken(editor, document)).toBe(false)
      feld.remove()
    }
  })

  it('Fokus in einem contenteditable (auch verschachtelt): nein', () => {
    const editor = editorAufbauen()
    const bereich = kind(editor, 'div')
    bereich.setAttribute('contenteditable', 'true')
    const innen = kind(bereich, 'span')
    innen.tabIndex = 0
    innen.focus()
    expect(darfKontexttasteWirken(editor, document)).toBe(false)
  })

  it('offene Seitenschublade (weiteres aria-modal) im Editor: nein', () => {
    const editor = editorAufbauen()
    const knopf = kind(editor, 'button')
    const schublade = kind(editor, 'div')
    schublade.setAttribute('role', 'dialog')
    schublade.setAttribute('aria-modal', 'true')
    knopf.focus()
    expect(darfKontexttasteWirken(editor, document)).toBe(false)
  })

  it('ein Modal außerhalb des Editors (z. B. Geschwister) blockiert ebenfalls, ein umschließendes nicht', () => {
    const huelle = document.createElement('div')
    huelle.setAttribute('aria-modal', 'true')
    document.body.append(huelle)
    const editor = kind(huelle, 'div')
    editor.setAttribute('aria-modal', 'true')
    const knopf = kind(editor, 'button')
    knopf.focus()
    expect(darfKontexttasteWirken(editor, document)).toBe(true)

    const fremd = document.createElement('div')
    fremd.setAttribute('aria-modal', 'true')
    document.body.append(fremd)
    expect(darfKontexttasteWirken(editor, document)).toBe(false)
  })
})
