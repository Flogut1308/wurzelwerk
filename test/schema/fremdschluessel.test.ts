// AP-0.6 PR-B, test/schema/fremdschluessel.test.ts (E-7, 50_Datenmodell.md N.5): jede *_id-Spalte
// hat entweder einen deklarierten Fremdschlüssel oder steht in einer kommentierten
// Ausnahmeliste — und jede polymorphe Spalte hat einen zugehörigen Diskriminator, außer das
// Modell sieht dafür bewusst keinen vor.
import { describe, expect, it } from 'vitest'
import { anwenderTabellenNamen, fremdschluesselListe, frischeMigrierteDatenbank, spaltenNamen } from './_hilfen'

interface PolymorpheSpalte {
  readonly tabelle: string
  readonly spalte: string
  /** Name der zugehörigen Diskriminator-Spalte in derselben Tabelle, oder `null` = laut Modell/SQL-Kommentar bewusst keiner vorgesehen. */
  readonly diskriminator: string | null
}

/**
 * E-7: polymorphe `*_id`-Spalten ohne deklarierten Fremdschlüssel, weil ihr Ziel je nach
 * Diskriminator variiert. Gegen das echte Schema geprüft (docs/schema/0002_kern.sql,
 * `-- E-7: polymorph, bewusst kein FK` je Spalte) — jede hier gelistete Spalte hat im Schema
 * tatsächlich keinen Fremdschlüssel; jede reale FK-lose `*_id`-Spalte, die hier NICHT steht,
 * lässt den Test unten bewusst rot werden (kein stillschweigendes Übernehmen neuer Ausnahmen).
 */
const POLYMORPHE_SPALTEN: readonly PolymorpheSpalte[] = [
  { tabelle: 'aussage', spalte: 'subjekt_id', diskriminator: 'subjekt_typ' },
  // SQL-Kommentar zu aussage.wert_ref_id: "kein _typ nötig laut Modell" — Verweisziel variiert
  // (z. B. ort), aber ohne eigenen Diskriminator vorgesehen.
  { tabelle: 'aussage', spalte: 'wert_ref_id', diskriminator: null },
  { tabelle: 'medium_zuordnung', spalte: 'subjekt_id', diskriminator: 'subjekt_typ' },
  { tabelle: 'feld_wert', spalte: 'subjekt_id', diskriminator: 'subjekt_typ' },
  // SQL-Kommentar zu feld_wert.wert_ref_id: "kein _typ nötig laut Plan".
  { tabelle: 'feld_wert', spalte: 'wert_ref_id', diskriminator: null },
  // id_alias: ein gemeinsamer Diskriminator "typ" für beide Seiten der Umleitung (Merge: alte_id
  // und neue_id bezeichnen dieselbe Entitätsart).
  { tabelle: 'id_alias', spalte: 'alte_id', diskriminator: 'typ' },
  { tabelle: 'id_alias', spalte: 'neue_id', diskriminator: 'typ' },
  { tabelle: 'import_herkunft', spalte: 'datensatz_id', diskriminator: 'datensatz_typ' },
  // docs/schema/0001_grundgeruest.sql: aenderung.tabelle trägt den Namen der Zieltabelle — der
  // Diskriminator heißt hier "tabelle", nicht "<spalte>_typ" (abweichende, aber gleichwertige
  // Namenskonvention aus AP-0.5, vor der AP-0.6-Konvention entstanden).
  { tabelle: 'aenderung', spalte: 'datensatz_id', diskriminator: 'tabelle' },
]

/**
 * Weitere `*_id`-Spalten ohne deklarierten Fremdschlüssel, die NICHT polymorph sind (kein E-7-Fall,
 * fester Zieltyp) und deshalb absichtlich getrennt von POLYMORPHE_SPALTEN geführt werden — sonst
 * würde die Diskriminator-Zusatzregel unten fälschlich einen `*_typ` dafür verlangen.
 *
 * `journal_kontext.transaktion_id` (docs/schema/0001_grundgeruest.sql) zeigt auf ein festes Ziel
 * (`transaktion`), trägt aber laut 55_Architektur.md §4.3 (Referenz-SQL für die Armierungs-
 * Kontexttabelle) bewusst keine REFERENCES-Klausel — das ist die Kontrolltabelle des
 * Journal-Mechanismus selbst, nicht Teil der AP-0.6-Zusicherung "jeder Fremdschlüssel deklariert"
 * (die gilt für die Entitätstabellen aus 50_Datenmodell.md §2, journal_kontext kam mit AP-0.5).
 */
const WEITERE_AUSNAHMEN_OHNE_FK: Record<string, readonly string[]> = {
  journal_kontext: ['transaktion_id'],
}

describe('test/schema/fremdschluessel (E-7, 50_Datenmodell.md N.5)', () => {
  it('jede *_id-Spalte hat einen deklarierten Fremdschlüssel oder ist als Ausnahme dokumentiert', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const verstoesse: string[] = []
      for (const tabelle of anwenderTabellenNamen(db)) {
        const spalten = spaltenNamen(db, tabelle)
        const fremdschluesselSpalten = new Set(fremdschluesselListe(db, tabelle).map((zeile) => zeile.from))
        const polymorpheSpaltenNamen = new Set(
          POLYMORPHE_SPALTEN.filter((eintrag) => eintrag.tabelle === tabelle).map((eintrag) => eintrag.spalte),
        )
        const weitereAusnahmen = new Set(WEITERE_AUSNAHMEN_OHNE_FK[tabelle] ?? [])

        for (const spalte of spalten) {
          if (!spalte.endsWith('_id')) {
            continue
          }
          const hatFk = fremdschluesselSpalten.has(spalte)
          const istDokumentierteAusnahme = polymorpheSpaltenNamen.has(spalte) || weitereAusnahmen.has(spalte)
          if (!hatFk && !istDokumentierteAusnahme) {
            verstoesse.push(`${tabelle}.${spalte}`)
          }
        }
      }
      expect(verstoesse.sort((a, b) => a.localeCompare(b))).toEqual([])
    } finally {
      db.close()
    }
  })

  it('jede dokumentierte Ausnahme (POLYMORPHE_SPALTEN, WEITERE_AUSNAHMEN_OHNE_FK) hat im echten Schema tatsächlich keinen Fremdschlüssel', () => {
    // Gegenprobe zum obigen Test: verhindert, dass die Ausnahmelisten Einträge enthalten, die gar
    // keine Ausnahme (mehr) sind — z. B. weil PR-A nachträglich doch einen FK ergänzt hat.
    const db = frischeMigrierteDatenbank()
    try {
      const faelschlichAlsAusnahmeGefuehrt: string[] = []
      const alleAusnahmen: { readonly tabelle: string; readonly spalte: string }[] = [
        ...POLYMORPHE_SPALTEN.map((eintrag) => ({ tabelle: eintrag.tabelle, spalte: eintrag.spalte })),
        ...Object.entries(WEITERE_AUSNAHMEN_OHNE_FK).flatMap(([tabelle, spalten]) =>
          spalten.map((spalte) => ({ tabelle, spalte })),
        ),
      ]
      for (const { tabelle, spalte } of alleAusnahmen) {
        const fremdschluesselSpalten = new Set(fremdschluesselListe(db, tabelle).map((zeile) => zeile.from))
        if (fremdschluesselSpalten.has(spalte)) {
          faelschlichAlsAusnahmeGefuehrt.push(`${tabelle}.${spalte}`)
        }
      }
      expect(faelschlichAlsAusnahmeGefuehrt).toEqual([])
    } finally {
      db.close()
    }
  })

  it('jede polymorphe Spalte mit vorgesehenem Diskriminator hat die zugehörige *_typ-Spalte in derselben Tabelle', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const fehlendeDiskriminatoren: string[] = []
      for (const eintrag of POLYMORPHE_SPALTEN) {
        if (eintrag.diskriminator === null) {
          continue
        }
        const spalten = new Set(spaltenNamen(db, eintrag.tabelle))
        if (!spalten.has(eintrag.diskriminator)) {
          fehlendeDiskriminatoren.push(`${eintrag.tabelle}.${eintrag.spalte} -> erwartet ${eintrag.diskriminator}`)
        }
      }
      expect(fehlendeDiskriminatoren).toEqual([])
    } finally {
      db.close()
    }
  })
})
