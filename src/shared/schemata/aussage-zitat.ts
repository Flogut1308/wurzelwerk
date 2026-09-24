// §2.7 aussage_zitat (docs/schema/0002_kern.sql; `feld`/`textanker_von`/`textanker_bis` aus
// docs/schema/0007_kennung_textanker.sql, AP-1.34). `feld` wird beim Lesen als freier Text
// toleriert (§31 U-1.34-E3/F1): ein alter oder künftiger Wert bricht das Lesen nicht ab.
//
// AP-1.34 PR-C1b (§31 U-1.34-F1): Wertliste von `feld`. `feld` ist ein Attribut des SUBJEKTS der
// Aussage, je `aussage.subjekt_typ` eine eigene Liste; NULL = der Beleg gilt für die ganze Aussage.
// Kein DB-CHECK (E3) — neue Werte kommen ohne Migration. Der Schreibweg (`aussage_zitat.anlegen`/
// `.aendern`) prüft gegen `BelegFeldEnum` (Zod) UND die Passung zum Subjekttyp (`belegFeldPasst`).
// Die Liste ist bestätigt (Nutzer 24.09.2026, Begründung je Typ: §31 F1). `feld` ≠ NULL nur an einer
// Existenz-Aussage — das prüft der Handler (`belegFeldPruefen`, §31 U-1.34-C1b-feld-praedikat).
import { z } from 'zod'
import type { AussageSubjektTypEnum } from './gemeinsam'

type AussageSubjektTyp = z.infer<typeof AussageSubjektTypEnum>

/** Alle zulässigen `feld`-Werte (Vereinigung der Listen unten; ein Test prüft, dass kein Wert tot ist). */
export const BelegFeldEnum = z.enum([
  'geschlecht',
  'lebend_status',
  'datum',
  'ort',
  'beschreibung',
  'typ',
  'beginn',
  'ende',
  'ende_grund',
  'koordinaten',
  'existiert_von',
  'existiert_bis',
  'vornamen',
  'rufname',
  'nachname',
  'praefix',
  'titel_vor',
  'zusatz_nach',
])

export type BelegFeld = z.infer<typeof BelegFeldEnum>

/**
 * Welche `feld`-Werte zu welchem Subjekttyp passen. Namen folgen den Spalten bzw. Datumsgruppen der
 * Subjekt-Entität (docs/datenmodell.md §2.1–§2.6, §2.12): eine Datumsspaltengruppe (§2.3) ist EIN
 * Feld (`datum`, `beginn`, `ende`), nicht acht.
 * - `person`: nur `geschlecht`/`lebend_status` — Geburts-/Sterbedaten und -orte sind eigene
 *   Aussagen (`praedikat` = `geburtsdatum` …) und damit schon feldgenau; `privat`/`notiz`/
 *   `gesperrt_bis`/Platzhalter sind Verwaltung, nicht belegbar.
 * - `name`: die Bestandteile der flachen Namenssicht (§2.2, `PersonDetailName`).
 * - `diagnose`/`risikofaktor`: bewusst leer (nur NULL) — M-08, kein Editorweg, nicht vorgreifen.
 */
export const BELEG_FELDER_JE_SUBJEKT: { readonly [T in AussageSubjektTyp]: readonly BelegFeld[] } = {
  person: ['geschlecht', 'lebend_status'],
  ereignis: ['datum', 'ort', 'beschreibung'],
  elternschaft: ['typ'],
  partnerschaft: ['beginn', 'ende', 'ende_grund'],
  ort: ['koordinaten', 'existiert_von', 'existiert_bis'],
  name: ['vornamen', 'rufname', 'nachname', 'praefix', 'titel_vor', 'zusatz_nach'],
  diagnose: [],
  risikofaktor: [],
}

/** `true`, wenn `feld` ein Attribut des Subjekttyps `subjektTyp` ist. */
export function belegFeldPasst(subjektTyp: AussageSubjektTyp, feld: string): boolean {
  return BELEG_FELDER_JE_SUBJEKT[subjektTyp].some((erlaubt) => erlaubt === feld)
}

export interface AussageZitat {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

export const aussageZitatSchema: z.ZodType<AussageZitat> = z.object({
  aussage_id: z.string(),
  zitat_id: z.string(),
  feld: z.string().nullable(),
  textanker_von: z.number().int().min(0).nullable(),
  textanker_bis: z.number().int().nullable(),
})
