// AP-1.7 PR-A (Profilseite, lesend): Nutzlast- und Ergebnistypen von `abfrage:person.detail`
// (55_Architektur.md §5). Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/
// SQL — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
//
// Freigegebene Entscheidungen (nicht neu aufmachen, s. Auftrag AP-1.7 PR-A):
// - Belegzahl je Grunddaten-Feld = COUNT über ALLE `aussage_zitat` aller Aussagen dieses
//   Prädikats (nicht je einzelner Aussage).
// - Der Konfidenz-Wert im Kopf ist `person_flach.konfidenz_min` (0003_abgeleitet.sql) — wird hier
//   gelesen, nicht neu berechnet.
// - Beziehungen zeigen ausschließlich direkte Kanten (Eltern/Kinder/Partner). Geschwister sind
//   bewusst NICHT Teil dieser Liste (kein `elternschaft`-Zwischenschritt über einen gemeinsamen
//   Elternteil).
// - Grunddaten = `aussage`-Prädikate (mit Konfidenz je Aussage); der Ereignis-Zeitstrahl liest
//   ausschließlich `ereignis`/`beteiligung` — ein Ereignistyp wie `tod` erscheint NUR im
//   Zeitstrahl, ein Prädikat wie `todesdatum` NUR in den Grunddaten (keine Dopplung).
//
// Designentscheidung dieser Datei (kein Modell-/Scope-Widerspruch, nur eine Formfrage, die der
// Auftrag offen ließ): Ein `PersonDetailAussage`-Eintrag trägt `wert`/`konfidenz`/`ist_bevorzugt`/
// `begruendung` (das sind Spalten von `aussage` selbst) UND eine verschachtelte `belege`-Liste
// (Quelle+Zitat je `aussage_zitat`-Zeile) — `begruendung`/`ist_bevorzugt` stehen NICHT auf jedem
// einzelnen Beleg, weil sie in `docs/schema/0002_kern.sql` Spalten von `aussage` sind, nicht von
// `zitat`/`aussage_zitat`. Eine Aussage mit zwei Zitaten hätte sonst dieselbe Begründung zweimal.
import { z } from 'zod'
import { KERNANGABE_IDS, KERNANGABE_ZUSTAENDE } from '../../core/person/kernangaben'
import { STERBEORT_HERKUNFT } from '../../core/person/sterbeort'
import { EDITOR_FELDER, OFFENE_PUNKTE_REGEL_IDS, OFFENE_PUNKTE_SCHLUESSEL } from '../../core/person/offene-punkte'
import { REITER, type ReiterId } from '../../core/person/reiter'
import type { FeldwarnungFeld } from '../../core/plausibilitaet/feldwarnungen'
import type { BestandHinweisCode } from '../../core/plausibilitaet/regeln'
import { BeteiligungRolleEnum } from './beteiligung'
import { ElternschaftTypEnum } from './elternschaft'
import { EreignisTypEnum } from './ereignis'
import { NameTypEnum, SchriftEnum } from './name'
import { PartnerschaftTypEnum } from './partnerschaft'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from './person'
import { QuelleTypEnum, UnmittelbarkeitEnum } from './quelle'
import type { Textanker } from './befehle'

/** Nutzlast von `abfrage:person.detail`. */
export interface PersonDetailEin {
  readonly personId: string
}

export const personDetailEinSchema: z.ZodType<PersonDetailEin> = z.object({
  personId: z.string(),
})

/** Kopf der Profilseite — Anzeigename aus dem Kern (`anzeigenameFuer`, Vorarbeiten AP-1.30 PR 4a),
 * Konfidenz aus `person_flach`, Platzhalter-/
 * Privat-Status aus `person` (docs/schema/0002_kern.sql, 0003_abgeleitet.sql).
 *
 * `geschlecht`/`platzhalter_grund` (AP-1.14a): bislang nur für die ANZEIGE gebraucht — jetzt zum
 * Vorbefüllen der Kernfelder-Schreibmaske (`befehl:person.feldSetzen`) ergänzt. Read-only wie jede
 * andere Spalte hier; kein neuer Schreibweg (CLAUDE.md §2). */
export interface PersonDetailKopf {
  readonly person_id: string
  readonly anzeigename: string
  readonly konfidenz_min: number | null
  readonly ist_platzhalter: boolean
  readonly privat: boolean
  readonly geschlecht: z.infer<typeof GeschlechtEnum> | null
  readonly platzhalter_grund: z.infer<typeof PlatzhalterGrundEnum> | null
  /** `person.kennung` (AP-1.34 PR-C1b, §31 U-1.34-E1/E10): die ROHE Zahl ≥ 1; NULL möglich (E13,
   * Undo eines Journaleintrags von vor 0007). Anzeige „P-0142"/„–" nur über `kennungAnzeige`
   * (src/core/person/kennung.ts) — kein Text hier, keine Kennung in `person_flach`/Suche (E9). */
  readonly kennung: number | null
  /** `person.lebend_status` (AP-1.34 PR-C2a) — `null` = nicht erfasst. Read-only wie `geschlecht`. */
  readonly lebend_status: z.infer<typeof LebendStatusEnum> | null
}

/** Eine `name`-Zeile dieser Person (AP-1.14a, Kernfelder-Schreibmaske) — read-only Spiegel der
 * `name`-Tabelle (docs/schema/0002_kern.sql §2.2), NUR die Spalten, die die Kernfelder-Maske
 * bearbeitet (`befehl:name.anlegen`/`.aendern`). Kein `konfidenz`/`beleg`-Slot (ADR-026: Name
 * trägt keine Aussage). */
export interface PersonDetailName {
  readonly id: string
  readonly typ: z.infer<typeof NameTypEnum>
  readonly schrift: z.infer<typeof SchriftEnum> | null
  readonly vornamen: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titel_vor: string | null
  readonly zusatz_nach: string | null
  readonly rufname_text: string | null
}

/** Stufe 1 eines Belegs (S-08): die Quelle selbst — `docs/schema/0002_kern.sql` §2.7/§2.15.
 * `archiv_name` kommt über `quelle.archiv_id` → `archiv.name` (LEFT JOIN, kann fehlen).
 * `unmittelbarkeit` ist nur bei `typ === 'muendlich'` sinnvoll befüllt (§2.15), bei jedem anderen
 * Typ `null` — die Anzeige entscheidet selbst, ob sie das Feld zeigt.
 *
 * `id` (AP-1.17 PR-C1, docs/80_Offene_Fragen.md §29): ergänzt, damit der Belegapparat einen
 * „Quelle bearbeiten"-Link zur passenden `abfrage:quelle.detail`/Pflege-Ansicht setzen kann — ohne
 * sie wäre eine bereits belegte Quelle aus dem Profil heraus nicht erreichbar gewesen. */
export interface PersonDetailBelegQuelle {
  readonly id: string
  readonly typ: z.infer<typeof QuelleTypEnum>
  readonly titel: string | null
  readonly archiv_name: string | null
  readonly signatur: string | null
  readonly unmittelbarkeit: z.infer<typeof UnmittelbarkeitEnum> | null
}

/** Stufe 2 eines Belegs (S-08): das konkrete Zitat innerhalb der Quelle — `docs/schema/
 * 0002_kern.sql` §2.7 (`zitat`). */
export interface PersonDetailBelegZitat {
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly zugriffsdatum_wert1: string | null
  readonly digitalisat_url: string | null
}

/** Ein einzelner Beleg einer Aussage — eine `aussage_zitat`-Zeile, aufgelöst über
 * `zitat`/`quelle`/`archiv`. DREISTUFIG (S-08, U-1.7-belegliste-zweistufig, AP-1.10 PR-B):
 * Quelle → Zitat → Transkript (Stufe 3, `zitat.transkript`, hier auf oberster Ebene, weil er der
 * am häufigsten gezeigte Teil ist, nicht in `zitat` verschachtelt). */
export interface PersonDetailBeleg {
  /** `aussage_zitat.zitat_id` (AP-1.34 PR-C1b, F3) — Schlüssel für `befehl:aussage_zitat.aendern`. */
  readonly zitat_id: string
  readonly quelle: PersonDetailBelegQuelle
  readonly zitat: PersonDetailBelegZitat
  readonly transkript: string | null
  /** `aussage_zitat.feld` (AP-1.34 PR-C1b, F1/F3): das belegte Attribut des Subjekts, NULL = ganze
   * Aussage. Bewusst `string`, nicht `BelegFeld`: ein Wert außerhalb der heutigen Wertliste (Altbestand,
   * künftige Version, kein DB-CHECK, E3) wird unverändert durchgereicht statt die Abfrage abzubrechen
   * oder still auf NULL zu fallen — die Anzeige prüft ihn mit `BelegFeldEnum.safeParse`. */
  readonly feld: string | null
  /** Ausschnitt [von, bis) des Transkripts in UTF-16-Codeeinheiten (B-01, §31 U-1.34-R2) oder NULL. */
  readonly textanker: Textanker | null
}

/** Eine einzelne `aussage`-Zeile eines Grunddaten-Felds, mit ihren Belegen. */
export interface PersonDetailAussage {
  readonly aussage_id: string
  readonly wert: string | null
  readonly konfidenz: number | null
  readonly ist_bevorzugt: boolean
  readonly begruendung: string | null
  readonly belege: readonly PersonDetailBeleg[]
}

/** Ein Grunddaten-Feld — alle `aussage`-Zeilen EINES `praedikat`s für diese Person, plus die daraus
 * abgeleitete Belegzahl (Entscheidung: Summe über ALLE Aussagen dieses Prädikats) und ZWEI
 * getrennte E21-Zeichen (hueter-Auflage 1, PR #65):
 * - `hat_widerspruch` — UNAUFGELÖSTER Konflikt (mind. zwei unterscheidbare Werte UND keiner
 *   bevorzugt). Spiegelt den Trigger `abl_aussage_ai` (`docs/schema/0003_abgeleitet.sql`,
 *   `src/core/aussage/widerspruch.ts`).
 * - `hatKonkurrierende` — es EXISTIEREN mindestens zwei unterscheidbare Werte, UNABHÄNGIG davon,
 *   ob einer bevorzugt ist. Bleibt also `true`, auch wenn `hat_widerspruch` durch eine
 *   Bevorzugung bereits auf `false` gefallen ist (der `wert`/`konfidenz`-Anzeigewert oben kollabiert
 *   das Wert-Tupel auf die bevorzugte bzw. erste Aussage — dieses Feld macht die dahinterliegende
 *   Konkurrenz trotzdem sichtbar).
 */
export interface PersonDetailGrunddatenFeld {
  readonly praedikat: string
  readonly wert: string | null
  readonly konfidenz: number | null
  readonly belegzahl: number
  readonly hat_widerspruch: boolean
  readonly hatKonkurrierende: boolean
  readonly aussagen: readonly PersonDetailAussage[]
}

/** Ein Eintrag im Ereignis-Zeitstrahl — eine `ereignis`-Zeile, an der diese Person über
 * `beteiligung` teilnimmt. Chronologisch nach `datum_sort_von` sortiert, unbekannte Daten zuletzt
 * (analog `vergleicheZahlNullsLetzten` in `src/main/abfragen/person-liste.ts`). `beteiligung_id`
 * (AP-1.15 PR-A) ist die `beteiligung.id`-Zeile GENAU dieser Person an GENAU diesem Ereignis —
 * `befehl:beteiligung.loeschen` braucht sie, um NUR die Teilnahme dieser Person zu entfernen,
 * nicht das Ereignis selbst (das mit weiteren Beteiligten bestehen bleibt). */
export interface PersonDetailEreignis {
  readonly ereignis_id: string
  readonly beteiligung_id: string
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly rolle: z.infer<typeof BeteiligungRolleEnum>
  readonly datum_wert1: string | null
  readonly datum_sort_von: number | null
  readonly ort_name: string | null
  readonly beschreibung: string | null
}

export const PersonDetailBeziehungRichtungEnum = z.enum(['elternteil', 'kind', 'partner'])

/** Ein direkter Beziehungs-Eintrag (nur Eltern/Kinder/Partner, KEINE Geschwister, s. Kopfkommentar).
 * `kantentyp` ist `elternschaft.typ` (biologisch/adoptiv/stief/…) bei `richtung`
 * `'elternteil'`/`'kind'`, `partnerschaft.typ` bei `'partner'`.
 *
 * `ist_platzhalter` (U-1.7-beziehung-platzhalter, A-17, AP-1.10 PR-B): das ECHTE
 * `person.ist_platzhalter`-Flag der VERWANDTEN Person (JOIN, `docs/80_Offene_Fragen.md` §19) —
 * NICHT über einen leeren `anzeigename` erraten. Ein leerer `anzeigename` allein sagt nur „kein
 * bevorzugter Name gepflegt" (`abl_person_ai`, `docs/schema/0003_abgeleitet.sql`) und trifft auch
 * auf echte, noch namenlose Personen zu — die zweite, praktisch häufigere Fehlrichtung, die dieses
 * Feld behebt. */
export interface PersonDetailBeziehung {
  readonly person_id: string
  readonly anzeigename: string
  readonly richtung: z.infer<typeof PersonDetailBeziehungRichtungEnum>
  readonly kantentyp: z.infer<typeof ElternschaftTypEnum> | z.infer<typeof PartnerschaftTypEnum>
  readonly ist_platzhalter: boolean
}

export const PersonDetailGesundheitArtEnum = z.enum(['diagnose', 'risikofaktor'])

/** Ein Gesundheitseintrag (`diagnose` ODER `risikofaktor`, docs/schema/0002_kern.sql §2.12) — M-08
 * gilt für JEDEN Export (GEDCOM, Lesemodus für Verwandte), NICHT für diese lesende Profil-Abfrage
 * innerhalb der eigenen App; die Ausschlussregel gehört in den jeweiligen Exportcode. */
export interface PersonDetailGesundheitseintrag {
  readonly id: string
  readonly art: z.infer<typeof PersonDetailGesundheitArtEnum>
  readonly bezeichnung: string | null
  readonly status: string | null
  readonly konfidenz: number | null
  readonly notiz: string | null
}

/** Herkunft des Sterbeorts (AP-1.34 PR-C2a, §31 U-1.34-E5): die Aussage `todesort` ist führend,
 * sonst der Ort des Tod-Ereignisses (Rolle `verstorbener`). Auflösung im Kern
 * (`src/core/person/sterbeort.ts`). */
export const SterbeortHerkunftEnum = z.enum(STERBEORT_HERKUNFT)

/** Sterbeort der Person. `ort_id`/`ort_name` sind `null`, wenn die führende Aussage nur einen
 * freien Text trägt (dann steht der Text im Grunddatenfeld `todesort`) bzw. der Ort keinen Namen
 * hat. `aussage_id` nur bei `herkunft = 'aussage'`. */
export interface PersonDetailSterbeort {
  readonly herkunft: z.infer<typeof SterbeortHerkunftEnum>
  readonly ort_id: string | null
  readonly ort_name: string | null
  readonly aussage_id: string | null
}

/** Eine Feldwarnung (AP-1.34 PR-C2b, F-07, docs/80_Offene_Fragen.md §31 U-1.34-C2-O1): ein
 * Bestandshinweis aus AP-1.8 an DIESER Person, mit Sprungziel (Entwicklungsvorgaben §3.1 Reiter,
 * §5.5 `tab`/`field`). Zuordnung im Kern (`feldZielFuer`, `src/core/plausibilitaet/feldwarnungen.ts`),
 * kein eigener Text — der Renderer leitet ihn aus `code` ab. Blockiert nie (Vorgaben §1). */
export interface PersonDetailWarnung {
  readonly code: BestandHinweisCode
  readonly reiter: ReiterId
  readonly feld: FeldwarnungFeld
}

/** Offene Punkte (AP-1.34 PR-C2c, Vorgaben §5.5, §31 U-1.34-C2-O2…O5): Enums aus den
 * Kern-Konstanten (`src/core/person/offene-punkte.ts`, `reiter.ts`) — eine Quelle der Werte. */
export const OffenePunkteRegelIdEnum = z.enum(OFFENE_PUNKTE_REGEL_IDS)
export const EditorReiterEnum = z.enum(REITER)
export const EditorFeldEnum = z.enum(EDITOR_FELDER)
export const OffenerPunktSchluesselEnum = z.enum(OFFENE_PUNKTE_SCHLUESSEL)

/** Ein offener Punkt (AP-1.34 PR-C2c): Regel, Sprungziel (Vorgaben §5.5 `tab`/`field`) und
 * Meldungsschlüssel (`profil.json`, `offener_punkt_*`). `bezug_id` = betroffener Datensatz (bei
 * `kind_ohne_partnerschaft` das Kind), sonst `null`. Kein Text — der Renderer übersetzt den Schlüssel. */
export interface PersonDetailOffenerPunkt {
  readonly regel_id: z.infer<typeof OffenePunkteRegelIdEnum>
  readonly reiter: z.infer<typeof EditorReiterEnum>
  readonly feld: z.infer<typeof EditorFeldEnum>
  readonly meldungsschluessel: z.infer<typeof OffenerPunktSchluesselEnum>
  readonly bezug_id: string | null
}

/** Kernangaben-Ids (AP-1.34 PR-D, ADR-031) aus der Kern-Konstante — eine Quelle der Werte. */
export const KernangabeIdEnum = z.enum(KERNANGABE_IDS)

/** Zustände je Kernangabe (Nachtrag ADR-031, 25.09.2026) aus der Kern-Konstante. */
export const KernangabeZustandEnum = z.enum(KERNANGABE_ZUSTAENDE)

/** Eine Zeile der Aufschlüsselung: `belegt` (erfüllt mit Beleg), `vorhanden` (erfüllt ohne Beleg —
 * Geschlecht, Name, Ereignis-Rückfall), `unbelegt` (Wert ohne Beleg, zählt nicht), `fehlt`. */
export interface PersonDetailKernangabeEintrag {
  readonly id: z.infer<typeof KernangabeIdEnum>
  readonly zustand: z.infer<typeof KernangabeZustandEnum>
}

/** Vollständigkeitsgrad (AP-1.34 PR-D, ADR-031, Vorgaben §3.1 „68 % der Kernangaben belegt"):
 * berechnet NUR in `kernangabenAuswerten` (src/core/person/kernangaben.ts), nichts gespeichert.
 * `fehlend` ist eine Multimenge in fester Reihenfolge (`elternteil` kann zweimal vorkommen),
 * `fehlend.length === anwendbar - erfuellt`. Kein Text — der Renderer übersetzt die Ids. */
export interface PersonDetailKernangaben {
  readonly erfuellt: number
  readonly anwendbar: number
  readonly prozent: number
  readonly fehlend: readonly z.infer<typeof KernangabeIdEnum>[]
  /** Nachtrag ADR-031: eine Zeile je anwendbarer Angabe, gleiche Reihenfolge wie `fehlend`;
   * `fehlend` = die Ids mit `unbelegt`/`fehlt`. */
  readonly aufschluesselung: readonly PersonDetailKernangabeEintrag[]
}

/** Antwort von `abfrage:person.detail`.
 *
 * `namen` (AP-1.14a): read-only Ergänzung für die Kernfelder-Schreibmaske (§2 Auftrag „prüfe, ob
 * `abfrage:person.detail` die Namensliste liefert" — sie tat es vorher nicht; ergänzt hier statt
 * eines zweiten Abfragekanals, weil die Profilseite ohnehin schon EINEN vollständigen
 * Personen-Datensatz lädt). */
export interface PersonDetailAus {
  readonly kopf: PersonDetailKopf
  readonly namen: readonly PersonDetailName[]
  readonly grunddaten: readonly PersonDetailGrunddatenFeld[]
  readonly ereignisse: readonly PersonDetailEreignis[]
  readonly beziehungen: readonly PersonDetailBeziehung[]
  readonly gesundheit: readonly PersonDetailGesundheitseintrag[]
  readonly notiz: string | null
  /** AP-1.34 PR-C2a: `null` = weder Aussage `todesort` noch Tod-Ereignis mit Ort. */
  readonly sterbeort: PersonDetailSterbeort | null
  /** AP-1.34 PR-C2b: Feldwarnungen dieser Person, geordnet nach der Regelreihenfolge
   * (`BESTAND_HINWEIS_CODES`); Mehrfachfunde bleiben erhalten. Leer für Platzhalter (A-17). */
  readonly warnungen: readonly PersonDetailWarnung[]
  /** AP-1.34 PR-C2c: offene Punkte in Regelreihenfolge (`OFFENE_PUNKTE_REGELN`), nur aktive Regeln.
   * Leer für Platzhalter (§31 U-1.34-C2-O4). */
  readonly offene_punkte: readonly PersonDetailOffenerPunkt[]
  /** AP-1.34 PR-D: Vollständigkeitsgrad; `null` = Platzhalter (A-17, E7 — ausgenommen, nicht 0 %). */
  readonly kernangaben: PersonDetailKernangaben | null
}
