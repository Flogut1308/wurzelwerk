import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncAnbieterErkennen } from '../../src/main/projekt/sync-ordner-warnung'

/**
 * AP-0.4, ADR-002: Erkennung von Dropbox/iCloud/OneDrive-Ordnern. `heimat` ist injizierbar
 * (statt `os.homedir()` fest zu verdrahten), damit sowohl macOS- als auch Windows-artige
 * Pfade deterministisch geprüft werden können — unabhängig vom Betriebssystem, auf dem der
 * Test tatsächlich läuft (§4: kein Rückgriff auf Laufzeitzustand für die Erwartung).
 */
describe('main/projekt/sync-ordner-warnung syncAnbieterErkennen() (ADR-002)', () => {
  const heimatMacOS = '/Users/anna'
  const heimatWindows = 'C:\\Users\\anna'

  it.each([
    ['dropbox', join(heimatMacOS, 'Dropbox', 'MeinBaum.ahnen')],
    ['dropbox', join(heimatMacOS, 'Library', 'CloudStorage', 'Dropbox', 'MeinBaum.ahnen')],
    ['icloud', join(heimatMacOS, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'MeinBaum.ahnen')],
    ['icloud', join(heimatMacOS, 'Library', 'CloudStorage', 'iCloud Drive', 'MeinBaum.ahnen')],
    ['onedrive', join(heimatMacOS, 'OneDrive', 'MeinBaum.ahnen')],
    ['onedrive', join(heimatMacOS, 'OneDrive - Firma GmbH', 'MeinBaum.ahnen')],
    ['onedrive', join(heimatMacOS, 'Library', 'CloudStorage', 'OneDrive-Firma', 'MeinBaum.ahnen')],
  ] as const)('erkennt %s unter einem macOS-artigen Heimatpfad', (erwarteterAnbieter, pfad) => {
    expect(syncAnbieterErkennen(pfad, heimatMacOS)).toBe(erwarteterAnbieter)
  })

  it('normaler Ordner unter macOS-artigem Heimatpfad → undefined', () => {
    expect(syncAnbieterErkennen(join(heimatMacOS, 'Dokumente', 'MeinBaum.ahnen'), heimatMacOS)).toBeUndefined()
  })

  it.each([
    ['onedrive', `${heimatWindows}\\OneDrive\\MeinBaum.ahnen`],
    ['dropbox', `${heimatWindows}\\Dropbox\\MeinBaum.ahnen`],
  ] as const)('erkennt %s unter einem Windows-artigen Heimatpfad', (erwarteterAnbieter, pfad) => {
    expect(syncAnbieterErkennen(pfad, heimatWindows)).toBe(erwarteterAnbieter)
  })

  it('normaler Ordner unter Windows-artigem Heimatpfad → undefined', () => {
    expect(syncAnbieterErkennen(`${heimatWindows}\\Dokumente\\MeinBaum.ahnen`, heimatWindows)).toBeUndefined()
  })

  it('ein Ordner, der nur zufällig "Dropbox" im Namen trägt, aber nicht direkt darunter liegt, zählt nicht', () => {
    expect(syncAnbieterErkennen(join(heimatMacOS, 'Meine Dropbox Ideen', 'MeinBaum.ahnen'), heimatMacOS)).toBeUndefined()
  })
})
