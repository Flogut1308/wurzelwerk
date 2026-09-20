// AP-1.13 PR-A: dieselbe Falltabelle wie test/einheit/datum-parser.test.ts (DORT nicht ändern,
// CLAUDE.md §9/ADR-025 — die Datei ist Prüfmaterial für src/core/datum/parser.ts selbst), hier
// erneut aufgeschrieben und durch das `Datumsfeld` (genauer: seine reine Interpretationslogik,
// `src/renderer/bausteine/datumsfeld-logik.ts`) gereicht. `datumsfeldInterpretation()` ruft NUR
// `parse()`+`formatiere()` auf (src/core/datum/parser.ts, formatierer.ts) — KEINE zweite
// Parselogik im Renderer (Auftragstext).
import { describe, expect, it } from 'vitest'
import { datumsfeldInterpretation } from '../../src/renderer/bausteine/datumsfeld-logik'

interface FallOk {
  readonly text: string
  readonly ok: true
  readonly schluessel: string
  readonly istOriginaltext: boolean
  readonly genauigkeitSchluessel?: string
}
interface FallFehler {
  readonly text: string
  readonly ok: false
  readonly grundSchluessel: string
}
type Fall = FallOk | FallFehler

function formatiert(text: string, schluessel: string, genauigkeitSchluessel: string): FallOk {
  return { text, ok: true, schluessel, istOriginaltext: false, genauigkeitSchluessel }
}

function original(text: string, schluessel = 'datum:originaltext'): FallOk {
  return { text, ok: true, schluessel, istOriginaltext: true }
}

function fehler(text: string, grundSchluessel: string): FallFehler {
  return { text, ok: false, grundSchluessel }
}

const FAELLE: readonly Fall[] = [
  // A. Monatsname + Jahr.
  formatiert('Januar 1900', 'datum:monat_jahr', 'datumsfeld_genauigkeit_monat'),
  formatiert('Dezember 1911', 'datum:monat_jahr', 'datumsfeld_genauigkeit_monat'),

  // B. D.M.YYYY.
  formatiert('14.3.1901', 'datum:tag_monat_jahr', 'datumsfeld_genauigkeit_tag'),
  formatiert('31.12.1999', 'datum:tag_monat_jahr', 'datumsfeld_genauigkeit_tag'),

  // C. Schalttage.
  formatiert('29.2.2000', 'datum:tag_monat_jahr', 'datumsfeld_genauigkeit_tag'),
  fehler('29.2.1900', 'datumsfeld_grund_ungueltiger_tag'),
  formatiert('29.2.1904', 'datum:tag_monat_jahr', 'datumsfeld_genauigkeit_tag'),
  fehler('29.2.2001', 'datumsfeld_grund_ungueltiger_tag'),

  // D. Ungültige Monatslängen.
  fehler('31.4.1900', 'datumsfeld_grund_ungueltiger_tag'),
  fehler('31.6.1900', 'datumsfeld_grund_ungueltiger_tag'),

  // E. Bloße Jahreszahl.
  formatiert('1901', 'datum:jahr', 'datumsfeld_genauigkeit_jahr'),
  formatiert('1750', 'datum:jahr', 'datumsfeld_genauigkeit_jahr'),

  // F. um/etwa.
  formatiert('um 1890', 'datum:um', 'datumsfeld_genauigkeit_jahr'),
  formatiert('etwa 1890', 'datum:um', 'datumsfeld_genauigkeit_jahr'),

  // G. vor.
  formatiert('vor 1750', 'datum:vor', 'datumsfeld_genauigkeit_jahr'),

  // H. nach.
  formatiert('nach 1812', 'datum:nach', 'datumsfeld_genauigkeit_jahr'),

  // I. zwischen — der Entwurfsprüfstein aus docs/71 §3.1.
  formatiert('zwischen 1750 und 1760', 'datum:zwischen', 'datumsfeld_genauigkeit_jahr'),

  // J. Doppeljahr — als Originaltext, NICHT auf ein Jahr gerundet (§3.1 Regel 6).
  original('1750/51'),
  original('1799/00'),

  // K. Enthält eine vierstellige Jahreszahl, sonst unbekannte Form -> Originaltext.
  original('Dom. III post Trinitatis 1750'),
  original('irgendwas 1888 Text'),

  // L. ISO-Tagesform.
  formatiert('1901-03-14', 'datum:tag_monat_jahr', 'datumsfeld_genauigkeit_tag'),

  // M. Leer — keine Interpretation, kein „nicht auflösbar" (nichts wurde noch getippt).
  { text: '', ok: false, grundSchluessel: 'leer' },

  // N. Ungültiger Tag.
  fehler('31.02.1900', 'datumsfeld_grund_ungueltiger_tag'),
  fehler('00.03.1901', 'datumsfeld_grund_ungueltiger_tag'),

  // O. Ungültiger Monat.
  fehler('1901-13-01', 'datumsfeld_grund_ungueltiger_monat'),
  fehler('01.13.1900', 'datumsfeld_grund_ungueltiger_monat'),

  // P. Unbekanntes Format (keine vierstellige Jahreszahl enthalten).
  fehler('hello world', 'datumsfeld_grund_unbekanntes_format'),
  fehler('abc123', 'datumsfeld_grund_unbekanntes_format'),
]

describe('datumsfeldInterpretation (src/renderer/bausteine/datumsfeld-logik.ts, AP-1.13 PR-A)', () => {
  it.each(FAELLE)('$text', (fall) => {
    const interpretation = datumsfeldInterpretation(fall.text)

    if (fall.text.trim().length === 0) {
      expect(interpretation.art).toBe('leer')
      return
    }

    if (fall.ok) {
      expect(interpretation.art === 'formatiert' || interpretation.art === 'originaltext', `erwartet ok, war ${interpretation.art}`).toBe(true)
      if (interpretation.art === 'formatiert' || interpretation.art === 'originaltext') {
        expect(interpretation.schluessel).toBe(fall.schluessel)
      }
      if (fall.istOriginaltext) {
        expect(interpretation.art).toBe('originaltext')
      } else if (interpretation.art === 'formatiert') {
        expect(interpretation.genauigkeitSchluessel).toBe(fall.genauigkeitSchluessel)
      }
    } else {
      expect(interpretation.art).toBe('nicht_aufloesbar')
      if (interpretation.art === 'nicht_aufloesbar') {
        expect(interpretation.grundSchluessel).toBe(fall.grundSchluessel)
      }
    }
  })

  it('parse() wirft nie — datumsfeldInterpretation() wirft entsprechend auch bei unbrauchbarer Eingabe nie', () => {
    expect(() => datumsfeldInterpretation('§§§ nicht parsbar €€€')).not.toThrow()
  })
})
