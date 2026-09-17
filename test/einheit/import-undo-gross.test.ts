// AP-1.5, ADR-019: ein Großimport (> RUECKNAHME_SCHWELLE_ZEILEN geänderte Zeilen) läuft ohne
// Journal, mit einem Schnappschuss VOR dem Schreiben — seine Rücknahme läuft darum über den
// Datei-Wiederherstellungsweg (`importZuruecknehmen()` in `src/main/journal/undo.ts`), nicht über
// die zeilenweise Undo-Schleife. 800 generierte Personen (deterministisch aus einer festen
// Schleife, keine `Math.random`/echte UUIDs nötig — die Rücknahme prüft nur "Zustand vorher ==
// Zustand nachher", der Inhalt des rückgängig gemachten Imports selbst ist irrelevant).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { undo } from '../../src/main/journal/undo'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'

const ANZAHL_PERSONEN = 800

/** Deterministisch erzeugte Importdatei mit `ANZAHL_PERSONEN` Personen — bewusst über 500
 * geänderte Zeilen (jede Person bringt person+name+existenz-aussage+zitat+aussage_zitat, also
 * grob das Fünffache an `aenderung`-Zeilen während der Sondierung). */
function baueGrossenImport(anzahl: number): unknown {
  const personen = Array.from({ length: anzahl }, (_, i) => ({
    id: `tmp:p${i}`,
    geschlecht: 'M',
    lebend_status: 'verstorben',
    namen: [{ typ: 'geburtsname', vornamen: `Vorname${i}`, nachname: `Nachname${i}`, ist_bevorzugt: true }],
    konfidenz: 4,
    belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
  }))
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-17', werkzeug: 'test' },
    zusammenfassung: { personen: anzahl, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Generierte Testquelle (import-undo-gross)' }],
    personen,
    notizen_unverarbeitet: [],
  }
}

interface TransaktionZeile {
  readonly id: string
  readonly art: string
  readonly snapshot_pfad: string | null
}

interface AenderungAnzahlZeile {
  readonly anzahl: number
}

describe('importAusfuehren() + undo() — Großimport wird über den Schnappschuss zurückgenommen (AP-1.5, ADR-019)', () => {
  let ordner: string
  let dbPfad: string
  let importPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-gross-'))
    dbPfad = join(ordner, 'baum.sqlite')
    importPfad = join(ordner, 'import-gross.json')
    writeFileSync(importPfad, JSON.stringify(baueGrossenImport(ANZAHL_PERSONEN)), 'utf8')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('schreibt als "schnappschuss"-Rücknahmeart, ohne Journal, mit gesetztem snapshot_pfad — Rücknahme stellt den Vorzustand wieder her', () => {
    const dbVorImport = oeffnen(dbPfad)
    migrieren(dbVorImport)
    const vorher = kanonischerAbzug(dbVorImport)

    const bericht = importAusfuehren(dbVorImport, { pfad: importPfad })
    expect(bericht.importGesperrt).toBe(false)
    expect(bericht.zusammenfassung.ruecknahmeArt).toBe('schnappschuss')
    expect(bericht.zusammenfassung.geaenderteZeilenAnzahl).toBeGreaterThan(500)

    const nachher = kanonischerAbzug(dbVorImport)
    expect(nachher).not.toBe(vorher)

    const transaktion = dbVorImport.prepare<[], TransaktionZeile>('SELECT id, art, snapshot_pfad FROM transaktion ORDER BY lfd DESC LIMIT 1').get()
    expect(transaktion?.art).toBe('import')
    expect(transaktion?.snapshot_pfad).not.toBeNull()

    // Journal war während der Echtschreibung aus — keine `aenderung`-Zeile für diese Transaktion.
    const anzahlAenderung = dbVorImport
      .prepare<{ readonly id: string }, AenderungAnzahlZeile>('SELECT COUNT(*) AS anzahl FROM aenderung WHERE transaktion_id = @id')
      .get({ id: transaktion?.id ?? '' })
    expect(anzahlAenderung?.anzahl).toBe(0)

    // Rücknahme: undo() schließt `dbVorImport` intern (Datei-Wiederherstellungsweg) — der weitere
    // Zugriff läuft über eine neu geöffnete Verbindung auf denselben Pfad.
    const ergebnis = undo(dbVorImport)
    expect(ergebnis.transaktionId).toBe(transaktion?.id)

    const dbNachRuecknahme = oeffnen(dbPfad)
    try {
      const zurueck = kanonischerAbzug(dbNachRuecknahme)
      expect(zurueck).toBe(vorher)
    } finally {
      dbNachRuecknahme.close()
    }
  })
})
