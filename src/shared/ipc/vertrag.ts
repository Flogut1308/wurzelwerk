import type { FehlerCode } from '../fehler/codes'
import type { PersonAnlegenEin, PersonFeldSetzenEin, PersonLoeschenEin } from '../schemata/befehle'

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
 * Nutzlast von `ereignis:datenGeaendert` (AP-0.9): Push nach jedem Befehl, der mindestens eine
 * `aenderung`-Zeile erzeugt hat. Trägt bewusst nur `transaktionId`/`ursache` — kein `betroffen`-Feld
 * (D-EREIGNIS); der Renderer invalidiert seinen Cache pauschal, statt selektiv nachzuführen.
 */
export interface DatenGeaendertNutzlast {
  readonly transaktionId: string
  readonly ursache: string
}

/** Nutzlast von `ereignis:journalStatus` (AP-0.9) — Grundlage für Undo/Redo-Menüzustand (AP-0.10). */
export interface JournalStatusNutzlast {
  readonly undoMoeglich: boolean
  readonly redoMoeglich: boolean
  readonly undoBeschreibung: string | null
  readonly redoBeschreibung: string | null
}

/**
 * Deckt `transaktion.art` (`docs/schema/0001_grundgeruest.sql`-CHECK) als geschlossene Union ab
 * (AP-0.9). Steht in `src/shared`, nicht in `src/main/repositories/journal-repo.ts`, weil
 * `VerlaufEintrag` (AP-0.10, unten) diese Union ebenfalls braucht und `src/shared` nichts aus
 * `src/main` importieren darf (CLAUDE.md §2) — `journal-repo.ts` importiert seinerseits von hier.
 */
export type TransaktionArt = 'nutzer' | 'import' | 'merge' | 'migration' | 'wartung' | 'platzhalter_aufgeloest'

/** Deckt `transaktion.status` (`docs/schema/0001_grundgeruest.sql`-CHECK) als geschlossene Union ab (AP-0.10, s. Kommentar bei `TransaktionArt`). */
export type TransaktionStatus = 'angewendet' | 'zurueckgenommen' | 'verworfen'

/**
 * Ergebnis von `befehl:journal.undo`/`befehl:journal.redo` (55_Architektur.md §4.7/§4.9,
 * AP-0.10) — ursprünglich als rein interner Typ in `src/main/journal/undo.ts` definiert (AP-0.10
 * PR-A1), hierher gehoben, jetzt da mit diesem PR ein Renderer-Aufrufer existiert (s. Kopfkommentar
 * dort). `beschreibung` ist `string | null`, weil `transaktion.beschreibung` in
 * `docs/schema/0001_grundgeruest.sql` nullbar ist (z. B. für spätere, nicht vom Befehlsbus
 * erzeugte Transaktionsarten) — kein unbegründetes `!`/`as`, um das zu verschweigen (CLAUDE.md §4).
 */
export interface UndoErgebnis {
  readonly transaktionId: string
  readonly beschreibung: string | null
}

/** Nutzlast von `abfrage:journal.verlauf` (AP-0.10, 55_Architektur.md §2.3): wie viele Zeilen höchstens. */
export interface JournalVerlaufEin {
  readonly grenze: number
}

/**
 * Ein Schnappschuss aus `abfrage:schnappschuss.liste`/`befehl:schnappschuss.erzeugen`
 * (55_Architektur.md §6.2, AP-0.11). Es gibt dafür KEINE Datenbanktabelle (Variante A) — die Liste
 * kommt live aus dem Dateisystem (`snapshots/`-Ordner, `src/main/schnappschuss/liste.ts`). `id` ist
 * der kolonfreie ISO-Zeit-Dateiname ohne Endung (Windows-tauglich, `docs/architektur.md` §6.2) und
 * zugleich der stabile Schlüssel für `befehl:schnappschuss.wiederherstellen`.
 */
export interface SchnappschussEintrag {
  readonly id: string
  readonly pfad: string
  readonly zeitpunktMs: number
  readonly groesseBytes: number
}

/** Nutzlast von `befehl:schnappschuss.wiederherstellen` (55_Architektur.md §6.2/§6.4, AP-0.11). */
export interface SchnappschussWiederherstellenEin {
  readonly id: string
}

/** Ein Eintrag aus `abfrage:journal.verlauf` (AP-0.10) — an `transaktion` orientiert (`docs/schema/0001_grundgeruest.sql`). */
export interface VerlaufEintrag {
  readonly id: string
  readonly zeitpunkt: number
  readonly art: TransaktionArt
  readonly status: TransaktionStatus
  readonly beschreibung: string | null
  readonly rueckgaengigMoeglich: boolean
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
  'befehl:wartung.abgeleiteteNeuAufbauen': { ein: null; aus: null }
  'befehl:person.anlegen': { ein: PersonAnlegenEin; aus: { readonly id: string } }
  'befehl:person.feldSetzen': { ein: PersonFeldSetzenEin; aus: null }
  'befehl:person.loeschen': { ein: PersonLoeschenEin; aus: null }
  'befehl:journal.undo': { ein: null; aus: UndoErgebnis }
  'befehl:journal.redo': { ein: null; aus: UndoErgebnis }
  'abfrage:journal.verlauf': { ein: JournalVerlaufEin; aus: readonly VerlaufEintrag[] }
  'befehl:schnappschuss.erzeugen': { ein: null; aus: SchnappschussEintrag }
  'abfrage:schnappschuss.liste': { ein: null; aus: readonly SchnappschussEintrag[] }
  'befehl:schnappschuss.wiederherstellen': { ein: SchnappschussWiederherstellenEin; aus: null }
}

export type Kanal = keyof Vertrag
export type Ein<K extends Kanal> = Vertrag[K]['ein']
export type Aus<K extends Kanal> = Vertrag[K]['aus']
