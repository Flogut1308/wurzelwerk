// AP-1.13 PR-A: `Datumsfeld` — Molekül (docs/71_Designsystem.md §2.2/§3.1), die wichtigste
// Komponente der App. Kontrolliertes Feld + IMMER sichtbare Interpretationszeile + eingeklappte
// Kalenderwahl. `renderToStaticMarkup` ohne i18next-Provider (wie kontrollkaestchen.test.tsx) —
// `t()` liefert den rohen Schlüssel zurück, das reicht, um zu belegen, DASS die richtige Zeile
// erscheint (welcher Schlüssel — geprüft gegen datumsfeld-logik.ts/datumsfeld-parser.test.ts).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Datumsfeld } from '../../src/renderer/bausteine/datumsfeld'

const GRUND_PROPS = {
  kalender: 'gregorian' as const,
  aufKalenderAenderung: () => {},
  kalenderErweitert: false,
  aufKalenderErweitertAenderung: () => {},
}

describe('Datumsfeld (docs/71_Designsystem.md §2.2/§3.1, AP-1.13 PR-A)', () => {
  it('rendert ein natives <input> für die freie Eingabe', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('<input')
  })

  it('leer: keine Interpretationszeile mit Inhalt', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('wz-datumsfeld__interpretation')
    expect(markup).not.toContain('datumsfeld_verstanden_als')
    expect(markup).not.toContain('datumsfeld_nicht_aufloesbar')
  })

  it('gültige Eingabe: zeigt "Verstanden als" MIT Genauigkeit, Feld nicht als ungültig markiert', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="um 1890" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('datumsfeld_verstanden_als_mit_genauigkeit')
    expect(markup).not.toContain('aria-invalid="true"')
  })

  it('unauflösbare Eingabe: zeigt "nicht auflösbar" UND markiert das Feld als ungültig', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="31.02.1900" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('datumsfeld_nicht_aufloesbar')
    expect(markup).toContain('aria-invalid="true"')
  })

  it('Doppeljahr (Originaltext): "Verstanden als" OHNE Genauigkeits-Suffix', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="1750/51" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('>datumsfeld_verstanden_als<')
    expect(markup).not.toContain('datumsfeld_verstanden_als_mit_genauigkeit')
  })

  it('"zwischen 1750 und 1760" — der Entwurfsprüfstein: eine Zeile, kein Umbruch im Markup (kein <br>)', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="zwischen 1750 und 1760" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).not.toContain('<br')
  })

  it('Kalenderwahl ist standardmäßig eingeklappt: kein <select> im Markup', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).not.toContain('<select')
  })

  it('kalenderErweitert=true: zeigt das Kalender-Auswahlfeld (<select>)', () => {
    const markup = renderToStaticMarkup(
      <Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} kalenderErweitert ariaLabel="Geburtsdatum" />,
    )
    expect(markup).toContain('<select')
  })

  it('der Aufklapp-Knopf ist ein natives <button> mit aria-expanded', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" />)
    expect(markup).toContain('<button')
    expect(markup).toContain('aria-expanded="false"')
  })

  it('gesperrt: das Eingabefeld ist disabled', () => {
    const markup = renderToStaticMarkup(<Datumsfeld text="" aufAenderung={() => {}} {...GRUND_PROPS} ariaLabel="Geburtsdatum" gesperrt />)
    expect(markup).toContain('disabled=""')
  })
})
