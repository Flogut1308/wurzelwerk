// Zod-Fassung des Import-Vertrags `wurzelwerk-import/v1` (56_Import_Vertrag.md §3, Anhang A;
// AP-1.3a). 1:1-Nachbau von `docs/import-vertrag/wurzelwerk-import-v1.schema.json` — das
// JSON-Schema ist die veröffentlichte Fassung des Vertrags, dieses Modul die ausgeführte (§4
// Stufe 1). `test/einheit/import-schema-zod-gleich.test.ts` ist die Fitnessfunktion, die beide
// Fassungen über den ganzen Fixture-Korpus gleich urteilen lässt.
//
// Jedes Objekt ist `z.strictObject` (Spiegel von `additionalProperties:false`). Jedes `if/then`
// aus dem JSON-Schema wird als `.superRefine` mit derselben Bedingung nachgebaut; die dabei
// erzeugten `custom`-Issues tragen `params.impCode`, damit `src/main/import/validierung.ts` sie
// ohne Rätselraten auf den richtigen IMP-Code abbilden kann (die Alternative — Ableitung allein
// aus dem generischen Zod-Issue-Code — wäre für zusammengesetzte Regeln wie IMP-106 nicht
// eindeutig). Enums aus `gemeinsam.ts` werden wiederverwendet (Kalender, Datumsmodifikator,
// -präzision, Konfidenz, Subjekttyp); alle anderen Enums sind lokal, damit sie nicht mit den
// (teils abweichenden, z. B. `OrtTypEnum` ohne "unbekannt") DB-Kern-Schemata in
// `src/shared/schemata/*.ts` kollidieren — dieser Vertrag ist ein eigenständiges, versioniertes
// Dokument und bewusst nicht an die aktuellen Kern-Tabellenschemata gekoppelt.
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum, KonfidenzSchema, SubjektTypEnum } from './gemeinsam'

/** `^(tmp|db):[A-Za-z0-9_.\-]{1,64}$` (§2.1). Exportiert, damit `validierung.ts` einen
 * `invalid_format`-Treffer auf dieser Regex von anderen Regex-Verstößen (Datumswerte,
 * Prüfsumme) unterscheiden kann (IMP-107 vs. IMP-104). */
export const KENNUNG_REGEX = /^(tmp|db):[A-Za-z0-9_.\-]{1,64}$/

const DATUMSWERT_REGEX = /^\d{3,4}(-\d{2}(-\d{2})?)?$/
const DOPPELJAHR_REGEX = /^\d{4}\/\d{2,4}$/
const PRUEFSUMME_REGEX = /^sha256-[0-9a-f]{64}$/

const kennungSchema = z.string().regex(KENNUNG_REGEX)

/** Ein `custom`-Issue mit `params.impCode`, damit die Abbildung in `validierung.ts` nicht raten
 * muss, welche Regel gefeuert hat. */
function pflichtfeldIssue(ctx: z.core.$RefinementCtx, pfad: (string | number)[], text: string): void {
  ctx.addIssue({ code: 'custom', path: pfad, message: text, params: { impCode: 'IMP-103' } })
}

// ---------------------------------------------------------------------------------------------
// Datumswert (§2.4, Anhang A $defs.Datumswert)
// ---------------------------------------------------------------------------------------------

interface Datumswert {
  readonly kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly modifikator: z.infer<typeof DatumModifikatorEnum>
  readonly praezision: z.infer<typeof DatumPraezisionEnum>
  readonly wert1?: string | undefined
  readonly wert2?: string | undefined
  readonly original_text?: string | undefined
  readonly zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly zweitwert?: string | undefined
  readonly doppeljahr?: string | undefined
}

const MODIFIKATOREN_MIT_ORIGINALTEXT_PFLICHT = ['etwa', 'vor', 'nach', 'zwischen', 'von_bis', 'geschaetzt', 'berechnet']
const MODIFIKATOREN_ZEITRAUM = ['zwischen', 'von_bis']

const datumswertBasis = z.strictObject({
  kalender: KalenderEnum.optional(),
  modifikator: DatumModifikatorEnum,
  praezision: DatumPraezisionEnum,
  wert1: z.string().regex(DATUMSWERT_REGEX).optional(),
  wert2: z.string().regex(DATUMSWERT_REGEX).optional(),
  original_text: z.string().min(1).optional(),
  zweitkalender: KalenderEnum.optional(),
  zweitwert: z.string().regex(DATUMSWERT_REGEX).optional(),
  doppeljahr: z.string().regex(DOPPELJAHR_REGEX).optional(),
})

/** Alle drei `allOf`-Regeln aus Anhang A `$defs.Datumswert` — jeder Verstoß wird IMP-106
 * (56_Import_Vertrag.md §2.4 „die wichtigste Regel im ganzen Vertrag"). */
const datumswertSchema: z.ZodType<Datumswert> = datumswertBasis.superRefine((wert, ctx) => {
  const brauchtOriginalText = MODIFIKATOREN_MIT_ORIGINALTEXT_PFLICHT.includes(wert.modifikator)
  if (brauchtOriginalText && wert.original_text === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['original_text'],
      message: 'original_text ist Pflicht, sobald modifikator ≠ exakt (§2.4).',
      params: { impCode: 'IMP-106' },
    })
  }

  const istZeitraum = MODIFIKATOREN_ZEITRAUM.includes(wert.modifikator)
  if (istZeitraum) {
    if (wert.wert1 === undefined) {
      ctx.addIssue({ code: 'custom', path: ['wert1'], message: 'wert1 ist Pflicht bei zwischen/von_bis.', params: { impCode: 'IMP-106' } })
    }
    if (wert.wert2 === undefined) {
      ctx.addIssue({ code: 'custom', path: ['wert2'], message: 'wert2 ist Pflicht bei zwischen/von_bis.', params: { impCode: 'IMP-106' } })
    }
  } else if (wert.wert1 === undefined) {
    ctx.addIssue({ code: 'custom', path: ['wert1'], message: 'wert1 ist Pflicht, außer bei zwischen/von_bis.', params: { impCode: 'IMP-106' } })
  }

  if (wert.zweitwert !== undefined && wert.zweitkalender === undefined) {
    ctx.addIssue({ code: 'custom', path: ['zweitkalender'], message: 'zweitkalender ist Pflicht, sobald zweitwert gesetzt ist.', params: { impCode: 'IMP-106' } })
  }
})

// ---------------------------------------------------------------------------------------------
// Beleg / Belege (§2.3, $defs.Beleg/Belege)
// ---------------------------------------------------------------------------------------------

interface Beleg {
  readonly quelle: string
  readonly seite?: string | undefined
  readonly eintragsnummer?: string | undefined
  readonly band?: string | undefined
  readonly jahr?: number | undefined
  readonly zeitmarke_sekunden?: number | undefined
  readonly transkript?: string | undefined
  readonly uebersetzung?: string | undefined
  readonly digitalisat_url?: string | undefined
  readonly konfidenz: number
}

const belegSchema: z.ZodType<Beleg> = z.strictObject({
  quelle: kennungSchema,
  seite: z.string().optional(),
  eintragsnummer: z.string().optional(),
  band: z.string().optional(),
  jahr: z.number().int().optional(),
  zeitmarke_sekunden: z.number().min(0).optional(),
  transkript: z.string().optional(),
  uebersetzung: z.string().optional(),
  digitalisat_url: z.string().optional(),
  konfidenz: KonfidenzSchema,
})

const belegeSchema = z.array(belegSchema).min(1)

// ---------------------------------------------------------------------------------------------
// Quelle (§3.2, $defs.Quelle)
// ---------------------------------------------------------------------------------------------

const QuelleTypEnum = z.enum(['kirchenbuch', 'standesamt', 'volkszaehlung', 'zeitung', 'grabstein', 'familienbesitz', 'literatur', 'website', 'muendlich', 'sonstiges'])
const QuelleArtEnum = z.enum(['original', 'derivat', 'verfasst'])
const InformationsartEnum = z.enum(['primaer', 'sekundaer', 'unbestimmt'])
const QuelleFormEnum = z.enum(['gespraech', 'telefonat', 'brief', 'email', 'audio', 'video'])
const UnmittelbarkeitEnum = z.enum(['selbst_erlebt', 'vom_hoerensagen', 'unbekannt'])

interface Quelle {
  readonly id: string
  readonly typ: z.infer<typeof QuelleTypEnum>
  readonly titel: string
  readonly autor?: string | undefined
  readonly verlag?: string | undefined
  readonly jahr?: number | undefined
  readonly art?: z.infer<typeof QuelleArtEnum> | undefined
  readonly informationsart?: z.infer<typeof InformationsartEnum> | undefined
  readonly archiv?: string | undefined
  readonly signatur?: string | undefined
  readonly informant_person?: string | undefined
  readonly gespraechsdatum?: Datumswert | undefined
  readonly form?: z.infer<typeof QuelleFormEnum> | undefined
  readonly unmittelbarkeit?: z.infer<typeof UnmittelbarkeitEnum> | undefined
  readonly audio_medium?: string | undefined
  readonly notiz?: string | undefined
}

const quelleBasis = z.strictObject({
  id: kennungSchema,
  typ: QuelleTypEnum,
  titel: z.string().min(1),
  autor: z.string().optional(),
  verlag: z.string().optional(),
  jahr: z.number().int().optional(),
  art: QuelleArtEnum.optional(),
  informationsart: InformationsartEnum.optional(),
  archiv: z.string().optional(),
  signatur: z.string().optional(),
  informant_person: kennungSchema.optional(),
  gespraechsdatum: datumswertSchema.optional(),
  form: QuelleFormEnum.optional(),
  unmittelbarkeit: UnmittelbarkeitEnum.optional(),
  audio_medium: kennungSchema.optional(),
  notiz: z.string().optional(),
})

/** §3.2: „unmittelbarkeit als Pflichtfeld bei mündlichen Quellen ist genealogisch der
 * wichtigste Unterschied überhaupt" — bei `typ: muendlich` sind `informant_person` und
 * `unmittelbarkeit` Pflicht. */
const quelleSchema: z.ZodType<Quelle> = quelleBasis.superRefine((quelle, ctx) => {
  if (quelle.typ === 'muendlich') {
    if (quelle.informant_person === undefined) pflichtfeldIssue(ctx, ['informant_person'], 'informant_person ist Pflicht bei typ muendlich.')
    if (quelle.unmittelbarkeit === undefined) pflichtfeldIssue(ctx, ['unmittelbarkeit'], 'unmittelbarkeit ist Pflicht bei typ muendlich.')
  }
})

// ---------------------------------------------------------------------------------------------
// Interview (§3.8, $defs.Interview)
// ---------------------------------------------------------------------------------------------

const InterviewStatusEnum = z.enum(['offen', 'ausgewertet', 'abgeschlossen'])

interface Interview {
  readonly id: string
  readonly informant_person: string
  readonly datum: Datumswert
  readonly ort?: string | undefined
  readonly audio_medium?: string | undefined
  readonly notizen?: string | undefined
  readonly status?: z.infer<typeof InterviewStatusEnum> | undefined
}

const interviewSchema: z.ZodType<Interview> = z.strictObject({
  id: kennungSchema,
  informant_person: kennungSchema,
  datum: datumswertSchema,
  ort: kennungSchema.optional(),
  audio_medium: kennungSchema.optional(),
  notizen: z.string().optional(),
  status: InterviewStatusEnum.optional(),
})

// ---------------------------------------------------------------------------------------------
// Name (§3.3, $defs.Name)
// ---------------------------------------------------------------------------------------------

const NameTypEnum = z.enum(['geburtsname', 'ehename', 'vulgo', 'latinisiert', 'transliteriert', 'ordensname', 'beruf', 'aka', 'sonstiges'])
const SchriftEnum = z.enum(['latn', 'cyrl'])
const UmschriftNormEnum = z.enum(['iso9', 'din1460', 'manuell'])

interface Name {
  readonly typ?: z.infer<typeof NameTypEnum> | undefined
  readonly schrift?: z.infer<typeof SchriftEnum> | undefined
  readonly umschrift_von?: number | undefined
  readonly umschrift_norm?: z.infer<typeof UmschriftNormEnum> | undefined
  readonly vornamen?: string | undefined
  readonly rufname_index?: number | undefined
  readonly rufname_text?: string | undefined
  readonly nachname?: string | undefined
  readonly nachname_unbekannt?: boolean | undefined
  readonly praefix?: string | undefined
  readonly titel_vor?: string | undefined
  readonly zusatz_nach?: string | undefined
  readonly original_text?: string | undefined
  readonly sprache?: string | undefined
  readonly ist_bevorzugt?: boolean | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
}

const nameBasis = z.strictObject({
  typ: NameTypEnum.optional(),
  schrift: SchriftEnum.optional(),
  umschrift_von: z.number().int().min(0).optional(),
  umschrift_norm: UmschriftNormEnum.optional(),
  vornamen: z.string().optional(),
  rufname_index: z.number().int().min(0).optional(),
  rufname_text: z.string().optional(),
  nachname: z.string().optional(),
  nachname_unbekannt: z.boolean().optional(),
  praefix: z.string().optional(),
  titel_vor: z.string().optional(),
  zusatz_nach: z.string().optional(),
  original_text: z.string().optional(),
  sprache: z.string().optional(),
  ist_bevorzugt: z.boolean().optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
})

/** §3.3: `nachname` ist Pflicht außer `nachname_unbekannt: true`; eine Umschrift
 * (`umschrift_von` gesetzt) braucht immer `umschrift_norm` (ADR-014). */
const nameSchema: z.ZodType<Name> = nameBasis.superRefine((name, ctx) => {
  if (name.nachname_unbekannt !== true && name.nachname === undefined) {
    pflichtfeldIssue(ctx, ['nachname'], 'nachname ist Pflicht, außer nachname_unbekannt ist true.')
  }
  if (name.umschrift_von !== undefined && name.umschrift_norm === undefined) {
    pflichtfeldIssue(ctx, ['umschrift_norm'], 'umschrift_norm ist Pflicht, sobald umschrift_von gesetzt ist.')
  }
})

// ---------------------------------------------------------------------------------------------
// Person (§3.3, $defs.Person)
// ---------------------------------------------------------------------------------------------

const GeschlechtEnum = z.enum(['M', 'F', 'U', 'X'])
const LebendStatusEnum = z.enum(['lebend', 'verstorben', 'vermutet_verstorben'])
const PlatzhalterGrundEnum = z.enum(['unbekannt', 'unehelich', 'nicht_identifiziert', 'forschungsluecke'])

interface Person {
  readonly id: string
  readonly ueberschreiben?: boolean | undefined
  readonly geschlecht?: z.infer<typeof GeschlechtEnum> | undefined
  readonly lebend_status?: z.infer<typeof LebendStatusEnum> | undefined
  readonly privat?: boolean | undefined
  readonly ist_platzhalter?: boolean | undefined
  readonly platzhalter_grund?: z.infer<typeof PlatzhalterGrundEnum> | undefined
  readonly namen?: readonly Name[] | undefined
  readonly notiz?: string | undefined
  readonly unsicherheit?: string | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
}

const personBasis = z.strictObject({
  id: kennungSchema,
  ueberschreiben: z.boolean().optional(),
  geschlecht: GeschlechtEnum.optional(),
  lebend_status: LebendStatusEnum.optional(),
  privat: z.boolean().optional(),
  ist_platzhalter: z.boolean().optional(),
  platzhalter_grund: PlatzhalterGrundEnum.optional(),
  namen: z.array(nameSchema).optional(),
  notiz: z.string().optional(),
  unsicherheit: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
})

/** §3.3 allOf: Platzhalter brauchen `platzhalter_grund`, alle anderen mindestens einen Namen
 * (`namen` minItems 1). */
const personSchema: z.ZodType<Person> = personBasis.superRefine((person, ctx) => {
  if (person.ist_platzhalter === true) {
    if (person.platzhalter_grund === undefined) {
      pflichtfeldIssue(ctx, ['platzhalter_grund'], 'platzhalter_grund ist Pflicht, wenn ist_platzhalter true ist.')
    }
    return
  }
  if (person.namen === undefined || person.namen.length < 1) {
    pflichtfeldIssue(ctx, ['namen'], 'namen ist Pflicht (mind. 1 Eintrag), außer bei Platzhaltern.')
  }
})

// ---------------------------------------------------------------------------------------------
// Ortsname / Ort (§3.4, $defs.Ortsname/Ort)
// ---------------------------------------------------------------------------------------------

interface Ortsname {
  readonly name: string
  readonly sprache?: string | undefined
  readonly schrift?: z.infer<typeof SchriftEnum> | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
  readonly ist_bevorzugt?: boolean | undefined
  readonly original_text?: string | undefined
}

const ortsnameSchema: z.ZodType<Ortsname> = z.strictObject({
  name: z.string().min(1),
  sprache: z.string().optional(),
  schrift: SchriftEnum.optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
  ist_bevorzugt: z.boolean().optional(),
  original_text: z.string().optional(),
})

const OrtTypEnum = z.enum(['dorf', 'stadt', 'gemeinde', 'kirchspiel', 'amt', 'kreis', 'provinz', 'staat', 'hof', 'friedhof', 'kirche', 'unbekannt'])
const OrtszugehoerigkeitArtEnum = z.enum(['politisch', 'kirchlich'])
const ExterneIdSystemEnum = z.enum(['gov', 'geonames', 'wikidata'])

interface OrtKoordinaten {
  readonly lat: number
  readonly lon: number
  readonly herkunft?: string | undefined
}

interface OrtZugehoerigkeit {
  readonly uebergeordnet: string
  readonly art: z.infer<typeof OrtszugehoerigkeitArtEnum>
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
}

interface OrtExterneId {
  readonly system: z.infer<typeof ExterneIdSystemEnum>
  readonly wert: string
}

interface Ort {
  readonly id: string
  readonly typ: z.infer<typeof OrtTypEnum>
  readonly namen: readonly Ortsname[]
  readonly koordinaten?: OrtKoordinaten | undefined
  readonly existiert_von?: number | undefined
  readonly existiert_bis?: number | undefined
  readonly zugehoerigkeiten?: readonly OrtZugehoerigkeit[] | undefined
  readonly externe_ids?: readonly OrtExterneId[] | undefined
  readonly notiz?: string | undefined
}

const ortSchema: z.ZodType<Ort> = z.strictObject({
  id: kennungSchema,
  typ: OrtTypEnum,
  namen: z.array(ortsnameSchema).min(1),
  koordinaten: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      herkunft: z.string().optional(),
    })
    .optional(),
  existiert_von: z.number().int().optional(),
  existiert_bis: z.number().int().optional(),
  zugehoerigkeiten: z
    .array(
      z.strictObject({
        uebergeordnet: kennungSchema,
        art: OrtszugehoerigkeitArtEnum,
        gueltig_von: z.number().int().optional(),
        gueltig_bis: z.number().int().optional(),
      }),
    )
    .optional(),
  externe_ids: z
    .array(
      z.strictObject({
        system: ExterneIdSystemEnum,
        wert: z.string(),
      }),
    )
    .optional(),
  notiz: z.string().optional(),
})

// ---------------------------------------------------------------------------------------------
// Beteiligung / Ereignis (§3.5, $defs.Beteiligung/Ereignis)
// ---------------------------------------------------------------------------------------------

const BeteiligungRolleEnum = z.enum([
  'hauptperson',
  'kind',
  'vater',
  'mutter',
  'braeutigam',
  'braut',
  'pate',
  'patenvertreter',
  'trauzeuge',
  'verstorbener',
  'ehepartner',
  'informant',
  'pfarrer',
  'hebamme',
  'dienstherr',
])

interface Beteiligung {
  readonly person: string
  readonly rolle: z.infer<typeof BeteiligungRolleEnum>
  readonly reihenfolge?: number | undefined
}

const beteiligungSchema: z.ZodType<Beteiligung> = z.strictObject({
  person: kennungSchema,
  rolle: BeteiligungRolleEnum,
  reihenfolge: z.number().int().min(0).optional(),
})

const EreignisTypEnum = z.enum([
  'geburt',
  'taufe',
  'konfirmation',
  'trauung',
  'kirchl_trauung',
  'verlobung',
  'scheidung',
  'tod',
  'beerdigung',
  'auswanderung',
  'einwanderung',
  'umzug',
  'beruf',
  'militaerdienst',
  'volkszaehlung',
  'testament',
  'sonstiges',
])

interface Ereignis {
  readonly id: string
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly ort?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly beteiligungen: readonly Beteiligung[]
  readonly beschreibung?: string | undefined
  readonly notiz?: string | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
}

const ereignisSchema: z.ZodType<Ereignis> = z.strictObject({
  id: kennungSchema,
  typ: EreignisTypEnum,
  ort: kennungSchema.optional(),
  datum: datumswertSchema.optional(),
  beteiligungen: z.array(beteiligungSchema).min(1),
  beschreibung: z.string().optional(),
  notiz: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
})

// ---------------------------------------------------------------------------------------------
// Elternschaft / Partnerschaft (§3.5, $defs.Elternschaft/Partnerschaft)
// ---------------------------------------------------------------------------------------------

const ElternschaftTypEnum = z.enum(['biologisch', 'adoptiv', 'stief', 'pflege', 'zieh', 'anerkannt', 'leihmutter', 'unbekannt'])

interface Elternschaft {
  readonly elternteil: string
  readonly kind: string
  readonly typ: z.infer<typeof ElternschaftTypEnum>
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
  readonly notiz?: string | undefined
}

const elternschaftSchema: z.ZodType<Elternschaft> = z.strictObject({
  elternteil: kennungSchema,
  kind: kennungSchema,
  typ: ElternschaftTypEnum,
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
  notiz: z.string().optional(),
})

const PartnerschaftTypEnum = z.enum(['ehe_zivil', 'ehe_kirchlich', 'verlobung', 'lebensgemeinschaft', 'eingetr_lebenspartnerschaft', 'unbekannt'])
const PartnerschaftRolleEnum = z.enum(['ehepartner', 'braeutigam', 'braut', 'partner'])
const EndeGrundEnum = z.enum(['scheidung', 'annullierung', 'tod', 'trennung', 'unbekannt'])

interface PartnerschaftBeteiligter {
  readonly person: string
  readonly rolle?: z.infer<typeof PartnerschaftRolleEnum> | undefined
}

interface Partnerschaft {
  readonly id: string
  readonly typ: z.infer<typeof PartnerschaftTypEnum>
  readonly beteiligte: readonly PartnerschaftBeteiligter[]
  readonly beginn?: Datumswert | undefined
  readonly ende?: Datumswert | undefined
  readonly ende_grund?: z.infer<typeof EndeGrundEnum> | undefined
  readonly reihenfolge?: number | undefined
  readonly notiz?: string | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
}

const partnerschaftSchema: z.ZodType<Partnerschaft> = z.strictObject({
  id: kennungSchema,
  typ: PartnerschaftTypEnum,
  beteiligte: z
    .array(
      z.strictObject({
        person: kennungSchema,
        rolle: PartnerschaftRolleEnum.optional(),
      }),
    )
    .min(2),
  beginn: datumswertSchema.optional(),
  ende: datumswertSchema.optional(),
  ende_grund: EndeGrundEnum.optional(),
  reihenfolge: z.number().int().min(0).optional(),
  notiz: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
})

// ---------------------------------------------------------------------------------------------
// Aussage (§3.6, $defs.Aussage)
// ---------------------------------------------------------------------------------------------

interface Aussage {
  readonly subjekt_typ: z.infer<typeof SubjektTypEnum>
  readonly subjekt: string
  readonly praedikat: string
  readonly wert_text?: string | undefined
  readonly wert_zahl?: number | undefined
  readonly wert_ref?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
  readonly ist_bevorzugt?: boolean | undefined
  readonly begruendung?: string | undefined
  readonly unsicherheit?: string | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
}

const aussageBasis = z.strictObject({
  subjekt_typ: SubjektTypEnum,
  subjekt: kennungSchema,
  praedikat: z.string().min(1),
  wert_text: z.string().optional(),
  wert_zahl: z.number().optional(),
  wert_ref: kennungSchema.optional(),
  datum: datumswertSchema.optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
  ist_bevorzugt: z.boolean().optional(),
  begruendung: z.string().optional(),
  unsicherheit: z.string().optional(),
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
})

/** §3.6 `anyOf`: genau eines von `wert_text`/`wert_zahl`/`wert_ref` ist Pflicht. */
const aussageSchema: z.ZodType<Aussage> = aussageBasis.superRefine((aussage, ctx) => {
  if (aussage.wert_text === undefined && aussage.wert_zahl === undefined && aussage.wert_ref === undefined) {
    pflichtfeldIssue(ctx, [], 'Genau eines von wert_text, wert_zahl oder wert_ref ist Pflicht.')
  }
})

// ---------------------------------------------------------------------------------------------
// Diagnose / Risikofaktor (§3.7, $defs.Diagnose/Risikofaktor) — M-08: nie exportiert
// ---------------------------------------------------------------------------------------------

const DiagnoseKategorieEnum = z.enum(['herz_kreislauf', 'krebs', 'stoffwechsel', 'neuro_psych', 'atemwege', 'nieren', 'autoimmun', 'angeboren_genetisch', 'infektion', 'unfall', 'sonstiges'])
const DiagnoseStatusEnum = z.enum(['bestehend', 'geheilt', 'todesursache', 'unbekannt'])

interface Diagnose {
  readonly person: string
  readonly kategorie: z.infer<typeof DiagnoseKategorieEnum>
  readonly organ?: string | undefined
  readonly bezeichnung: string
  readonly erstdiagnose?: Datumswert | undefined
  readonly alter_bei_diagnose?: number | undefined
  readonly status: z.infer<typeof DiagnoseStatusEnum>
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
  readonly notiz?: string | undefined
}

const diagnoseBasis = z.strictObject({
  person: kennungSchema,
  kategorie: DiagnoseKategorieEnum,
  organ: z.string().optional(),
  bezeichnung: z.string().min(1),
  erstdiagnose: datumswertSchema.optional(),
  alter_bei_diagnose: z.number().int().min(0).max(120).optional(),
  status: DiagnoseStatusEnum,
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
  notiz: z.string().optional(),
})

/** §3.7: `organ` ist Pflicht bei `kategorie: krebs` („Krebs" ohne Organ ist genealogisch fast
 * nutzlos"). */
const diagnoseSchema: z.ZodType<Diagnose> = diagnoseBasis.superRefine((diagnose, ctx) => {
  if (diagnose.kategorie === 'krebs' && diagnose.organ === undefined) {
    pflichtfeldIssue(ctx, ['organ'], 'organ ist Pflicht bei kategorie krebs.')
  }
})

const RisikofaktorArtEnum = z.enum(['rauchen', 'alkohol', 'beruf_exposition', 'umwelt', 'uebergewicht', 'bewegungsmangel', 'ernaehrung', 'sonstiges'])
const IntensitaetEnum = z.enum(['gering', 'mittel', 'hoch', 'unbekannt'])

interface Risikofaktor {
  readonly person: string
  readonly art: z.infer<typeof RisikofaktorArtEnum>
  readonly detail?: string | undefined
  readonly intensitaet: z.infer<typeof IntensitaetEnum>
  readonly beginn?: Datumswert | undefined
  readonly ende?: Datumswert | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
  readonly notiz?: string | undefined
}

const risikofaktorBasis = z.strictObject({
  person: kennungSchema,
  art: RisikofaktorArtEnum,
  detail: z.string().optional(),
  intensitaet: IntensitaetEnum,
  beginn: datumswertSchema.optional(),
  ende: datumswertSchema.optional(),
  konfidenz: KonfidenzSchema,
  belege: belegeSchema,
  notiz: z.string().optional(),
})

/** §3.7: `detail` ist Pflicht bei `art: beruf_exposition` („berufliche Exposition" ohne Angabe
 * welcher ist keine Information"). */
const risikofaktorSchema: z.ZodType<Risikofaktor> = risikofaktorBasis.superRefine((risikofaktor, ctx) => {
  if (risikofaktor.art === 'beruf_exposition' && risikofaktor.detail === undefined) {
    pflichtfeldIssue(ctx, ['detail'], 'detail ist Pflicht bei art beruf_exposition.')
  }
})

// ---------------------------------------------------------------------------------------------
// Medium (§3.8, $defs.Medium)
// ---------------------------------------------------------------------------------------------

const MediumZuordnungSubjektTypEnum = z.enum(['person', 'ereignis', 'ort', 'quelle'])

interface MediumZuordnung {
  readonly subjekt_typ: z.infer<typeof MediumZuordnungSubjektTypEnum>
  readonly subjekt: string
  readonly ist_titelbild?: boolean | undefined
}

interface Medium {
  readonly id: string
  readonly relativer_pfad: string
  readonly titel?: string | undefined
  readonly beschreibung?: string | undefined
  readonly datum?: Datumswert | undefined
  readonly ort?: string | undefined
  readonly zuordnungen?: readonly MediumZuordnung[] | undefined
}

const mediumSchema: z.ZodType<Medium> = z.strictObject({
  id: kennungSchema,
  relativer_pfad: z.string().min(1),
  titel: z.string().optional(),
  beschreibung: z.string().optional(),
  datum: datumswertSchema.optional(),
  ort: kennungSchema.optional(),
  zuordnungen: z
    .array(
      z.strictObject({
        subjekt_typ: MediumZuordnungSubjektTypEnum,
        subjekt: kennungSchema,
        ist_titelbild: z.boolean().optional(),
      }),
    )
    .optional(),
})

// ---------------------------------------------------------------------------------------------
// UnverarbeiteteNotiz (§7.1 Schranke 5, $defs.UnverarbeiteteNotiz)
// ---------------------------------------------------------------------------------------------

interface UnverarbeiteteNotiz {
  readonly text: string
  readonly warum: string
  readonly betrifft_vermutlich?: readonly string[] | undefined
  readonly herkunft?: string | undefined
}

const unverarbeiteteNotizSchema: z.ZodType<UnverarbeiteteNotiz> = z.strictObject({
  text: z.string().min(1),
  warum: z.string().min(1),
  betrifft_vermutlich: z.array(kennungSchema).optional(),
  herkunft: z.string().optional(),
})

// ---------------------------------------------------------------------------------------------
// Wurzel: Erzeugt / Zusammenfassung / ImportDatei (§3.1, §2 Aufbau, Anhang A Wurzelobjekt)
// ---------------------------------------------------------------------------------------------

interface Erzeugt {
  readonly am: string
  readonly werkzeug: string
  readonly werkzeug_version?: string | undefined
  readonly bearbeiter?: string | undefined
}

const erzeugtSchema: z.ZodType<Erzeugt> = z.strictObject({
  // `am` bleibt bewusst `z.string()` und NICHT `.date()`: Ajv (ohne ajv-formats, §4 Stufe 1)
  // erzwingt `format: "date"` ebenfalls nicht — beide Fassungen bleiben damit gleich lax
  // (Gleichwertigkeitstest, siehe docs/80_Offene_Fragen.md U-AP1.3a).
  am: z.string(),
  werkzeug: z.string().min(1),
  werkzeug_version: z.string().optional(),
  bearbeiter: z.string().optional(),
})

interface Zusammenfassung {
  readonly personen: number
  readonly orte?: number | undefined
  readonly ereignisse?: number | undefined
  readonly elternschaften?: number | undefined
  readonly partnerschaften?: number | undefined
  readonly aussagen?: number | undefined
  readonly diagnosen?: number | undefined
  readonly risikofaktoren?: number | undefined
  readonly medien?: number | undefined
  readonly notizen_unverarbeitet: number
}

const zusammenfassungSchema: z.ZodType<Zusammenfassung> = z.strictObject({
  personen: z.number().int().min(0),
  orte: z.number().int().min(0).optional(),
  ereignisse: z.number().int().min(0).optional(),
  elternschaften: z.number().int().min(0).optional(),
  partnerschaften: z.number().int().min(0).optional(),
  aussagen: z.number().int().min(0).optional(),
  diagnosen: z.number().int().min(0).optional(),
  risikofaktoren: z.number().int().min(0).optional(),
  medien: z.number().int().min(0).optional(),
  notizen_unverarbeitet: z.number().int().min(0),
})

export interface ImportDatei {
  readonly vertrag: 'wurzelwerk-import/v1'
  readonly erzeugt: Erzeugt
  readonly pruefsumme_quelltext?: string | undefined
  readonly zusammenfassung: Zusammenfassung
  readonly quellen: readonly Quelle[]
  readonly interviews?: readonly Interview[] | undefined
  readonly personen?: readonly Person[] | undefined
  readonly orte?: readonly Ort[] | undefined
  readonly ereignisse?: readonly Ereignis[] | undefined
  readonly elternschaften?: readonly Elternschaft[] | undefined
  readonly partnerschaften?: readonly Partnerschaft[] | undefined
  readonly aussagen?: readonly Aussage[] | undefined
  readonly diagnosen?: readonly Diagnose[] | undefined
  readonly risikofaktoren?: readonly Risikofaktor[] | undefined
  readonly medien?: readonly Medium[] | undefined
  readonly notizen_unverarbeitet?: readonly UnverarbeiteteNotiz[] | undefined
}

/** Der Vertrag `wurzelwerk-import/v1` in Zod (§4 Stufe 1). `required: [vertrag, erzeugt,
 * quellen, zusammenfassung]` — der Rest ist optional (§2 Aufbau einer Importdatei). */
export const importDateiSchema: z.ZodType<ImportDatei> = z.strictObject({
  vertrag: z.literal('wurzelwerk-import/v1'),
  erzeugt: erzeugtSchema,
  pruefsumme_quelltext: z.string().regex(PRUEFSUMME_REGEX).optional(),
  zusammenfassung: zusammenfassungSchema,
  quellen: z.array(quelleSchema).min(1),
  interviews: z.array(interviewSchema).optional(),
  personen: z.array(personSchema).optional(),
  orte: z.array(ortSchema).optional(),
  ereignisse: z.array(ereignisSchema).optional(),
  elternschaften: z.array(elternschaftSchema).optional(),
  partnerschaften: z.array(partnerschaftSchema).optional(),
  aussagen: z.array(aussageSchema).optional(),
  diagnosen: z.array(diagnoseSchema).optional(),
  risikofaktoren: z.array(risikofaktorSchema).optional(),
  medien: z.array(mediumSchema).optional(),
  notizen_unverarbeitet: z.array(unverarbeiteteNotizSchema).optional(),
})
