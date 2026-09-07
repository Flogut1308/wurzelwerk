import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const SPERRDATEI_NAME = 'projekt.lock'

/** Inhalt von `projekt.lock` (AP-0.4). */
export interface SperrdateiInhalt {
  readonly pid: number
  readonly host: string
  readonly appVersion: string
  readonly gesetztAm: string
}

const sperrdateiInhaltSchema: z.ZodType<SperrdateiInhalt> = z.object({
  pid: z.number(),
  host: z.string(),
  appVersion: z.string(),
  gesetztAm: z.string(),
})

const prozessFehlerSchema = z.object({ code: z.string() })

export type SperrdateiStatus = 'frei' | 'belegt' | 'verwaist'

export interface SperrdateiPruefungErgebnis {
  readonly status: SperrdateiStatus
  readonly inhalt?: SperrdateiInhalt
}

export function sperrdateiPfad(ordnerPfad: string): string {
  return join(ordnerPfad, SPERRDATEI_NAME)
}

export interface SperrdateiSetzenEin {
  readonly ordnerPfad: string
  readonly appVersion: string
}

export function sperrdateiSetzen(ein: SperrdateiSetzenEin): void {
  const inhalt: SperrdateiInhalt = {
    pid: process.pid,
    host: hostname(),
    appVersion: ein.appVersion,
    gesetztAm: new Date().toISOString(),
  }
  writeFileSync(sperrdateiPfad(ein.ordnerPfad), JSON.stringify(inhalt, null, 2), 'utf8')
}

export function sperrdateiEntfernen(ordnerPfad: string): void {
  const pfad = sperrdateiPfad(ordnerPfad)
  if (existsSync(pfad)) {
    rmSync(pfad)
  }
}

function prozessLebt(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (u) {
    const geprueft = prozessFehlerSchema.safeParse(u)
    // ESRCH: keine PID mit dieser Nummer → als tot werten. Jeder andere Fall (z. B. EPERM, der
    // Prozess existiert, gehört aber einem anderen Benutzer) konservativ als lebend werten.
    return !(geprueft.success && geprueft.data.code === 'ESRCH')
  }
}

/**
 * Prüft eine bestehende Sperrdatei. Nutzerentscheidung (AP-0.4): Ein fremder Host kann die
 * Liveness der PID nicht beurteilen und gilt darum konservativ als `belegt`, ebenso eine
 * unlesbare oder unvollständige Sperrdatei. Nur eine tote PID auf dem eigenen Host gilt als
 * `verwaist` (unsauberer letzter Lauf) — `projekt-dienst` protokolliert das und übernimmt die
 * Sperre.
 */
export function sperrdateiPruefen(ordnerPfad: string): SperrdateiPruefungErgebnis {
  const pfad = sperrdateiPfad(ordnerPfad)
  if (!existsSync(pfad)) {
    return { status: 'frei' }
  }

  let roh: unknown
  try {
    roh = JSON.parse(readFileSync(pfad, 'utf8'))
  } catch {
    return { status: 'belegt' }
  }

  const geprueft = sperrdateiInhaltSchema.safeParse(roh)
  if (!geprueft.success) {
    return { status: 'belegt' }
  }

  const inhalt = geprueft.data
  if (inhalt.host !== hostname()) {
    return { status: 'belegt', inhalt }
  }

  return prozessLebt(inhalt.pid) ? { status: 'belegt', inhalt } : { status: 'verwaist', inhalt }
}
