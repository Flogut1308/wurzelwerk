// AP-1.2 PR-A, test/einheit/name-anzeige.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Prüft `anzeigename()` (src/core/name/anzeige.ts): Rufname-Markierung, Präfix, Zusatz, Titel.
// Ergänzt um eine Konsistenzprüfung, die die core-lokalen Literale aus src/core/name/typen.ts
// gegen die Zod-Enums aus src/shared/schemata/name.ts abgleicht (diese eine Prüfung darf
// core+shared importieren — sie ist Prüfmaterial, keine Produktionsgrenzverletzung: src/core
// selbst importiert nirgends aus src/shared).
import { describe, expect, it } from 'vitest'
import { anzeigename } from '../../src/core/name/anzeige'
import type { NameTyp, Schrift, UmschriftNorm } from '../../src/core/name/typen'
import { NameTypEnum, SchriftEnum, UmschriftNormEnum } from '../../src/shared/schemata/name'

describe('anzeigename (src/core/name/anzeige.ts, AP-1.2)', () => {
  it('markiert den Rufnamen per rufnameIndex innerhalb der Vornamenkette', () => {
    const ergebnis = anzeigename({ vornamen: 'Johann Wilhelm Friedrich', rufnameIndex: 1 })
    expect(ergebnis.vornamen).toEqual([
      { text: 'Johann', istRufname: false },
      { text: 'Wilhelm', istRufname: true },
      { text: 'Friedrich', istRufname: false },
    ])
  })

  it('markiert den Rufnamen per rufnameText, wenn er abweichend vom Index gesetzt ist', () => {
    const ergebnis = anzeigename({ vornamen: 'Anna Maria', rufnameText: 'Maria' })
    expect(ergebnis.vornamen).toEqual([
      { text: 'Anna', istRufname: false },
      { text: 'Maria', istRufname: true },
    ])
  })

  it('übernimmt das Präfix "von"', () => {
    const ergebnis = anzeigename({ vornamen: 'Otto', praefix: 'von', nachname: 'Bismarck' })
    expect(ergebnis.praefix).toBe('von')
    expect(ergebnis.nachname).toBe('Bismarck')
  })

  it('übernimmt das Präfix "van"', () => {
    const ergebnis = anzeigename({ vornamen: 'Vincent', praefix: 'van', nachname: 'Gogh' })
    expect(ergebnis.praefix).toBe('van')
  })

  it('übernimmt das Präfix "zu"', () => {
    const ergebnis = anzeigename({ vornamen: 'Karl-Theodor', praefix: 'zu', nachname: 'Guttenberg' })
    expect(ergebnis.praefix).toBe('zu')
  })

  it('übernimmt den Zusatz "der Ältere"', () => {
    const ergebnis = anzeigename({ vornamen: 'Lucas', nachname: 'Cranach', zusatzNach: 'der Ältere' })
    expect(ergebnis.zusatzNach).toBe('der Ältere')
  })

  it('übernimmt einen vorangestellten Titel', () => {
    const ergebnis = anzeigename({ titelVor: 'Dr.', vornamen: 'Max', nachname: 'Mustermann' })
    expect(ergebnis.titelVor).toBe('Dr.')
  })

  it('liefert eine leere Vornamenliste, wenn keine Vornamen gesetzt sind', () => {
    const ergebnis = anzeigename({ nachname: 'Müller' })
    expect(ergebnis.vornamen).toEqual([])
  })
})

describe('core-lokale Literale (src/core/name/typen.ts) stimmen mit den Zod-Enums überein (src/shared/schemata/name.ts)', () => {
  it('NameTyp deckt sich vollständig mit NameTypEnum.options', () => {
    const alle: Record<NameTyp, true> = {
      geburtsname: true,
      ehename: true,
      vulgo: true,
      latinisiert: true,
      transliteriert: true,
      ordensname: true,
      beruf: true,
      aka: true,
      sonstiges: true,
    }
    expect(Object.keys(alle).sort()).toEqual([...NameTypEnum.options].sort())
  })

  it('Schrift deckt sich vollständig mit SchriftEnum.options', () => {
    const alle: Record<Schrift, true> = { latn: true, cyrl: true }
    expect(Object.keys(alle).sort()).toEqual([...SchriftEnum.options].sort())
  })

  it('UmschriftNorm deckt sich vollständig mit UmschriftNormEnum.options', () => {
    const alle: Record<UmschriftNorm, true> = { iso9: true, din1460: true, manuell: true }
    expect(Object.keys(alle).sort()).toEqual([...UmschriftNormEnum.options].sort())
  })
})
