import { app } from 'electron'
import { homedir } from 'node:os'
import type { Kontext } from '../ipc/huelle'
import type {
  ProjektAnlegenEin,
  ProjektInfo,
  ProjektOeffnenAus,
  ProjektOeffnenEin,
  ZuletztEintrag,
} from '../../shared/ipc/vertrag'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { protokollInfo } from '../protokoll/logger'
import { oeffnen } from '../datenbank/verbindung'
import { leseManifest, projektOrdnerAnlegen, projektOrdnerPfade, type ProjektManifest, type ProjektOrdnerPfade } from './ordnerformat'
import { sperrdateiEntfernen, sperrdateiPruefen, sperrdateiSetzen } from './sperrdatei'
import { syncAnbieterErkennen } from './sync-ordner-warnung'
import { zuletztHinzufuegen, zuletztLesen } from './zuletzt-speicher'

/**
 * Orchestriert anlegen/öffnen/schließen (AP-0.4). Der Prozess hält höchstens ein offenes Projekt
 * gleichzeitig — dieses Modul-Singleton hält den einen `Database`-Handle, analog zu
 * `src/main/fenster/geometrie-speicher.ts`.
 */
interface OffenesProjekt {
  readonly db: ReturnType<typeof oeffnen>
  readonly pfade: ProjektOrdnerPfade
  readonly info: ProjektInfo
}

let offenesProjekt: OffenesProjekt | undefined

function projektInfoAus(pfade: ProjektOrdnerPfade, manifest: ProjektManifest): ProjektInfo {
  return { pfad: pfade.ordnerPfad, name: manifest.projektname, schemaversion: manifest.schemaversion }
}

/**
 * Öffnet die Datenbankverbindung, setzt die Sperre und merkt sich das Ergebnis als das eine
 * offene Projekt dieses Prozesses. War bereits ein anderes Projekt offen, wird es zuerst geordnet
 * geschlossen.
 */
function projektUebernehmen(pfade: ProjektOrdnerPfade, info: ProjektInfo): void {
  if (offenesProjekt !== undefined) {
    projektSchliessen()
  }
  const db = oeffnen(pfade.dbPfad)
  sperrdateiSetzen({ ordnerPfad: pfade.ordnerPfad, appVersion: app.getVersion() })
  offenesProjekt = { db, pfade, info }
}

/** `befehl:projekt.anlegen`. Kein Vorgriff auf AP-0.5: das Projekt wird direkt geöffnet. */
export function projektAnlegen(ein: ProjektAnlegenEin): ProjektInfo {
  const { pfade, manifest } = projektOrdnerAnlegen({ elternordner: ein.elternordner, projektname: ein.name })
  const info = projektInfoAus(pfade, manifest)
  projektUebernehmen(pfade, info)
  zuletztHinzufuegen({ pfad: info.pfad, name: info.name, zuletztGeoeffnetAm: new Date().toISOString() })
  return info
}

/**
 * `befehl:projekt.oeffnen`. `heimat` ist injizierbar (Standard: `os.homedir()`) — reiner Seam für
 * `test/einheit/projekt-dienst.test.ts`, damit die Sync-Ordner-Warnung ohne Eingriff in den
 * echten Home-Ordner geprüft werden kann.
 */
export function projektOeffnen(ein: ProjektOeffnenEin, ktx: Kontext, heimat: string = homedir()): ProjektOeffnenAus {
  const manifest = leseManifest(ein.pfad) // wirft PROJEKT_KEIN_WURZELWERK_ORDNER

  const anbieter = syncAnbieterErkennen(ein.pfad, heimat)
  if (anbieter !== undefined && ein.syncBestaetigt !== true) {
    return { status: 'sync_warnung', anbieter, pfad: ein.pfad }
  }

  const sperre = sperrdateiPruefen(ein.pfad)
  if (sperre.status === 'belegt') {
    throw new WurzelFehler('PROJEKT_BEREITS_GEOEFFNET')
  }
  if (sperre.status === 'verwaist') {
    // Unsauberer letzter Lauf (§7: nur IDs/Codes, keine Inhalte) — die Sperre wird trotzdem
    // übernommen, s. u.
    protokollInfo({ vorgangsId: ktx.vorgangsId, code: 'projekt_sperre_verwaist' })
  }

  const pfade = projektOrdnerPfade(ein.pfad)
  const info = projektInfoAus(pfade, manifest)
  projektUebernehmen(pfade, info)
  zuletztHinzufuegen({ pfad: info.pfad, name: info.name, zuletztGeoeffnetAm: new Date().toISOString() })
  return { status: 'geoeffnet', projekt: info }
}

/** `befehl:projekt.schliessen`. Ohne offenes Projekt ein No-op. */
export function projektSchliessen(): void {
  if (offenesProjekt === undefined) {
    return
  }
  offenesProjekt.db.close()
  sperrdateiEntfernen(offenesProjekt.pfade.ordnerPfad)
  offenesProjekt = undefined
}

/** `abfrage:projekt.zuletzt`. */
export function projektZuletzt(): readonly ZuletztEintrag[] {
  return zuletztLesen()
}
