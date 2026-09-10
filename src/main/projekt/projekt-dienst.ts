import type Database from 'better-sqlite3'
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
import { schnappschussBeiTransaktionSetzen } from '../befehle/bus'
import { integritaetPruefen } from '../datenbank/integritaet'
import { migrieren } from '../datenbank/migration/laeufer'
import { oeffnen } from '../datenbank/verbindung'
import { journalAufraeumen } from '../journal/aufraeumen'
import { journalStatusMelden } from '../journal/journal-status-melder'
import { schnappschussAufbewahrung } from '../schnappschuss/aufbewahrung'
import { schnappschussErzeugen } from '../schnappschuss/erzeugen'
import { schnappschussListeLesen } from '../schnappschuss/liste'
import { leseManifest, projektOrdnerAnlegen, projektOrdnerPfade, type ProjektManifest, type ProjektOrdnerPfade } from './ordnerformat'
import { sperrdateiEntfernen, sperrdateiPruefen, sperrdateiSetzen } from './sperrdatei'
import { syncAnbieterErkennen } from './sync-ordner-warnung'
import { zuletztHinzufuegen, zuletztLesen } from './zuletzt-speicher'

/** Ein Stand pro Arbeitstag "ohne Zutun" (55_Architektur.md §6.2). */
const SCHNAPPSCHUSS_MAX_ALTER_MS = 24 * 60 * 60 * 1000

/** Kein Schnappschuss vorhanden ODER der jüngste ist älter als `SCHNAPPSCHUSS_MAX_ALTER_MS`. */
function schnappschussFaelligBeimOeffnen(pfade: ProjektOrdnerPfade): boolean {
  const juengste = schnappschussListeLesen(pfade.snapshotsPfad)[0] // jüngste zuerst (schnappschussListeLesen())
  return juengste === undefined || Date.now() - juengste.zeitpunktMs > SCHNAPPSCHUSS_MAX_ALTER_MS
}

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
  integritaetPruefen(db)
  migrieren(db, {
    appVersion: app.getVersion(),
    schnappschussVor: (geoeffnet) => {
      schnappschussErzeugen(geoeffnet, pfade)
    },
  })

  // 55_Architektur.md §6.2/§4.6, AP-0.11 — in dieser Reihenfolge nach der Migration:
  // (a) ein Stand pro Arbeitstag "ohne Zutun", falls der letzte Schnappschuss älter als 24 h ist,
  if (schnappschussFaelligBeimOeffnen(pfade)) {
    schnappschussErzeugen(db, pfade)
  }
  // (b) Rotation (letzte 10 + je einer pro Tag/Woche der letzten 7 Tage/4 Wochen), und
  schnappschussAufbewahrung(pfade.snapshotsPfad)
  // (c) Journalbegrenzung (30 Tage / mindestens die letzten 200).
  journalAufraeumen(db)

  sperrdateiSetzen({ ordnerPfad: pfade.ordnerPfad, appVersion: app.getVersion() })
  offenesProjekt = { db, pfade, info }
  // 55_Architektur.md §6.2 ("alle 200 Transaktionen") — der Befehlsbus (`src/main/befehle/bus.ts`)
  // kennt selbst keine Projektpfade; dieser Aufruf registriert den echten Auslöser für das gerade
  // übernommene Projekt (Default dort: no-op, s. Kommentar bei `schnappschussBeiTransaktionSetzen`).
  schnappschussBeiTransaktionSetzen((geoeffnet) => {
    schnappschussErzeugen(geoeffnet, pfade)
  })
  journalStatusMelden(db) // AP-0.10: frisch geöffnetes Projekt bringt einen eigenen Undo/Redo-Stand mit (Menü, ereignis:journalStatus)
}

/** `befehl:projekt.anlegen`. Das Projekt wird direkt geöffnet — dabei läuft es durch `projektUebernehmen` automatisch auf `SCHEMA_VERSION` hoch (AP-0.5). */
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
  journalStatusMelden(undefined) // AP-0.10: kein Projekt mehr offen - Menü/Renderer wieder ausgegraut
}

/** `abfrage:projekt.zuletzt`. */
export function projektZuletzt(): readonly ZuletztEintrag[] {
  return zuletztLesen()
}

/**
 * Die Datenbankverbindung des aktuell offenen Projekts (AP-0.7, für Wartungsbefehle wie
 * `befehl:wartung.abgeleiteteNeuAufbauen`, die kein eigenes Repository sind und darum keinen
 * eigenen Zugriffsweg auf `offenesProjekt` haben). Wirft `PROJEKT_NICHT_GEOEFFNET`, statt `undefined`
 * durchzureichen — ein Aufrufer soll nie mit einer optionalen Datenbank weiterrechnen müssen.
 */
export function offenesProjektDatenbank(): Database.Database {
  if (offenesProjekt === undefined) {
    throw new WurzelFehler('PROJEKT_NICHT_GEOEFFNET')
  }
  return offenesProjekt.db
}

/**
 * Die Ordnerpfade (`ProjektOrdnerPfade`) des aktuell offenen Projekts (AP-0.11, für
 * `befehl:schnappschuss.*` - dieselbe Begründung wie bei `offenesProjektDatenbank()` oben:
 * Schnappschuss-Kanäle sind kein eigenes Repository mit Zugriff auf `offenesProjekt`).
 */
export function offenesProjektPfade(): ProjektOrdnerPfade {
  if (offenesProjekt === undefined) {
    throw new WurzelFehler('PROJEKT_NICHT_GEOEFFNET')
  }
  return offenesProjekt.pfade
}
