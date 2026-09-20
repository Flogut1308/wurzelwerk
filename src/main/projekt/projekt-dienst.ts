import type Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { Kontext } from '../ipc/huelle'
import type {
  ProjektAnlegenEin,
  ProjektInfo,
  ProjektOeffnenAus,
  ProjektOeffnenEin,
  ZuletztEintragAnzeige,
} from '../../shared/ipc/vertrag'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { protokollInfo } from '../protokoll/logger'
import { schnappschussBeiTransaktionSetzen } from '../befehle/bus'
import { integritaetPruefen, integritaetVollPruefen } from '../datenbank/integritaet'
import { triggerdriftAusgleichen } from '../datenbank/journal-trigger-anwenden'
import { migrieren } from '../datenbank/migration/laeufer'
import { schemaBasisverzeichnis } from '../datenbank/migration/schema-basis'
import { oeffnen } from '../datenbank/verbindung'
import { sendeEreignis } from '../ipc/ereignisse'
import { journalAufraeumen } from '../journal/aufraeumen'
import { journalStatusMelden } from '../journal/journal-status-melder'
import { schnappschussAufbewahrung } from '../schnappschuss/aufbewahrung'
import { schnappschussErzeugen } from '../schnappschuss/erzeugen'
import { schnappschussListeLesen } from '../schnappschuss/liste'
import { leseManifest, projektOrdnerAnlegen, projektOrdnerPfade, type ProjektManifest, type ProjektOrdnerPfade } from './ordnerformat'
import { istSperrdateiKonflikt, sperrdateiEntfernen, sperrdateiPruefen, sperrdateiSetzen } from './sperrdatei'
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
 * geschlossen. `unsauber` kommt vom Aufrufer (AP-0.13: `projektOeffnen` reicht
 * `sperre.status === 'verwaist'` durch, `projektAnlegen` immer `false` — ein frisch angelegtes
 * Projekt hatte nie einen vorherigen Lauf) — bei `true` läuft zusätzlich zum immer laufenden
 * `quick_check` (`integritaetPruefen`) der volle `integrity_check` (`integritaetVollPruefen`, nur
 * Protokoll, wirft nicht). `vorgangsId` ist optional (§7: Protokollzeilen erlauben sie optional) -
 * `projektOeffnen` reicht `ktx.vorgangsId` durch, `projektAnlegen` hat (noch) keinen `Kontext` und
 * ruft ohne auf.
 */
function projektUebernehmen(pfade: ProjektOrdnerPfade, info: ProjektInfo, unsauber: boolean, vorgangsId?: string): void {
  if (offenesProjekt !== undefined) {
    projektSchliessen()
  }
  if (unsauber) {
    // Eine verwaiste Alt-Sperre erst hier entfernen, NICHT vorher: `sperrdateiPruefen()` hat sie
    // gerade als "verwaist" erkannt (toter Prozess auf dem eigenen Host) — läge sie noch da, würde
    // das exklusive `sperrdateiSetzen()` unten mit `EEXIST` gegen die eigene, überholte Sperre
    // laufen, statt sie zu übernehmen.
    sperrdateiEntfernen(pfade.ordnerPfad)
  }

  // AP-0.19: die Sperre VOR jeder Datenbankoperation setzen — atomar (`flag: 'wx'`), damit
  // zwischen `sperrdateiPruefen()` (im Aufrufer) und dem Setzen kein Fenster für einen zweiten
  // Prozess bleibt, der dieselbe Sperre ebenfalls für frei hält.
  try {
    sperrdateiSetzen({ ordnerPfad: pfade.ordnerPfad, appVersion: app.getVersion() })
  } catch (u) {
    if (istSperrdateiKonflikt(u)) {
      throw new WurzelFehler('PROJEKT_BEREITS_GEOEFFNET')
    }
    throw u
  }

  let db: ReturnType<typeof oeffnen>
  try {
    db = oeffnen(pfade.dbPfad)
  } catch (u) {
    sperrdateiEntfernen(pfade.ordnerPfad)
    // AP-0.19: `oeffnen()` setzt Pragmas direkt nach dem Öffnen und wirft darum für dieselbe
    // Klasse kaputter Datei (z. B. SQLITE_NOTADB), die `integritaetPruefen()` unten sonst als
    // `DATENBANK_INTEGRITAET` erkennen würde (s. Kommentar dort) — kommt der Wurf schon hier
    // heraus, bekommt der Aufrufer trotzdem den bekannten, geschlossenen Fehlercode (§7) statt
    // einer rohen `SqliteError` über die Funktionsgrenze.
    throw u instanceof WurzelFehler ? u : new WurzelFehler('DATENBANK_INTEGRITAET')
  }

  try {
    integritaetPruefen(db)
    if (unsauber) {
      integritaetVollPruefen(db)
    }
    migrieren(db, {
      appVersion: app.getVersion(),
      schemaBasis: schemaBasisverzeichnis(),
      schnappschussVor: (geoeffnet) => {
        schnappschussErzeugen(geoeffnet, pfade)
      },
    })

    // AP-0.24 (F-06): erreicht auch Dateien, für die migrieren() oben ein No-op war (bereits auf
    // Zielversion) - ein Trigger-Fix ohne begleitende neue Migration greift sonst nie.
    const triggerAbweichungen = triggerdriftAusgleichen(db, schemaBasisverzeichnis())
    if (triggerAbweichungen > 0) {
      protokollInfo({
        ...(vorgangsId !== undefined ? { vorgangsId } : {}),
        code: 'trigger_drift_behoben',
        zeilenzahl: triggerAbweichungen,
      })
    }

    // 55_Architektur.md §6.2/§4.6, AP-0.11 — in dieser Reihenfolge nach der Migration:
    // (a) ein Stand pro Arbeitstag "ohne Zutun", falls der letzte Schnappschuss älter als 24 h ist,
    if (schnappschussFaelligBeimOeffnen(pfade)) {
      schnappschussErzeugen(db, pfade)
    }
    // (b) Rotation (letzte 10 + je einer pro Tag/Woche der letzten 7 Tage/4 Wochen), und
    schnappschussAufbewahrung(pfade.snapshotsPfad)
    // (c) Journalbegrenzung (30 Tage / mindestens die letzten 200).
    journalAufraeumen(db)
  } catch (u) {
    // AP-0.19: eine beschädigte/inkompatible Datenbank darf weder die Verbindung offen lassen
    // (Windows kann eine offene Datei sonst nicht mehr löschen/verschieben) noch die soeben
    // gesetzte Sperre stehen lassen — sonst gilt der Ordner ab jetzt fälschlich als geöffnet.
    db.close()
    sperrdateiEntfernen(pfade.ordnerPfad)
    throw u
  }

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
  projektUebernehmen(pfade, info, false)
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
  projektUebernehmen(pfade, info, sperre.status === 'verwaist', ktx.vorgangsId)
  zuletztHinzufuegen({ pfad: info.pfad, name: info.name, zuletztGeoeffnetAm: new Date().toISOString() })
  return { status: 'geoeffnet', projekt: info }
}

/** `befehl:projekt.schliessen`. Ohne offenes Projekt ein No-op. */
export function projektSchliessen(): void {
  if (offenesProjekt === undefined) {
    return
  }
  const pfad = offenesProjekt.pfade.ordnerPfad
  offenesProjekt.db.close()
  sperrdateiEntfernen(offenesProjekt.pfade.ordnerPfad)
  offenesProjekt = undefined
  // AP-0.19: den Auslöser auf No-op zurücksetzen — sonst zeigt der Bus (`src/main/befehle/bus.ts`)
  // bei der nächsten "alle 200 Transaktionen"-Marke weiter auf `schnappschussErzeugen(_, pfade)`
  // dieses bereits geschlossenen Projekts, egal welche Datenbank (z. B. eines danach geöffneten
  // anderen Projekts oder eine Test-`:memory:`-Datenbank) die 200. Transaktion tatsächlich ausführt.
  schnappschussBeiTransaktionSetzen(() => {
    // No-op nach dem Schließen (AP-0.19), s. o.
  })
  journalStatusMelden(undefined) // AP-0.10: kein Projekt mehr offen - Menü/Renderer wieder ausgegraut
  // AP-0.20: genau einmal je tatsächlichem Schließen (hinter dem obigen Guard) — u. a. Grundlage
  // dafür, dass die Start-Ansicht auch nach einem Schließen "hinter dem Rücken des Renderers"
  // (z. B. einer Wiederherstellung) wieder den Startzustand zeigt.
  sendeEreignis('ereignis:projektGeschlossen', { pfad })
}

/**
 * `abfrage:projekt.zuletzt`. Ergänzt je Eintrag `existiert` über `existsSync(ordnerPfad)` (S-01,
 * AP-1.26) — rein lesend, keine Transaktion, kein Journal (§11). Bewusst nur in dieser
 * Anzeigeform, nicht in der Speicherform (`zuletzt-speicher.ts`): ein verschwundener Ordner soll
 * bei jedem Aufruf neu geprüft werden, nicht als veralteter Stand in der Datei stehen bleiben.
 */
export function projektZuletzt(): readonly ZuletztEintragAnzeige[] {
  return zuletztLesen().map((eintrag) => ({ ...eintrag, existiert: existsSync(eintrag.pfad) }))
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
