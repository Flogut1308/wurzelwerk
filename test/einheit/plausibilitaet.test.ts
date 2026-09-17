// AP-1.4a, 56_Import_Vertrag.md §4 Stufe 3 (IMP-301…IMP-310). Rein gegen `regeln.ts` — KEINE
// Datenbank, KEINE Importdatei: jede Regel bekommt einen von Hand gebauten, minimalen
// `PlausibilitaetEingabe`-Ausschnitt, mit je einem auslösenden und einem knapp-nicht-auslösenden
// Fall (CLAUDE.md §5 — additive Tests, eiserne Regel).
import { describe, expect, it } from 'vitest'
import { nachJdn } from '../../src/core/datum/kalender'
import { pruefePlausibilitaet, type PlausibilitaetEingabe } from '../../src/core/plausibilitaet/regeln'

const JAHR = (jahr: number): number => nachJdn(jahr, 1, 1, 'gregorian')

const LEERE_EINGABE: PlausibilitaetEingabe = {
  personen: [],
  namen: [],
  orte: [],
  ereignisse: [],
  elternschaften: [],
  partnerschaften: [],
  aussagen: [],
  diagnosen: [],
  notizenUnverarbeitetAnzahl: 0,
  pruefsummeVorhanden: false,
}

function codes(eingabe: PlausibilitaetEingabe): readonly string[] {
  return pruefePlausibilitaet(eingabe).map((hinweis) => hinweis.code)
}

describe('pruefePlausibilitaet() — Stufe 3 (56_Import_Vertrag.md §4)', () => {
  it('IMP-301: Tod vor Geburt löst aus, Tod nach Geburt nicht', () => {
    const auslösend: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', geburt: { von: JAHR(1900), bis: JAHR(1901) - 1 }, tod: { von: JAHR(1899), bis: JAHR(1899) } }],
    }
    expect(codes(auslösend)).toContain('IMP-301')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', geburt: { von: JAHR(1900), bis: JAHR(1901) - 1 }, tod: { von: JAHR(1950), bis: JAHR(1950) } }],
    }
    expect(codes(nicht)).not.toContain('IMP-301')
  })

  it('IMP-301: Bestattung vor Tod löst aus, Bestattung nach Tod nicht', () => {
    const auslösend: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', tod: { von: JAHR(1950), bis: JAHR(1950) }, beerdigung: { von: JAHR(1949), bis: JAHR(1949) } }],
    }
    expect(codes(auslösend)).toContain('IMP-301')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', tod: { von: JAHR(1950), bis: JAHR(1950) }, beerdigung: { von: JAHR(1950), bis: JAHR(1950) } }],
    }
    expect(codes(nicht)).not.toContain('IMP-301')
  })

  it('IMP-301: Ehe vor Geburt eines Beteiligten löst aus, Ehe nach Geburt nicht', () => {
    const basis: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', geburt: { von: JAHR(1900), bis: JAHR(1900) } }],
    }

    const auslösend: PlausibilitaetEingabe = {
      ...basis,
      partnerschaften: [{ pfad: 'partnerschaften[0]', beginn: { von: JAHR(1890), bis: JAHR(1890) }, beteiligte: ['tmp:a'] }],
    }
    expect(codes(auslösend)).toContain('IMP-301')

    const nicht: PlausibilitaetEingabe = {
      ...basis,
      partnerschaften: [{ pfad: 'partnerschaften[0]', beginn: { von: JAHR(1925), bis: JAHR(1925) }, beteiligte: ['tmp:a'] }],
    }
    expect(codes(nicht)).not.toContain('IMP-301')
  })

  it('IMP-302: Elternteil bei Geburt des Kindes jünger als 12 löst aus, 15 Jahre nicht', () => {
    const basis: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ pfad: 'elternschaften[0]', elternteil: 'tmp:eltern', kind: 'tmp:kind' }],
    }

    const auslösend: PlausibilitaetEingabe = {
      ...basis,
      personen: [
        { kennung: 'tmp:eltern', pfad: 'personen[0]', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { kennung: 'tmp:kind', pfad: 'personen[1]', geburt: { von: JAHR(1956), bis: JAHR(1956) } },
      ],
    }
    expect(codes(auslösend)).toContain('IMP-302')

    const nicht: PlausibilitaetEingabe = {
      ...basis,
      personen: [
        { kennung: 'tmp:eltern', pfad: 'personen[0]', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { kennung: 'tmp:kind', pfad: 'personen[1]', geburt: { von: JAHR(1965), bis: JAHR(1965) } },
      ],
    }
    expect(codes(nicht)).not.toContain('IMP-302')
  })

  it('IMP-302: Mutter über 55 bei Geburt löst aus, mit 50 nicht', () => {
    const basis: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ pfad: 'elternschaften[0]', elternteil: 'tmp:mutter', kind: 'tmp:kind' }],
    }
    const auslösend: PlausibilitaetEingabe = {
      ...basis,
      personen: [
        { kennung: 'tmp:mutter', pfad: 'personen[0]', geschlecht: 'F', geburt: { von: JAHR(1900), bis: JAHR(1900) } },
        { kennung: 'tmp:kind', pfad: 'personen[1]', geburt: { von: JAHR(1960), bis: JAHR(1960) } },
      ],
    }
    expect(codes(auslösend)).toContain('IMP-302')

    const nicht: PlausibilitaetEingabe = {
      ...basis,
      personen: [
        { kennung: 'tmp:mutter', pfad: 'personen[0]', geschlecht: 'F', geburt: { von: JAHR(1900), bis: JAHR(1900) } },
        { kennung: 'tmp:kind', pfad: 'personen[1]', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
      ],
    }
    expect(codes(nicht)).not.toContain('IMP-302')
  })

  it('IMP-303: Koordinate ohne herkunft löst aus, mit herkunft nicht', () => {
    const auslösend: PlausibilitaetEingabe = { ...LEERE_EINGABE, orte: [{ kennung: 'tmp:ort', pfad: 'orte[0]', koordinate: { herkunftVorhanden: false } }] }
    expect(codes(auslösend)).toContain('IMP-303')

    const nicht: PlausibilitaetEingabe = { ...LEERE_EINGABE, orte: [{ kennung: 'tmp:ort', pfad: 'orte[0]', koordinate: { herkunftVorhanden: true } }] }
    expect(codes(nicht)).not.toContain('IMP-303')
  })

  it('IMP-304: unbekanntes Prädikat löst aus, "beruf" nicht', () => {
    const auslösend: PlausibilitaetEingabe = { ...LEERE_EINGABE, aussagen: [{ pfad: 'aussagen[0]', praedikat: 'astrologisches_zeichen' }] }
    expect(codes(auslösend)).toContain('IMP-304')

    const nicht: PlausibilitaetEingabe = { ...LEERE_EINGABE, aussagen: [{ pfad: 'aussagen[0]', praedikat: 'beruf' }] }
    expect(codes(nicht)).not.toContain('IMP-304')
  })

  it('IMP-305: Umschrift ohne kyrillisches Original löst aus, mit Original nicht', () => {
    const auslösend: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      namen: [{ personKennung: 'tmp:a', personPfad: 'personen[0]', pfad: 'personen[0].namen[0]', istTransliteriert: true, istBevorzugt: false }],
    }
    expect(codes(auslösend)).toContain('IMP-305')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      namen: [{ personKennung: 'tmp:a', personPfad: 'personen[0]', pfad: 'personen[0].namen[0]', istTransliteriert: true, umschriftVonSchrift: 'cyrl', istBevorzugt: false }],
    }
    expect(codes(nicht)).not.toContain('IMP-305')
  })

  it('IMP-306: Diagnose Konfidenz 3 aus rein mündlicher Quelle löst aus, Konfidenz 2 nicht', () => {
    const auslösend: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      diagnosen: [{ pfad: 'diagnosen[0]', personKennung: 'tmp:a', konfidenz: 3, nurMuendlicheQuellen: true }],
    }
    expect(codes(auslösend)).toContain('IMP-306')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      diagnosen: [{ pfad: 'diagnosen[0]', personKennung: 'tmp:a', konfidenz: 2, nurMuendlicheQuellen: true }],
    }
    expect(codes(nicht)).not.toContain('IMP-306')
  })

  it('IMP-307: Lebensdauer über 110 Jahre löst aus, genau 110 Jahre nicht', () => {
    const auslösend: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', geburt: { von: JAHR(1800), bis: JAHR(1800) }, tod: { von: JAHR(1920), bis: JAHR(1920) } }],
    }
    expect(codes(auslösend)).toContain('IMP-307')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]', geburt: { von: JAHR(1800), bis: JAHR(1800) }, tod: { von: JAHR(1910), bis: JAHR(1910) } }],
    }
    expect(codes(nicht)).not.toContain('IMP-307')
  })

  it('IMP-308: Ereignisdatum außerhalb der Existenz des Ortes löst aus, innerhalb nicht', () => {
    const basis: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      orte: [{ kennung: 'tmp:ort', pfad: 'orte[0]', existiert: { von: JAHR(1900), bis: JAHR(1945) } }],
    }
    const auslösend: PlausibilitaetEingabe = {
      ...basis,
      ereignisse: [{ kennung: 'tmp:e', pfad: 'ereignisse[0]', ort: 'tmp:ort', datum: { von: JAHR(1950), bis: JAHR(1950) }, beteiligte: [] }],
    }
    expect(codes(auslösend)).toContain('IMP-308')

    const nicht: PlausibilitaetEingabe = {
      ...basis,
      ereignisse: [{ kennung: 'tmp:e', pfad: 'ereignisse[0]', ort: 'tmp:ort', datum: { von: JAHR(1920), bis: JAHR(1920) }, beteiligte: [] }],
    }
    expect(codes(nicht)).not.toContain('IMP-308')
  })

  it('IMP-309: Person ohne jede Beziehung/Ereignis löst aus, mit Elternschaft nicht', () => {
    const auslösend: PlausibilitaetEingabe = { ...LEERE_EINGABE, personen: [{ kennung: 'tmp:a', pfad: 'personen[0]' }] }
    expect(codes(auslösend)).toContain('IMP-309')

    const nicht: PlausibilitaetEingabe = {
      ...LEERE_EINGABE,
      personen: [{ kennung: 'tmp:a', pfad: 'personen[0]' }, { kennung: 'tmp:b', pfad: 'personen[1]' }],
      elternschaften: [{ pfad: 'elternschaften[0]', elternteil: 'tmp:a', kind: 'tmp:b' }],
    }
    expect(codes(nicht)).not.toContain('IMP-309')
  })

  it('IMP-310: leeres notizen_unverarbeitet trotz Prüfsumme löst aus, mit einer Notiz nicht', () => {
    const auslösend: PlausibilitaetEingabe = { ...LEERE_EINGABE, pruefsummeVorhanden: true, notizenUnverarbeitetAnzahl: 0 }
    expect(codes(auslösend)).toContain('IMP-310')

    const nicht: PlausibilitaetEingabe = { ...LEERE_EINGABE, pruefsummeVorhanden: true, notizenUnverarbeitetAnzahl: 1 }
    expect(codes(nicht)).not.toContain('IMP-310')
  })
})
