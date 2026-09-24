// AP-1.34 PR-C1b (§31 U-1.34-E3/F1): Wertliste von `aussage_zitat.feld` je `aussage.subjekt_typ`.
// `feld` ist ein Attribut des Subjekts der Aussage; NULL = der Beleg gilt für die ganze Aussage.
// Kein DB-CHECK (E3) — die Liste lebt nur im Code, darum beim Lesen tolerant.
import { describe, expect, it } from 'vitest'
import {
  BELEG_FELDER_JE_SUBJEKT,
  BelegFeldEnum,
  aussageZitatSchema,
  belegFeldPasst,
} from '../../src/shared/schemata/aussage-zitat'
import { AussageSubjektTypEnum } from '../../src/shared/schemata/gemeinsam'

describe('Wertliste aussage_zitat.feld (AP-1.34 PR-C1b, F1)', () => {
  it('F1a jeder Subjekttyp hat eine (ggf. leere) Liste, und nur diese', () => {
    expect(Object.keys(BELEG_FELDER_JE_SUBJEKT).sort()).toEqual([...AussageSubjektTypEnum.options].sort())
  })

  it('F1b die Vorschlagsliste je Subjekttyp (im PR zu bestätigen)', () => {
    expect(BELEG_FELDER_JE_SUBJEKT).toEqual({
      person: ['geschlecht', 'lebend_status'],
      ereignis: ['datum', 'ort', 'beschreibung'],
      elternschaft: ['typ'],
      partnerschaft: ['beginn', 'ende', 'ende_grund'],
      ort: ['koordinaten', 'existiert_von', 'existiert_bis'],
      name: ['vornamen', 'rufname', 'nachname', 'praefix', 'titel_vor', 'zusatz_nach'],
      diagnose: [],
      risikofaktor: [],
    })
  })

  it('F1c das Enum enthält genau die Vereinigung aller Listen (kein toter Wert)', () => {
    const vereinigung = new Set(Object.values(BELEG_FELDER_JE_SUBJEKT).flat())
    expect([...BelegFeldEnum.options].sort()).toEqual([...vereinigung].sort())
  })

  it('F1d Passung feld ↔ subjekt_typ', () => {
    expect(belegFeldPasst('ereignis', 'datum')).toBe(true)
    expect(belegFeldPasst('ereignis', 'ort')).toBe(true)
    expect(belegFeldPasst('name', 'nachname')).toBe(true)
    expect(belegFeldPasst('partnerschaft', 'beginn')).toBe(true)
    expect(belegFeldPasst('person', 'geschlecht')).toBe(true)

    expect(belegFeldPasst('person', 'datum')).toBe(false)
    expect(belegFeldPasst('ereignis', 'nachname')).toBe(false)
    expect(belegFeldPasst('name', 'beginn')).toBe(false)
    expect(belegFeldPasst('elternschaft', 'ende')).toBe(false)
    expect(belegFeldPasst('diagnose', 'datum')).toBe(false)
    expect(belegFeldPasst('risikofaktor', 'beginn')).toBe(false)
  })

  it('F1e das Enum lehnt unbekannte Werte ab (Schreibweg)', () => {
    expect(BelegFeldEnum.safeParse('datum').success).toBe(true)
    expect(BelegFeldEnum.safeParse('geburtsdatum').success).toBe(false)
    expect(BelegFeldEnum.safeParse('').success).toBe(false)
  })

  it('F1f beim Lesen wird ein unbekannter feld-Wert toleriert (kein DB-CHECK, E3)', () => {
    const zeile = { aussage_id: 'a', zitat_id: 'z', feld: 'kuenftiges_feld', textanker_von: null, textanker_bis: null }
    const ergebnis = aussageZitatSchema.safeParse(zeile)
    expect(ergebnis.success).toBe(true)
    expect(ergebnis.data?.feld).toBe('kuenftiges_feld')
  })
})
