// AP-0.8 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Zwei Invarianten aus
// 55_Architektur.md §4.3 / docs/arbeitspakete.md Z.288, die den Produktivcode aus AP-0.8 PR-A
// (jrn_*-Trigger, Armierung, Migration 0004 - bereits auf main) absichern:
//
// 1. Ein Schreibvorgang außerhalb des Befehlsbusses ist unmöglich: ein direktes INSERT in eine
//    journalisierte Tabelle OHNE vorheriges `armieren()` scheitert immer, weil der `jrn_*`-Trigger
//    versucht, `aenderung.transaktion_id` mit NULL zu befüllen (NOT NULL-Bedingung, ADR-017). Das
//    wird hier NICHT nur für `person` geprüft (das deckt bereits test/einheit/journal-trigger.test
//    .ts ab), sondern für JEDE Tabelle aus JOURNALISIERT (journalisierung.ts) - über den
//    Minimalzeilen-Baukasten in _journal-minimalzeilen.ts, der für jede Tabelle eine eigene, FK-
//    gültige Zeile erzeugt (die Vorstufen-Zeilen selbst entstehen über eine korrekt armierte
//    Bus-Emulation, s. dort). Die Regex-Erwartung `NOT NULL constraint failed: aenderung
//    .transaktion_id` stellt sicher, dass wirklich die Armierungs-Mechanik greift - nicht
//    zufällig eine andere Fremdschlüssel- oder CHECK-Verletzung, die ebenfalls geworfen hätte.
//    Dieser Test ist heute GRÜN, weil der geprüfte Produktivcode (Trigger + Armierung) bereits auf
//    main liegt (additiver Invariantentest über bestehenden Code, kein Bugfix-Rot/Grün-Zyklus) -
//    er würde rot, sobald die NOT-NULL-Bedingung auf `aenderung.transaktion_id` oder der
//    `WHEN`-Wächter der Trigger entfernt würde.
//
// 2. Nur drei Stellen dürfen das Journal abschalten (Migration, Undo/Redo, Großimport,
//    55_Architektur.md §4.3). `journalAusAufrufstellen()` (_journal-aufrufer.ts) scannt src/ per
//    TypeScript-AST nach echten Aufrufstellen von `journalAus()` (ohne die Definition in
//    kontext.ts selbst) und ordnet jede über den Text ihres verpflichtenden `grund`-Arguments
//    einer der drei Kategorien zu. Seit AP-0.24 (PR-A: Migrations-Klammer, laeufer.ts; AP-0.10:
//    Undo/Redo, undo.ts) und AP-1.5 (Großimport, `src/main/befehle/import-ausfuehren.ts`) sind
//    VIER Aufrufstellen erreichbare Realität: Migration genau 1, Undo/Redo genau 2 (undo + redo),
//    Großimport genau 1. Die aktive Prüfung unten nagelt diese Multimenge KATEGORIESCHARF fest
//    (nicht bloß die Summe): jede einzelne Kategoriezahl. Damit fällt das Entfernen der
//    Migrations-Stelle (migration → 0) ebenso auf wie eine fünfte, nicht kategorisierbare
//    Aufrufstelle (unbekannte ≠ [] / gesamt > 4). (AP-1.5-Nachtrag: löst den bis dahin aktiven
//    `it.todo` "grossimport-Aufrufstelle hebt grossimport auf 1 / gesamt auf 4" auf.)
import { describe, expect, it } from 'vitest'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { JOURNALISIERT } from '../../src/main/journal/journalisierung'
import type { JournalAusKategorie } from './_journal-aufrufer'
import { journalAusAufrufeAusQuelltext, journalAusAufrufstellen } from './_journal-aufrufer'
import { minimalZeileFuer, vorstufeAnlegen } from './_journal-minimalzeilen'

describe('Invariante: kein Schreibvorgang auf einer journalisierten Tabelle ohne armierte Transaktion (AP-0.8, 55_Architektur.md §4.3)', () => {
  it.each(JOURNALISIERT)('direktes INSERT auf "%s" ohne armierte Transaktion scheitert an aenderung.transaktion_id NOT NULL', (tabelle) => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      // Baut die nötigen Fremdschlüssel-Vorstufen über eine korrekt armierte Bus-Emulation auf und
      // hinterlässt journal_kontext danach im "scharfen Ruhezustand" (aktiv=1, transaktion_id=NULL)
      // - exakt der Zustand, den jeder Schreibversuch außerhalb des Befehlsbusses vorfindet.
      const vorstufe = vorstufeAnlegen(db)
      const { sql, params } = minimalZeileFuer(tabelle, vorstufe)

      expect(() => db.prepare(sql).run(params)).toThrow(/NOT NULL constraint failed: aenderung\.transaktion_id/)
    } finally {
      db.close()
    }
  })
})

describe('Invariante: nur Migration, Undo/Redo und Großimport dürfen das Journal abschalten (55_Architektur.md §4.3)', () => {
  it('die journalAus()-Aufrufstellen in src/ sind kategoriescharf verteilt: Migration=1, Undo/Redo=2, Großimport=1, keine unbekannte Kategorie, gesamt=4', () => {
    const aufrufstellen = journalAusAufrufstellen()

    // Bestehende Zusicherung (nicht abgeschwächt): keine Aufrufstelle trägt einen grund, der zu
    // keiner der drei erlaubten Kategorien passt.
    const unbekannte = aufrufstellen.filter((stelle) => stelle.kategorie === null)
    expect(
      unbekannte,
      `journalAus()-Aufrufstellen, deren grund-Argument zu keiner der drei erlaubten Kategorien ` +
        `(Migration/Undo-Redo/Großimport) passt: ${unbekannte.map((s) => `${s.datei}:${s.zeile} (grund=${JSON.stringify(s.grund)})`).join(', ') || '—'}`,
    ).toEqual([])

    const zähleKategorie = (kategorie: JournalAusKategorie): number =>
      aufrufstellen.filter((stelle) => stelle.kategorie === kategorie).length
    const stellenText = aufrufstellen.map((s) => `${s.datei}:${s.zeile} (${s.kategorie ?? 'unbekannt'})`).join(', ') || '—'

    // Kategoriescharf: jede einzelne Zahl festgenagelt, nicht nur die Summe. Fällt eine Kategorie
    // aus (z. B. Migrations-Klammer entfernt → migration=0) oder taucht eine zusätzliche auf, wird
    // die betroffene Zusicherung rot - eine reine Summenprüfung finge das Verschieben zwischen
    // Kategorien nicht.
    expect(zähleKategorie('migration'), `Migrations-Aufrufstellen (erwartet genau 1): ${stellenText}`).toBe(1)
    expect(zähleKategorie('undo_redo'), `Undo/Redo-Aufrufstellen (erwartet genau 2 - undo + redo): ${stellenText}`).toBe(2)
    expect(
      zähleKategorie('grossimport'),
      `Großimport-Aufrufstellen (erwartet genau 1 - AP-1.5 befehle/import-ausfuehren.ts): ${stellenText}`,
    ).toBe(1)

    expect(
      aufrufstellen.length,
      `Gesamtzahl journalAus()-Aufrufstellen (erwartet genau 4 = 1 Migration + 2 Undo/Redo + 1 Großimport): ${stellenText}`,
    ).toBe(4)
  })
})

describe('Selbstprüfung des Scanners: journalAusAufrufeAusQuelltext erkennt beide Aufrufformen (hueter-Review PR #13, Auflage 1)', () => {
  it('erkennt den bare Call journalAus(tx, grund) (Named-Import-Stil)', () => {
    const treffer = journalAusAufrufeAusQuelltext(
      'probe-bare-call.ts',
      "import { journalAus } from '../journal/kontext'\nfunction f(tx: unknown): void {\n  journalAus(tx, 'migration: Testzweck')\n}\n",
    )
    expect(treffer).toHaveLength(1)
    expect(treffer[0]?.grund).toBe('migration: Testzweck')
    expect(treffer[0]?.kategorie).toBe('migration')
  })

  it('erkennt den Property-Access-Aufruf kontext.journalAus(tx, grund) (Namespace-Import-Stil, 55_Architektur.md §4.3/§4.5)', () => {
    const treffer = journalAusAufrufeAusQuelltext(
      'probe-namespace-call.ts',
      "import * as kontext from '../journal/kontext'\nfunction f(tx: unknown): void {\n  kontext.journalAus(tx, 'grossimport: Testzweck')\n}\n",
    )
    expect(treffer).toHaveLength(1)
    expect(treffer[0]?.grund).toBe('grossimport: Testzweck')
    expect(treffer[0]?.kategorie).toBe('grossimport')
  })

  it('zählt BEIDE Formen, wenn sie im selben Quelltext gemischt vorkommen', () => {
    const treffer = journalAusAufrufeAusQuelltext(
      'probe-gemischt.ts',
      [
        "import * as kontext from '../journal/kontext'",
        "import { journalAus } from '../journal/kontext'",
        'function f(tx: unknown): void {',
        "  journalAus(tx, 'undo: Testzweck a')",
        "  kontext.journalAus(tx, 'redo: Testzweck b')",
        '}',
        '',
      ].join('\n'),
    )
    expect(treffer.map((t) => t.grund)).toEqual(['undo: Testzweck a', 'redo: Testzweck b'])
    expect(treffer.every((t) => t.kategorie === 'undo_redo')).toBe(true)
  })

  it('KEIN Treffer für einen bloßen Kommentartext "journalAus(...)" ohne echten Aufruf (AST statt Regex, s. Modul-Kommentar)', () => {
    const treffer = journalAusAufrufeAusQuelltext(
      'probe-kommentar.ts',
      "// Diese Funktion ruft niemals journalAus(tx, 'migration') auf - nur ein Kommentar.\nfunction f(): void {}\n",
    )
    expect(treffer).toEqual([])
  })

  // Bewusst dokumentierte Lücke (Auflage 2, s. auch Modul-Kommentar in _journal-aufrufer.ts): ein
  // Alias-Re-Export/-Import (`import { journalAus as x } from '...'; x(tx, grund)`) wird vom
  // Scanner NICHT erkannt, weil er keine Bindungen auflöst, sondern wörtlich nach dem
  // Identifier-/Property-Namen `journalAus` sucht. Kein aktiver Test dafür (er müsste erwarten,
  // dass NICHTS gefunden wird - das wäre kein rotes Warnsignal, sondern nur eine Bestätigung der
  // bekannten Grenze); als Dokumentation genügt der Kommentar hier + in _journal-aufrufer.ts.
  it.todo('Alias-Re-Export (journalAus as x) erkennen - nur falls das je gebraucht wird, s. Kommentar in _journal-aufrufer.ts')
})
