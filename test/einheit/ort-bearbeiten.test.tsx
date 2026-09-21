// AP-1.16 PR-C — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// `ort-bearbeiten-logik.ts` (reine Umrechnungen, Muster `profil-bearbeiten-logik.ts`/
// `profil-bearbeiten-namen.test.tsx`) UND `OrtBearbeitenAnsicht` (`renderToStaticMarkup`, vitest
// läuft mit `environment: 'node'`). Befehl- UND Abfrage-Hooks hängen an `@tanstack/react-query`
// (brauchen einen `QueryClientProvider`) und werden darum gemockt, je EIN `mutate`-Spion pro Kanal.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// Seiteneffekt: initialisiert die einzige i18next-Instanz synchron (Muster `profil-bearbeiten-namen.test.tsx`).
import '../../src/renderer/i18n/einrichten'

const ortsnameAnlegenMutate = vi.fn()
const ortsnameAendernMutate = vi.fn()
const ortsnameLoeschenMutate = vi.fn()
const ortszugehoerigkeitAnlegenMutate = vi.fn()
const ortszugehoerigkeitAendernMutate = vi.fn()
const ortszugehoerigkeitLoeschenMutate = vi.fn()
const ortExterneIdAnlegenMutate = vi.fn()
const ortExterneIdLoeschenMutate = vi.fn()
const ortAnlegenMutateAsync = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useOrtsnameAnlegen: () => ({ mutate: ortsnameAnlegenMutate }),
  useOrtsnameAendern: () => ({ mutate: ortsnameAendernMutate }),
  useOrtsnameLoeschen: () => ({ mutate: ortsnameLoeschenMutate }),
  useOrtszugehoerigkeitAnlegen: () => ({ mutate: ortszugehoerigkeitAnlegenMutate }),
  useOrtszugehoerigkeitAendern: () => ({ mutate: ortszugehoerigkeitAendernMutate }),
  useOrtszugehoerigkeitLoeschen: () => ({ mutate: ortszugehoerigkeitLoeschenMutate }),
  useOrtExterneIdAnlegen: () => ({ mutate: ortExterneIdAnlegenMutate }),
  useOrtExterneIdLoeschen: () => ({ mutate: ortExterneIdLoeschenMutate }),
  useOrtAnlegen: () => ({ mutateAsync: ortAnlegenMutateAsync }),
}))

vi.mock('../../src/renderer/brücke/abfrage-hooks', () => ({
  useOrtSuche: () => ({ data: undefined, isPending: false }),
}))

import { OrteBearbeitenInhalt } from '../../src/renderer/ansichten/orte/ort-bearbeiten'
import {
  EXTERNE_ID_ENTWURF_LEER,
  ORTSNAME_ENTWURF_LEER,
  auswahlWertZuBool,
  boolZuAuswahlWert,
  externeIdAnlegenEinAusEntwurf,
  externeIdEntwurfAbsendbar,
  gueltigkeitTextIstGueltig,
  jdnZuIsoText,
  ortsnameAendernEinAusEntwurf,
  ortsnameAnlegenEinAusEntwurf,
  ortsnameEntwurfAbsendbar,
  ortsnameEntwurfAusZeile,
  ortszugehoerigkeitAendernEinAusText,
  ortszugehoerigkeitAnlegenEinAusEntwurf,
  ortszugehoerigkeitEntwurfAbsendbar,
  ortszugehoerigkeitEntwurfLeer,
  type OrtsnameEntwurfWerte,
} from '../../src/renderer/ansichten/orte/ort-bearbeiten-logik'
import type { OrtDetailAus, OrtDetailName, OrtDetailZugehoerigkeit } from '../../src/shared/schemata/ort-detail'

function ortsname(ueberschreibung: Partial<OrtDetailName> = {}): OrtDetailName {
  return {
    id: 'name-1',
    name: 'Marienwerder',
    sprache: null,
    gueltig_von: null,
    gueltig_bis: null,
    ist_bevorzugt: true,
    original_text: null,
    ...ueberschreibung,
  }
}

function zugehoerigkeit(ueberschreibung: Partial<OrtDetailZugehoerigkeit> = {}): OrtDetailZugehoerigkeit {
  return {
    id: 'zug-1',
    uebergeordnet_id: 'kreis-1',
    uebergeordnet_anzeigename: 'Kreis Marienwerder',
    art: 'politisch',
    gueltig_von: null,
    gueltig_bis: null,
    ...ueberschreibung,
  }
}

function ortDetail(ueberschreibung: Partial<OrtDetailAus> = {}): OrtDetailAus {
  return {
    kopf: { id: 'ort-1', typ: null, koordinaten_lat: null, koordinaten_lon: null, existiert_von: null, existiert_bis: null, notiz: null },
    namen: [],
    zugehoerigkeiten: [],
    externeIds: [],
    ...ueberschreibung,
  }
}

describe('ort-bearbeiten-logik: JDN <-> Text (AP-1.16 PR-C)', () => {
  it('jdnZuIsoText: null -> leere Zeichenkette', () => {
    expect(jdnZuIsoText(null)).toBe('')
  })

  it('jdnZuIsoText/parse: Rundreise über einen bekannten JDN (1.1.1900 ≈ 2415021)', () => {
    const text = jdnZuIsoText(2415021)
    expect(text).toBe('1900-01-01')
    expect(gueltigkeitTextIstGueltig(text)).toBe(true)
  })

  it('gueltigkeitTextIstGueltig: leerer Text ist gültig (beide Grenzen sind optional)', () => {
    expect(gueltigkeitTextIstGueltig('')).toBe(true)
    expect(gueltigkeitTextIstGueltig('   ')).toBe(true)
  })

  it('gueltigkeitTextIstGueltig: unauflösbarer Text ist ungültig', () => {
    expect(gueltigkeitTextIstGueltig('völliger Unsinn')).toBe(false)
  })
})

describe('ort-bearbeiten-logik: Namen (AP-1.16 PR-C)', () => {
  it('ortsnameEntwurfAusZeile: überträgt alle Felder, gueltig_von/bis als ISO-Text', () => {
    const eintrag = ortsnameEntwurfAusZeile(ortsname({ gueltig_von: 2415021, ist_bevorzugt: false }))
    expect(eintrag.name).toBe('Marienwerder')
    expect(eintrag.gueltigVonText).toBe('1900-01-01')
    expect(eintrag.gueltigBisText).toBe('')
    expect(eintrag.istBevorzugt).toBe(false)
  })

  it('ortsnameEntwurfAbsendbar: leerer Name -> nicht absendbar', () => {
    expect(ortsnameEntwurfAbsendbar(ORTSNAME_ENTWURF_LEER)).toBe(false)
  })

  it('ortsnameEntwurfAbsendbar: Name gesetzt UND gültige (leere) Gültigkeit -> absendbar', () => {
    const entwurf: OrtsnameEntwurfWerte = { ...ORTSNAME_ENTWURF_LEER, name: 'Kwidzyn' }
    expect(ortsnameEntwurfAbsendbar(entwurf)).toBe(true)
  })

  it('ortsnameEntwurfAbsendbar: unauflösbare Gültigkeit sperrt das Absenden', () => {
    const entwurf: OrtsnameEntwurfWerte = { ...ORTSNAME_ENTWURF_LEER, name: 'Kwidzyn', gueltigVonText: 'Unsinn' }
    expect(ortsnameEntwurfAbsendbar(entwurf)).toBe(false)
  })

  it('ortsnameAnlegenEinAusEntwurf: name/gueltigVon/gueltigBis/istBevorzugt aus dem Entwurf, ortId vom Aufrufer', () => {
    const entwurf: OrtsnameEntwurfWerte = { ...ORTSNAME_ENTWURF_LEER, name: 'Kwidzyn', gueltigVonText: '1950-01-01', istBevorzugt: true }
    expect(ortsnameAnlegenEinAusEntwurf('ort-1', entwurf)).toEqual({
      ortId: 'ort-1',
      name: 'Kwidzyn',
      sprache: undefined,
      gueltigVon: 2433283,
      gueltigBis: undefined,
      istBevorzugt: 1,
      originalText: undefined,
    })
  })

  it('ortsnameAendernEinAusEntwurf: trägt die id statt ortId, reicht sprache/originalText UNVERÄNDERT durch (kein stiller Datenverlust)', () => {
    const eintrag = ortsnameEntwurfAusZeile(ortsname({ sprache: 'de', original_text: 'Marienw.' }))
    expect(ortsnameAendernEinAusEntwurf('name-1', eintrag)).toEqual({
      id: 'name-1',
      name: 'Marienwerder',
      sprache: 'de',
      gueltigVon: undefined,
      gueltigBis: undefined,
      istBevorzugt: 1,
      originalText: 'Marienw.',
    })
  })
})

describe('ort-bearbeiten-logik: Zugehörigkeit (AP-1.16 PR-C)', () => {
  it('ortszugehoerigkeitEntwurfAbsendbar: ohne gewählten übergeordneten Ort NICHT absendbar', () => {
    expect(ortszugehoerigkeitEntwurfAbsendbar(ortszugehoerigkeitEntwurfLeer('politisch'))).toBe(false)
  })

  it('ortszugehoerigkeitAnlegenEinAusEntwurf: art "kirchlich" bleibt im Ergebnis erhalten', () => {
    const entwurf = { ...ortszugehoerigkeitEntwurfLeer('kirchlich'), uebergeordnetId: 'bistum-1' }
    expect(ortszugehoerigkeitAnlegenEinAusEntwurf('ort-1', entwurf)).toEqual({
      ortId: 'ort-1',
      uebergeordnetId: 'bistum-1',
      art: 'kirchlich',
      gueltigVon: undefined,
      gueltigBis: undefined,
    })
  })

  it('ortszugehoerigkeitAnlegenEinAusEntwurf: ohne uebergeordnetId -> null (defensiv, kein Absenden ohne Auswahl)', () => {
    expect(ortszugehoerigkeitAnlegenEinAusEntwurf('ort-1', ortszugehoerigkeitEntwurfLeer('politisch'))).toBeNull()
  })

  it('ortszugehoerigkeitAendernEinAusText: NUR gueltigVon/gueltigBis, keine art/ortId/uebergeordnetId', () => {
    expect(ortszugehoerigkeitAendernEinAusText('zug-1', '1900-01-01', '')).toEqual({
      id: 'zug-1',
      gueltigVon: 2415021,
      gueltigBis: undefined,
    })
  })
})

describe('ort-bearbeiten-logik: externe Kennung (AP-1.16 PR-C)', () => {
  it('externeIdEntwurfAbsendbar: leerer Wert -> nicht absendbar', () => {
    expect(externeIdEntwurfAbsendbar(EXTERNE_ID_ENTWURF_LEER)).toBe(false)
  })

  it('externeIdAnlegenEinAusEntwurf: system + getrimmter wert', () => {
    expect(externeIdAnlegenEinAusEntwurf('ort-1', { system: 'geonames', wert: '  4567  ' })).toEqual({
      ortId: 'ort-1',
      system: 'geonames',
      wert: '4567',
    })
  })
})

describe('ort-bearbeiten-logik: ja/nein <-> boolean (AP-1.16 PR-C, §14: Auswahlfeld statt Checkbox)', () => {
  it('Rundreise über beide Werte', () => {
    expect(boolZuAuswahlWert(true)).toBe('ja')
    expect(boolZuAuswahlWert(false)).toBe('nein')
    expect(auswahlWertZuBool('ja')).toBe(true)
    expect(auswahlWertZuBool('nein')).toBe(false)
  })
})

describe('OrteBearbeitenInhalt (AP-1.16 PR-C)', () => {
  it('ohne Namen/Zugehörigkeit/externe Kennung: zeigt die drei Leerzustandstexte', () => {
    const markup = renderToStaticMarkup(<OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail()} />)
    expect(markup).toContain('Noch kein Name erfasst.')
    expect(markup).toContain('Noch keine politische Zugehörigkeit erfasst.')
    expect(markup).toContain('Noch keine kirchliche Zugehörigkeit erfasst.')
    expect(markup).toContain('Noch keine externe Kennung erfasst.')
  })

  it('mit einem Namen: zeigt eine Namenszeile mit den vorhandenen Werten', () => {
    const markup = renderToStaticMarkup(<OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail({ namen: [ortsname()] })} />)
    expect(markup).toContain('value="Marienwerder"')
  })

  it('mit einer politischen UND einer kirchlichen Zugehörigkeit: beide Ketten getrennt, je EIGENE Liste', () => {
    const markup = renderToStaticMarkup(
      <OrteBearbeitenInhalt
        ortId="ort-1"
        daten={ortDetail({
          zugehoerigkeiten: [
            zugehoerigkeit({ id: 'zug-politisch', art: 'politisch', uebergeordnet_anzeigename: 'Kreis Marienwerder' }),
            zugehoerigkeit({ id: 'zug-kirchlich', art: 'kirchlich', uebergeordnet_anzeigename: 'Bistum Kulm' }),
          ],
        })}
      />,
    )
    expect(markup).toContain('Kreis Marienwerder')
    expect(markup).toContain('Bistum Kulm')
    expect(markup).not.toContain('Noch keine politische Zugehörigkeit erfasst.')
    expect(markup).not.toContain('Noch keine kirchliche Zugehörigkeit erfasst.')
  })

  it('mit einer externen Kennung: zeigt System + Wert', () => {
    const markup = renderToStaticMarkup(
      <OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail({ externeIds: [{ system: 'gov', wert: 'GOV-1234' }] })} />,
    )
    expect(markup).toContain('GOV-1234')
  })

  it('„Zugehörigkeit hinzufügen (kirchlich)": das Auswahlfeld für "art" bietet "kirchlich" als Option', () => {
    const markup = renderToStaticMarkup(<OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail()} />)
    expect(markup).toMatch(/<option[^>]*value="kirchlich"/)
  })

  it('alle drei "hinzufügen"-Formulare sind echte <form>-Elemente (Tastatur: Enter sendet ab)', () => {
    const markup = renderToStaticMarkup(<OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail()} />)
    expect((markup.match(/<form/g) ?? []).length).toBe(3)
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(
      <OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail({ namen: [ortsname()], zugehoerigkeiten: [zugehoerigkeit()], externeIds: [{ system: 'gov', wert: 'X' }] })} />,
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  it('kein JSX-Zeichenkettenliteral — jeder sichtbare Text kommt aus i18n (Stichprobe)', () => {
    const markup = renderToStaticMarkup(<OrteBearbeitenInhalt ortId="ort-1" daten={ortDetail()} />)
    expect(markup).toContain('Namen')
    expect(markup).toContain('Zugehörigkeit')
    expect(markup).toContain('Externe Kennungen')
  })
})
