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
import { BeteiligungRolleEnum } from './beteiligung'
import { ElternschaftTypEnum } from './elternschaft'
import { EreignisTypEnum } from './ereignis'
import { NameTypEnum, SchriftEnum } from './name'
import { PartnerschaftTypEnum } from './partnerschaft'
import { GeschlechtEnum, PlatzhalterGrundEnum } from './person'
import { QuelleTypEnum, UnmittelbarkeitEnum } from './quelle'

/** Nutzlast von `abfrage:person.detail`. */
export interface PersonDetailEin {
  readonly personId: string
}

export const personDetailEinSchema: z.ZodType<PersonDetailEin> = z.object({
  personId: z.string(),
})

/** Kopf der Profilseite — Anzeigename und Konfidenz aus `person_flach`, Platzhalter-/
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
 * Typ `null` — die Anzeige entscheidet selbst, ob sie das Feld zeigt. */
export interface PersonDetailBelegQuelle {
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
  readonly quelle: PersonDetailBelegQuelle
  readonly zitat: PersonDetailBelegZitat
  readonly transkript: string | null
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
 * (analog `vergleicheZahlNullsLetzten` in `src/main/abfragen/person-liste.ts`). */
export interface PersonDetailEreignis {
  readonly ereignis_id: string
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
}
