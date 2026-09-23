// AP-1.33 (ADR-029, Beobachtung 4): Driftschutz für den generierten abl-Block. ADR-029 verspricht:
// „Ein Test sichert, dass der abl-Block in der jüngsten Migration mit `generierterTriggerBlock()`
// übereinstimmt." Damit fällt ein Handedit am generierten Block (zwischen den Markierungskommentaren
// in docs/schema/0006_namensformen.sql) auf, statt still von der Migration abzuweichen.
//
// Additiv, KEIN geschützter Prüfpfad (test/einheit, nicht test/schema): verglichen wird die
// generierte Ausgabe von skripte/trigger-generieren.ts mit ihrem eingecheckten Ziel — analog dazu,
// wie trigger_generiert.sql gegen generierterJournalTriggerBlock() geprüft wird. Reine Textprüfung,
// `generierterTriggerBlock()` ist eine reine Funktion der Bausteine (kein DB-Zugriff).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generierterTriggerBlock } from '../../skripte/trigger-generieren'

const ZIEL_DATEI = join(process.cwd(), 'docs', 'schema', '0006_namensformen.sql')
const MARKER_ANFANG = '-- @generierte-trigger-anfang'
const MARKER_ENDE = '-- @generierte-trigger-ende'

/** Extrahiert den Block STRIKT zwischen den Markierungskommentaren (ohne die Marker selbst). */
function blockZwischenMarkierungen(inhalt: string): string {
  const anfangIndex = inhalt.indexOf(MARKER_ANFANG)
  const endeIndex = inhalt.indexOf(MARKER_ENDE)
  if (anfangIndex === -1 || endeIndex === -1 || endeIndex < anfangIndex) {
    throw new Error(`Markierungskommentare "${MARKER_ANFANG}"/"${MARKER_ENDE}" nicht gefunden oder in falscher Reihenfolge.`)
  }
  // Vom Zeilenumbruch nach dem Anfangsmarker bis unmittelbar vor den Endmarker.
  return inhalt.slice(anfangIndex + MARKER_ANFANG.length, endeIndex).replace(/^\n/, '').replace(/\n$/, '')
}

describe('test/einheit/abl-block-drift (ADR-029, AP-1.33)', () => {
  it('der abl-Block in 0006_namensformen.sql stimmt mit generierterTriggerBlock() überein', () => {
    const inhalt = readFileSync(ZIEL_DATEI, 'utf8')
    expect(blockZwischenMarkierungen(inhalt)).toBe(generierterTriggerBlock())
  })
})
