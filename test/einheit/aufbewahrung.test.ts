// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): `schnappschussAufbewahrung()` — die
// Dateisystem-Seite der Rotation (Auswahllogik selbst ist bereits in
// `test/einheit/schnappschuss-auswahl.test.ts` als reiner Test abgedeckt). Zeit injiziert, NICHT
// `Date.now()` (CLAUDE.md §4).
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { kolonfreieZeit } from '../../src/main/schnappschuss/dateiname'
import { schnappschussAufbewahrung } from '../../src/main/schnappschuss/aufbewahrung'
import { schnappschussListeLesen } from '../../src/main/schnappschuss/liste'

const TAG_MS = 86_400_000
const STUNDE_MS = 60 * 60 * 1000

describe('schnappschussAufbewahrung() (55_Architektur.md §6.2, AP-0.11)', () => {
  let snapshotsPfad: string

  beforeEach(() => {
    snapshotsPfad = mkdtempSync(join(tmpdir(), 'wurzelwerk-aufbewahrung-'))
  })

  afterEach(() => {
    rmSync(snapshotsPfad, { recursive: true, force: true })
  })

  it('74 Schnappschüsse über 60 simulierte Tage → genau die von Hand ausgerechnete Menge bleibt übrig (hueter-Auflage A1, AP-0.11)', () => {
    // Dieselbe Verteilung UND dieselbe von Hand (NICHT durch Aufruf von
    // `zuLoeschendeSchnappschuesse()`) ausgerechnete Soll-Menge wie im gepinnten Test in
    // `test/einheit/schnappschuss-auswahl.test.ts` - dort steht die vollständige Herleitung
    // (inkl. der Begründung, warum "1 Eintrag pro Tag" allein einen Tages-/Wochen-Bucket-Off-by-one
    // NICHT aufdecken würde) als Kommentar. Ein Off-by-one in der Auswahllogik ODER in der
    // Dateisystem-Verdrahtung hier (Dateiname → Zeitpunkt → Auswahl → `unlinkSync`) würde beide
    // Tests rot machen, mit unabhängig hingeschriebenen Erwartungen statt einer gemeinsamen,
    // tautologischen Berechnung.
    const jetzt = 59 * TAG_MS + 23 * STUNDE_MS

    for (let stunde = 0; stunde < 15; stunde += 1) {
      const zeitpunktMs = 59 * TAG_MS + stunde * STUNDE_MS
      writeFileSync(join(snapshotsPfad, `${kolonfreieZeit(zeitpunktMs)}.sqlite`), 'platzhalter')
    }
    for (let tag = 0; tag < 59; tag += 1) {
      const zeitpunktMs = tag * TAG_MS + 12 * STUNDE_MS
      writeFileSync(join(snapshotsPfad, `${kolonfreieZeit(zeitpunktMs)}.sqlite`), 'platzhalter')
    }
    // Eine `ersetzt-*.sqlite`-Datei liegt ebenfalls im Ordner - darf NIE gelöscht werden (§6.4),
    // egal wie alt sie nach ihrem (irrelevanten) Namen wäre.
    writeFileSync(join(snapshotsPfad, 'ersetzt-2000-01-01T00-00-00Z.sqlite'), 'platzhalter')

    // Behalten (18, hart hingeschrieben, s. Herleitung in schnappschuss-auswahl.test.ts): Tag 41
    // und 48 (je einer pro Woche der letzten 4 Wochen), Tag 53..58 (je einer pro Tag der letzten 7
    // Tage) sowie die 10 jüngsten Stunden von Tag 59 (letzte 10).
    const erwarteteBehalteneIds = new Set([
      kolonfreieZeit(41 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(48 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(53 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(54 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(55 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(56 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(57 * TAG_MS + 12 * STUNDE_MS),
      kolonfreieZeit(58 * TAG_MS + 12 * STUNDE_MS),
      ...Array.from({ length: 10 }, (_v, i) => kolonfreieZeit(59 * TAG_MS + (5 + i) * STUNDE_MS)), // h5..h14
    ])
    expect(erwarteteBehalteneIds.size).toBe(18) // Selbstprüfung: keine zwei Zeitpunkte kollidieren auf dieselbe ID

    schnappschussAufbewahrung(snapshotsPfad, () => jetzt)

    const verbleibendeIds = schnappschussListeLesen(snapshotsPfad)
      .map((eintrag) => eintrag.id)
      .sort()
    expect(verbleibendeIds).toEqual([...erwarteteBehalteneIds].sort())

    // Die ersetzt-Datei ist unangetastet - sie taucht in `schnappschussListeLesen()` erst gar
    // nicht auf (§6.4), muss aber auch als rohe Datei im Ordner noch da sein.
    expect(readdirSync(snapshotsPfad)).toContain('ersetzt-2000-01-01T00-00-00Z.sqlite')
  })

  it('leerer/fehlender Ordner: No-op, kein Wurf', () => {
    const fehlenderOrdner = join(snapshotsPfad, 'existiert-nicht')
    expect(() => schnappschussAufbewahrung(fehlenderOrdner, () => 0)).not.toThrow()
  })

  it('weniger als 10 Schnappschüsse, alle jünger als 7 Tage: nichts wird gelöscht', () => {
    const jetzt = 5 * TAG_MS
    for (let i = 0; i < 3; i += 1) {
      const zeitpunktMs = jetzt - i * TAG_MS
      writeFileSync(join(snapshotsPfad, `${kolonfreieZeit(zeitpunktMs)}.sqlite`), 'platzhalter')
    }

    schnappschussAufbewahrung(snapshotsPfad, () => jetzt)

    expect(schnappschussListeLesen(snapshotsPfad)).toHaveLength(3)
  })
})
