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
//    einer der drei Kategorien zu. In AP-0.8 ist die Produktiv-Aufrufermenge LEER (Undo = AP-0.10,
//    Großimport = AP-1.5, Migration ruft `journalAus()` noch nicht auf) - die aktive Prüfung
//    unten ("höchstens drei, jede erkennbar begründet") ist damit trivial grün; sie wird
//    unmittelbar rot, sobald eine vierte, nicht kategorisierbare Aufrufstelle auftaucht. Die
//    schärfere "== 3, genau eine je Kategorie"-Prüfung steht als `it.todo` (aktivierbar, sobald
//    AP-0.10 und AP-1.5 existieren).
import { describe, expect, it } from 'vitest'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { JOURNALISIERT } from '../../src/main/journal/journalisierung'
import { journalAusAufrufstellen } from './_journal-aufrufer'
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
  it('jede journalAus()-Aufrufstelle in src/ (außer der Definition selbst) trägt eine erkennbare Begründung, und es sind höchstens drei', () => {
    const aufrufstellen = journalAusAufrufstellen()

    const unbekannte = aufrufstellen.filter((stelle) => stelle.kategorie === null)
    expect(
      unbekannte,
      `journalAus()-Aufrufstellen, deren grund-Argument zu keiner der drei erlaubten Kategorien ` +
        `(Migration/Undo-Redo/Großimport) passt: ${unbekannte.map((s) => `${s.datei}:${s.zeile} (grund=${JSON.stringify(s.grund)})`).join(', ') || '—'}`,
    ).toEqual([])

    expect(
      aufrufstellen.length,
      `Mehr als drei journalAus()-Aufrufstellen (§4.3 erlaubt genau drei): ${aufrufstellen.map((s) => `${s.datei}:${s.zeile}`).join(', ')}`,
    ).toBeLessThanOrEqual(3)
  })

  // AP-0.8: die Produktiv-Aufrufermenge ist aktuell LEER (Undo/Redo = AP-0.10, Großimport = AP-1.5,
  // Migration ruft journalAus() noch nicht auf) - eine scharfe "genau drei, je eine Kategorie"-
  // Prüfung wäre hier nicht sinnvoll aktivierbar. Der Test oben deckt schon "nie mehr als drei,
  // jede erkennbar begründet" ab. Aktivieren, sobald AP-0.10 (Undo/Redo) und AP-1.5 (Großimport)
  // ihre journalAus()-Aufrufer angelegt haben (Migration bleibt ggf. weiterhin ungenutzt, dann
  // reicht "zwei von drei besetzt" - siehe dann docs/arbeitspakete.md).
  it.todo('genau drei journalAus()-Aufrufstellen, je eine für Migration, Undo/Redo und Großimport')
})
