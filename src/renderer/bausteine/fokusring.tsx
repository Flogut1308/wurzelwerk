import './fokusring.css'

/**
 * `Fokusring` — Atom (docs/71_Designsystem.md §2.1). Der eigentliche Mechanismus ist global in
 * `basis.css` (`:focus-visible`, §5: „immer sichtbar, nie ausgeschaltet") — dieses Atom ist ein
 * rein dekoratives Anschauungsstück für die Zustandsbibliothek (S-19), das denselben visuellen
 * Ring unabhängig von echter Tastaturfokussierung zeigt (ein Screenshot hat keinen echten Fokus).
 */
export function Fokusring() {
  return <span className="wz-fokusring" aria-hidden="true" />
}
