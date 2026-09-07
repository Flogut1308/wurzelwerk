import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MANIFEST_SCHEMAVERSION } from '../../src/shared/konstanten'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

vi.mock('electron', () => ({ app: { getVersion: () => '0.1.0-test', isPackaged: false } }))

import { leseManifest, projektOrdnerAnlegen, projektOrdnerPfade } from '../../src/main/projekt/ordnerformat'

/**
 * AP-0.4: Projektordner-Format (50_Datenmodell.md §3, ADR-002). `projektOrdnerAnlegen` erzeugt die
 * Ordnerstruktur und das manifest.json; `leseManifest` erkennt einen fremden oder kaputten Ordner.
 */
describe('main/projekt/ordnerformat (50_Datenmodell.md §3)', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-ordnerformat-'))
  })

  afterEach(() => {
    rmSync(elternordner, { recursive: true, force: true })
  })

  it('erzeugt Name.ahnen/ mit baum.sqlite, medien/, snapshots/, export/, manifest.json', () => {
    const { pfade, manifest } = projektOrdnerAnlegen({ elternordner, projektname: 'Testbaum' })

    expect(pfade.ordnerPfad).toBe(join(elternordner, 'Testbaum.ahnen'))
    expect(existsSync(pfade.ordnerPfad)).toBe(true)
    expect(existsSync(pfade.dbPfad)).toBe(true)
    expect(existsSync(pfade.medienPfad)).toBe(true)
    expect(existsSync(pfade.snapshotsPfad)).toBe(true)
    expect(existsSync(pfade.exportPfad)).toBe(true)
    expect(existsSync(pfade.manifestPfad)).toBe(true)

    expect(manifest).toEqual({
      typ: 'wurzelwerk-projekt',
      schemaversion: MANIFEST_SCHEMAVERSION,
      appVersion: '0.1.0-test',
      projektname: 'Testbaum',
      erstelltAm: expect.any(String),
    })
    expect(Number.isNaN(Date.parse(manifest.erstelltAm))).toBe(false)
  })

  it('funktioniert mit Leerzeichen und Umlaut im Projektnamen (§11)', () => {
    const { pfade, manifest } = projektOrdnerAnlegen({ elternordner, projektname: 'Müller Familie' })

    expect(pfade.ordnerPfad).toBe(join(elternordner, 'Müller Familie.ahnen'))
    expect(existsSync(pfade.ordnerPfad)).toBe(true)
    expect(manifest.projektname).toBe('Müller Familie')
  })

  it('legt kein zweites Mal an, wenn dort schon ein Projekt liegt → KONFLIKT_BEREITS_VORHANDEN', () => {
    projektOrdnerAnlegen({ elternordner, projektname: 'Testbaum' })

    try {
      projektOrdnerAnlegen({ elternordner, projektname: 'Testbaum' })
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('KONFLIKT_BEREITS_VORHANDEN')
      }
    }
  })

  it('leseManifest liest ein zuvor angelegtes Projekt korrekt', () => {
    const { pfade, manifest } = projektOrdnerAnlegen({ elternordner, projektname: 'Testbaum' })
    expect(leseManifest(pfade.ordnerPfad)).toEqual(manifest)
  })

  it('leseManifest auf einem Ordner ohne manifest.json → PROJEKT_KEIN_WURZELWERK_ORDNER', () => {
    const fremderOrdner = join(elternordner, 'kein-projekt')
    mkdirSync(fremderOrdner)

    expect(() => leseManifest(fremderOrdner)).toThrow(WurzelFehler)
    try {
      leseManifest(fremderOrdner)
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_KEIN_WURZELWERK_ORDNER')
      }
    }
  })

  it('leseManifest auf einem Ordner mit kaputtem manifest.json → PROJEKT_KEIN_WURZELWERK_ORDNER', () => {
    const kaputterOrdner = join(elternordner, 'kaputt')
    mkdirSync(kaputterOrdner)
    writeFileSync(join(kaputterOrdner, 'manifest.json'), '{ das ist kein json')

    expect(() => leseManifest(kaputterOrdner)).toThrow(WurzelFehler)
  })

  it('leseManifest lehnt ein manifest.json mit falschem typ ab', () => {
    const fremdOrdner = join(elternordner, 'fremd')
    mkdirSync(fremdOrdner)
    writeFileSync(join(fremdOrdner, 'manifest.json'), JSON.stringify({ typ: 'anderes-format' }))

    expect(() => leseManifest(fremdOrdner)).toThrow(WurzelFehler)
  })

  it('projektOrdnerPfade leitet alle Pfade konsistent aus dem Ordnerpfad ab', () => {
    const pfade = projektOrdnerPfade(join(elternordner, 'X.ahnen'))
    expect(pfade.dbPfad).toBe(join(elternordner, 'X.ahnen', 'baum.sqlite'))
    expect(pfade.medienPfad).toBe(join(elternordner, 'X.ahnen', 'medien'))
    expect(pfade.snapshotsPfad).toBe(join(elternordner, 'X.ahnen', 'snapshots'))
    expect(pfade.exportPfad).toBe(join(elternordner, 'X.ahnen', 'export'))
    expect(pfade.manifestPfad).toBe(join(elternordner, 'X.ahnen', 'manifest.json'))
  })
})
