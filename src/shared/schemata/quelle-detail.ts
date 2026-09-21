// AP-1.17 PR-A2 (docs/schema/0002_kern.sql §2.7 + §2.15 „mündlich"): Nutzlast-/Ergebnistyp von
// `abfrage:quelle.detail` — die lesende Grundlage der (noch zu bauenden, PR-C) Quellen-Detailseite.
// Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL — `src/shared` bleibt
// Electron-/SQL-frei (CLAUDE.md §2).
//
// Zeigt die Quelle selbst (`kopf`, alle Spalten aus `./quelle`, ZUSÄTZLICH `archiv_name` — der
// bevorzugte Anzeigename ist hier einfach `archiv.name`, es gibt dort — anders als bei `ort` —
// keine Mehrfachbenennung) + ihre `zitat`-Zeilen (`zitate`, dreistufig Quelle → Zitat →
// Transkript, S-08/AP-1.10 PR-B). Bewusst KEIN Schreibpfad für Zitate hier (das bleibt PR-A3).
import { z } from 'zod'
import { KalenderEnum, DatumModifikatorEnum, DatumPraezisionEnum } from './gemeinsam'
import { InformationsartEnum, QuelleArtEnum, QuelleFormEnum, QuelleTypEnum, UnmittelbarkeitEnum } from './quelle'

/** Nutzlast von `abfrage:quelle.detail`. */
export interface QuelleDetailEin {
  readonly quelleId: string
}

export const quelleDetailEinSchema: z.ZodType<QuelleDetailEin> = z.object({
  quelleId: z.string(),
})

/** Stammfelder von `quelle` (docs/schema/0002_kern.sql §2.7 + §2.15) + `archiv_name`
 * (`archiv.name` des über `archiv_id` verknüpften Archivs, `null` ohne Archiv). */
export interface QuelleDetailKopf {
  readonly id: string
  readonly typ: z.infer<typeof QuelleTypEnum>
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: z.infer<typeof QuelleArtEnum> | null
  readonly informationsart: z.infer<typeof InformationsartEnum> | null
  readonly archiv_id: string | null
  readonly archiv_name: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informant_person_id: string | null
  readonly gespraechsdatum_kalender: z.infer<typeof KalenderEnum> | null
  readonly gespraechsdatum_modifikator: z.infer<typeof DatumModifikatorEnum> | null
  readonly gespraechsdatum_praezision: z.infer<typeof DatumPraezisionEnum> | null
  readonly gespraechsdatum_wert1: string | null
  readonly gespraechsdatum_wert2: string | null
  readonly gespraechsdatum_originaltext: string | null
  readonly gespraechsdatum_zweitkalender: z.infer<typeof KalenderEnum> | null
  readonly gespraechsdatum_zweitwert: string | null
  readonly gespraechsdatum_doppeljahr: string | null
  readonly form: z.infer<typeof QuelleFormEnum> | null
  readonly unmittelbarkeit: z.infer<typeof UnmittelbarkeitEnum> | null
  readonly audio_medium_id: string | null
}

/** Eine `zitat`-Zeile (docs/schema/0002_kern.sql §2.7), read-only. `zugriffsdatum_*`
 * bewusst weggelassen — Anzeige nur, keine Bearbeitung (die bleibt PR-A3). */
export interface QuelleDetailZitat {
  readonly id: string
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly band: string | null
  readonly jahr: number | null
  readonly zeitmarke_sekunden: number | null
  readonly digitalisat_url: string | null
  readonly transkript: string | null
  readonly uebersetzung: string | null
  readonly konfidenz: number | null
}

/** Antwort von `abfrage:quelle.detail`. */
export interface QuelleDetailAus {
  readonly kopf: QuelleDetailKopf
  readonly zitate: readonly QuelleDetailZitat[]
}
