// AP-1.2 PR-A, test/einheit/ort-zeitbezug.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Prüft `gueltigerOrtsname()` und `zugehoerigkeitsketteZuDatum()` (src/core/ort/zeitbezug.ts)
// am Beispiel Marienwerder/Kwidzyn (Westpreußen -> Woiwodschaft Danzig nach 1945). JDN-Anker
// kommen aus src/core/datum/kalender.ts (AP-1.1), damit keine "magischen" Tageszahlen im Test
// stehen.
import { describe, expect, it } from 'vitest'
import { nachJdn } from '../../src/core/datum/kalender'
import { gueltigerOrtsname, zugehoerigkeitsketteZuDatum } from '../../src/core/ort/zeitbezug'
import type { OrtsnameEintrag, ZugehoerigkeitEintrag } from '../../src/core/ort/zeitbezug'

// Kriegsende/Verwaltungswechsel als Testanker für den Namens- und Zugehörigkeitswechsel.
const GRENZTAG = nachJdn(1945, 5, 8, 'gregorian')
const JDN_1900 = nachJdn(1900, 6, 15, 'gregorian')
const JDN_1950 = nachJdn(1950, 6, 15, 'gregorian')

describe('gueltigerOrtsname', () => {
  const namen: readonly OrtsnameEintrag[] = [
    { name: 'Marienwerder', gueltigBis: GRENZTAG, istBevorzugt: false },
    { name: 'Kwidzyn', gueltigVon: GRENZTAG + 1, istBevorzugt: true },
  ]

  it('liefert 1900 den damals gültigen deutschen Namen', () => {
    expect(gueltigerOrtsname(namen, JDN_1900)?.name).toBe('Marienwerder')
  })

  it('liefert 1950 den dann gültigen polnischen Namen', () => {
    expect(gueltigerOrtsname(namen, JDN_1950)?.name).toBe('Kwidzyn')
  })

  it('liefert ohne Datum den als bevorzugt markierten Namen', () => {
    expect(gueltigerOrtsname(namen)?.name).toBe('Kwidzyn')
  })

  it('liefert undefined, wenn kein Eintrag zum Datum passt', () => {
    const luecke: readonly OrtsnameEintrag[] = [{ name: 'Nur-1900', gueltigVon: JDN_1900, gueltigBis: JDN_1900 }]
    expect(gueltigerOrtsname(luecke, JDN_1950)).toBeUndefined()
  })
})

describe('zugehoerigkeitsketteZuDatum', () => {
  const politisch: readonly ZugehoerigkeitEintrag[] = [
    { uebergeordnetId: 'westpreussen', art: 'politisch', gueltigBis: GRENZTAG },
    { uebergeordnetId: 'woiwodschaft-danzig', art: 'politisch', gueltigVon: GRENZTAG + 1 },
  ]
  // Die kirchliche Zugehörigkeit ändert sich an einem völlig anderen Datum als die politische —
  // politisch und kirchlich dürfen nie vermischt werden, auch wenn beide Ketten am selben
  // Abfragedatum ausgewertet werden.
  const kirchlich: readonly ZugehoerigkeitEintrag[] = [{ uebergeordnetId: 'bistum-kulm', art: 'kirchlich' }]
  const alle: readonly ZugehoerigkeitEintrag[] = [...politisch, ...kirchlich]

  it('liefert die politische Kette vor der Grenzänderung', () => {
    const kette = zugehoerigkeitsketteZuDatum(alle, 'politisch', JDN_1900)
    expect(kette.map((eintrag) => eintrag.uebergeordnetId)).toEqual(['westpreussen'])
  })

  it('liefert die politische Kette nach der Grenzänderung', () => {
    const kette = zugehoerigkeitsketteZuDatum(alle, 'politisch', JDN_1950)
    expect(kette.map((eintrag) => eintrag.uebergeordnetId)).toEqual(['woiwodschaft-danzig'])
  })

  it('hält politisch und kirchlich am selben Datum strikt getrennt', () => {
    const politischeKette = zugehoerigkeitsketteZuDatum(alle, 'politisch', JDN_1900)
    const kirchlicheKette = zugehoerigkeitsketteZuDatum(alle, 'kirchlich', JDN_1900)

    expect(politischeKette.map((eintrag) => eintrag.uebergeordnetId)).not.toContain('bistum-kulm')
    expect(kirchlicheKette.map((eintrag) => eintrag.uebergeordnetId)).toEqual(['bistum-kulm'])
  })
})
