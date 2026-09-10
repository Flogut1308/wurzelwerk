// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): Zod-Eingabeschemata der Schnappschuss-Kanäle.
// Reine Zod-Schemata + strukturelle Prüfung gegen die Vertrag-Typen (Muster aus
// `src/main/ipc/registrierung.ts` `protokollMeldenEingabeSchema`) — kein Node/Electron/SQL
// (CLAUDE.md §2).
import { z } from 'zod'
import type { Ein } from '../ipc/vertrag'

/** `befehl:schnappschuss.erzeugen` hat keine Pflichtnutzlast. */
export const schnappschussErzeugenEinSchema: z.ZodType<Ein<'befehl:schnappschuss.erzeugen'>> = z.null()

/** `befehl:schnappschuss.wiederherstellen` — `id` ist der Schnappschuss-Dateiname ohne Endung (s. `SchnappschussEintrag.id`). */
export const schnappschussWiederherstellenEinSchema: z.ZodType<Ein<'befehl:schnappschuss.wiederherstellen'>> = z.object({
  id: z.string(),
})
