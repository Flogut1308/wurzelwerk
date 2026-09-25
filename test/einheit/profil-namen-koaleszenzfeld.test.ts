// AP-1.30 (PR 4): der Namens-Autosave schreibt die ganze Form (`name.aendern` ersetzt alles) — damit
// der Bus schnelle Folgeänderungen am selben Feld zu EINEM Undo-Schritt zusammenfasst, nennt der
// Renderer das eine geänderte Feld (`feld`). `geaendertesNamensFeld` vergleicht den zuletzt
// gelesenen mit dem neuen Bearbeitungszustand: genau ein Unterschied → dessen Vertragsname, sonst
// `undefined` (keine Koaleszenz). Der Bus prüft das gegen den gespeicherten Stand noch einmal
// (`src/main/befehle/koaleszenz-schluessel.ts`); hier geht es nur darum, dass der Renderer das
// Signal überhaupt schickt.
import { describe, expect, it } from 'vitest'
import {
  geaendertesNamensFeld,
  NAMEN_EINTRAG_LEER,
  nameAendernEinAusEintrag,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'

const BASIS: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'geburtsname', vornamen: 'Karl Friedrich', nachname: 'Müller', rufname: 'Friedrich', rufnameIndex: 1 }

describe('geaendertesNamensFeld (AP-1.30 PR 4)', () => {
  const faelle: readonly (readonly [Partial<NamenEintragWerte>, string])[] = [
    [{ nachname: 'Meier' }, 'nachname'],
    [{ vornamen: 'Karl Fritz' }, 'vornamen'],
    [{ rufname: 'Karl' }, 'rufnameText'],
    [{ praefix: 'von' }, 'praefix'],
    [{ titelVor: 'Dr.' }, 'titelVor'],
    [{ zusatzNach: 'd. Ä.' }, 'zusatzNach'],
    [{ vatersname: 'Petrowitsch' }, 'vatersname'],
    [{ typ: 'ehename' }, 'typ'],
    [{ schrift: 'latn' }, 'schrift'],
  ]
  for (const [aenderung, feld] of faelle) {
    it(`genau ${Object.keys(aenderung).join()} geändert → ${feld}`, () => {
      expect(geaendertesNamensFeld(BASIS, { ...BASIS, ...aenderung })).toBe(feld)
    })
  }

  it('zwei Felder geändert → undefined', () => {
    expect(geaendertesNamensFeld(BASIS, { ...BASIS, nachname: 'Meier', praefix: 'von' })).toBeUndefined()
  })

  it('nichts geändert → undefined', () => {
    expect(geaendertesNamensFeld(BASIS, { ...BASIS })).toBeUndefined()
  })

  it('nameAendernEinAusEintrag trägt das Feld nur, wenn eines genannt ist', () => {
    expect(nameAendernEinAusEintrag('n1', BASIS, 'nachname').feld).toBe('nachname')
    expect('feld' in nameAendernEinAusEintrag('n1', BASIS)).toBe(false)
  })
})
