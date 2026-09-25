// AP-1.8, F-07, A-17 (`docs/50_Datenmodell.md` §2.14 „Platzhalterpersonen"). Ein Platzhalter mit
// unmöglichen Daten löst KEINEN Hinweis aus — Platzhalter sind bewusst unvollständig/unsicher
// (Vater unbekannt etc.), Prüfungen auf ihnen wären reines Rauschen. Eigene Datei, getrennt von
// `plausibilitaet-bestand.test.ts` (CLAUDE.md §5 — additive Tests, eiserne Regel).
import { describe, expect, it } from 'vitest'
import { nachJdn } from '../../src/core/datum/kalender'
import { pruefeBestand, type BestandEingabe } from '../../src/core/plausibilitaet/regeln'

const JAHR = (jahr: number): number => nachJdn(jahr, 1, 1, 'gregorian')

describe('pruefeBestand() — Platzhalter werden übersprungen (A-17)', () => {
  it('Platzhalter mit Tod vor Geburt löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [{ id: 'a', istPlatzhalter: true, geburt: { von: JAHR(1900), bis: JAHR(1900) }, tod: { von: JAHR(1899), bis: JAHR(1899) } }],
      elternschaften: [],
      partnerschaften: [],
      orte: [],
      ereignisse: [],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })

  it('Platzhalter mit Lebensdauer über 110 Jahren löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [{ id: 'a', istPlatzhalter: true, geburt: { von: JAHR(1800), bis: JAHR(1800) }, tod: { von: JAHR(1920), bis: JAHR(1920) } }],
      elternschaften: [],
      partnerschaften: [],
      orte: [],
      ereignisse: [],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })

  it('Platzhalter als Mutter mit 8 Jahren bei Geburt des Kindes löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [
        { id: 'mutter', istPlatzhalter: true, geschlecht: 'F', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1958), bis: JAHR(1958) } },
      ],
      elternschaften: [{ elternteilId: 'mutter', kindId: 'kind' }],
      partnerschaften: [],
      orte: [],
      ereignisse: [],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })

  it('Platzhalter als Kind mit implausiblem Elternalter löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [
        { id: 'vater', istPlatzhalter: false, geschlecht: 'M', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: true, geburt: { von: JAHR(1958), bis: JAHR(1958) } },
      ],
      elternschaften: [{ elternteilId: 'vater', kindId: 'kind' }],
      partnerschaften: [],
      orte: [],
      ereignisse: [],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })

  it('Zyklus, an dem ein Platzhalter beteiligt ist, löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [
        { id: 'a', istPlatzhalter: true },
        { id: 'b', istPlatzhalter: false },
      ],
      elternschaften: [
        { elternteilId: 'a', kindId: 'b' },
        { elternteilId: 'b', kindId: 'a' },
      ],
      partnerschaften: [],
      orte: [],
      ereignisse: [],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })

  it('Ereignis außerhalb der Ortsexistenz mit einem Platzhalter als einzigem Beteiligten löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      personen: [{ id: 'a', istPlatzhalter: true }],
      elternschaften: [],
      partnerschaften: [],
      orte: [{ id: 'ort', existiert: { von: JAHR(1900), bis: JAHR(1945) } }],
      ereignisse: [{ ortId: 'ort', datum: { von: JAHR(1950), bis: JAHR(1950) }, beteiligteIds: ['a'] }],
      aussagen: [],
    }
    expect(pruefeBestand(eingabe)).toEqual([])
  })
})
