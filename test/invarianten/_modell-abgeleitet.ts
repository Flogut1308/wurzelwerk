// AP-0.7 PR-C — Modell + fast-check-Arbitrary für den Invariantentest
// `abgeleitet-gleich.test.ts` (geschützter Prüfpfad, CLAUDE.md §13/ADR-025). Kein Produktivcode:
// dieser Helfer erzeugt nur Befehlsfolgen über den Basistabellen (`person`, `name`, `aussage`,
// `ort`, `ortsname`, `zitat`) und führt sie gegen eine echte Datenbank aus — er behauptet nichts
// über das Ergebnis, das tut ausschließlich die Testdatei selbst.
//
// Muster "Index modulo aktuelle Länge" (statt eines vollen fast-check-`commands`-Modells): jede
// Aktion trägt rohe `fc.nat()`-Indizes; `indexInBereich` reduziert sie zur Ausführungszeit auf
// die tatsächliche Länge der jeweils zutreffenden Liste. So bleiben referenzielle Aktionen (z. B.
// "lösche den Namen an Index i") über die gesamte Länge der generierten Folge hinweg gültig, ohne
// dass die Arbitrary selbst den wachsenden Datenbankzustand kennen müsste — und ohne je eine
// Fremdschlüsselverletzung zu riskieren (referenzierte Listen werden nach jedem CASCADE-Delete
// unten aktiv nachgeführt, s. `personDeleteAusfuehren`/`ortDeleteAusfuehren`).
import type Database from 'better-sqlite3'
import fc from 'fast-check'
import { v7 as uuidv7 } from 'uuid'

/** Mutabler Modellzustand einer einzelnen Eigenschaftslauf-Ausführung (kein Vertrags-/Ergebnistyp — bewusst kein `readonly`, siehe Nutzung mit Reassign/`filter` unten). */
export interface ModellZustand {
  personIds: string[]
  namen: NameEintrag[]
  aussagen: AussageEintrag[]
  orte: string[]
  ortsnamen: OrtsnameEintrag[]
  zitate: string[]
}

interface NameEintrag {
  readonly id: string
  readonly personId: string
}
interface AussageEintrag {
  readonly id: string
  readonly personId: string
}
interface OrtsnameEintrag {
  readonly id: string
  readonly ortId: string
}

export function neuerZustand(): ModellZustand {
  return { personIds: [], namen: [], aussagen: [], orte: [], ortsnamen: [], zitate: [] }
}

/** Einzige `quelle`-Zeile für alle `zitat`-Inserts (FK `zitat.quelle_id NOT NULL`, kein Aktionsziel selbst). */
export function basisDatenAnlegen(db: Database.Database): { readonly quelleId: string } {
  const quelleId = uuidv7()
  db.prepare("INSERT INTO quelle (id, typ) VALUES (@id, 'kirchenbuch')").run({ id: quelleId })
  return { quelleId }
}

/** `undefined`, wenn `laenge = 0` (Aktion wird dann zu einem No-op — s. jeweilige `*Ausfuehren`-Funktion). */
function indexInBereich(laenge: number, roherIndex: number): number | undefined {
  return laenge <= 0 ? undefined : roherIndex % laenge
}

const NAME_TYP_WERTE = [
  'geburtsname',
  'ehename',
  'vulgo',
  'latinisiert',
  'transliteriert',
  'ordensname',
  'beruf',
  'aka',
  'sonstiges',
] as const
type NameTyp = (typeof NAME_TYP_WERTE)[number]

const SCHRIFT_WERTE = ['latn', 'cyrl'] as const
type Schrift = (typeof SCHRIFT_WERTE)[number]

const PRAEDIKAT_WERTE = ['geburtsdatum', 'todesdatum', 'geburtsort', 'beruf', 'konfession'] as const
type Praedikat = (typeof PRAEDIKAT_WERTE)[number]

type EinfuegenModus = 'ohne' | 'text'
type TextModus = 'behalten' | 'null' | 'text'
type TriModus = 'behalten' | 'null' | '0' | '1'
type BevorzugtWert = 0 | 1 | null
type KonfidenzWert = 1 | 2 | 3 | 4 | null

// Kleines, aber schriftsystem-durchmischtes Alphabet (lateinisch inkl. Umlaute, kyrillisch,
// Apostroph/Bindestrich als in genealogischen Namen übliche Trennzeichen). Bewusst KEIN volles
// `fc.string()` mit beliebigen Unicode-Codepunkten — vermeidet Edge-Cases (z. B. NUL-Zeichen), die
// nichts mit der hier geprüften Invariante zu tun haben.
const TEXT_ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  'ä',
  'ö',
  'ü',
  'ß',
  'é',
  'ñ',
  ...'абвгдежзийклмнопрстуфхцчшщъыьэюя',
  "'",
  '-',
]
function textArb(maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...TEXT_ALPHABET), { maxLength })
    .map((zeichen) => zeichen.join(''))
}

const indexArb = fc.nat({ max: 64 })
const einfuegenModusArb = fc.constantFrom<EinfuegenModus>('ohne', 'text')
const textModusArb = fc.constantFrom<TextModus>('behalten', 'null', 'text')
const triModusArb = fc.constantFrom<TriModus>('behalten', 'null', '0', '1')
const bevorzugtWertArb = fc.constantFrom<BevorzugtWert>(0, 1, null)
const konfidenzWertArb = fc.constantFrom<KonfidenzWert>(1, 2, 3, 4, null)

interface PersonInsertAktion {
  readonly kind: 'person_insert'
  readonly notizModus: EinfuegenModus
  readonly notizText: string
}
interface PersonUpdateNotizAktion {
  readonly kind: 'person_update_notiz'
  readonly idx: number
  readonly notizModus: TextModus
  readonly notizText: string
}
interface PersonDeleteAktion {
  readonly kind: 'person_delete'
  readonly idx: number
}

interface NameInsertAktion {
  readonly kind: 'name_insert'
  readonly personIdx: number
  readonly typ: NameTyp
  readonly schrift: Schrift | null
  readonly originalTextModus: EinfuegenModus
  readonly originalText: string
  readonly istBevorzugt: BevorzugtWert
  readonly vornamen: string
  readonly nachname: string
}
interface NameInsertUmschriftPaarAktion {
  readonly kind: 'name_insert_umschrift_paar'
  readonly personIdx: number
  readonly originalNachname: string
  readonly originalText: string
  readonly umschriftNachname: string
  readonly umschriftText: string
}
interface NameUpdateAktion {
  readonly kind: 'name_update'
  readonly idx: number
  readonly originalTextModus: TextModus
  readonly originalText: string
  readonly umschriftModus: 'behalten' | 'auf_null' | 'zu_index'
  readonly umschriftZielIdx: number
  readonly bevorzugtModus: TriModus
}
interface NameDeleteAktion {
  readonly kind: 'name_delete'
  readonly idx: number
}

interface AussageInsertAktion {
  readonly kind: 'aussage_insert'
  readonly personIdx: number
  readonly praedikat: Praedikat
  readonly konfidenz: KonfidenzWert
  readonly istBevorzugt: BevorzugtWert
  readonly datumJahr: number
  readonly datumVollstaendig: boolean
  readonly datumSortVon: number | null
  readonly ortIdx: number
  readonly ortReferenzModus: 'keine' | 'vorhanden' | 'fremd'
  readonly wertText: string
}
interface AussageUpdateAktion {
  readonly kind: 'aussage_update'
  readonly idx: number
  readonly konfidenzModus: 'behalten' | 'null' | '1' | '2' | '3' | '4'
  readonly bevorzugtModus: TriModus
  readonly datumModus: 'behalten' | 'null' | 'text'
  readonly datumJahr: number
  readonly datumVollstaendig: boolean
}
interface AussageDeleteAktion {
  readonly kind: 'aussage_delete'
  readonly idx: number
}

interface OrtInsertAktion {
  readonly kind: 'ort_insert'
}
interface OrtDeleteAktion {
  readonly kind: 'ort_delete'
  readonly idx: number
}
interface OrtsnameInsertAktion {
  readonly kind: 'ortsname_insert'
  readonly ortIdx: number
  readonly name: string
  readonly istBevorzugt: BevorzugtWert
}
interface OrtsnameUpdateAktion {
  readonly kind: 'ortsname_update'
  readonly idx: number
  readonly nameModus: TextModus
  readonly name: string
  readonly bevorzugtModus: TriModus
}
interface OrtsnameDeleteAktion {
  readonly kind: 'ortsname_delete'
  readonly idx: number
}
/**
 * Wächter-Auflage 2 (hueter-Review AP-0.7 PR-C): Person + Ort + bevorzugter Ortsname +
 * `geburtsort`-Aussage auf genau diesen Ort atomar — analog zu `name_insert_umschrift_paar`.
 * Ohne diese Aktion ergab die Kette Person→Ort→Ortsname→`geburtsort`-Aussage nur in ~0,03 % der
 * Läufe (drei UNABHÄNGIG per Index gewählte Zufallsziele mussten zufällig zusammenpassen) ein
 * nicht-NULL `person_flach.geburt_ort_name` — der gesamte Fan-out über `abl_ortsname_au`/`_ad`
 * (0003_abgeleitet.sql:711/772) blieb dadurch faktisch unbewacht (Handbeweis im Auftragsbericht:
 * `abl_ortsname_au` gedroppt → inkrementell bleibt der alte Name, Neuaufbau liefert den neuen).
 * Diese Aktion erzeugt garantiert (nicht zufällig) einen Personen/Ort/Ortsname/Aussage-Verbund mit
 * nicht-NULL `geburt_ort_name`, den nachfolgende `ortsname_update`/`ortsname_delete`-Aktionen
 * (über den normalen Index-modulo-Länge-Mechanismus, s. Moduldoku oben) mit nennenswerter
 * Wahrscheinlichkeit auch tatsächlich treffen und verändern.
 */
interface OrtMitGeburtsortAktion {
  readonly kind: 'ort_mit_geburtsort'
  readonly ortsnameName: string
}

interface ZitatInsertAktion {
  readonly kind: 'zitat_insert'
  readonly transkriptModus: EinfuegenModus
  readonly transkriptText: string
}
interface ZitatUpdateAktion {
  readonly kind: 'zitat_update'
  readonly idx: number
  readonly transkriptModus: TextModus
  readonly transkriptText: string
}
interface ZitatDeleteAktion {
  readonly kind: 'zitat_delete'
  readonly idx: number
}

export type Aktion =
  | PersonInsertAktion
  | PersonUpdateNotizAktion
  | PersonDeleteAktion
  | NameInsertAktion
  | NameInsertUmschriftPaarAktion
  | NameUpdateAktion
  | NameDeleteAktion
  | AussageInsertAktion
  | AussageUpdateAktion
  | AussageDeleteAktion
  | OrtInsertAktion
  | OrtDeleteAktion
  | OrtsnameInsertAktion
  | OrtsnameUpdateAktion
  | OrtsnameDeleteAktion
  | OrtMitGeburtsortAktion
  | ZitatInsertAktion
  | ZitatUpdateAktion
  | ZitatDeleteAktion

const personInsertArb: fc.Arbitrary<PersonInsertAktion> = fc.record({
  kind: fc.constant('person_insert'),
  notizModus: einfuegenModusArb,
  notizText: textArb(24),
})
const personUpdateNotizArb: fc.Arbitrary<PersonUpdateNotizAktion> = fc.record({
  kind: fc.constant('person_update_notiz'),
  idx: indexArb,
  notizModus: textModusArb,
  notizText: textArb(24),
})
const personDeleteArb: fc.Arbitrary<PersonDeleteAktion> = fc.record({
  kind: fc.constant('person_delete'),
  idx: indexArb,
})

const nameInsertArb: fc.Arbitrary<NameInsertAktion> = fc.record({
  kind: fc.constant('name_insert'),
  personIdx: indexArb,
  typ: fc.constantFrom(...NAME_TYP_WERTE),
  schrift: fc.option(fc.constantFrom(...SCHRIFT_WERTE), { nil: null }),
  originalTextModus: einfuegenModusArb,
  originalText: textArb(16),
  istBevorzugt: bevorzugtWertArb,
  vornamen: textArb(12),
  nachname: textArb(12),
})
const nameInsertUmschriftPaarArb: fc.Arbitrary<NameInsertUmschriftPaarAktion> = fc.record({
  kind: fc.constant('name_insert_umschrift_paar'),
  personIdx: indexArb,
  originalNachname: textArb(12),
  originalText: textArb(16),
  umschriftNachname: textArb(12),
  umschriftText: textArb(16),
})
const nameUpdateArb: fc.Arbitrary<NameUpdateAktion> = fc.record({
  kind: fc.constant('name_update'),
  idx: indexArb,
  originalTextModus: textModusArb,
  originalText: textArb(16),
  umschriftModus: fc.constantFrom<'behalten' | 'auf_null' | 'zu_index'>('behalten', 'auf_null', 'zu_index'),
  umschriftZielIdx: indexArb,
  bevorzugtModus: triModusArb,
})
const nameDeleteArb: fc.Arbitrary<NameDeleteAktion> = fc.record({
  kind: fc.constant('name_delete'),
  idx: indexArb,
})

const aussageInsertArb: fc.Arbitrary<AussageInsertAktion> = fc.record({
  kind: fc.constant('aussage_insert'),
  personIdx: indexArb,
  praedikat: fc.constantFrom(...PRAEDIKAT_WERTE),
  konfidenz: konfidenzWertArb,
  istBevorzugt: bevorzugtWertArb,
  datumJahr: fc.integer({ min: 1500, max: 2050 }),
  datumVollstaendig: fc.boolean(),
  datumSortVon: fc.option(fc.integer({ min: -50_000, max: 50_000 }), { nil: null }),
  ortIdx: indexArb,
  ortReferenzModus: fc.constantFrom<'keine' | 'vorhanden' | 'fremd'>('keine', 'vorhanden', 'fremd'),
  wertText: textArb(16),
})
const aussageUpdateArb: fc.Arbitrary<AussageUpdateAktion> = fc.record({
  kind: fc.constant('aussage_update'),
  idx: indexArb,
  konfidenzModus: fc.constantFrom<'behalten' | 'null' | '1' | '2' | '3' | '4'>('behalten', 'null', '1', '2', '3', '4'),
  bevorzugtModus: triModusArb,
  datumModus: fc.constantFrom<'behalten' | 'null' | 'text'>('behalten', 'null', 'text'),
  datumJahr: fc.integer({ min: 1500, max: 2050 }),
  datumVollstaendig: fc.boolean(),
})
const aussageDeleteArb: fc.Arbitrary<AussageDeleteAktion> = fc.record({
  kind: fc.constant('aussage_delete'),
  idx: indexArb,
})

const ortInsertArb: fc.Arbitrary<OrtInsertAktion> = fc.record({ kind: fc.constant('ort_insert') })
const ortDeleteArb: fc.Arbitrary<OrtDeleteAktion> = fc.record({
  kind: fc.constant('ort_delete'),
  idx: indexArb,
})
const ortsnameInsertArb: fc.Arbitrary<OrtsnameInsertAktion> = fc.record({
  kind: fc.constant('ortsname_insert'),
  ortIdx: indexArb,
  name: textArb(16),
  istBevorzugt: bevorzugtWertArb,
})
const ortsnameUpdateArb: fc.Arbitrary<OrtsnameUpdateAktion> = fc.record({
  kind: fc.constant('ortsname_update'),
  idx: indexArb,
  nameModus: textModusArb,
  name: textArb(16),
  bevorzugtModus: triModusArb,
})
const ortsnameDeleteArb: fc.Arbitrary<OrtsnameDeleteAktion> = fc.record({
  kind: fc.constant('ortsname_delete'),
  idx: indexArb,
})
const ortMitGeburtsortArb: fc.Arbitrary<OrtMitGeburtsortAktion> = fc.record({
  kind: fc.constant('ort_mit_geburtsort'),
  ortsnameName: textArb(16),
})

const zitatInsertArb: fc.Arbitrary<ZitatInsertAktion> = fc.record({
  kind: fc.constant('zitat_insert'),
  transkriptModus: einfuegenModusArb,
  transkriptText: textArb(24),
})
const zitatUpdateArb: fc.Arbitrary<ZitatUpdateAktion> = fc.record({
  kind: fc.constant('zitat_update'),
  idx: indexArb,
  transkriptModus: textModusArb,
  transkriptText: textArb(24),
})
const zitatDeleteArb: fc.Arbitrary<ZitatDeleteAktion> = fc.record({
  kind: fc.constant('zitat_delete'),
  idx: indexArb,
})

/**
 * Eine einzelne Aktion. Insert-Varianten sind höher gewichtet als Update/Delete — sonst bliebe
 * die Datenbank in kurzen Läufen oft leer, und die interessanten Fälle (Fan-out, Umschrift-
 * Geschwister, `hat_widerspruch`-Konflikte) kämen selten zustande.
 */
const einzelAktionArb: fc.Arbitrary<Aktion> = fc.oneof(
  { arbitrary: personInsertArb, weight: 4 },
  { arbitrary: personUpdateNotizArb, weight: 2 },
  { arbitrary: personDeleteArb, weight: 1 },
  { arbitrary: nameInsertArb, weight: 4 },
  { arbitrary: nameInsertUmschriftPaarArb, weight: 3 },
  { arbitrary: nameUpdateArb, weight: 3 },
  { arbitrary: nameDeleteArb, weight: 2 },
  { arbitrary: aussageInsertArb, weight: 4 },
  { arbitrary: aussageUpdateArb, weight: 2 },
  { arbitrary: aussageDeleteArb, weight: 1 },
  { arbitrary: ortInsertArb, weight: 2 },
  { arbitrary: ortDeleteArb, weight: 1 },
  { arbitrary: ortsnameInsertArb, weight: 3 },
  { arbitrary: ortsnameUpdateArb, weight: 2 },
  { arbitrary: ortsnameDeleteArb, weight: 1 },
  { arbitrary: ortMitGeburtsortArb, weight: 4 },
  { arbitrary: zitatInsertArb, weight: 2 },
  { arbitrary: zitatUpdateArb, weight: 1 },
  { arbitrary: zitatDeleteArb, weight: 1 },
)

export function aktionenArbitrary(): fc.Arbitrary<readonly Aktion[]> {
  return fc.array(einzelAktionArb, { minLength: 1, maxLength: 40 })
}

function datumWert1Bauen(jahr: number, vollstaendig: boolean): string {
  const jahrText = String(jahr).padStart(4, '0')
  return vollstaendig ? `${jahrText}-03-17` : jahrText
}

function personInsertAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: PersonInsertAktion): void {
  const id = uuidv7()
  const notiz = aktion.notizModus === 'text' ? aktion.notizText : null
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter, notiz) VALUES (@id, 0, 0, @notiz)').run({ id, notiz })
  zustand.personIds.push(id)
}

function personUpdateNotizAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: PersonUpdateNotizAktion): void {
  const index = indexInBereich(zustand.personIds.length, aktion.idx)
  const id = index === undefined ? undefined : zustand.personIds[index]
  if (id === undefined) {
    return
  }
  db.prepare(
    `UPDATE person SET notiz = CASE @modus WHEN 'null' THEN NULL WHEN 'text' THEN @text ELSE notiz END WHERE id = @id`,
  ).run({ id, modus: aktion.notizModus, text: aktion.notizText })
}

function personDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: PersonDeleteAktion): void {
  const index = indexInBereich(zustand.personIds.length, aktion.idx)
  const personId = index === undefined ? undefined : zustand.personIds[index]
  if (personId === undefined) {
    return
  }
  db.prepare('DELETE FROM person WHERE id = @id').run({ id: personId })
  zustand.personIds = zustand.personIds.filter((id) => id !== personId)
  // CASCADE (0002_kern.sql: name.person_id ... ON DELETE CASCADE) hat die Namenszeilen dieser
  // Person bereits real gelöscht — aus dem Modell entfernen, sonst würde eine spätere Aktion
  // versuchen, `umschrift_von` auf eine nicht mehr existierende `name.id` zu setzen (FK-Verletzung).
  zustand.namen = zustand.namen.filter((eintrag) => eintrag.personId !== personId)
  // `aussagen` bewusst NICHT gefiltert: aussage.subjekt_id ist polymorph OHNE Fremdschlüssel
  // (0002_kern.sql, E-7) — eine "verwaiste" Aussage nach dem Löschen ihrer Person ist gültiger
  // DB-Zustand und Teil der Testabdeckung (die Trigger müssen auch dafür robust bleiben, s.
  // abl_aussage_au/_ad: das Neuberechnen für eine nicht mehr existierende Person liefert 0 Zeilen).
}

function nameInsertAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: NameInsertAktion): void {
  const index = indexInBereich(zustand.personIds.length, aktion.personIdx)
  const personId = index === undefined ? undefined : zustand.personIds[index]
  if (personId === undefined) {
    return
  }
  const id = uuidv7()
  const originalText = aktion.originalTextModus === 'text' ? aktion.originalText : null
  db.prepare(
    `INSERT INTO name (id, person_id, typ, schrift, umschrift_von, vornamen, nachname, original_text, ist_bevorzugt)
     VALUES (@id, @personId, @typ, @schrift, NULL, @vornamen, @nachname, @originalText, @istBevorzugt)`,
  ).run({
    id,
    personId,
    typ: aktion.typ,
    schrift: aktion.schrift,
    vornamen: aktion.vornamen,
    nachname: aktion.nachname,
    originalText,
    istBevorzugt: aktion.istBevorzugt,
  })
  zustand.namen.push({ id, personId })
}

function nameInsertUmschriftPaarAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: NameInsertUmschriftPaarAktion): void {
  const index = indexInBereich(zustand.personIds.length, aktion.personIdx)
  const personId = index === undefined ? undefined : zustand.personIds[index]
  if (personId === undefined) {
    return
  }
  const originalId = uuidv7()
  db.prepare(
    `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
     VALUES (@id, @personId, 'geburtsname', 'cyrl', @nachname, @originalText)`,
  ).run({ id: originalId, personId, nachname: aktion.originalNachname, originalText: aktion.originalText })
  zustand.namen.push({ id: originalId, personId })

  const umschriftId = uuidv7()
  db.prepare(
    `INSERT INTO name (id, person_id, typ, schrift, umschrift_von, nachname, original_text)
     VALUES (@id, @personId, 'transliteriert', 'latn', @umschriftVon, @nachname, @originalText)`,
  ).run({
    id: umschriftId,
    personId,
    umschriftVon: originalId,
    nachname: aktion.umschriftNachname,
    originalText: aktion.umschriftText,
  })
  zustand.namen.push({ id: umschriftId, personId })
}

function nameUpdateAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: NameUpdateAktion): void {
  const index = indexInBereich(zustand.namen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.namen[index]
  if (ziel === undefined) {
    return
  }

  let umschriftModusSql: 'behalten' | 'auf_null' | 'zu_id' = 'behalten'
  let umschriftZielId: string | null = null
  if (aktion.umschriftModus === 'auf_null') {
    umschriftModusSql = 'auf_null'
  } else if (aktion.umschriftModus === 'zu_index') {
    // Bewusst ohne die eigene Zeile als Ziel (sonst umschrift_von = eigene id, ein Sonderfall,
    // den die reale Anwendung nicht erzeugen würde und der die Geschwistersuche der Trigger-SQL
    // nicht sinnvoll prüft).
    const andere = zustand.namen.filter((eintrag) => eintrag.id !== ziel.id)
    const zielIndex = indexInBereich(andere.length, aktion.umschriftZielIdx)
    const kandidat = zielIndex === undefined ? undefined : andere[zielIndex]
    if (kandidat !== undefined) {
      umschriftModusSql = 'zu_id'
      umschriftZielId = kandidat.id
    }
  }

  db.prepare(
    `UPDATE name SET
       original_text = CASE @originalModus WHEN 'null' THEN NULL WHEN 'text' THEN @originalText ELSE original_text END,
       umschrift_von = CASE @umschriftModus WHEN 'auf_null' THEN NULL WHEN 'zu_id' THEN @umschriftZielId ELSE umschrift_von END,
       ist_bevorzugt = CASE @bevorzugtModus WHEN 'null' THEN NULL WHEN '0' THEN 0 WHEN '1' THEN 1 ELSE ist_bevorzugt END
     WHERE id = @id`,
  ).run({
    id: ziel.id,
    originalModus: aktion.originalTextModus,
    originalText: aktion.originalText,
    umschriftModus: umschriftModusSql,
    umschriftZielId,
    bevorzugtModus: aktion.bevorzugtModus,
  })
}

function nameDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: NameDeleteAktion): void {
  const index = indexInBereich(zustand.namen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.namen[index]
  if (ziel === undefined) {
    return
  }
  db.prepare('DELETE FROM name WHERE id = @id').run({ id: ziel.id })
  zustand.namen = zustand.namen.filter((eintrag) => eintrag.id !== ziel.id)
}

function aussageInsertAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: AussageInsertAktion): void {
  const index = indexInBereich(zustand.personIds.length, aktion.personIdx)
  const personId = index === undefined ? undefined : zustand.personIds[index]
  if (personId === undefined) {
    return
  }

  let wertText: string | null = null
  let wertRefId: string | null = null
  let datumWert1: string | null = null
  let datumSortVon: number | null = null

  if (aktion.praedikat === 'geburtsdatum' || aktion.praedikat === 'todesdatum') {
    datumWert1 = datumWert1Bauen(aktion.datumJahr, aktion.datumVollstaendig)
    datumSortVon = aktion.datumSortVon
  } else if (aktion.praedikat === 'geburtsort') {
    if (aktion.ortReferenzModus === 'vorhanden') {
      const ortIndex = indexInBereich(zustand.orte.length, aktion.ortIdx)
      wertRefId = ortIndex === undefined ? null : (zustand.orte[ortIndex] ?? null)
    } else if (aktion.ortReferenzModus === 'fremd') {
      // aussage.wert_ref_id ist E-7-polymorph OHNE Fremdschlüssel (0002_kern.sql) — eine
      // baumelnde Referenz verletzt keine Constraint und ist gültiger Input für die Projektion
      // (das LEFT JOIN über ortsname liefert dafür einfach NULL, in beiden Vergleichsseiten gleich).
      wertRefId = uuidv7()
    }
  } else {
    wertText = aktion.wertText
  }

  const id = uuidv7()
  db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id, datum_wert1, datum_sort_von, konfidenz, ist_bevorzugt)
     VALUES (@id, 'person', @subjektId, @praedikat, @wertText, NULL, @wertRefId, @datumWert1, @datumSortVon, @konfidenz, @istBevorzugt)`,
  ).run({
    id,
    subjektId: personId,
    praedikat: aktion.praedikat,
    wertText,
    wertRefId,
    datumWert1,
    datumSortVon,
    konfidenz: aktion.konfidenz,
    istBevorzugt: aktion.istBevorzugt,
  })
  zustand.aussagen.push({ id, personId })
}

function aussageUpdateAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: AussageUpdateAktion): void {
  const index = indexInBereich(zustand.aussagen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.aussagen[index]
  if (ziel === undefined) {
    return
  }
  const datumWert1 = aktion.datumModus === 'text' ? datumWert1Bauen(aktion.datumJahr, aktion.datumVollstaendig) : null
  db.prepare(
    `UPDATE aussage SET
       datum_wert1 = CASE @datumModus WHEN 'null' THEN NULL WHEN 'text' THEN @datumWert1 ELSE datum_wert1 END,
       konfidenz = CASE @konfidenzModus
         WHEN 'null' THEN NULL WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 WHEN '4' THEN 4 ELSE konfidenz END,
       ist_bevorzugt = CASE @bevorzugtModus WHEN 'null' THEN NULL WHEN '0' THEN 0 WHEN '1' THEN 1 ELSE ist_bevorzugt END
     WHERE id = @id`,
  ).run({
    id: ziel.id,
    datumModus: aktion.datumModus,
    datumWert1,
    konfidenzModus: aktion.konfidenzModus,
    bevorzugtModus: aktion.bevorzugtModus,
  })
}

function aussageDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: AussageDeleteAktion): void {
  const index = indexInBereich(zustand.aussagen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.aussagen[index]
  if (ziel === undefined) {
    return
  }
  db.prepare('DELETE FROM aussage WHERE id = @id').run({ id: ziel.id })
  zustand.aussagen = zustand.aussagen.filter((eintrag) => eintrag.id !== ziel.id)
}

function ortInsertAusfuehren(db: Database.Database, zustand: ModellZustand): void {
  const id = uuidv7()
  db.prepare('INSERT INTO ort (id) VALUES (@id)').run({ id })
  zustand.orte.push(id)
}

function ortDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: OrtDeleteAktion): void {
  const index = indexInBereich(zustand.orte.length, aktion.idx)
  const ortId = index === undefined ? undefined : zustand.orte[index]
  if (ortId === undefined) {
    return
  }
  db.prepare('DELETE FROM ort WHERE id = @id').run({ id: ortId })
  zustand.orte = zustand.orte.filter((id) => id !== ortId)
  // CASCADE (ortsname.ort_id ... ON DELETE CASCADE) hat die Ortsnamenszeilen bereits real gelöscht.
  zustand.ortsnamen = zustand.ortsnamen.filter((eintrag) => eintrag.ortId !== ortId)
}

function ortsnameInsertAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: OrtsnameInsertAktion): void {
  const index = indexInBereich(zustand.orte.length, aktion.ortIdx)
  const ortId = index === undefined ? undefined : zustand.orte[index]
  if (ortId === undefined) {
    return
  }
  const id = uuidv7()
  db.prepare(
    'INSERT INTO ortsname (id, ort_id, name, ist_bevorzugt) VALUES (@id, @ortId, @name, @istBevorzugt)',
  ).run({ id, ortId, name: aktion.name, istBevorzugt: aktion.istBevorzugt })
  zustand.ortsnamen.push({ id, ortId })
}

function ortsnameUpdateAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: OrtsnameUpdateAktion): void {
  const index = indexInBereich(zustand.ortsnamen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.ortsnamen[index]
  if (ziel === undefined) {
    return
  }
  db.prepare(
    `UPDATE ortsname SET
       name = CASE @nameModus WHEN 'null' THEN NULL WHEN 'text' THEN @name ELSE name END,
       ist_bevorzugt = CASE @bevorzugtModus WHEN 'null' THEN NULL WHEN '0' THEN 0 WHEN '1' THEN 1 ELSE ist_bevorzugt END
     WHERE id = @id`,
  ).run({ id: ziel.id, nameModus: aktion.nameModus, name: aktion.name, bevorzugtModus: aktion.bevorzugtModus })
}

function ortsnameDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: OrtsnameDeleteAktion): void {
  const index = indexInBereich(zustand.ortsnamen.length, aktion.idx)
  const ziel = index === undefined ? undefined : zustand.ortsnamen[index]
  if (ziel === undefined) {
    return
  }
  db.prepare('DELETE FROM ortsname WHERE id = @id').run({ id: ziel.id })
  zustand.ortsnamen = zustand.ortsnamen.filter((eintrag) => eintrag.id !== ziel.id)
}

/**
 * Wächter-Auflage 2: atomarer Verbund Person→Ort→bevorzugter Ortsname→`geburtsort`-Aussage — s.
 * Doku bei `OrtMitGeburtsortAktion`. Garantiert (kein Zufall über unabhängige Indizes) ein
 * nicht-NULL `person_flach.geburt_ort_name`, das nachfolgende `ortsname_update`/`_delete`-Aktionen
 * mit nennenswerter Wahrscheinlichkeit treffen und dadurch den `abl_ortsname_au`/`_ad`-Fan-out
 * tatsächlich beanspruchen.
 */
function ortMitGeburtsortAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: OrtMitGeburtsortAktion): void {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
  zustand.personIds.push(personId)

  const ortId = uuidv7()
  db.prepare('INSERT INTO ort (id) VALUES (@id)').run({ id: ortId })
  zustand.orte.push(ortId)

  const ortsnameId = uuidv7()
  db.prepare('INSERT INTO ortsname (id, ort_id, name, ist_bevorzugt) VALUES (@id, @ortId, @name, 1)').run({
    id: ortsnameId,
    ortId,
    name: aktion.ortsnameName,
  })
  zustand.ortsnamen.push({ id: ortsnameId, ortId })

  const aussageId = uuidv7()
  db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_ref_id) VALUES (@id, 'person', @personId, 'geburtsort', @ortId)`,
  ).run({ id: aussageId, personId, ortId })
  zustand.aussagen.push({ id: aussageId, personId })
}

function zitatInsertAusfuehren(db: Database.Database, zustand: ModellZustand, quelleId: string, aktion: ZitatInsertAktion): void {
  const id = uuidv7()
  const transkript = aktion.transkriptModus === 'text' ? aktion.transkriptText : null
  db.prepare('INSERT INTO zitat (id, quelle_id, transkript) VALUES (@id, @quelleId, @transkript)').run({
    id,
    quelleId,
    transkript,
  })
  zustand.zitate.push(id)
}

function zitatUpdateAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: ZitatUpdateAktion): void {
  const index = indexInBereich(zustand.zitate.length, aktion.idx)
  const id = index === undefined ? undefined : zustand.zitate[index]
  if (id === undefined) {
    return
  }
  db.prepare(
    `UPDATE zitat SET transkript = CASE @modus WHEN 'null' THEN NULL WHEN 'text' THEN @text ELSE transkript END WHERE id = @id`,
  ).run({ id, modus: aktion.transkriptModus, text: aktion.transkriptText })
}

function zitatDeleteAusfuehren(db: Database.Database, zustand: ModellZustand, aktion: ZitatDeleteAktion): void {
  const index = indexInBereich(zustand.zitate.length, aktion.idx)
  const id = index === undefined ? undefined : zustand.zitate[index]
  if (id === undefined) {
    return
  }
  db.prepare('DELETE FROM zitat WHERE id = @id').run({ id })
  zustand.zitate = zustand.zitate.filter((zitatId) => zitatId !== id)
}

/** Erschöpfende Prüfung zur Compile-Zeit: eine neue `Aktion`-Variante ohne passenden `case` bricht `pnpm typen`. */
function nieErreichbar(wert: never): never {
  throw new Error(`Unbekannte Aktion: ${JSON.stringify(wert)}`)
}

export function aktionAusfuehren(db: Database.Database, zustand: ModellZustand, quelleId: string, aktion: Aktion): void {
  switch (aktion.kind) {
    case 'person_insert':
      personInsertAusfuehren(db, zustand, aktion)
      return
    case 'person_update_notiz':
      personUpdateNotizAusfuehren(db, zustand, aktion)
      return
    case 'person_delete':
      personDeleteAusfuehren(db, zustand, aktion)
      return
    case 'name_insert':
      nameInsertAusfuehren(db, zustand, aktion)
      return
    case 'name_insert_umschrift_paar':
      nameInsertUmschriftPaarAusfuehren(db, zustand, aktion)
      return
    case 'name_update':
      nameUpdateAusfuehren(db, zustand, aktion)
      return
    case 'name_delete':
      nameDeleteAusfuehren(db, zustand, aktion)
      return
    case 'aussage_insert':
      aussageInsertAusfuehren(db, zustand, aktion)
      return
    case 'aussage_update':
      aussageUpdateAusfuehren(db, zustand, aktion)
      return
    case 'aussage_delete':
      aussageDeleteAusfuehren(db, zustand, aktion)
      return
    case 'ort_insert':
      ortInsertAusfuehren(db, zustand)
      return
    case 'ort_delete':
      ortDeleteAusfuehren(db, zustand, aktion)
      return
    case 'ortsname_insert':
      ortsnameInsertAusfuehren(db, zustand, aktion)
      return
    case 'ortsname_update':
      ortsnameUpdateAusfuehren(db, zustand, aktion)
      return
    case 'ortsname_delete':
      ortsnameDeleteAusfuehren(db, zustand, aktion)
      return
    case 'ort_mit_geburtsort':
      ortMitGeburtsortAusfuehren(db, zustand, aktion)
      return
    case 'zitat_insert':
      zitatInsertAusfuehren(db, zustand, quelleId, aktion)
      return
    case 'zitat_update':
      zitatUpdateAusfuehren(db, zustand, aktion)
      return
    case 'zitat_delete':
      zitatDeleteAusfuehren(db, zustand, aktion)
      return
    default:
      nieErreichbar(aktion)
  }
}
