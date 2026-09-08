// AP-0.6 PR-B, test/schema/vollstaendigkeit.test.ts (CLAUDE.md §13 geschützter Prüfpfad).
// ERWARTETES_SCHEMA ist die handkuratierte "Wahrheit": Tabelle -> Spaltennamen, abgeleitet aus
// 50_Datenmodell.md §2 (inkl. Nachtrag N.1-N.6) UND dem tatsächlichen docs/schema/0001_grundgeruest.sql
// + 0002_kern.sql. Bei einer Divergenz zwischen Modell und Schema gilt das Schema (CLAUDE.md §12:
// docs/ ist die geprüfte Wahrheit) — Abweichungen stehen als Kommentar bei der betroffenen Zeile.
import { describe, expect, it } from 'vitest'
import { anwenderTabellenNamen, frischeMigrierteDatenbank, spaltenNamen } from './_hilfen'

export const ERWARTETES_SCHEMA: Record<string, readonly string[]> = {
  // docs/schema/0001_grundgeruest.sql (AP-0.5) — Journal-Infrastruktur, NICHT_JOURNALISIERT.
  transaktion: [
    'id',
    'zeitpunkt',
    'bearbeiter',
    'beschreibung',
    'art',
    'lfd',
    'status',
    'rueckgaengig_moeglich',
    'snapshot_pfad',
    'koaleszenz_schluessel',
  ],
  aenderung: [
    'id',
    'transaktion_id',
    'reihenfolge',
    'tabelle',
    'datensatz_id',
    'feld',
    'wert_alt_json',
    'wert_neu_json',
    'operation',
  ],
  journal_kontext: ['id', 'transaktion_id', 'aktiv'],
  schema_migration: ['version', 'datei', 'pruefsumme', 'angewendet_am', 'app_version'],

  // docs/schema/0002_kern.sql (AP-0.6). 50_Datenmodell.md §2 (Vorspann) nennt "erstellt_am"/
  // "geaendert_am" als "überall implizit" — im Schema bewusst weggelassen (0001-Konvention: nur
  // transaktion.zeitpunkt trägt einen Zeitstempel, keine Zeilenzeitstempel je Tabelle). Divergenz
  // Modell↔Schema, siehe Abschlussbericht dieses Pakets — hier absichtlich NICHT nachgetragen,
  // sonst wäre dieser Test kein Test des tatsächlichen Schemas mehr.
  person: ['id', 'geschlecht', 'lebend_status', 'privat', 'notiz', 'gesperrt_bis', 'ist_platzhalter', 'platzhalter_grund'],
  name: [
    'id',
    'person_id',
    'typ',
    'schrift',
    'umschrift_von',
    'umschrift_norm',
    'vornamen',
    'rufname_index',
    'rufname_text',
    'nachname',
    'praefix',
    'titel_vor',
    'zusatz_nach',
    'original_text',
    'sprache',
    'ist_bevorzugt',
    'gueltig_von',
    'gueltig_bis',
  ],
  name_phonetik: ['name_id', 'verfahren', 'code'],
  ort: ['id', 'typ', 'koordinaten_lat', 'koordinaten_lon', 'existiert_von', 'existiert_bis', 'nachfolger_ort_id', 'notiz'],
  ortsname: ['id', 'ort_id', 'name', 'sprache', 'gueltig_von', 'gueltig_bis', 'ist_bevorzugt', 'original_text'],
  ortszugehoerigkeit: ['id', 'ort_id', 'uebergeordnet_id', 'art', 'gueltig_von', 'gueltig_bis'],
  ort_externe_id: ['ort_id', 'system', 'wert'],
  ereignis: [
    'id',
    'typ',
    'ort_id',
    'datum_kalender',
    'datum_modifikator',
    'datum_praezision',
    'datum_wert1',
    'datum_wert2',
    'datum_originaltext',
    'datum_sort_von',
    'datum_sort_bis',
    'datum_zweitkalender',
    'datum_zweitwert',
    'datum_doppeljahr',
    'beschreibung',
    'notiz',
  ],
  beteiligung: ['id', 'ereignis_id', 'person_id', 'rolle', 'reihenfolge'],
  elternschaft: ['id', 'elternteil_id', 'kind_id', 'typ', 'konfidenz', 'notiz'],
  partnerschaft: [
    'id',
    'typ',
    'beginn_kalender',
    'beginn_modifikator',
    'beginn_praezision',
    'beginn_wert1',
    'beginn_wert2',
    'beginn_originaltext',
    'beginn_sort_von',
    'beginn_sort_bis',
    'beginn_zweitkalender',
    'beginn_zweitwert',
    'beginn_doppeljahr',
    'ende_kalender',
    'ende_modifikator',
    'ende_praezision',
    'ende_wert1',
    'ende_wert2',
    'ende_originaltext',
    'ende_sort_von',
    'ende_sort_bis',
    'ende_zweitkalender',
    'ende_zweitwert',
    'ende_doppeljahr',
    'ende_grund',
    'reihenfolge',
    'notiz',
  ],
  partnerschaft_person: ['partnerschaft_id', 'person_id', 'rolle'],
  assoziation: ['id', 'person_a_id', 'person_b_id', 'art', 'notiz'],
  archiv: ['id', 'name', 'ort_id', 'kontakt', 'url', 'notiz'],
  quelle: [
    'id',
    'typ',
    'titel',
    'autor',
    'verlag',
    'jahr',
    'art',
    'informationsart',
    'archiv_id',
    'signatur',
    'notiz',
    'informant_person_id',
    'gespraechsdatum_kalender',
    'gespraechsdatum_modifikator',
    'gespraechsdatum_praezision',
    'gespraechsdatum_wert1',
    'gespraechsdatum_wert2',
    'gespraechsdatum_originaltext',
    'gespraechsdatum_sort_von',
    'gespraechsdatum_sort_bis',
    'gespraechsdatum_zweitkalender',
    'gespraechsdatum_zweitwert',
    'gespraechsdatum_doppeljahr',
    'form',
    'unmittelbarkeit',
    'audio_medium_id',
  ],
  zitat: [
    'id',
    'quelle_id',
    'seite',
    'eintragsnummer',
    'band',
    'jahr',
    'zugriffsdatum_kalender',
    'zugriffsdatum_modifikator',
    'zugriffsdatum_praezision',
    'zugriffsdatum_wert1',
    'zugriffsdatum_wert2',
    'zugriffsdatum_originaltext',
    'zugriffsdatum_sort_von',
    'zugriffsdatum_sort_bis',
    'zugriffsdatum_zweitkalender',
    'zugriffsdatum_zweitwert',
    'zugriffsdatum_doppeljahr',
    'digitalisat_url',
    'transkript',
    'uebersetzung',
    'konfidenz',
    'medium_id',
  ],
  aussage: [
    'id',
    'subjekt_typ',
    'subjekt_id',
    'praedikat',
    'wert_text',
    'wert_zahl',
    'wert_ref_id',
    'datum_kalender',
    'datum_modifikator',
    'datum_praezision',
    'datum_wert1',
    'datum_wert2',
    'datum_originaltext',
    'datum_sort_von',
    'datum_sort_bis',
    'datum_zweitkalender',
    'datum_zweitwert',
    'datum_doppeljahr',
    'konfidenz',
    'ist_bevorzugt',
    'begruendung',
  ],
  aussage_zitat: ['aussage_id', 'zitat_id'],
  negativbefund: [
    'id',
    'quelle_id',
    'gesuchte_person_id',
    'gesuchtes_praedikat',
    'zeitraum_von',
    'zeitraum_bis',
    'beschreibung',
    'datum_der_pruefung',
  ],
  persona: ['id', 'zitat_id', 'rohdaten_json', 'person_id', 'zuordnung_konfidenz', 'zuordnung_begruendung', 'zuordnung_datum'],
  medium: [
    'id',
    'dateiname',
    'relativer_pfad',
    'hash',
    'mime_typ',
    'groesse',
    'titel',
    'beschreibung',
    'datum_kalender',
    'datum_modifikator',
    'datum_praezision',
    'datum_wert1',
    'datum_wert2',
    'datum_originaltext',
    'datum_sort_von',
    'datum_sort_bis',
    'datum_zweitkalender',
    'datum_zweitwert',
    'datum_doppeljahr',
    'ort_id',
  ],
  medium_zuordnung: ['medium_id', 'subjekt_typ', 'subjekt_id', 'ist_titelbild'],
  medium_region: ['id', 'medium_id', 'person_id', 'x', 'y', 'w', 'h'],
  merge_protokoll: [
    'id',
    'transaktion_id',
    'ziel_person_id',
    'quell_person_id',
    'feldentscheidungen_json',
    'begruendung',
    'rueckgaengig_moeglich',
  ],
  id_alias: ['alte_id', 'neue_id', 'typ'],
  aufgabe: ['id', 'person_id', 'ort_id', 'quelle_id', 'titel', 'beschreibung', 'prioritaet', 'status', 'faellig_am'],
  diagnose: [
    'id',
    'person_id',
    'kategorie',
    'organ',
    'bezeichnung',
    'icd10',
    'erstdiagnose_kalender',
    'erstdiagnose_modifikator',
    'erstdiagnose_praezision',
    'erstdiagnose_wert1',
    'erstdiagnose_wert2',
    'erstdiagnose_originaltext',
    'erstdiagnose_sort_von',
    'erstdiagnose_sort_bis',
    'erstdiagnose_zweitkalender',
    'erstdiagnose_zweitwert',
    'erstdiagnose_doppeljahr',
    'alter_bei_diagnose',
    'status',
    'konfidenz',
    'notiz',
  ],
  risikofaktor: [
    'id',
    'person_id',
    'art',
    'detail',
    'intensitaet',
    'beginn_kalender',
    'beginn_modifikator',
    'beginn_praezision',
    'beginn_wert1',
    'beginn_wert2',
    'beginn_originaltext',
    'beginn_sort_von',
    'beginn_sort_bis',
    'beginn_zweitkalender',
    'beginn_zweitwert',
    'beginn_doppeljahr',
    'ende_kalender',
    'ende_modifikator',
    'ende_praezision',
    'ende_wert1',
    'ende_wert2',
    'ende_originaltext',
    'ende_sort_von',
    'ende_sort_bis',
    'ende_zweitkalender',
    'ende_zweitwert',
    'ende_doppeljahr',
    'quelle_beruf_id',
    'konfidenz',
    'notiz',
  ],
  feld_definition: [
    'id',
    'schluessel',
    'bezeichnung',
    'beschreibung',
    'gilt_fuer',
    'datentyp',
    'ist_mehrfach',
    'hat_zeitraum',
    'gruppe',
    'reihenfolge',
    'ist_system',
    'ist_sensibel',
  ],
  feld_auswahloption: ['id', 'feld_definition_id', 'wert', 'bezeichnung', 'reihenfolge'],
  feld_wert: [
    'id',
    'feld_definition_id',
    'subjekt_typ',
    'subjekt_id',
    'wert_text',
    'wert_zahl',
    'wert_ref_id',
    'wert_datum_kalender',
    'wert_datum_modifikator',
    'wert_datum_praezision',
    'wert_datum_wert1',
    'wert_datum_wert2',
    'wert_datum_originaltext',
    'wert_datum_sort_von',
    'wert_datum_sort_bis',
    'wert_datum_zweitkalender',
    'wert_datum_zweitwert',
    'wert_datum_doppeljahr',
    'gueltig_von',
    'gueltig_bis',
    'reihenfolge',
  ],
  interview_sitzung: [
    'id',
    'informant_person_id',
    'datum_kalender',
    'datum_modifikator',
    'datum_praezision',
    'datum_wert1',
    'datum_wert2',
    'datum_originaltext',
    'datum_sort_von',
    'datum_sort_bis',
    'datum_zweitkalender',
    'datum_zweitwert',
    'datum_doppeljahr',
    'ort_id',
    'audio_medium_id',
    'notizen',
    'status',
  ],
  import_lauf: ['id', 'datei', 'pruefsumme', 'vertragsversion', 'zeitpunkt', 'transaktion_id'],
  import_herkunft: ['id', 'import_lauf_id', 'datensatz_id', 'datensatz_typ'],
  ansicht_zustand: ['id', 'name', 'zentrumsperson_id', 'filter_json'],
}

/** Die 11 Spalten einer Datumsgruppe (50_Datenmodell.md §2.3 + N.1-Zusatzfelder E9). */
const DATUMSGRUPPEN_SUFFIXE = [
  'kalender',
  'modifikator',
  'praezision',
  'wert1',
  'wert2',
  'originaltext',
  'sort_von',
  'sort_bis',
  'zweitkalender',
  'zweitwert',
  'doppeljahr',
] as const

describe('test/schema/vollstaendigkeit (AP-0.6, 50_Datenmodell.md §2)', () => {
  it('Tabellenmenge der Datenbank entspricht ERWARTETES_SCHEMA', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const tatsaechlich = new Set(anwenderTabellenNamen(db))
      const erwartet = new Set(Object.keys(ERWARTETES_SCHEMA))

      const fehlend = [...erwartet].filter((tabelle) => !tatsaechlich.has(tabelle)).sort((a, b) => a.localeCompare(b))
      const ueberzaehlig = [...tatsaechlich].filter((tabelle) => !erwartet.has(tabelle)).sort((a, b) => a.localeCompare(b))

      expect({ fehlend, ueberzaehlig }).toEqual({ fehlend: [], ueberzaehlig: [] })
    } finally {
      db.close()
    }
  })

  describe.each(Object.keys(ERWARTETES_SCHEMA).sort((a, b) => a.localeCompare(b)))('Tabelle %s', (tabelle) => {
    it('Spaltenmenge entspricht ERWARTETES_SCHEMA', () => {
      const db = frischeMigrierteDatenbank()
      try {
        const erwarteteSpalten = ERWARTETES_SCHEMA[tabelle]
        if (erwarteteSpalten === undefined) {
          throw new Error(`Kein Eintrag für Tabelle "${tabelle}" in ERWARTETES_SCHEMA.`)
        }
        const tatsaechlich = new Set(spaltenNamen(db, tabelle))
        const erwartet = new Set(erwarteteSpalten)

        const fehlend = [...erwartet].filter((spalte) => !tatsaechlich.has(spalte)).sort((a, b) => a.localeCompare(b))
        const ueberzaehlig = [...tatsaechlich].filter((spalte) => !erwartet.has(spalte)).sort((a, b) => a.localeCompare(b))

        expect({ fehlend, ueberzaehlig }).toEqual({ fehlend: [], ueberzaehlig: [] })
      } finally {
        db.close()
      }
    })
  })

  it('jede {feld}_kalender-Spalte hat alle 11 Datumsgruppen-Geschwister (fängt Tippfehler in Datumsgruppen)', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const fehlendeGeschwister: string[] = []
      for (const tabelle of anwenderTabellenNamen(db)) {
        const spalten = new Set(spaltenNamen(db, tabelle))
        for (const spalte of spalten) {
          if (!spalte.endsWith('_kalender')) {
            continue
          }
          const praefix = spalte.slice(0, -'_kalender'.length)
          for (const suffix of DATUMSGRUPPEN_SUFFIXE) {
            const erwarteteSpalte = `${praefix}_${suffix}`
            if (!spalten.has(erwarteteSpalte)) {
              fehlendeGeschwister.push(`${tabelle}.${erwarteteSpalte}`)
            }
          }
        }
      }
      expect(fehlendeGeschwister).toEqual([])
    } finally {
      db.close()
    }
  })
})
