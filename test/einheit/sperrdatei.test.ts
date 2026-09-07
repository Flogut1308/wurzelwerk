import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  sperrdateiEntfernen,
  sperrdateiPfad,
  sperrdateiPruefen,
  sperrdateiSetzen,
} from '../../src/main/projekt/sperrdatei'

/**
 * AP-0.4: `projekt.lock` verhindert doppeltes Öffnen und erkennt einen unsauberen letzten Lauf
 * (Nutzerentscheidung: ein fremder Host gilt konservativ als `belegt`, weil die Liveness der PID
 * dort nicht geprüft werden kann).
 */
describe('main/projekt/sperrdatei', () => {
  let ordnerPfad: string

  beforeEach(() => {
    ordnerPfad = mkdtempSync(join(tmpdir(), 'wurzelwerk-sperrdatei-'))
  })

  afterEach(() => {
    rmSync(ordnerPfad, { recursive: true, force: true })
  })

  it('setzen erzeugt projekt.lock im Projektordner', () => {
    sperrdateiSetzen({ ordnerPfad, appVersion: '0.1.0-test' })
    expect(existsSync(sperrdateiPfad(ordnerPfad))).toBe(true)
  })

  it('geordnetes Schließen entfernt projekt.lock', () => {
    sperrdateiSetzen({ ordnerPfad, appVersion: '0.1.0-test' })
    sperrdateiEntfernen(ordnerPfad)
    expect(existsSync(sperrdateiPfad(ordnerPfad))).toBe(false)
  })

  it('kein projekt.lock → frei', () => {
    expect(sperrdateiPruefen(ordnerPfad)).toEqual({ status: 'frei' })
  })

  it('Sperre mit lebender eigener PID auf eigenem Host → belegt', () => {
    sperrdateiSetzen({ ordnerPfad, appVersion: '0.1.0-test' })
    const ergebnis = sperrdateiPruefen(ordnerPfad)
    expect(ergebnis.status).toBe('belegt')
  })

  it('Sperre mit toter PID auf eigenem Host → verwaist', () => {
    // Ein Kindprozess, der sofort beendet: spawnSync wartet auf das Ende, die PID ist beim
    // Rückgabewert bereits reaped — robust gegen PID-Wiederverwendung.
    const kindprozess = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
    const totePid = kindprozess.pid

    writeFileSync(
      sperrdateiPfad(ordnerPfad),
      JSON.stringify({
        pid: totePid,
        host: hostname(),
        appVersion: '0.1.0-test',
        gesetztAm: new Date().toISOString(),
      }),
      'utf8',
    )

    expect(sperrdateiPruefen(ordnerPfad)).toMatchObject({ status: 'verwaist' })
  })

  it('Sperre mit fremdem Host → konservativ belegt (Liveness nicht prüfbar)', () => {
    writeFileSync(
      sperrdateiPfad(ordnerPfad),
      JSON.stringify({
        pid: process.pid,
        host: 'ein-ganz-anderer-rechner',
        appVersion: '0.1.0-test',
        gesetztAm: new Date().toISOString(),
      }),
      'utf8',
    )

    expect(sperrdateiPruefen(ordnerPfad)).toMatchObject({ status: 'belegt' })
  })

  it('kaputte Sperrdatei → konservativ belegt', () => {
    writeFileSync(sperrdateiPfad(ordnerPfad), '{ kein json')
    expect(sperrdateiPruefen(ordnerPfad)).toEqual({ status: 'belegt' })
  })
})
