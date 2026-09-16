// AP-1.2 PR-A, test/einheit/umschrift-din.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Prüft `din1460()` (src/core/name/umschrift.ts) gegen bekannte wissenschaftliche
// Transliterationen (ADR-014) und stellt sicher, dass für DIN 1460 KEINE Rückfunktion exportiert
// wird — DIN 1460 enthält Digraphen (ch, šč, ju, ja) und ist damit viele-zu-eins, nicht
// umkehrbar. Die Umkehrbarkeits-Invariante für ISO 9 gehört zu PR-B
// (test/invarianten/umschrift-umkehrbar.test.ts), nicht hierher.
import { describe, expect, it } from 'vitest'
import * as umschrift from '../../src/core/name/umschrift'
import { din1460 } from '../../src/core/name/umschrift'

describe('din1460 (src/core/name/umschrift.ts, AP-1.2, ADR-014)', () => {
  it.each([
    // Anton Tschechow — die in der Bibliothekswissenschaft übliche DIN-1460-Form.
    ['Чехов', 'Čechov'],
    // щ ist im Deutschen "šč" (Digraph) — dieselbe Ausgabe wie die Zeichenfolge ш+ч ("шч").
    ['Щербаков', 'Ščerbakov'],
    // ю -> "ju" (Digraph).
    ['Юрий', 'Jurij'],
    // я -> "ja" (Digraph).
    ['Мария', 'Marija'],
  ])('%s -> %s', (kyrillisch, erwartet) => {
    expect(din1460(kyrillisch)).toBe(erwartet)
  })

  it('щ (ein Zeichen) und ш+ч (zwei Zeichen) ergeben denselben DIN-1460-Text — genau deshalb keine Rückfunktion', () => {
    expect(din1460('щ')).toBe(din1460('шч'))
  })

  it('exportiert keine Rückfunktion für DIN 1460 — nur vorwärts (ADR-014)', () => {
    expect('din1460Zurueck' in umschrift).toBe(false)
  })
})
