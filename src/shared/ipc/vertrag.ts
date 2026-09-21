import type { FehlerCode } from '../fehler/codes'
import type { PruefBericht } from '../import/imp-codes'
import type { Trockenlaufbericht } from '../import/trockenlauf-bericht'
import type {
  PersonAnlegenEin,
  PersonFeldSetzenEin,
  PersonLoeschenEin,
  NameAnlegenEin,
  NameAendernEin,
  NameLoeschenEin,
  ElternschaftAnlegenEin,
  ElternschaftAendernEin,
  ElternschaftLoeschenEin,
  PartnerschaftAnlegenEin,
  PartnerschaftAendernEin,
  PartnerschaftLoeschenEin,
  EreignisAnlegenEin,
  EreignisAendernEin,
  EreignisLoeschenEin,
  BeteiligungLoeschenEin,
  AussageAnlegenEin,
  AussageLoeschenEin,
  OrtAnlegenEin,
} from '../schemata/befehle'
import type { PersonListeAus, PersonListeEin, SucheAus, SucheEin } from '../schemata/person-liste'
import type { PersonDetailAus, PersonDetailEin } from '../schemata/person-detail'
import type { PruefhinweiseAus } from '../schemata/pruefhinweise'
import type { OrtSucheAus, OrtSucheEin } from '../schemata/ort-suche'

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

/**
 * Anzeigeform von `ZuletztEintrag`, wie sie `abfrage:projekt.zuletzt` ausliefert (AP-1.26, S-01):
 * `existiert` kommt aus einem `existsSync(pfad)` beim Beantworten der Abfrage dazu (nur lesend,
 * s. `src/main/projekt/projekt-dienst.ts::projektZuletzt()`) und gehört bewusst NICHT in die
 * Speicherform (`zuletzt-speicher.ts`) — ein verschwundener Ordner soll bei jedem Aufruf neu
 * geprüft werden, nicht als veralteter Snapshot in der Datei stehen bleiben.
 */
export interface ZuletztEintragAnzeige extends ZuletztEintrag {
  readonly existiert: boolean
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
 * Ergebnis von `befehl:projekt.elternordnerWaehlen`/`befehl:projekt.ordnerWaehlen` (S-01,
 * AP-1.26): der im nativen Ordnerdialog gewählte Pfad, oder `null` bei Abbruch. Ein Abbruch ist
 * KEIN Fehler (kein `ok:false`) — die Startansicht bleibt einfach stehen, wie bei
 * `ImportDateiWaehlenAus`.
 */
export type ProjektOrdnerWaehlenAus = string | null

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
 * Nutzlast von `ereignis:projektGeschlossen` (AP-0.20): der Ordnerpfad des Projekts, das gerade
 * geschlossen wurde — z. B. nach einer Wiederherstellung, die `projektSchliessen()` hinter dem
 * Rücken des Renderers auslöst (`src/main/projekt/projekt-dienst.ts`). Der Renderer nutzt `pfad`
 * bislang nur zum Zurücksetzen auf den Startzustand, nicht zum Abgleich mit einem konkret
 * angezeigten Projekt — das Feld steht trotzdem schon jetzt bereit, weil es die Nutzlast ist, die
 * ohnehin ansteht (kein zweiter Vertrag nötig, wenn eine spätere Ansicht sie braucht).
 */
export interface ProjektGeschlossenNutzlast {
  readonly pfad: string
}

/**
 * Nutzlast von `ereignis:zustandsbibliothekOeffnen` (AP-1.11, 72_Screens_und_Flows.md S-19): der
 * Menüpunkt „Entwicklung → Zustandsbibliothek" (nur `!app.isPackaged`,
 * `src/main/menue/menue.ts::entwicklungMenueEintrag`) trägt keine zusätzlichen Daten — er schaltet
 * die Ansicht im Renderer nur um, analog zu `ereignis:projektGeschlossen`. `null` statt eines
 * leeren `{}`-Objekts, weil es fachlich nichts zu übertragen gibt.
 */
export type ZustandsbibliothekOeffnenNutzlast = null

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

/**
 * Nutzlast von `abfrage:import.pruefen` (AP-1.3b, 56_Import_Vertrag.md §4): der Pfad der
 * Importdatei auf der Festplatte. Der Kanal ist bewusst `abfrage:`, nicht `befehl:` — die Prüfung
 * schreibt nichts (§11, ADR-016; U-AP1.3b-kanal in docs/80_Offene_Fragen.md).
 */
export interface ImportPruefenEin {
  readonly pfad: string
}

/**
 * Nutzlast von `befehl:import.trockenlauf` (AP-1.4a, 56_Import_Vertrag.md §6): der Pfad der
 * Importdatei. Bewusst `befehl:`, NICHT `abfrage:` — anders als `abfrage:import.pruefen` SCHREIBT
 * der Trockenlauf während der Ausführung (in einer Transaktion, die anschließend zurückgerollt
 * wird, §6.1) und testet dabei u. a. das Journal; das ist kein reiner Lesevorgang mehr.
 */
export interface ImportTrockenlaufEin {
  readonly pfad: string
}

/**
 * Nutzlast von `befehl:import.ausfuehren` (AP-1.5, 56_Import_Vertrag.md §6.3, ADR-019): der Pfad
 * der Importdatei — derselbe wie bei `befehl:import.trockenlauf`, diesmal schreibt der Kanal
 * tatsächlich (nach erfolgreicher Sondierung, s. `src/main/befehle/import-ausfuehren.ts`).
 */
export interface ImportAusfuehrenEin {
  readonly pfad: string
}

/**
 * Ergebnis von `befehl:import.dateiWaehlen` (AP-1.4b, S-10): der vom Nutzer im nativen
 * Datei-Öffnen-Dialog gewählte Pfad, oder `null`, wenn der Dialog abgebrochen wurde. Ein Abbruch
 * ist KEIN Fehler (kein `ok:false`) — der Assistent bleibt einfach im Schritt „Datei wählen".
 */
export interface ImportDateiWaehlenAus {
  readonly pfad: string | null
}

/**
 * Nutzlast von `befehl:import.berichtSpeichern` (AP-1.4b, S-11/S-13, F-03): der vollständige
 * Bericht, den der Renderer bereits hält (aus Trockenlauf oder Ausführung). Der Hauptprozess
 * formatiert ihn mit `src/main/import/bericht.ts::alsText()` und schreibt ihn nach einem nativen
 * Speicherdialog — die Textbildung bleibt in `main` (§2, der Renderer sieht `alsText` nie).
 */
export interface ImportBerichtSpeichernEin {
  readonly bericht: Trockenlaufbericht
}

/** Ergebnis von `befehl:import.berichtSpeichern`: der Zielpfad, oder `null` bei Abbruch (wie oben). */
export interface ImportBerichtSpeichernAus {
  readonly gespeichertNach: string | null
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
  'befehl:projekt.elternordnerWaehlen': { ein: null; aus: ProjektOrdnerWaehlenAus }
  'befehl:projekt.ordnerWaehlen': { ein: null; aus: ProjektOrdnerWaehlenAus }
  'abfrage:projekt.zuletzt': { ein: null; aus: readonly ZuletztEintragAnzeige[] }
  'befehl:wartung.abgeleiteteNeuAufbauen': { ein: null; aus: null }
  'befehl:person.anlegen': { ein: PersonAnlegenEin; aus: { readonly id: string } }
  'befehl:person.feldSetzen': { ein: PersonFeldSetzenEin; aus: null }
  'befehl:person.loeschen': { ein: PersonLoeschenEin; aus: null }
  'befehl:name.anlegen': { ein: NameAnlegenEin; aus: { readonly id: string } }
  'befehl:name.aendern': { ein: NameAendernEin; aus: null }
  'befehl:name.loeschen': { ein: NameLoeschenEin; aus: null }
  'befehl:elternschaft.anlegen': { ein: ElternschaftAnlegenEin; aus: { readonly id: string } }
  'befehl:elternschaft.aendern': { ein: ElternschaftAendernEin; aus: null }
  'befehl:elternschaft.loeschen': { ein: ElternschaftLoeschenEin; aus: null }
  'befehl:partnerschaft.anlegen': { ein: PartnerschaftAnlegenEin; aus: { readonly id: string } }
  'befehl:partnerschaft.aendern': { ein: PartnerschaftAendernEin; aus: null }
  'befehl:partnerschaft.loeschen': { ein: PartnerschaftLoeschenEin; aus: null }
  'befehl:ereignis.anlegen': { ein: EreignisAnlegenEin; aus: { readonly id: string } }
  'befehl:ereignis.aendern': { ein: EreignisAendernEin; aus: null }
  'befehl:ereignis.loeschen': { ein: EreignisLoeschenEin; aus: null }
  'befehl:beteiligung.loeschen': { ein: BeteiligungLoeschenEin; aus: null }
  'befehl:aussage.anlegen': { ein: AussageAnlegenEin; aus: { readonly id: string } }
  'befehl:aussage.loeschen': { ein: AussageLoeschenEin; aus: null }
  'befehl:journal.undo': { ein: null; aus: UndoErgebnis }
  'befehl:journal.redo': { ein: null; aus: UndoErgebnis }
  'abfrage:journal.verlauf': { ein: JournalVerlaufEin; aus: readonly VerlaufEintrag[] }
  'befehl:schnappschuss.erzeugen': { ein: null; aus: SchnappschussEintrag }
  'abfrage:schnappschuss.liste': { ein: null; aus: readonly SchnappschussEintrag[] }
  'befehl:schnappschuss.wiederherstellen': { ein: SchnappschussWiederherstellenEin; aus: null }
  'abfrage:import.pruefen': { ein: ImportPruefenEin; aus: PruefBericht }
  'befehl:import.trockenlauf': { ein: ImportTrockenlaufEin; aus: Trockenlaufbericht }
  'befehl:import.ausfuehren': { ein: ImportAusfuehrenEin; aus: Trockenlaufbericht }
  'befehl:import.dateiWaehlen': { ein: null; aus: ImportDateiWaehlenAus }
  'befehl:import.berichtSpeichern': { ein: ImportBerichtSpeichernEin; aus: ImportBerichtSpeichernAus }
  'abfrage:person.liste': { ein: PersonListeEin; aus: PersonListeAus }
  'abfrage:suche': { ein: SucheEin; aus: SucheAus }
  'abfrage:person.detail': { ein: PersonDetailEin; aus: PersonDetailAus }
  'abfrage:pruefhinweise': { ein: null; aus: PruefhinweiseAus }
  'befehl:ort.anlegen': { ein: OrtAnlegenEin; aus: { readonly id: string } }
  'abfrage:ort.suche': { ein: OrtSucheEin; aus: OrtSucheAus }
}

export type Kanal = keyof Vertrag
export type Ein<K extends Kanal> = Vertrag[K]['ein']
export type Aus<K extends Kanal> = Vertrag[K]['aus']

/**
 * Die Typkarte der `ereignis:`-Kanäle (Hauptprozess → Renderer, §2.5, AP-0.20) — analog zu
 * `Vertrag` oben, aber ohne `ein`/`aus`-Unterscheidung: ein Ereignis hat nur eine Nutzlast, keine
 * Anfrage. `ereignis:speicherStatus` ist bewusst NICHT enthalten (§7.5, noch kein Kanal).
 */
export interface EreignisVertrag {
  'ereignis:datenGeaendert': DatenGeaendertNutzlast
  'ereignis:journalStatus': JournalStatusNutzlast
  'ereignis:projektGeschlossen': ProjektGeschlossenNutzlast
  'ereignis:zustandsbibliothekOeffnen': ZustandsbibliothekOeffnenNutzlast
}

export type EreignisKanal = keyof EreignisVertrag
export type EreignisNutzlast<K extends EreignisKanal> = EreignisVertrag[K]
