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
import { PartnerschaftTypEnum } from './partnerschaft'

/** Nutzlast von `abfrage:person.detail`. */
export interface PersonDetailEin {
  readonly personId: string
}

export const personDetailEinSchema: z.ZodType<PersonDetailEin> = z.object({
  personId: z.string(),
})

/** Kopf der Profilseite — Anzeigename und Konfidenz aus `person_flach`, Platzhalter-/
 * Privat-Status aus `person` (docs/schema/0002_kern.sql, 0003_abgeleitet.sql). */
export interface PersonDetailKopf {
  readonly person_id: string
  readonly anzeigename: string
  readonly konfidenz_min: number | null
  readonly ist_platzhalter: boolean
  readonly privat: boolean
}

/** Ein einzelner Beleg (Quelle + Zitat) einer Aussage — eine `aussage_zitat`-Zeile, aufgelöst über
 * `zitat`/`quelle`. `quelle` ist die Anzeigebezeichnung der Quelle (Titel, sonst Typ als Fallback,
 * s. `src/main/abfragen/person-detail.ts`), `zitat` ist `zitat.transkript`. */
export interface PersonDetailBeleg {
  readonly quelle: string
  readonly zitat: string | null
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
 * abgeleitete Belegzahl (Entscheidung: Summe über ALLE Aussagen dieses Prädikats) und der
 * Widerspruchs-Zustand (`src/core/aussage/widerspruch.ts`, spiegelt den Trigger aus
 * `docs/schema/0003_abgeleitet.sql`). */
export interface PersonDetailGrunddatenFeld {
  readonly praedikat: string
  readonly wert: string | null
  readonly konfidenz: number | null
  readonly belegzahl: number
  readonly hat_widerspruch: boolean
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
 * `'elternteil'`/`'kind'`, `partnerschaft.typ` bei `'partner'`. */
export interface PersonDetailBeziehung {
  readonly person_id: string
  readonly anzeigename: string
  readonly richtung: z.infer<typeof PersonDetailBeziehungRichtungEnum>
  readonly kantentyp: z.infer<typeof ElternschaftTypEnum> | z.infer<typeof PartnerschaftTypEnum>
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

/** Antwort von `abfrage:person.detail`. */
export interface PersonDetailAus {
  readonly kopf: PersonDetailKopf
  readonly grunddaten: readonly PersonDetailGrunddatenFeld[]
  readonly ereignisse: readonly PersonDetailEreignis[]
  readonly beziehungen: readonly PersonDetailBeziehung[]
  readonly gesundheit: readonly PersonDetailGesundheitseintrag[]
  readonly notiz: string | null
}
