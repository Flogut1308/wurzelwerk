// AP-0.9, 55_Architektur.md §4 (Befehlsbus): Nutzlast-Schemata der ersten echten Befehle
// (`befehl:person.anlegen`, `befehl:person.feldSetzen`, `befehl:person.loeschen`). Reine
// Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL — `src/shared` bleibt
// Electron-/SQL-frei (CLAUDE.md §2).
//
// AP-1.12 ergänzt die Schreibbefehle für `name`/`elternschaft`/`partnerschaft`/`ereignis`/
// `aussage`. Enums werden bewusst aus den bestehenden DB-Kern-Schemata (`./name`, `./elternschaft`,
// `./partnerschaft`, `./ereignis`, `./beteiligung`) wiederverwendet statt hier neu definiert — sie
// spiegeln exakt die `CHECK`-Klauseln aus `docs/schema/0002_kern.sql`, ein zweites, lokales Enum
// wäre eine drift-anfällige Kopie. `Datumswert`/`datumswertSchema` kommen analog aus
// `./import-v1` (dieselbe Vertragsform + dieselben §2.4-Prüfregeln, s. Exportkommentar dort).
import { z } from 'zod'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from './person'
import { BoolWert, KonfidenzSchema, SubjektTypEnum } from './gemeinsam'
import { NameTypEnum, SchriftEnum, UmschriftNormEnum } from './name'
import { ElternschaftTypEnum } from './elternschaft'
import { PartnerschaftTypEnum, EndeGrundEnum } from './partnerschaft'
import { EreignisTypEnum } from './ereignis'
import { BeteiligungRolleEnum } from './beteiligung'
import { OrtTypEnum } from './ort'
import { type Datumswert, datumswertSchema } from './import-v1'

/** Liste bestehender `zitat.id`-Werte, mit denen eine neue Aussage verknüpft wird (AP-1.12) —
 * bewusst NUR Kennungen, keine `quelle`/`zitat`-Anlage in diesem Arbeitspaket (das bleibt dem
 * Import-Pfad, `src/main/import/schreiben.ts`, vorbehalten). Leer/`undefined`, wenn (noch) kein
 * Beleg vorliegt — anders als der Import-Vertrag (`belegeSchema`, min. 1) erzwingen die
 * Schreibbefehle hier keinen Beleg, weil eine frisch im Baum erfasste Aussage zunächst unbelegt
 * bleiben können muss (z. B. eine mündliche Erinnerung ohne Quelle). */
const zitatIdsSchema = z.array(z.string()).optional()

/**
 * Nutzlast von `befehl:person.anlegen` — alle `person`-Spalten aus `docs/schema/0002_kern.sql`
 * außer `id` (wird vom Handler per `neueId()` vergeben, D-3) und `erstellt_am`/`geaendert_am`
 * (werden vom Handler per `Date.now()` gesetzt, D-3 — `Date.now()` steht in `src/main/`, nie in
 * `src/core/`, CLAUDE.md §4).
 */
export interface PersonAnlegenEin {
  readonly geschlecht?: z.infer<typeof GeschlechtEnum> | undefined
  readonly lebend_status?: z.infer<typeof LebendStatusEnum> | undefined
  readonly privat: 0 | 1
  readonly notiz?: string | undefined
  readonly gesperrt_bis?: number | undefined
  readonly ist_platzhalter: 0 | 1
  readonly platzhalter_grund?: z.infer<typeof PlatzhalterGrundEnum> | undefined
}

export const personAnlegenEinSchema: z.ZodType<PersonAnlegenEin> = z.object({
  geschlecht: GeschlechtEnum.optional(),
  lebend_status: LebendStatusEnum.optional(),
  privat: BoolWert,
  notiz: z.string().optional(),
  gesperrt_bis: z.number().int().optional(),
  ist_platzhalter: BoolWert,
  platzhalter_grund: PlatzhalterGrundEnum.optional(),
})

/**
 * Nutzlast von `befehl:person.feldSetzen` — eine diskriminierte Union pro Feld (D-FELD), damit
 * `wert` je Feld exakt typisiert ist (kein `wert: unknown`, kein dynamischer Spaltenname). Der
 * `person-repo` schreibt für jeden Zweig festes SQL (CLAUDE.md §6).
 */
export type PersonFeldSetzenEin =
  | { readonly id: string; readonly feld: 'geschlecht'; readonly wert: z.infer<typeof GeschlechtEnum> }
  | { readonly id: string; readonly feld: 'lebend_status'; readonly wert: z.infer<typeof LebendStatusEnum> }
  | { readonly id: string; readonly feld: 'privat'; readonly wert: 0 | 1 }
  | { readonly id: string; readonly feld: 'notiz'; readonly wert: string }
  | { readonly id: string; readonly feld: 'gesperrt_bis'; readonly wert: number }
  | { readonly id: string; readonly feld: 'ist_platzhalter'; readonly wert: 0 | 1 }
  | { readonly id: string; readonly feld: 'platzhalter_grund'; readonly wert: z.infer<typeof PlatzhalterGrundEnum> }

export const personFeldSetzenEinSchema: z.ZodType<PersonFeldSetzenEin> = z.discriminatedUnion('feld', [
  z.object({ id: z.string(), feld: z.literal('geschlecht'), wert: GeschlechtEnum }),
  z.object({ id: z.string(), feld: z.literal('lebend_status'), wert: LebendStatusEnum }),
  z.object({ id: z.string(), feld: z.literal('privat'), wert: BoolWert }),
  z.object({ id: z.string(), feld: z.literal('notiz'), wert: z.string() }),
  z.object({ id: z.string(), feld: z.literal('gesperrt_bis'), wert: z.number().int() }),
  z.object({ id: z.string(), feld: z.literal('ist_platzhalter'), wert: BoolWert }),
  z.object({ id: z.string(), feld: z.literal('platzhalter_grund'), wert: PlatzhalterGrundEnum }),
])

/** Nutzlast von `befehl:person.loeschen`. */
export interface PersonLoeschenEin {
  readonly id: string
}

export const personLoeschenEinSchema: z.ZodType<PersonLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// name.anlegen / name.aendern / name.loeschen (AP-1.12)
// -----------------------------------------------------------------------------------------------

/** Editierbare `name`-Spalten (docs/schema/0002_kern.sql §2.2), ohne `id`/`erstellt_am`/
 * `geaendert_am` (Handler, D-3). `name.anlegen` schreibt bewusst KEINE Existenz-Aussage (ADR-026)
 * — anders als `elternschaft`/`partnerschaft`/`ereignis`: der Import-Orchestrator
 * (`src/main/import/schreiben.ts`) ruft `merkeExistenzAussage()` für `name` ebenfalls nicht auf. */
export interface NameAnlegenEin {
  readonly personId: string
  readonly typ: z.infer<typeof NameTypEnum>
  readonly schrift?: z.infer<typeof SchriftEnum> | undefined
  readonly umschriftVon?: string | undefined
  readonly umschriftNorm?: z.infer<typeof UmschriftNormEnum> | undefined
  readonly vornamen?: string | undefined
  readonly rufnameIndex?: number | undefined
  readonly rufnameText?: string | undefined
  readonly nachname?: string | undefined
  readonly praefix?: string | undefined
  readonly titelVor?: string | undefined
  readonly zusatzNach?: string | undefined
  readonly originalText?: string | undefined
  readonly sprache?: string | undefined
  readonly istBevorzugt?: 0 | 1 | undefined
  readonly gueltigVon?: number | undefined
  readonly gueltigBis?: number | undefined
}

export const nameAnlegenEinSchema: z.ZodType<NameAnlegenEin> = z.object({
  personId: z.string(),
  typ: NameTypEnum,
  schrift: SchriftEnum.optional(),
  umschriftVon: z.string().optional(),
  umschriftNorm: UmschriftNormEnum.optional(),
  vornamen: z.string().optional(),
  rufnameIndex: z.number().int().optional(),
  rufnameText: z.string().optional(),
  nachname: z.string().optional(),
  praefix: z.string().optional(),
  titelVor: z.string().optional(),
  zusatzNach: z.string().optional(),
  originalText: z.string().optional(),
  sprache: z.string().optional(),
  istBevorzugt: BoolWert.optional(),
  gueltigVon: z.number().int().optional(),
  gueltigBis: z.number().int().optional(),
})

/** Nutzlast von `befehl:name.aendern` — alle editierbaren Spalten außer `person_id` (ein Name
 * wird nicht zwischen Personen verschoben; dafür gibt es `name.loeschen` + `name.anlegen`). */
export interface NameAendernEin {
  readonly id: string
  readonly typ: z.infer<typeof NameTypEnum>
  readonly schrift?: z.infer<typeof SchriftEnum> | undefined
  readonly umschriftVon?: string | undefined
  readonly umschriftNorm?: z.infer<typeof UmschriftNormEnum> | undefined
  readonly vornamen?: string | undefined
  readonly rufnameIndex?: number | undefined
  readonly rufnameText?: string | undefined
  readonly nachname?: string | undefined
  readonly praefix?: string | undefined
  readonly titelVor?: string | undefined
  readonly zusatzNach?: string | undefined
  readonly originalText?: string | undefined
  readonly sprache?: string | undefined
  readonly istBevorzugt?: 0 | 1 | undefined
  readonly gueltigVon?: number | undefined
  readonly gueltigBis?: number | undefined
}

export const nameAendernEinSchema: z.ZodType<NameAendernEin> = z.object({
  id: z.string(),
  typ: NameTypEnum,
  schrift: SchriftEnum.optional(),
  umschriftVon: z.string().optional(),
  umschriftNorm: UmschriftNormEnum.optional(),
  vornamen: z.string().optional(),
  rufnameIndex: z.number().int().optional(),
  rufnameText: z.string().optional(),
  nachname: z.string().optional(),
  praefix: z.string().optional(),
  titelVor: z.string().optional(),
  zusatzNach: z.string().optional(),
  originalText: z.string().optional(),
  sprache: z.string().optional(),
  istBevorzugt: BoolWert.optional(),
  gueltigVon: z.number().int().optional(),
  gueltigBis: z.number().int().optional(),
})

export interface NameLoeschenEin {
  readonly id: string
}

export const nameLoeschenEinSchema: z.ZodType<NameLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// elternschaft.anlegen / elternschaft.aendern / elternschaft.loeschen (AP-1.12)
// -----------------------------------------------------------------------------------------------

/** `konfidenz`/`belege` speisen die Existenz-Aussage (ADR-026) der neuen Kante — `elternschaft`
 * selbst trägt seit ADR-026 keine eigene `konfidenz`-Spalte mehr (s. `src/main/repositories/
 * beziehung-repo.ts::ElternschaftEinfuegenEin`-Kommentar). Zyklusfreiheit prüft der Handler über
 * `src/core/graph/zyklus.ts::wuerdeZyklusErzeugen` — kein Zod-Refinement, weil das den gesamten
 * bestehenden Elternschaftsgraphen (eine DB-Abfrage) bräuchte, den ein reines Schema nicht sieht. */
export interface ElternschaftAnlegenEin {
  readonly elternteilId: string
  readonly kindId: string
  readonly typ: z.infer<typeof ElternschaftTypEnum>
  readonly notiz?: string | undefined
  readonly konfidenz: number
  readonly belege?: readonly string[] | undefined
}

export const elternschaftAnlegenEinSchema: z.ZodType<ElternschaftAnlegenEin> = z.object({
  elternteilId: z.string(),
  kindId: z.string(),
  typ: ElternschaftTypEnum,
  notiz: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: zitatIdsSchema,
})

/** Nutzlast von `befehl:elternschaft.aendern` — NUR `typ`/`notiz` (Nutzerentscheidung, AP-1.12):
 * `elternteil_id`/`kind_id` ändern heißt fachlich eine andere Kante, nicht dieselbe bearbeiten. */
export interface ElternschaftAendernEin {
  readonly id: string
  readonly typ: z.infer<typeof ElternschaftTypEnum>
  readonly notiz?: string | undefined
}

export const elternschaftAendernEinSchema: z.ZodType<ElternschaftAendernEin> = z.object({
  id: z.string(),
  typ: ElternschaftTypEnum,
  notiz: z.string().optional(),
})

export interface ElternschaftLoeschenEin {
  readonly id: string
}

export const elternschaftLoeschenEinSchema: z.ZodType<ElternschaftLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// partnerschaft.anlegen / partnerschaft.aendern / partnerschaft.loeschen (AP-1.12)
// -----------------------------------------------------------------------------------------------

/** Ein Beteiligter beim Anlegen einer Partnerschaft (`partnerschaft_person`,
 * docs/schema/0002_kern.sql §2.6) — `rolle` bleibt bewusst ein freier String ohne Enum: die
 * Tabelle selbst hat dafür KEINEN `CHECK` (dokumentierte Modelllücke, s. Kommentar in
 * `src/shared/schemata/partnerschaft-person.ts`). */
export interface PartnerschaftBeteiligterEin {
  readonly personId: string
  readonly rolle?: string | undefined
}

const partnerschaftBeteiligterEinSchema: z.ZodType<PartnerschaftBeteiligterEin> = z.object({
  personId: z.string(),
  rolle: z.string().optional(),
})

/** `konfidenz`/`belege` speisen die Existenz-Aussage (ADR-026) — `partnerschaft` hat keine eigene
 * `konfidenz`-Spalte (s. `src/main/repositories/beziehung-repo.ts`). */
export interface PartnerschaftAnlegenEin {
  readonly typ: z.infer<typeof PartnerschaftTypEnum>
  readonly beteiligte: readonly PartnerschaftBeteiligterEin[]
  readonly beginn?: Datumswert | undefined
  readonly ende?: Datumswert | undefined
  readonly endeGrund?: z.infer<typeof EndeGrundEnum> | undefined
  readonly reihenfolge?: number | undefined
  readonly notiz?: string | undefined
  readonly konfidenz: number
  readonly belege?: readonly string[] | undefined
}

export const partnerschaftAnlegenEinSchema: z.ZodType<PartnerschaftAnlegenEin> = z.object({
  typ: PartnerschaftTypEnum,
  beteiligte: z.array(partnerschaftBeteiligterEinSchema).min(2),
  beginn: datumswertSchema.optional(),
  ende: datumswertSchema.optional(),
  endeGrund: EndeGrundEnum.optional(),
  reihenfolge: z.number().int().optional(),
  notiz: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: zitatIdsSchema,
})

/** Nutzlast von `befehl:partnerschaft.aendern` — die Zeile selbst (`typ`/`beginn`/`ende`/
 * `ende_grund`/`reihenfolge`/`notiz`); die Beteiligten (`partnerschaft_person`) ändert dieser
 * Befehl NICHT (außerhalb des AP-1.12-Umfangs, s. Arbeitspaket). */
export interface PartnerschaftAendernEin {
  readonly id: string
  readonly typ: z.infer<typeof PartnerschaftTypEnum>
  readonly beginn?: Datumswert | undefined
  readonly ende?: Datumswert | undefined
  readonly endeGrund?: z.infer<typeof EndeGrundEnum> | undefined
  readonly reihenfolge?: number | undefined
  readonly notiz?: string | undefined
}

export const partnerschaftAendernEinSchema: z.ZodType<PartnerschaftAendernEin> = z.object({
  id: z.string(),
  typ: PartnerschaftTypEnum,
  beginn: datumswertSchema.optional(),
  ende: datumswertSchema.optional(),
  endeGrund: EndeGrundEnum.optional(),
  reihenfolge: z.number().int().optional(),
  notiz: z.string().optional(),
})

export interface PartnerschaftLoeschenEin {
  readonly id: string
}

export const partnerschaftLoeschenEinSchema: z.ZodType<PartnerschaftLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// ereignis.anlegen / ereignis.aendern / ereignis.loeschen (AP-1.12)
// -----------------------------------------------------------------------------------------------

export interface EreignisBeteiligungEin {
  readonly personId: string
  readonly rolle: z.infer<typeof BeteiligungRolleEnum>
  readonly reihenfolge?: number | undefined
}

const ereignisBeteiligungEinSchema: z.ZodType<EreignisBeteiligungEin> = z.object({
  personId: z.string(),
  rolle: BeteiligungRolleEnum,
  reihenfolge: z.number().int().optional(),
})

/** `konfidenz`/`belege` speisen die Existenz-Aussage (ADR-026, + die abgeleiteten
 * geburtsdatum/todesdatum/geburtsort-Aussagen bleiben dem Import-Pfad vorbehalten — dieser Befehl
 * schreibt nur die Existenz-Aussage, keine abgeleiteten Aussagen). */
export interface EreignisAnlegenEin {
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly ortId?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly beschreibung?: string | undefined
  readonly notiz?: string | undefined
  readonly beteiligungen: readonly EreignisBeteiligungEin[]
  readonly konfidenz: number
  readonly belege?: readonly string[] | undefined
}

export const ereignisAnlegenEinSchema: z.ZodType<EreignisAnlegenEin> = z.object({
  typ: EreignisTypEnum,
  ortId: z.string().optional(),
  datum: datumswertSchema.optional(),
  beschreibung: z.string().optional(),
  notiz: z.string().optional(),
  beteiligungen: z.array(ereignisBeteiligungEinSchema).min(1),
  konfidenz: KonfidenzSchema,
  belege: zitatIdsSchema,
})

/** Nutzlast von `befehl:ereignis.aendern` — die Zeile selbst; die Beteiligungen ändert dieser
 * Befehl NICHT (außerhalb des AP-1.12-Umfangs). */
export interface EreignisAendernEin {
  readonly id: string
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly ortId?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly beschreibung?: string | undefined
  readonly notiz?: string | undefined
}

export const ereignisAendernEinSchema: z.ZodType<EreignisAendernEin> = z.object({
  id: z.string(),
  typ: EreignisTypEnum,
  ortId: z.string().optional(),
  datum: datumswertSchema.optional(),
  beschreibung: z.string().optional(),
  notiz: z.string().optional(),
})

export interface EreignisLoeschenEin {
  readonly id: string
}

export const ereignisLoeschenEinSchema: z.ZodType<EreignisLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// aussage.anlegen / aussage.loeschen (AP-1.12) — KEIN aussage.aendern (Nutzerentscheidung): ein
// geänderter Fakt ist eine neue bevorzugte Aussage, die die alte bevorzugte Aussage zum selben
// (subjektTyp, subjektId, praedikat) demotet (`src/main/befehle/aussage-anlegen.ts`, Muster
// `bevorzugungAberkennen()` aus `src/main/import/schreiben.ts`).
// -----------------------------------------------------------------------------------------------

/** `subjektTyp` OHNE `diagnose`/`risikofaktor` (M-08, DSGVO Art. 9) — deckungsgleich mit
 * `SubjektTypEnum` (`./gemeinsam`, sechs Werte für `medium_zuordnung`), die um die beiden
 * Gesundheitswerte erweiterte Acht-Werte-Fassung ist `AussageSubjektTypEnum` (nur für den
 * Import-Pfad/die `aussage`-Tabelle selbst gedacht, s. Kommentar dort) — dieser Befehl darf über
 * sie gar nicht erst versuchen, eine Diagnose/einen Risikofaktor zu bezeugen. */
export interface AussageAnlegenEin {
  readonly subjektTyp: z.infer<typeof SubjektTypEnum>
  readonly subjektId: string
  readonly praedikat: string
  readonly wertText?: string | undefined
  readonly wertZahl?: number | undefined
  readonly wertRefId?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly konfidenz: number
  readonly istBevorzugt?: 0 | 1 | undefined
  readonly begruendung?: string | undefined
  readonly unsicherheit?: string | undefined
  readonly gueltigVon?: number | undefined
  readonly gueltigBis?: number | undefined
  readonly belege?: readonly string[] | undefined
}

const aussageAnlegenBasis = z.object({
  subjektTyp: SubjektTypEnum,
  subjektId: z.string(),
  praedikat: z.string().min(1),
  wertText: z.string().optional(),
  wertZahl: z.number().optional(),
  wertRefId: z.string().optional(),
  datum: datumswertSchema.optional(),
  konfidenz: KonfidenzSchema,
  istBevorzugt: BoolWert.optional(),
  begruendung: z.string().optional(),
  unsicherheit: z.string().optional(),
  gueltigVon: z.number().int().optional(),
  gueltigBis: z.number().int().optional(),
  belege: zitatIdsSchema,
})

/** Genau eines von `wertText`/`wertZahl`/`wertRefId` (Nutzerentscheidung AP-1.12) — anders als
 * der Import-Vertrag (`aussageSchema` in `./import-v1`, "mindestens eines"), weil eine direkt vom
 * Nutzer erfasste Aussage einen einzigen, eindeutigen Wert hat statt mehrerer gleichzeitig
 * belegter Werttypen. */
export const aussageAnlegenEinSchema: z.ZodType<AussageAnlegenEin> = aussageAnlegenBasis.superRefine((ein, ctx) => {
  const gesetzteWerte = [ein.wertText, ein.wertZahl, ein.wertRefId].filter((wert) => wert !== undefined)
  if (gesetzteWerte.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['wertText'],
      message: 'Genau eines von wertText, wertZahl oder wertRefId ist Pflicht.',
    })
  }
})

export interface AussageLoeschenEin {
  readonly id: string
}

export const aussageLoeschenEinSchema: z.ZodType<AussageLoeschenEin> = z.object({
  id: z.string(),
})

// -----------------------------------------------------------------------------------------------
// ort.anlegen (AP-1.13 PR-C, docs/71_Designsystem.md §3.2) — NUR Ort + EIN primärer Ortsname
// (minimale Ortsverwaltung fürs `Ortsfeld`, direkt aus der Trefferliste heraus). Die volle
// Ortsverwaltung (zeitabhängige Namensgeschichte pflegen, politisch/kirchlich getrennte
// Zugehörigkeitsketten bearbeiten) bleibt AP-1.16 vorbehalten (CLAUDE.md §10: nicht vorgreifen) —
// ebenso KEIN `ort.aendern`/`ort.loeschen` in diesem PR und KEINE Existenz-Aussage (analog
// `name.anlegen`, ADR-026 betrifft nur belegbare Fachaussagen über Personen/Beziehungen).
// -----------------------------------------------------------------------------------------------

/** Nutzlast von `befehl:ort.anlegen`. `typ` bleibt optional — ein aus dem `Ortsfeld` heraus schnell
 * eingetippter Ortsname hat oft noch keine Einordnung (Dorf/Stadt/…), das DB-Schema erlaubt
 * `ort.typ IS NULL` genau dafür (docs/schema/0002_kern.sql §2.4). */
export interface OrtAnlegenEin {
  readonly name: string
  readonly typ?: z.infer<typeof OrtTypEnum> | undefined
  readonly notiz?: string | undefined
}

export const ortAnlegenEinSchema: z.ZodType<OrtAnlegenEin> = z.object({
  name: z.string().min(1),
  typ: OrtTypEnum.optional(),
  notiz: z.string().optional(),
})
