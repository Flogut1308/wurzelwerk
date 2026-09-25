import type { KontexttasteNutzlast } from '../../shared/ipc/vertrag'

/**
 * Zentrale Tastenkürzel-Tabelle (§11, ADR-012). `CmdOrCtrl` ist Electrons eigene Abstraktion für
 * Cmd (macOS) / Ctrl (Windows, Linux) — sie wird nur hier verwendet, nirgends sonst im Code steht
 * eine Plattformabfrage für Tastenkürzel.
 */
export const TASTENKUERZEL = {
  beenden: 'CmdOrCtrl+Q',
  rueckgaengig: 'CmdOrCtrl+Z',
  wiederholen: 'Shift+CmdOrCtrl+Z',
  schliessen: 'CmdOrCtrl+W',
} as const

/**
 * Kontexttasten (AP-1.30 PR 7c, docs/80 §33 V-130-7-tasten): bloße Tasten OHNE Modifikator, die nur
 * in einem bestimmten Zusammenhang wirken — heute die Tasten 1…8, die im Editor „Person bearbeiten"
 * den Reiter in fester Reihenfolge wählen (`src/core/person/reiter.ts`). Diese Tabelle ist
 * zugleich die Doku der Kürzel.
 *
 * Bewusst KEIN Menü-Accelerator: ein Accelerator mit bloßer Ziffer würde die Taste abfangen und das
 * Tippen jeder Ziffer in jedem Textfeld blockieren. Stattdessen beobachtet der Hauptprozess die
 * Eingabe (`kontexttasten-beobachter.ts`, `before-input-event` ohne `preventDefault()`) und meldet
 * eine erkannte Kontexttaste über `ereignis:kontexttaste`; ob sie wirkt (kein Textfeld fokussiert,
 * keine Schublade offen), entscheidet der Renderer, der den Fokus kennt.
 *
 * Erkannt über `code` (physische Taste der oberen Ziffernreihe), nicht über `key`: auf AZERTY
 * liefert die Taste „1" ohne Shift den `key` „&". Der Ziffernblock (`Numpad1`…) zählt nicht — er
 * ist die übliche Zifferneingabe und hätte sonst eine zweite Bedeutung.
 */
export const KONTEXTTASTEN = [
  { code: 'Digit1', aktion: 'reiterWaehlen', reiterIndex: 0 },
  { code: 'Digit2', aktion: 'reiterWaehlen', reiterIndex: 1 },
  { code: 'Digit3', aktion: 'reiterWaehlen', reiterIndex: 2 },
  { code: 'Digit4', aktion: 'reiterWaehlen', reiterIndex: 3 },
  { code: 'Digit5', aktion: 'reiterWaehlen', reiterIndex: 4 },
  { code: 'Digit6', aktion: 'reiterWaehlen', reiterIndex: 5 },
  { code: 'Digit7', aktion: 'reiterWaehlen', reiterIndex: 6 },
  { code: 'Digit8', aktion: 'reiterWaehlen', reiterIndex: 7 },
] as const satisfies readonly (KontexttasteNutzlast & { readonly code: string })[]

/** Die Felder von Electrons `Input` (`before-input-event`), die die Erkennung braucht — als eigene
 * Schnittstelle, damit die Prüfung ohne Electron testbar bleibt. */
export interface KontexttastenEingabe {
  readonly type: string
  readonly code: string
  readonly isAutoRepeat: boolean
  readonly isComposing: boolean
  readonly shift: boolean
  readonly control: boolean
  readonly alt: boolean
  readonly meta: boolean
}

/**
 * Reine Prüfung: ist diese Eingabe eine Kontexttaste? Nur ein erstes Drücken (`keyDown`, keine
 * Tastenwiederholung — gedrückt halten wechselt nicht fortlaufend), ohne jeden Modifikator (Shift+1
 * ist „!", Ctrl/Cmd/Alt+1 gehören anderen Kürzeln, AltGr meldet Ctrl+Alt) und nicht während einer
 * IME-Komposition (Electron meldet `isComposing` am Input-Objekt; die Ziffer gehört dann dem
 * Eingabefenster der Eingabemethode).
 */
export function kontexttasteErkennen(eingabe: KontexttastenEingabe): KontexttasteNutzlast | null {
  if (eingabe.type !== 'keyDown') return null
  if (eingabe.isAutoRepeat || eingabe.isComposing) return null
  if (eingabe.shift || eingabe.control || eingabe.alt || eingabe.meta) return null
  const taste = KONTEXTTASTEN.find((eintrag) => eintrag.code === eingabe.code)
  if (taste === undefined) return null
  return { aktion: taste.aktion, reiterIndex: taste.reiterIndex }
}
