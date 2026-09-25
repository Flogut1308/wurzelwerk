// AP-1.30 (PR 8): DOM-Kennung eines Editorfelds — das Sprungziel eines offenen Punkts
// (`OffenerPunkt.feld`, Vorgaben §5.5 `field`). Zentral, damit rechte Spalte (Sprung) und die
// Reiterinhalte (die das Feld rendern) dieselbe Kennung bilden, nie zwei Schreibweisen.
import type { EditorFeld } from '../../../core/person/offene-punkte'

/** `<praefix>-feld-<feld>`; `feld` ist ein Bezeichner aus `EDITOR_FELDER` (Buchstaben, kein Leerraum). */
export function editorFeldId(praefix: string, feld: EditorFeld): string {
  return `${praefix}-feld-${feld}`
}
