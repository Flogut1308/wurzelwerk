// AP-1.8, F-07 (57_Phase0_Arbeitspakete.md „AP-1.8"). Rein gegen `regeln.ts::pruefeBestand()` —
// KEINE Datenbank: jede der acht Bestandsregeln bekommt einen von Hand gebauten, minimalen
// `BestandEingabe`-Ausschnitt, mit je einem auslösenden und einem knapp-nicht-auslösenden Fall
// (CLAUDE.md §5 — additive Tests, eiserne Regel). Platzhalter-Ausschluss (A-17) hat eine eigene
// Datei: `test/einheit/plausibilitaet-platzhalter.test.ts`.
import { describe, expect, it } from 'vitest'
import { nachJdn } from '../../src/core/datum/kalender'
import { pruefeBestand, type BestandEingabe } from '../../src/core/plausibilitaet/regeln'

const JAHR = (jahr: number): number => nachJdn(jahr, 1, 1, 'gregorian')

const LEERE_EINGABE: BestandEingabe = {
  personen: [],
  elternschaften: [],
  partnerschaften: [],
  orte: [],
  ereignisse: [],
  aussagen: [],
}

function codes(eingabe: BestandEingabe): readonly string[] {
  return pruefeBestand(eingabe).map((hinweis) => hinweis.code)
}

describe('pruefeBestand() — Bestandsprüfung (AP-1.8, F-07)', () => {
  it('tod_vor_geburt: Tod vor Geburt löst aus, Tod nach Geburt nicht', () => {
    const auslösend: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, geburt: { von: JAHR(1900), bis: JAHR(1900) }, tod: { von: JAHR(1899), bis: JAHR(1899) } }],
    }
    expect(codes(auslösend)).toContain('tod_vor_geburt')

    const nicht: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, geburt: { von: JAHR(1900), bis: JAHR(1900) }, tod: { von: JAHR(1950), bis: JAHR(1950) } }],
    }
    expect(codes(nicht)).not.toContain('tod_vor_geburt')
  })

  it('bestattung_vor_tod: Bestattung vor Tod löst aus, Bestattung nach Tod nicht', () => {
    const auslösend: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, tod: { von: JAHR(1950), bis: JAHR(1950) }, bestattung: { von: JAHR(1949), bis: JAHR(1949) } }],
    }
    expect(codes(auslösend)).toContain('bestattung_vor_tod')

    const nicht: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, tod: { von: JAHR(1950), bis: JAHR(1950) }, bestattung: { von: JAHR(1950), bis: JAHR(1950) } }],
    }
    expect(codes(nicht)).not.toContain('bestattung_vor_tod')
  })

  it('mutter_alter: Mutter mit 8 Jahren bei Geburt löst aus, mit 20 Jahren nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ elternteilId: 'mutter', kindId: 'kind' }],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'mutter', istPlatzhalter: false, geschlecht: 'F', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1958), bis: JAHR(1958) } },
      ],
    }
    expect(codes(auslösend)).toContain('mutter_alter')

    const nicht: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'mutter', istPlatzhalter: false, geschlecht: 'F', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1970), bis: JAHR(1970) } },
      ],
    }
    expect(codes(nicht)).not.toContain('mutter_alter')
  })

  it('mutter_alter: Mutter mit 60 Jahren bei Geburt löst aus, mit 50 Jahren nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ elternteilId: 'mutter', kindId: 'kind' }],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'mutter', istPlatzhalter: false, geschlecht: 'F', geburt: { von: JAHR(1900), bis: JAHR(1900) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1960), bis: JAHR(1960) } },
      ],
    }
    expect(codes(auslösend)).toContain('mutter_alter')

    const nicht: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'mutter', istPlatzhalter: false, geschlecht: 'F', geburt: { von: JAHR(1900), bis: JAHR(1900) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1950), bis: JAHR(1950) } },
      ],
    }
    expect(codes(nicht)).not.toContain('mutter_alter')
  })

  it('vater_alter: Vater mit 8 Jahren bei Geburt löst aus, mit 20 Jahren nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ elternteilId: 'vater', kindId: 'kind' }],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'vater', istPlatzhalter: false, geschlecht: 'M', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1958), bis: JAHR(1958) } },
      ],
    }
    expect(codes(auslösend)).toContain('vater_alter')

    const nicht: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'vater', istPlatzhalter: false, geschlecht: 'M', geburt: { von: JAHR(1950), bis: JAHR(1950) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1970), bis: JAHR(1970) } },
      ],
    }
    expect(codes(nicht)).not.toContain('vater_alter')
  })

  it('vater_alter: Vater mit 85 Jahren bei Geburt löst aus, mit 70 Jahren nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ elternteilId: 'vater', kindId: 'kind' }],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'vater', istPlatzhalter: false, geschlecht: 'M', geburt: { von: JAHR(1850), bis: JAHR(1850) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1935), bis: JAHR(1935) } },
      ],
    }
    expect(codes(auslösend)).toContain('vater_alter')

    const nicht: BestandEingabe = {
      ...basis,
      personen: [
        { id: 'vater', istPlatzhalter: false, geschlecht: 'M', geburt: { von: JAHR(1850), bis: JAHR(1850) } },
        { id: 'kind', istPlatzhalter: false, geburt: { von: JAHR(1920), bis: JAHR(1920) } },
      ],
    }
    expect(codes(nicht)).not.toContain('vater_alter')
  })

  it('kind_vor_ehe: Kind vor Eheschließung der Eltern löst aus (nur Hinweis), Kind nach Eheschließung nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      elternschaften: [{ elternteilId: 'mutter', kindId: 'kind' }],
      personen: [
        { id: 'mutter', istPlatzhalter: false },
        { id: 'vater', istPlatzhalter: false },
        { id: 'kind', istPlatzhalter: false },
      ],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      personen: basis.personen.map((person) => (person.id === 'kind' ? { ...person, geburt: { von: JAHR(1920), bis: JAHR(1920) } } : person)),
      partnerschaften: [{ beginn: { von: JAHR(1925), bis: JAHR(1925) }, beteiligteIds: ['mutter', 'vater'] }],
    }
    expect(codes(auslösend)).toContain('kind_vor_ehe')

    const nicht: BestandEingabe = {
      ...basis,
      personen: basis.personen.map((person) => (person.id === 'kind' ? { ...person, geburt: { von: JAHR(1930), bis: JAHR(1930) } } : person)),
      partnerschaften: [{ beginn: { von: JAHR(1925), bis: JAHR(1925) }, beteiligteIds: ['mutter', 'vater'] }],
    }
    expect(codes(nicht)).not.toContain('kind_vor_ehe')
  })

  it('alter_ueber_110: Lebensdauer über 110 Jahre löst aus, genau 110 Jahre nicht', () => {
    const auslösend: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, geburt: { von: JAHR(1800), bis: JAHR(1800) }, tod: { von: JAHR(1920), bis: JAHR(1920) } }],
    }
    expect(codes(auslösend)).toContain('alter_ueber_110')

    const nicht: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false, geburt: { von: JAHR(1800), bis: JAHR(1800) }, tod: { von: JAHR(1910), bis: JAHR(1910) } }],
    }
    expect(codes(nicht)).not.toContain('alter_ueber_110')
  })

  it('zyklus: ein Zyklus im Elternschaftsgraphen löst aus, ein azyklischer Graph nicht', () => {
    const auslösend: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [
        { id: 'a', istPlatzhalter: false },
        { id: 'b', istPlatzhalter: false },
      ],
      elternschaften: [
        { elternteilId: 'a', kindId: 'b' },
        { elternteilId: 'b', kindId: 'a' },
      ],
    }
    expect(codes(auslösend)).toContain('zyklus')

    const nicht: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [
        { id: 'a', istPlatzhalter: false },
        { id: 'b', istPlatzhalter: false },
      ],
      elternschaften: [{ elternteilId: 'a', kindId: 'b' }],
    }
    expect(codes(nicht)).not.toContain('zyklus')
  })

  it('ereignis_vor_ortsexistenz: Ereignisdatum außerhalb der Existenz des Ortes löst aus, innerhalb nicht', () => {
    const basis: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'a', istPlatzhalter: false }],
      orte: [{ id: 'ort', existiert: { von: JAHR(1900), bis: JAHR(1945) } }],
    }
    const auslösend: BestandEingabe = {
      ...basis,
      ereignisse: [{ ortId: 'ort', datum: { von: JAHR(1950), bis: JAHR(1950) }, beteiligteIds: ['a'] }],
    }
    expect(codes(auslösend)).toContain('ereignis_vor_ortsexistenz')

    const nicht: BestandEingabe = {
      ...basis,
      ereignisse: [{ ortId: 'ort', datum: { von: JAHR(1920), bis: JAHR(1920) }, beteiligteIds: ['a'] }],
    }
    expect(codes(nicht)).not.toContain('ereignis_vor_ortsexistenz')
  })
})

// Vorarbeiten AP-1.30 Teil 3 (docs/80 §32, Eigentümer-Entscheidung E5): Orts-Aussagen mit Datum im
// Altbestand werden nicht gelöscht, sondern als Prüfhinweis sichtbar. „Datum" = die Datumsgruppe der
// Aussage (`datum_*`), NICHT der Gültigkeitszeitraum (`gueltig_von`/`gueltig_bis`, V-5b-zeitraum).
describe('pruefeBestand() — ort_mit_datum (AP-1.30 Vorarbeiten Teil 3, E5)', () => {
  const person = { id: 'a', istPlatzhalter: false } as const

  it('eine Orts-Aussage mit Datum ergibt je Aussage einen Hinweis an der Person, mit Prädikat', () => {
    const eingabe: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [person],
      aussagen: [
        { personId: 'a', praedikat: 'geburtsort', hatDatum: true },
        { personId: 'a', praedikat: 'wohnort', hatDatum: true },
        { personId: 'a', praedikat: 'todesort', hatDatum: true },
      ],
    }
    expect(pruefeBestand(eingabe)).toEqual([
      { code: 'ort_mit_datum', personId: 'a', praedikat: 'geburtsort' },
      { code: 'ort_mit_datum', personId: 'a', praedikat: 'wohnort' },
      { code: 'ort_mit_datum', personId: 'a', praedikat: 'todesort' },
    ])
  })

  it('ohne Datum (auch mit Gültigkeitszeitraum, der hier gar nicht als Datum zählt) kein Hinweis', () => {
    const eingabe: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [person],
      aussagen: [
        { personId: 'a', praedikat: 'geburtsort', hatDatum: false },
        { personId: 'a', praedikat: 'wohnort', hatDatum: false },
      ],
    }
    expect(codes(eingabe)).not.toContain('ort_mit_datum')
  })

  it('ein anderes Prädikat mit Datum löst nichts aus', () => {
    const eingabe: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [person],
      aussagen: [
        { personId: 'a', praedikat: 'beruf', hatDatum: true },
        { personId: 'a', praedikat: 'geburtsdatum', hatDatum: true },
      ],
    }
    expect(codes(eingabe)).not.toContain('ort_mit_datum')
  })

  it('Platzhalter und unbekannte Personen werden übersprungen (A-17)', () => {
    const eingabe: BestandEingabe = {
      ...LEERE_EINGABE,
      personen: [{ id: 'pl', istPlatzhalter: true }],
      aussagen: [
        { personId: 'pl', praedikat: 'geburtsort', hatDatum: true },
        { personId: 'fehlt', praedikat: 'wohnort', hatDatum: true },
      ],
    }
    expect(codes(eingabe)).not.toContain('ort_mit_datum')
  })
})
