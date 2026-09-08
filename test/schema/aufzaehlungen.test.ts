// AP-0.6 PR-B, test/schema/aufzaehlungen.test.ts — "der Test, der Schema und Code zusammenhält"
// (57_Phase0_Arbeitspakete.md AP-0.6). Für jede Spalte mit `CHECK (spalte IN (…))` im echten
// Schema muss die Werteliste als Menge exakt der zugehörigen Zod-Aufzählung entsprechen.
import { describe, expect, it } from 'vitest'
import {
  BeteiligungRolleEnum,
  DatumModifikatorEnum,
  DatumPraezisionEnum,
  DiagnoseKategorieEnum,
  DiagnoseStatusEnum,
  ElternschaftTypEnum,
  EndeGrundEnum,
  EreignisTypEnum,
  ExterneIdSystemEnum,
  FeldDatentypEnum,
  FeldGiltFuerEnum,
  GeschlechtEnum,
  InformationsartEnum,
  IntensitaetEnum,
  KalenderEnum,
  LebendStatusEnum,
  NameTypEnum,
  OrtTypEnum,
  OrtszugehoerigkeitArtEnum,
  PartnerschaftTypEnum,
  PlatzhalterGrundEnum,
  QuelleArtEnum,
  QuelleFormEnum,
  QuelleTypEnum,
  RisikofaktorArtEnum,
  SchriftEnum,
  SubjektTypEnum,
  UmschriftNormEnum,
  UnmittelbarkeitEnum,
  VerfahrenEnum,
} from '../../src/shared/schemata'
import {
  anwenderTabellenNamen,
  checkInSpaltenAusSql,
  createTableSqlVon,
  frischeMigrierteDatenbank,
  hatKonfidenzBetweenCheck,
} from './_hilfen'

/** Jedes hier verwendete Zod-Enum bringt `.options` mit (zod v4 `z.enum(...)`-Ergebnis). */
interface EnumMitOptionen {
  readonly options: readonly string[]
}

interface AufzaehlungsZuordnung {
  readonly tabelle: string
  readonly spalte: string
  readonly zodEnum: EnumMitOptionen
}

/** Die vier wiederkehrenden Spalten einer Datumsgruppe mit `CHECK (… IN (…))` (50_Datenmodell.md §2.3). */
const DATUMSGRUPPEN_ENUM_SPALTEN: Record<string, EnumMitOptionen> = {
  kalender: KalenderEnum,
  modifikator: DatumModifikatorEnum,
  praezision: DatumPraezisionEnum,
  zweitkalender: KalenderEnum,
}

function datumsgruppenZuordnungen(tabelle: string, praefix: string): readonly AufzaehlungsZuordnung[] {
  return Object.entries(DATUMSGRUPPEN_ENUM_SPALTEN).map(([suffix, zodEnum]) => ({
    tabelle,
    spalte: `${praefix}_${suffix}`,
    zodEnum,
  }))
}

/**
 * { tabelle, spalte, zodEnum } für jede Spalte mit `CHECK (spalte IN (…))` in
 * docs/schema/0002_kern.sql. Die drei entsprechenden Spalten aus 0001_grundgeruest.sql
 * (transaktion.art, transaktion.status, aenderung.operation) sind außerhalb des AP-0.6-Umfangs
 * (kein Zod-Schema für transaktion/aenderung existiert bisher, AP-0.6 baut nur
 * `src/shared/schemata/*.ts` "je Entität" aus 50_Datenmodell.md §2 — journal_kontext & Co. kamen
 * mit AP-0.5) und bewusst nicht hier gelistet.
 */
const AUFZAEHLUNGS_ZUORDNUNGEN: readonly AufzaehlungsZuordnung[] = [
  { tabelle: 'person', spalte: 'geschlecht', zodEnum: GeschlechtEnum },
  { tabelle: 'person', spalte: 'lebend_status', zodEnum: LebendStatusEnum },
  { tabelle: 'person', spalte: 'platzhalter_grund', zodEnum: PlatzhalterGrundEnum },
  { tabelle: 'name', spalte: 'typ', zodEnum: NameTypEnum },
  { tabelle: 'name', spalte: 'schrift', zodEnum: SchriftEnum },
  { tabelle: 'name', spalte: 'umschrift_norm', zodEnum: UmschriftNormEnum },
  { tabelle: 'name_phonetik', spalte: 'verfahren', zodEnum: VerfahrenEnum },
  { tabelle: 'ort', spalte: 'typ', zodEnum: OrtTypEnum },
  { tabelle: 'ortszugehoerigkeit', spalte: 'art', zodEnum: OrtszugehoerigkeitArtEnum },
  { tabelle: 'ort_externe_id', spalte: 'system', zodEnum: ExterneIdSystemEnum },
  { tabelle: 'ereignis', spalte: 'typ', zodEnum: EreignisTypEnum },
  ...datumsgruppenZuordnungen('ereignis', 'datum'),
  { tabelle: 'beteiligung', spalte: 'rolle', zodEnum: BeteiligungRolleEnum },
  { tabelle: 'elternschaft', spalte: 'typ', zodEnum: ElternschaftTypEnum },
  { tabelle: 'partnerschaft', spalte: 'typ', zodEnum: PartnerschaftTypEnum },
  ...datumsgruppenZuordnungen('partnerschaft', 'beginn'),
  ...datumsgruppenZuordnungen('partnerschaft', 'ende'),
  { tabelle: 'partnerschaft', spalte: 'ende_grund', zodEnum: EndeGrundEnum },
  { tabelle: 'quelle', spalte: 'typ', zodEnum: QuelleTypEnum },
  { tabelle: 'quelle', spalte: 'art', zodEnum: QuelleArtEnum },
  { tabelle: 'quelle', spalte: 'informationsart', zodEnum: InformationsartEnum },
  ...datumsgruppenZuordnungen('quelle', 'gespraechsdatum'),
  { tabelle: 'quelle', spalte: 'form', zodEnum: QuelleFormEnum },
  { tabelle: 'quelle', spalte: 'unmittelbarkeit', zodEnum: UnmittelbarkeitEnum },
  ...datumsgruppenZuordnungen('zitat', 'zugriffsdatum'),
  { tabelle: 'aussage', spalte: 'subjekt_typ', zodEnum: SubjektTypEnum },
  ...datumsgruppenZuordnungen('aussage', 'datum'),
  ...datumsgruppenZuordnungen('medium', 'datum'),
  { tabelle: 'medium_zuordnung', spalte: 'subjekt_typ', zodEnum: SubjektTypEnum },
  { tabelle: 'diagnose', spalte: 'kategorie', zodEnum: DiagnoseKategorieEnum },
  ...datumsgruppenZuordnungen('diagnose', 'erstdiagnose'),
  { tabelle: 'diagnose', spalte: 'status', zodEnum: DiagnoseStatusEnum },
  { tabelle: 'risikofaktor', spalte: 'art', zodEnum: RisikofaktorArtEnum },
  { tabelle: 'risikofaktor', spalte: 'intensitaet', zodEnum: IntensitaetEnum },
  ...datumsgruppenZuordnungen('risikofaktor', 'beginn'),
  ...datumsgruppenZuordnungen('risikofaktor', 'ende'),
  { tabelle: 'feld_definition', spalte: 'gilt_fuer', zodEnum: FeldGiltFuerEnum },
  { tabelle: 'feld_definition', spalte: 'datentyp', zodEnum: FeldDatentypEnum },
  { tabelle: 'feld_wert', spalte: 'subjekt_typ', zodEnum: FeldGiltFuerEnum },
  ...datumsgruppenZuordnungen('feld_wert', 'wert_datum'),
  ...datumsgruppenZuordnungen('interview_sitzung', 'datum'),
]

/** Spalten mit `CHECK (spalte IN (…))` in 0001_grundgeruest.sql, außerhalb des AP-0.6-Umfangs (s. o.). */
const AUSSERHALB_AP_0_6: ReadonlySet<string> = new Set(['transaktion.art', 'transaktion.status', 'aenderung.operation'])

/** Tabelle -> Spalte -> `CHECK (spalte BETWEEN 1 AND 4)` (Konfidenzskala, N.1/E-1/E-9, vier Stufen). */
const KONFIDENZ_SPALTEN: readonly { readonly tabelle: string; readonly spalte: string }[] = [
  { tabelle: 'elternschaft', spalte: 'konfidenz' },
  { tabelle: 'zitat', spalte: 'konfidenz' },
  { tabelle: 'aussage', spalte: 'konfidenz' },
  { tabelle: 'diagnose', spalte: 'konfidenz' },
  { tabelle: 'risikofaktor', spalte: 'konfidenz' },
  { tabelle: 'persona', spalte: 'zuordnung_konfidenz' },
]

describe('test/schema/aufzaehlungen (Schema <-> Zod)', () => {
  it('für jede Zod-Zuordnung stimmt die CHECK-Werteliste exakt mit den Zod-Optionen überein', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const abweichungen: string[] = []
      for (const zuordnung of AUFZAEHLUNGS_ZUORDNUNGEN) {
        const sql = createTableSqlVon(db, zuordnung.tabelle)
        const checkWerte = checkInSpaltenAusSql(sql).get(zuordnung.spalte)
        if (checkWerte === undefined) {
          abweichungen.push(`${zuordnung.tabelle}.${zuordnung.spalte}: kein CHECK (… IN (…)) im Schema gefunden`)
          continue
        }
        const zodWerte = new Set(zuordnung.zodEnum.options)
        const fehltInZod = [...checkWerte].filter((wert) => !zodWerte.has(wert))
        const zuvielInZod = [...zodWerte].filter((wert) => !checkWerte.has(wert))
        if (fehltInZod.length > 0 || zuvielInZod.length > 0) {
          abweichungen.push(
            `${zuordnung.tabelle}.${zuordnung.spalte}: fehlt in Zod [${fehltInZod.join(', ')}], zu viel in Zod [${zuvielInZod.join(', ')}]`,
          )
        }
      }
      expect(abweichungen).toEqual([])
    } finally {
      db.close()
    }
  })

  it('jede CHECK (… IN (…))-Spalte im Kernschema hat eine Zuordnung (keine unbeobachtete Aufzählung)', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const zugeordnet = new Set(AUFZAEHLUNGS_ZUORDNUNGEN.map((zuordnung) => `${zuordnung.tabelle}.${zuordnung.spalte}`))
      const unbeobachtet: string[] = []
      for (const tabelle of anwenderTabellenNamen(db)) {
        const sql = createTableSqlVon(db, tabelle)
        for (const spalte of checkInSpaltenAusSql(sql).keys()) {
          const schluessel = `${tabelle}.${spalte}`
          if (!zugeordnet.has(schluessel) && !AUSSERHALB_AP_0_6.has(schluessel)) {
            unbeobachtet.push(schluessel)
          }
        }
      }
      expect(unbeobachtet.sort((a, b) => a.localeCompare(b))).toEqual([])
    } finally {
      db.close()
    }
  })

  it.each(KONFIDENZ_SPALTEN)('$tabelle.$spalte hat CHECK ($spalte BETWEEN 1 AND 4) statt IN (…)', ({ tabelle, spalte }) => {
    const db = frischeMigrierteDatenbank()
    try {
      const sql = createTableSqlVon(db, tabelle)
      expect(hatKonfidenzBetweenCheck(sql, spalte)).toBe(true)
    } finally {
      db.close()
    }
  })

  it('aussage.praedikat hat bewusst KEINEN CHECK (E-6: offene Menge, freier Text)', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const sql = createTableSqlVon(db, 'aussage')
      expect(checkInSpaltenAusSql(sql).has('praedikat')).toBe(false)
      expect(/CHECK\s*\(\s*praedikat\b/.test(sql)).toBe(false)
    } finally {
      db.close()
    }
  })

  // Review-Auflage 2: assoziation.art ist jetzt eine offene Menge ohne CHECK, analog zu
  // aussage.praedikat (50_Datenmodell.md §1 nutzt Ellipse). `AssoziationArtEnum` existiert
  // deshalb nicht mehr in src/shared/schemata/assoziation.ts und steht bewusst nicht in
  // AUFZAEHLUNGS_ZUORDNUNGEN.
  it('assoziation.art hat bewusst KEINEN CHECK (offene Menge, freier Text)', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const sql = createTableSqlVon(db, 'assoziation')
      expect(checkInSpaltenAusSql(sql).has('art')).toBe(false)
      expect(/CHECK\s*\(\s*art\b/.test(sql)).toBe(false)
    } finally {
      db.close()
    }
  })
})
