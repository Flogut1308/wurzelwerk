// AP-1.13 PR-A: `Formularfeld` — Molekül (docs/71_Designsystem.md §2.2): „Beschriftung + Feld +
// Hilfetext + Fehlermeldung + Konfidenzwähler + Belegabzeichen" — die Hülle, die jedes Datenfeld
// trägt. Reine Präsentation: kein Datenzugriff, keine Fachlogik, `children` ist das eigentliche
// Feld (Textfeld/Zahlfeld/Datumsfeld/…).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Formularfeld } from '../../src/renderer/bausteine/formularfeld'

describe('Formularfeld (docs/71_Designsystem.md §2.2, AP-1.13 PR-A)', () => {
  it('trägt die Beschriftung als <label>, das native Tastaturaktivierung über das erste Kindfeld erlaubt', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum">
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).toContain('<label')
    expect(markup).toContain('Geburtsdatum')
  })

  it('gibt das Kindfeld unverändert wieder', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum">
        <input type="text" data-testid="mein-feld" />
      </Formularfeld>,
    )
    expect(markup).toContain('data-testid="mein-feld"')
  })

  it('ohne Hilfetext/Fehlertext: reserviert trotzdem eine Metazeile (kein Layout-Sprung beim späteren Erscheinen)', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum">
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).toContain('wz-formularfeld__meta')
  })

  it('mit Hilfetext: zeigt ihn in der Metazeile', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum" hilfetext="Format TT.MM.JJJJ oder um 1890">
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).toContain('Format TT.MM.JJJJ oder um 1890')
  })

  it('Fehlertext gewinnt gegen Hilfetext (beide gesetzt zeigt nur den Fehler)', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum" hilfetext="Hilfetext" fehlertext="Datum nicht auflösbar">
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).toContain('Datum nicht auflösbar')
    expect(markup).not.toContain('Hilfetext')
    expect(markup).toContain('wz-text--farbe-akzent')
  })

  it('rendert Konfidenzwähler- und Belegabzeichen-Slots, wenn übergeben', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum" konfidenzwaehler={<span data-testid="kw" />} belegabzeichen={<span data-testid="ba" />}>
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).toContain('data-testid="kw"')
    expect(markup).toContain('data-testid="ba"')
  })

  it('ohne Slots: kein leerer Slot-Container im Markup', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum">
        <input type="text" />
      </Formularfeld>,
    )
    expect(markup).not.toContain('wz-formularfeld__slots')
  })

  it('gesperrt: Beschriftung trägt die gesperrte Textfarbe', () => {
    const markup = renderToStaticMarkup(
      <Formularfeld beschriftung="Geburtsdatum" gesperrt>
        <input type="text" disabled />
      </Formularfeld>,
    )
    expect(markup).toContain('wz-text--farbe-gesperrt')
  })
})
