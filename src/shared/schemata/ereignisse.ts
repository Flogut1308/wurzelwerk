// AP-0.10 PR-A2 / AP-0.20: Zod-Härtung der `ereignis:`-Nutzlast, die der Renderer als `unknown`
// vom Preload bekommt (CLAUDE.md §4: kein unbegründetes `as`). `befehl:`/`abfrage:`-Antworten
// laufen bereits durch die IPC-Hülle im Hauptprozess (`src/main/ipc/huelle.ts`) und werden dort
// schon einmal geprüft — ein `ereignis:`-Push hat diese Station nicht, darum prüft der Renderer
// hier selbst. AP-0.20 konsolidiert alle `ereignis:`-Schemata in dieser einen Datei (vorher lag
// `journalStatusNutzlastSchema` allein in `journal.ts`) — ein Kanal, ein Ort.
import { z } from 'zod'
import type { DatenGeaendertNutzlast, JournalStatusNutzlast, ProjektGeschlossenNutzlast } from '../ipc/vertrag'

/** Prüft die Nutzlast von `ereignis:datenGeaendert` (AP-0.9) gegen `DatenGeaendertNutzlast`. */
export const datenGeaendertNutzlastSchema: z.ZodType<DatenGeaendertNutzlast> = z.object({
  transaktionId: z.string(),
  ursache: z.string(),
})

/** Prüft die Nutzlast von `ereignis:journalStatus` (55_Architektur.md §2.5) gegen `JournalStatusNutzlast`. */
export const journalStatusNutzlastSchema: z.ZodType<JournalStatusNutzlast> = z.object({
  undoMoeglich: z.boolean(),
  redoMoeglich: z.boolean(),
  undoBeschreibung: z.string().nullable(),
  redoBeschreibung: z.string().nullable(),
})

/** Prüft die Nutzlast von `ereignis:projektGeschlossen` (AP-0.20) gegen `ProjektGeschlossenNutzlast`. */
export const projektGeschlossenNutzlastSchema: z.ZodType<ProjektGeschlossenNutzlast> = z.object({
  pfad: z.string(),
})
