// AP-1.34 PR-C2b (F-07, §31 U-1.34-C2-O1): Zuordnung der Bestandshinweise (AP-1.8) zu Reiter und
// Feld der Bearbeitungsansicht (Entwicklungsvorgaben §3.1/§5.5). Rein gegen den Kern.
import { describe, expect, it } from 'vitest'
import { BESTAND_HINWEIS_CODES, type BestandHinweis } from '../../src/core/plausibilitaet/regeln'
import { FELDWARNUNG_FELDER, feldZielFuer, feldwarnungenFuer } from '../../src/core/plausibilitaet/feldwarnungen'
import { REITER } from '../../src/core/person/reiter'
import { widerspruchZielFuer } from '../../src/core/person/offene-punkte'

describe('Reiter-IDs (Vorgaben §3.1)', () => {
  it('genau acht Reiter in fester Reihenfolge', () => {
    expect(REITER).toEqual(['person', 'namen', 'leben', 'beziehungen', 'belege_medien', 'gesundheit', 'notizen', 'verwaltung'])
  })
})

describe('feldZielFuer() — Zuordnung Hinweiscode → Reiter/Feld', () => {
  it('die Codeliste nennt genau die acht Bestandsregeln und ort_mit_datum (AP-1.30 Vorarbeiten Teil 3, E5)', () => {
    expect([...BESTAND_HINWEIS_CODES].sort()).toEqual(
      ['alter_ueber_110', 'bestattung_vor_tod', 'ereignis_vor_ortsexistenz', 'kind_vor_ehe', 'mutter_alter', 'ort_mit_datum', 'tod_vor_geburt', 'vater_alter', 'zyklus'],
    )
  })

  it('jeder Code hat einen gültigen Reiter und ein gültiges Feld', () => {
    for (const code of BESTAND_HINWEIS_CODES) {
      const ziel = feldZielFuer(code)
      expect(REITER, code).toContain(ziel.reiter)
      expect(FELDWARNUNG_FELDER, code).toContain(ziel.feld)
    }
  })

  it('die Tabelle aus §31 gilt Code für Code', () => {
    expect(feldZielFuer('tod_vor_geburt')).toEqual({ reiter: 'person', feld: 'todesdatum' })
    expect(feldZielFuer('bestattung_vor_tod')).toEqual({ reiter: 'person', feld: 'todesdatum' })
    expect(feldZielFuer('alter_ueber_110')).toEqual({ reiter: 'person', feld: 'todesdatum' })
    expect(feldZielFuer('mutter_alter')).toEqual({ reiter: 'beziehungen', feld: 'kinder' })
    expect(feldZielFuer('vater_alter')).toEqual({ reiter: 'beziehungen', feld: 'kinder' })
    expect(feldZielFuer('kind_vor_ehe')).toEqual({ reiter: 'beziehungen', feld: 'eltern' })
    expect(feldZielFuer('zyklus')).toEqual({ reiter: 'beziehungen', feld: 'eltern' })
    expect(feldZielFuer('ereignis_vor_ortsexistenz')).toEqual({ reiter: 'leben', feld: 'ereignisse' })
  })

  it('ort_mit_datum hängt am Feld seines Prädikats, wohnort und Unbekanntes an den Angaben (wie widerspruchZielFuer)', () => {
    expect(feldZielFuer('ort_mit_datum', 'geburtsort')).toEqual({ reiter: 'person', feld: 'geburtsort' })
    expect(feldZielFuer('ort_mit_datum', 'todesort')).toEqual({ reiter: 'person', feld: 'todesort' })
    expect(feldZielFuer('ort_mit_datum', 'wohnort')).toEqual({ reiter: 'leben', feld: 'angaben' })
    expect(feldZielFuer('ort_mit_datum')).toEqual({ reiter: 'leben', feld: 'angaben' })
    for (const praedikat of ['geburtsort', 'todesort', 'wohnort']) {
      expect(feldZielFuer('ort_mit_datum', praedikat)).toEqual(widerspruchZielFuer(praedikat))
    }
  })

  it('feldwarnungenFuer reicht das Prädikat an die Zuordnung weiter', () => {
    const hinweise: readonly BestandHinweis[] = [
      { code: 'ort_mit_datum', personId: 'p', praedikat: 'todesort' },
      { code: 'ort_mit_datum', personId: 'p', praedikat: 'wohnort' },
    ]
    expect(feldwarnungenFuer(hinweise, 'p')).toEqual([
      { code: 'ort_mit_datum', reiter: 'person', feld: 'todesort' },
      { code: 'ort_mit_datum', reiter: 'leben', feld: 'angaben' },
    ])
  })
})

describe('feldwarnungenFuer()', () => {
  const hinweise: readonly BestandHinweis[] = [
    { code: 'ereignis_vor_ortsexistenz', personId: 'p' },
    { code: 'mutter_alter', personId: 'andere' },
    { code: 'mutter_alter', personId: 'p' },
    { code: 'tod_vor_geburt', personId: 'p' },
    { code: 'mutter_alter', personId: 'p' },
  ]

  it('liefert nur die Hinweise dieser Person, mit Reiter und Feld', () => {
    const warnungen = feldwarnungenFuer(hinweise, 'p')
    expect(warnungen).toHaveLength(4)
    for (const w of warnungen) expect({ reiter: w.reiter, feld: w.feld }).toEqual(feldZielFuer(w.code))
    expect(feldwarnungenFuer(hinweise, 'andere')).toEqual([{ code: 'mutter_alter', reiter: 'beziehungen', feld: 'kinder' }])
    expect(feldwarnungenFuer(hinweise, 'niemand')).toEqual([])
  })

  it('ordnet nach der Regelreihenfolge, Mehrfachfunde bleiben erhalten', () => {
    expect(feldwarnungenFuer(hinweise, 'p').map((w) => w.code)).toEqual(['tod_vor_geburt', 'mutter_alter', 'mutter_alter', 'ereignis_vor_ortsexistenz'])
  })

  it('die Reihenfolge hängt nicht von der Eingabereihenfolge ab', () => {
    const umgedreht = [...hinweise].reverse()
    expect(feldwarnungenFuer(umgedreht, 'p')).toEqual(feldwarnungenFuer(hinweise, 'p'))
  })
})
