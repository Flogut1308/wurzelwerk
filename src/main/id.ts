import { v7 as uuidv7 } from 'uuid'

/** UUID v7 (zeitsortierbar) als Vorgangs-/Entitäts-ID; dieselbe ID steht ggf. im Protokoll (ADR-016). */
export function neueId(): string {
  return uuidv7()
}
