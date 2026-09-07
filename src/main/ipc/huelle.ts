import { app, ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import type { FehlerCode } from '../../shared/fehler/codes'
import type { AppFehler } from '../../shared/fehler/app-fehler'
import type { Ergebnis } from '../../shared/ipc/ergebnis'
import type { Aus, Ein, Kanal } from '../../shared/ipc/vertrag'
import { protokollFehler } from '../protokoll/logger'

/** Wird jedem Handler mitgegeben — bislang nur die Vorgangs-ID (§2.4). */
export interface Kontext {
  readonly vorgangsId: string
}

/** UUID v7 (zeitsortierbar) als Vorgangs-ID; dieselbe ID steht im Protokoll (ADR-016). */
export function neueId(): string {
  return uuidv7()
}

const sqliteFehlerSchema = z.object({ code: z.string() })

function sqliteCodeZuFehlerCode(u: unknown): FehlerCode | undefined {
  const geprueft = sqliteFehlerSchema.safeParse(u)
  if (!geprueft.success) return undefined
  switch (geprueft.data.code) {
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return 'DATENBANK_FREMDSCHLUESSEL'
    case 'SQLITE_BUSY':
      return 'DATENBANK_GESPERRT'
    case 'SQLITE_CORRUPT':
      return 'DATENBANK_INTEGRITAET'
    default:
      return undefined
  }
}

function textSchluesselFuer(code: FehlerCode): string {
  return `fehler.${code}`
}

/**
 * Wandelt eine geworfene Ausnahme in einen `AppFehler` (§10.1). `details` wird nur außerhalb der
 * Auslieferung gefüllt (`app.isPackaged`) — im Renderer landet nie ein Stacktrace des
 * Entwicklungsrechners.
 */
export function zuAppFehler(u: unknown, vorgangsId: string): AppFehler {
  const code = sqliteCodeZuFehlerCode(u) ?? 'INTERN_UNERWARTET'
  const entwicklung = !app.isPackaged
  return {
    code,
    textSchluessel: textSchluesselFuer(code),
    vorgangsId,
    ...(entwicklung && u instanceof Error ? { details: u.message } : {}),
  }
}

/**
 * Die einzige Stelle, die `ipcMain.handle` aufruft (§2.4, ADR-016). Validiert die Nutzlast mit
 * Zod, ruft den Handler und wandelt jede Ausnahme in ein `Ergebnis` — nie wirft ein registrierter
 * Kanal über die Prozessgrenze.
 */
export function registriere<K extends Kanal>(
  kanal: K,
  eingabeSchema: z.ZodType<Ein<K>>,
  handler: (ein: Ein<K>, ktx: Kontext) => Promise<Aus<K>> | Aus<K>,
): void {
  ipcMain.handle(kanal, async (_ereignis: unknown, roh: unknown): Promise<Ergebnis<Aus<K>>> => {
    const vorgangsId = neueId()
    const geprueft = eingabeSchema.safeParse(roh)
    if (!geprueft.success) {
      const erstesProblem = geprueft.error.issues[0]
      return {
        ok: false,
        fehler: {
          code: 'IPC_UNGUELTIGE_NUTZLAST',
          textSchluessel: textSchluesselFuer('IPC_UNGUELTIGE_NUTZLAST'),
          vorgangsId,
          ...(erstesProblem !== undefined ? { feld: erstesProblem.path.join('.') } : {}),
        },
      }
    }

    try {
      const daten = await handler(geprueft.data, { vorgangsId })
      return { ok: true, daten }
    } catch (u) {
      const fehler = zuAppFehler(u, vorgangsId)
      protokollFehler({ vorgangsId, kanal, code: fehler.code })
      return { ok: false, fehler }
    }
  })
}
