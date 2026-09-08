// AP-0.7 PR-A, test/einheit/koelner-phonetik.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Bekannte Paare aus dem freigegebenen Plan: Meyer/Maier und Schmidt/Schmitt müssen denselben
// Kölner-Phonetik-Code liefern - das ist der ganze Zweck des Verfahrens (55_Architektur.md §5.2).
import { describe, expect, it } from 'vitest'
import { koelnerPhonetik } from '../../src/core/name/koelner-phonetik'

describe('koelnerPhonetik (src/core/name/koelner-phonetik.ts, AP-0.7)', () => {
  it('Meyer und Maier liefern denselben Code', () => {
    expect(koelnerPhonetik('Meyer')).toBe(koelnerPhonetik('Maier'))
  })

  it('Schmidt und Schmitt liefern denselben Code', () => {
    expect(koelnerPhonetik('Schmidt')).toBe(koelnerPhonetik('Schmitt'))
  })

  it('Meyer ergibt den bekannten Referenzcode 67', () => {
    expect(koelnerPhonetik('Meyer')).toBe('67')
  })

  it('Schmidt ergibt den bekannten Referenzcode 862', () => {
    expect(koelnerPhonetik('Schmidt')).toBe('862')
  })

  it('ist bei leerem Text leer', () => {
    expect(koelnerPhonetik('')).toBe('')
  })
})
