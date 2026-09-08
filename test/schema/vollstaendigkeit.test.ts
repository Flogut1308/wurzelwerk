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

  // docs/schema/0002_kern.sql (AP-0.6). Review-Auflage 1: erstellt_am/geaendert_am an allen
  // Kern-Tabellen ergänzt (50_Datenmodell.md §2 Vorspann nennt sie "überall implizit" — jetzt im
  // Schema explizit gemacht). 0001-Tabellen (transaktion, aenderung, journal_kontext,
  // schema_migration) tragen diese Spalten NICHT, siehe deren Einträge oben.
  person: [
    'id',
    'geschlecht',
    'lebend_status',
    'privat',
    'notiz',
    'gesperrt_bis',
    'ist_platzhalter',
    'platzhalter_grund',
    'erstellt_am',
    'geaendert_am',
  ],
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
    'erstellt_am',
    'geaendert_am',
  ],
  name_phonetik: ['name_id', 'verfahren', 'code', 'erstellt_am', 'geaendert_am'],
  ort: [
    'id',
    'typ',
    'koordinaten_lat',
    'koordinaten_lon',
    'existiert_von',
    'existiert_bis',
    'nachfolger_ort_id',
    'notiz',
    'erstellt_am',
    'geaendert_am',
  ],
  ortsname: [
    'id',
    'ort_id',
    'name',
    'sprache',
    'gueltig_von',
    'gueltig_bis',
    'ist_bevorzugt',
    'original_text',
    'erstellt_am',
    'geaendert_am',
  ],
  ortszugehoerigkeit: ['id', 'ort_id', 'uebergeordnet_id', 'art', 'gueltig_von', 'gueltig_bis', 'erstellt_am', 'geaendert_am'],
  ort_externe_id: ['ort_id', 'system', 'wert', 'erstellt_am', 'geaendert_am'],
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
    'erstellt_am',
    'geaendert_am',
  ],
  beteiligung: ['id', 'ereignis_id', 'person_id', 'rolle', 'reihenfolge', 'erstellt_am', 'geaendert_am'],
  elternschaft: ['id', 'elternteil_id', 'kind_id', 'typ', 'konfidenz', 'notiz', 'erstellt_am', 'geaendert_am'],
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
    'erstellt_am',
    'geaendert_am',
  ],
  partnerschaft_person: ['partnerschaft_id', 'person_id', 'rolle', 'erstellt_am', 'geaendert_am'],
  assoziation: ['id', 'person_a_id', 'person_b_id', 'art', 'notiz', 'erstellt_am', 'geaendert_am'],
  archiv: ['id', 'name', 'ort_id', 'kontakt', 'url', 'notiz', 'erstellt_am', 'geaendert_am'],
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
    'erstellt_am',
    'geaendert_am',
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
    'erstellt_am',
    'geaendert_am',
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
    'erstellt_am',
    'geaendert_am',
  ],
  aussage_zitat: ['aussage_id', 'zitat_id', 'erstellt_am', 'geaendert_am'],
  negativbefund: [
    'id',
    'quelle_id',
    'gesuchte_person_id',
    'gesuchtes_praedikat',
    'zeitraum_von',
    'zeitraum_bis',
    'beschreibung',
    'datum_der_pruefung',
    'erstellt_am',
    'geaendert_am',
  ],
  persona: [
    'id',
    'zitat_id',
    'rohdaten_json',
    'person_id',
    'zuordnung_konfidenz',
    'zuordnung_begruendung',
    'zuordnung_datum',
    'erstellt_am',
    'geaendert_am',
  ],
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
    'erstellt_am',
    'geaendert_am',
  ],
  medium_zuordnung: ['medium_id', 'subjekt_typ', 'subjekt_id', 'ist_titelbild', 'erstellt_am', 'geaendert_am'],
  medium_region: ['id', 'medium_id', 'person_id', 'x', 'y', 'w', 'h', 'erstellt_am', 'geaendert_am'],
  merge_protokoll: [
    'id',
    'transaktion_id',
    'ziel_person_id',
    'quell_person_id',
    'feldentscheidungen_json',
    'begruendung',
    'rueckgaengig_moeglich',
    'erstellt_am',
    'geaendert_am',
  ],
  id_alias: ['alte_id', 'neue_id', 'typ', 'erstellt_am', 'geaendert_am'],
  aufgabe: [
    'id',
    'person_id',
    'ort_id',
    'quelle_id',
    'titel',
    'beschreibung',
    'prioritaet',
    'status',
    'faellig_am',
    'erstellt_am',
    'geaendert_am',
  ],
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
    'erstellt_am',
    'geaendert_am',
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
    'erstellt_am',
    'geaendert_am',
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
    'erstellt_am',
    'geaendert_am',
  ],
  feld_auswahloption: ['id', 'feld_definition_id', 'wert', 'bezeichnung', 'reihenfolge', 'erstellt_am', 'geaendert_am'],
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
    'erstellt_am',
    'geaendert_am',
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
    'erstellt_am',
    'geaendert_am',
  ],
  import_lauf: [
    'id',
    'datei',
    'pruefsumme',
    'vertragsversion',
    'zeitpunkt',
    'transaktion_id',
    'erstellt_am',
    'geaendert_am',
  ],
  import_herkunft: ['id', 'import_lauf_id', 'datensatz_id', 'datensatz_typ', 'erstellt_am', 'geaendert_am'],
  ansicht_zustand: ['id', 'name', 'zentrumsperson_id', 'filter_json', 'erstellt_am', 'geaendert_am'],

  // docs/schema/0003_abgeleitet.sql (AP-0.7). Abgeleitet, NICHT_JOURNALISIERT (55_Architektur.md
  // §5) — tragen keine Wahrheit, sind aus den Basistabellen jederzeit neu berechenbar. Die
  // eigentliche FTS5-Tabelle `suche_fts` ist `type='virtual'` (PRAGMA table_list) und deren
  // Schattentabellen (`suche_fts_data`/`_idx`/`_docsize`/`_config`) sind `type='shadow'` — beides
  // filtert `anwenderTabellenNamen` (test/schema/_hilfen.ts) bereits aus, siehe eigenständige
  // Prüfung dazu in test/schema/schluessel-typen.test.ts + fremdschluessel.test.ts.
  person_flach: [
    'person_id',
    'anzeigename',
    'sortier_nachname',
    'sortier_vornamen',
    'geburt_jahr',
    'geburt_sort_von',
    'geburt_ort_name',
    'tod_jahr',
    'tod_sort_von',
    'konfidenz_min',
    'hat_widerspruch',
  ],
  suche_fts_quelle: ['rowid', 'quelle_typ', 'quelle_id'],
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
