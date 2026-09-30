// AP-1.30 PR 11c-1 (A-02, C-26; docs/80 §33 V-130-11-E3): die Karten im Reiter „Namen" zeigen die Teile
// einer Form in Anzeigefolge. Diese Folge gibt es genau einmal, im Kern (`anzeigeArtFolge`), und
// `anzeigetextVon` verbindet die Felder in derselben Folge — sonst könnten Karte und Anzeigetext
// auseinanderlaufen. Rot zuerst (CLAUDE.md §5): vor PR 11c-1 exportiert der Kern keine Folge.
import { describe, expect, it } from 'vitest'
import { anzeigeArtFolge, anzeigetextVon } from '../../src/core/name/anzeigename'
import { NAME_PART_ART_REIHENFOLGE, type GeladenerTeil } from '../../src/core/name/zerlegung'
import { NamePartArtEnum } from '../../src/shared/schemata/name'

describe('anzeigeArtFolge (V-130-11-E3)', () => {
  it('NULL, fehlend und vorname_zuerst: die bisherige Folge', () => {
    expect(anzeigeArtFolge(null)).toStrictEqual(NAME_PART_ART_REIHENFOLGE)
    expect(anzeigeArtFolge(undefined)).toStrictEqual(NAME_PART_ART_REIHENFOLGE)
    expect(anzeigeArtFolge('vorname_zuerst')).toStrictEqual(['titel', 'vorname', 'vatersname', 'praefix', 'nachname', 'suffix'])
  })

  it('nachname_zuerst: Titel, Präfix, Nachname, Vornamen, Vatersname, Zusatz', () => {
    expect(anzeigeArtFolge('nachname_zuerst')).toStrictEqual(['titel', 'praefix', 'nachname', 'vorname', 'vatersname', 'suffix'])
  })

  it('jede Folge enthält jede Art genau einmal', () => {
    for (const reihenfolge of [null, 'vorname_zuerst', 'nachname_zuerst'] as const) {
      expect([...anzeigeArtFolge(reihenfolge)].sort()).toStrictEqual([...NamePartArtEnum.options].sort())
    }
  })

  it('anzeigetextVon verbindet die Teile in genau dieser Folge (ein Teil je Art, Wert = Art)', () => {
    const teile: readonly GeladenerTeil[] = NamePartArtEnum.options.map((art) => ({ art, wert: art, istRufname: false, sortierIndex: 0 }))
    for (const reihenfolge of [null, 'vorname_zuerst', 'nachname_zuerst'] as const) {
      expect(anzeigetextVon({ teile, originalText: null, reihenfolge }).split(' ')).toStrictEqual([...anzeigeArtFolge(reihenfolge)])
    }
  })
})
