import './tastenkappe.css'

export interface TastenKappeProps {
  /** Die einzelnen Tastensegmente, z. B. `['⌘', 'K']` oder `['Ctrl', 'K']` — bereits
   * plattformgerecht aufgelöst vom Aufrufer. CLAUDE.md §11: die Cmd/Ctrl-Konvention lebt NUR in
   * `src/main/menue/tastenkuerzel.ts` ("dort steht Cmd bzw. Ctrl genau einmal") — dieses Atom
   * ermittelt selbst NICHTS über die Plattform (kein `metaKey`, kein `navigator.platform`), es
   * rendert nur, was ihm übergeben wird. */
  readonly segmente: readonly string[]
}

/**
 * `TastenKappe` — Atom (docs/71_Designsystem.md §2.1): zeigt `⌘K` bzw. `Ctrl+K` plattformabhängig
 * — die Plattformabhängigkeit sitzt beim Aufrufer, nicht hier (s. Prop-Doku). Rein dekorativ: der
 * zugängliche Name des Bedienelements, das diese Kappe begleitet (z. B. ein Eintrag der
 * Befehlspalette), trägt die Aktion selbst, nicht ihr Tastaturkürzel.
 */
export function TastenKappe({ segmente }: TastenKappeProps) {
  return (
    <span className="wz-tastenkappe" aria-hidden="true">
      {segmente.map((segment, index) => (
        <kbd key={`${segment}-${String(index)}`} className="wz-tastenkappe__taste">
          {segment}
        </kbd>
      ))}
    </span>
  )
}
