// AP-0.10 PR-A2: Zod-Härtung der `ereignis:`-Nutzlast, die der Renderer als `unknown` vom Preload
// bekommt (CLAUDE.md §4: kein unbegründetes `as`). `befehl:`/`abfrage:`-Antworten laufen bereits
// durch die IPC-Hülle im Hauptprozess (`src/main/ipc/huelle.ts`) und werden dort schon einmal
// geprüft — ein `ereignis:`-Push hat diese Station nicht, darum prüft der Renderer hier selbst.
import { z } from 'zod'
import type { JournalStatusNutzlast } from '../ipc/vertrag'

/** Prüft die Nutzlast von `ereignis:journalStatus` (55_Architektur.md §2.5) gegen `JournalStatusNutzlast`. */
export const journalStatusNutzlastSchema: z.ZodType<JournalStatusNutzlast> = z.object({
  undoMoeglich: z.boolean(),
  redoMoeglich: z.boolean(),
  undoBeschreibung: z.string().nullable(),
  redoBeschreibung: z.string().nullable(),
})
