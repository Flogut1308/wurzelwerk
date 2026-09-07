import type { FehlerCode } from '../fehler/codes'

/**
 * Anbieter, unter deren Synchronisationsordnern ein Projekt liegen kann (ADR-002, AP-0.4).
 * SQLite-Dateien dort können korrumpieren, WAL funktioniert auf Netzlaufwerken nicht zuverlässig —
 * die App warnt beim Öffnen, statt es stillschweigend zuzulassen.
 */
export type SyncAnbieter = 'dropbox' | 'icloud' | 'onedrive'

/**
 * Eintrag der Liste zuletzt geöffneter Projekte (AP-0.4, G-04 vorgezogen). Wird sowohl von
 * `src/main/projekt/zuletzt-speicher.ts` geschrieben als auch über `abfrage:projekt.zuletzt` an
 * den Renderer geliefert — die Form gehört darum in den gemeinsamen Vertrag, nicht in `main`.
 */
export interface ZuletztEintrag {
  readonly pfad: string
  readonly name: string
  readonly zuletztGeoeffnetAm: string
}

/** Antwort von `abfrage:version` — Nachweis, dass die IPC-Hülle steht (AP-0.2). */
export interface VersionInfo {
  readonly app: string
  readonly schema: string
  readonly electron: string
}

/** Antwort von `befehl:projekt.anlegen` und der `geoeffnet`-Variante von `befehl:projekt.oeffnen`. */
export interface ProjektInfo {
  readonly pfad: string
  readonly name: string
  readonly schemaversion: string
}

/** Nutzlast von `befehl:projekt.anlegen`. */
export interface ProjektAnlegenEin {
  readonly elternordner: string
  readonly name: string
}

/**
 * Nutzlast von `befehl:projekt.oeffnen`. `syncBestaetigt` fehlt beim ersten Versuch; liegt der
 * Pfad in einem erkannten Sync-Ordner, antwortet der Kanal mit `status: 'sync_warnung'`, ohne zu
 * öffnen — ein zweiter Aufruf mit `syncBestaetigt: true` öffnet trotzdem (ADR-002).
 */
export interface ProjektOeffnenEin {
  readonly pfad: string
  readonly syncBestaetigt?: boolean | undefined
}

/**
 * Diskriminierte Union statt eines Booleans: `sync_warnung` ist kein Fehler (kein `AppFehler`,
 * kein `ok:false`) — der Renderer zeigt einen Bestätigungsdialog und ruft den Kanal danach mit
 * `syncBestaetigt: true` erneut auf.
 */
export type ProjektOeffnenAus =
  | { readonly status: 'geoeffnet'; readonly projekt: ProjektInfo }
  | { readonly status: 'sync_warnung'; readonly anbieter: SyncAnbieter; readonly pfad: string }

/**
 * Nutzlast von `befehl:protokoll.melden` (§10.3): Der Renderer meldet einen Fehler aus der
 * Fehlergrenze, `window.onerror` oder `unhandledrejection`. `nachricht` und `stack` dürfen
 * Inhalte aus der Laufzeitumgebung enthalten (Stacktraces, technische Meldungen) — der Handler
 * in `src/main/ipc/registrierung.ts` protokolliert davon ausdrücklich nur eine reduzierte
 * Teilmenge (§7: IDs ja, Inhalte nein).
 */
export interface ProtokollMeldenEin {
  readonly quelle: 'fehlergrenze' | 'fenster'
  readonly nachricht: string
  // `| undefined` explizit, nicht nur optional: Das Zod-Schema in registrierung.ts erzeugt über
  // `.optional()` genau diesen Typ (Schlüssel kann fehlen ODER den Wert `undefined` tragen), und
  // `exactOptionalPropertyTypes` unterscheidet das von einem rein optionalen Schlüssel.
  readonly stack?: string | undefined
  readonly code?: FehlerCode | undefined
}

/**
 * Die Typkarte, aus der Renderer und Hauptprozess ihre Typen ziehen (§2.3). Phase 1 ergänzt hier
 * die `abfrage:`- und `befehl:`-Kanäle für Personen, Suche und Journal.
 */
export interface Vertrag {
  'abfrage:version': { ein: null; aus: VersionInfo }
  'befehl:protokoll.melden': { ein: ProtokollMeldenEin; aus: null }
  'befehl:projekt.anlegen': { ein: ProjektAnlegenEin; aus: ProjektInfo }
  'befehl:projekt.oeffnen': { ein: ProjektOeffnenEin; aus: ProjektOeffnenAus }
  'befehl:projekt.schliessen': { ein: null; aus: null }
  'abfrage:projekt.zuletzt': { ein: null; aus: readonly ZuletztEintrag[] }
}

export type Kanal = keyof Vertrag
export type Ein<K extends Kanal> = Vertrag[K]['ein']
export type Aus<K extends Kanal> = Vertrag[K]['aus']
