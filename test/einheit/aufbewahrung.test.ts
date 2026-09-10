// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): `schnappschussAufbewahrung()` — die
// Dateisystem-Seite der Rotation (Auswahllogik selbst ist bereits in
// `test/einheit/schnappschuss-auswahl.test.ts` als reiner Test abgedeckt). Zeit injiziert, NICHT
// `Date.now()` (CLAUDE.md §4).
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { zuLoeschendeSchnappschuesse } from '../../src/core/aufbewahrung/schnappschuss-auswahl'
import { kolonfreieZeit } from '../../src/main/schnappschuss/dateiname'
import { schnappschussAufbewahrung } from '../../src/main/schnappschuss/aufbewahrung'
import { schnappschussListeLesen } from '../../src/main/schnappschuss/liste'

const TAG_MS = 86_400_000

describe('schnappschussAufbewahrung() (55_Architektur.md §6.2, AP-0.11)', () => {
  let snapshotsPfad: string

  beforeEach(() => {
    snapshotsPfad = mkdtempSync(join(tmpdir(), 'wurzelwerk-aufbewahrung-'))
  })

  afterEach(() => {
    rmSync(snapshotsPfad, { recursive: true, force: true })
  })

  it('40 Schnappschüsse über 60 simulierte Tage → genau die von der Auswahllogik behaltene Menge bleibt übrig', () => {
    const jetzt = 60 * TAG_MS
    const zeitpunkte: number[] = []
    for (let i = 0; i < 40; i += 1) {
      zeitpunkte.push(Math.round((i * 60 * TAG_MS) / 39))
    }

    for (const zeitpunktMs of zeitpunkte) {
      const dateiname = `${kolonfreieZeit(zeitpunktMs)}.sqlite`
      writeFileSync(join(snapshotsPfad, dateiname), 'platzhalter')
    }
    // Eine `ersetzt-*.sqlite`-Datei liegt ebenfalls im Ordner - darf NIE gelöscht werden (§6.4),
    // egal wie alt sie nach ihrem (irrelevanten) Namen wäre.
    writeFileSync(join(snapshotsPfad, 'ersetzt-2000-01-01T00-00-00Z.sqlite'), 'platzhalter')

    const kandidaten = zeitpunkte.map((zeitpunktMs) => ({ id: kolonfreieZeit(zeitpunktMs), zeitpunktMs }))
    const erwartetGeloescht = new Set(zuLoeschendeSchnappschuesse(kandidaten, jetzt))
    const erwarteteAnzahlBehalten = 40 - erwartetGeloescht.size

    schnappschussAufbewahrung(snapshotsPfad, () => jetzt)

    const verbleibendeListe = schnappschussListeLesen(snapshotsPfad)
    expect(verbleibendeListe).toHaveLength(erwarteteAnzahlBehalten)
    for (const eintrag of verbleibendeListe) {
      expect(erwartetGeloescht.has(eintrag.id)).toBe(false)
    }

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
