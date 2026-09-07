import { app } from 'electron'
import { z } from 'zod'
import { ALLE_FEHLERCODES } from '../../shared/fehler/codes'
import { SCHEMA_VERSION } from '../../shared/konstanten'
import type { Ein } from '../../shared/ipc/vertrag'
import { protokollFehler } from '../protokoll/logger'
import { registriere } from './huelle'

// Erzwingt strukturell, dass dieses Schema zu `ProtokollMeldenEin` passt — eine Abweichung ist
// ein Typfehler hier, nicht erst zur Laufzeit im Renderer.
const protokollMeldenEingabeSchema: z.ZodType<Ein<'befehl:protokoll.melden'>> = z.object({
  quelle: z.enum(['fehlergrenze', 'fenster']),
  nachricht: z.string(),
  stack: z.string().optional(),
  code: z.enum(ALLE_FEHLERCODES).optional(),
})

/**
 * Registriert alle Kanäle aus AP-0.2 (§2.4). Wird einmal beim Start aufgerufen
 * (`src/main/index.ts`).
 */
export function ipcRegistrierung(): void {
  registriere('abfrage:version', z.null(), () => ({
    app: app.getVersion(),
    schema: SCHEMA_VERSION,
    electron: process.versions.electron,
  }))

  // Log-only-Handler ohne Transaktion/Journal — kein Vorgriff auf den Befehlsbus (AP-0.9).
  // Datenschutz (§7): `nachricht`/`stack` können Laufzeitinhalte tragen und werden bewusst NICHT
  // protokolliert — nur Quelle, Fehlercode und Vorgangs-ID.
  registriere('befehl:protokoll.melden', protokollMeldenEingabeSchema, (ein, ktx) => {
    protokollFehler({ vorgangsId: ktx.vorgangsId, quelle: ein.quelle, code: ein.code })
    return null
  })
}
