// AP-1.13 PR-C (docs/71_Designsystem.md §3.2, docs/arbeitspakete.md AP-1.13): `Ortsfeld` —
// vollständig kontrolliertes Molekül (kein `useState`, wie jeder Baustein hier).
// `renderToStaticMarkup` (react-dom/server, wie `personenwaehler.test.tsx`) statt einer
// DOM-Testbibliothek — vitest läuft mit `environment: 'node'` (vitest.config.ts). Tastaturnavigation
// und die `befehl:ort.anlegen`-Nutzlast sind reine Funktionen in `ortsfeld-logik.ts` und werden dort
// direkt geprüft (kein Klick-/Tastenereignis nötig).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Ortsfeld } from '../../src/renderer/bausteine/ortsfeld'
import {
  ortsfeldGeltungszeitraum,
  ortsfeldHierarchieText,
  ortsfeldNaechsterIndex,
  ortsfeldNeuAnlegenEin,
  ortsfeldZeileAktivieren,
  ortsfeldZeilenAufbauen,
  type OrtsfeldZeile,
} from '../../src/renderer/bausteine/ortsfeld-logik'
import type { OrtTreffer } from '../../src/shared/schemata/ort-suche'

function treffer(ueberschreibung: Partial<OrtTreffer> = {}): OrtTreffer {
  return {
    id: 'o-1',
    anzeigename: 'Marienwerder',
    politischeKette: [],
    ...ueberschreibung,
  }
}

describe('ortsfeld-logik (docs/71 §3.2, AP-1.13 PR-C)', () => {
  it('ortsfeldZeilenAufbauen: Treffer zuerst, dann IMMER die Schlusszeile "neu anlegen" — auch ohne Treffer', () => {
    const ohneTreffer = ortsfeldZeilenAufbauen([])
    expect(ohneTreffer).toEqual([{ art: 'neuAnlegen' }])

    const einTreffer = treffer()
    const mitTreffer = ortsfeldZeilenAufbauen([einTreffer])
    expect(mitTreffer).toEqual([{ art: 'treffer', treffer: einTreffer }, { art: 'neuAnlegen' }])
  })

  it('ortsfeldNaechsterIndex: "runter" läuft nach dem letzten Eintrag zum ersten um', () => {
    expect(ortsfeldNaechsterIndex(null, 'runter', 2)).toBe(0)
    expect(ortsfeldNaechsterIndex(0, 'runter', 2)).toBe(1)
    expect(ortsfeldNaechsterIndex(1, 'runter', 2)).toBe(0)
  })

  it('ortsfeldNaechsterIndex: "hoch" läuft vor dem ersten Eintrag zum letzten um', () => {
    expect(ortsfeldNaechsterIndex(null, 'hoch', 2)).toBe(1)
    expect(ortsfeldNaechsterIndex(0, 'hoch', 2)).toBe(1)
    expect(ortsfeldNaechsterIndex(1, 'hoch', 2)).toBe(0)
  })

  it('ortsfeldNaechsterIndex: ohne Zeilen (anzahl 0) bleibt "null"', () => {
    expect(ortsfeldNaechsterIndex(null, 'runter', 0)).toBeNull()
  })

  it('ortsfeldZeileAktivieren("treffer"): ruft NUR aufAusgewaehlt mit der Ort-id', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const zeile: OrtsfeldZeile = { art: 'treffer', treffer: treffer({ id: 'o-7' }) }
    ortsfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })
    expect(aufAusgewaehlt).toHaveBeenCalledExactlyOnceWith('o-7')
    expect(aufNeuAnlegen).not.toHaveBeenCalled()
  })

  it('ortsfeldZeileAktivieren("neuAnlegen"): ruft NUR aufNeuAnlegen', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    ortsfeldZeileAktivieren({ art: 'neuAnlegen' }, { aufAusgewaehlt, aufNeuAnlegen })
    expect(aufNeuAnlegen).toHaveBeenCalledOnce()
    expect(aufAusgewaehlt).not.toHaveBeenCalled()
  })

  it('ortsfeldNeuAnlegenEin(text): ort.anlegen NUR mit dem eingegebenen Namen', () => {
    expect(ortsfeldNeuAnlegenEin('Marienw…')).toEqual({ name: 'Marienw…' })
  })

  it('"neu anlegen" ruft in Kombination mit ortsfeldZeileAktivieren tatsächlich befehl:ort.anlegen-taugliche Nutzlast auf', () => {
    const mutate = vi.fn()
    const aufNeuAnlegen = () => mutate(ortsfeldNeuAnlegenEin('Kirchdorf'))
    ortsfeldZeileAktivieren({ art: 'neuAnlegen' }, { aufAusgewaehlt: vi.fn(), aufNeuAnlegen })
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ name: 'Kirchdorf' })
  })

  it('ortsfeldHierarchieText: verkettet mit " · " (docs/71 §3.2 "Kreis Marienwerder · Westpreußen · Preußen")', () => {
    expect(ortsfeldHierarchieText(['Kreis Marienwerder', 'Westpreußen', 'Preußen'])).toBe('Kreis Marienwerder · Westpreußen · Preußen')
  })

  it('ortsfeldHierarchieText: leere Kette -> leere Zeichenkette', () => {
    expect(ortsfeldHierarchieText([])).toBe('')
  })

  // AP-1.16 PR-C (docs/71_Designsystem.md §3.2 "Zwingend": Geltungszeitraum rechts neben jedem
  // Vorschlag, z. B. "bis 1945"/"ab 1945").
  it('ortsfeldGeltungszeitraum: nur gueltigBisJahr -> "ortsfeld_geltung_bis"', () => {
    expect(ortsfeldGeltungszeitraum(treffer({ gueltigBisJahr: 1945 }))).toEqual({ schluessel: 'ortsfeld_geltung_bis', werte: { jahr: 1945 } })
  })

  it('ortsfeldGeltungszeitraum: nur gueltigVonJahr -> "ortsfeld_geltung_ab"', () => {
    expect(ortsfeldGeltungszeitraum(treffer({ gueltigVonJahr: 1945 }))).toEqual({ schluessel: 'ortsfeld_geltung_ab', werte: { jahr: 1945 } })
  })

  it('ortsfeldGeltungszeitraum: beide Grenzen -> "ortsfeld_geltung_zwischen"', () => {
    expect(ortsfeldGeltungszeitraum(treffer({ gueltigVonJahr: 1900, gueltigBisJahr: 1945 }))).toEqual({
      schluessel: 'ortsfeld_geltung_zwischen',
      werte: { von: 1900, bis: 1945 },
    })
  })

  it('ortsfeldGeltungszeitraum: ohne Grenzen (unbegrenzt gültig) -> undefined', () => {
    expect(ortsfeldGeltungszeitraum(treffer())).toBeUndefined()
  })
})

describe('Ortsfeld (docs/71 §3.2, AP-1.13 PR-C)', () => {
  const OHNE_AKTION = { aufAenderung: () => {}, aufAusgewaehlt: () => {}, aufNeuAnlegen: () => {} }

  it('zustand "leer": zeigt kein Listbox (noch nicht gesucht)', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="" zustand="leer" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('role="listbox"')
  })

  it('zustand "laedt": zeigt ein Listbox, aber KEINE Treffer-/Schlusszeile als role="option"', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="Marienw" zustand="laedt" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).toContain('role="listbox"')
    expect(markup).not.toContain('role="option"')
  })

  it('zustand "bereit" mit Treffern: zeigt je Treffer den datumsgültigen Namen, PLUS die feste Schlusszeile', () => {
    const einTreffer = treffer({ id: 'o-42', anzeigename: 'Kwidzyn' })
    const markup = renderToStaticMarkup(
      <Ortsfeld text="Marienw" zustand="bereit" treffer={[einTreffer]} hervorgehobenerIndex={null} {...OHNE_AKTION} />,
    )
    expect(markup).toContain('Kwidzyn')
    // Treffer + "neu anlegen" = 2 role="option"
    expect((markup.match(/role="option"/g) ?? []).length).toBe(2)
  })

  it('zustand "bereit" ohne Treffer: zeigt trotzdem die feste Schlusszeile', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="Xyz" zustand="bereit" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect((markup.match(/role="option"/g) ?? []).length).toBe(1)
  })

  it('die Schlusszeile nennt die aktuelle Eingabe in Anführungszeichen', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="Marienw…" zustand="bereit" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).toContain('Marienw…')
  })

  it('hervorgehobenerIndex markiert GENAU eine Zeile als aria-selected="true"', () => {
    const zwei = [treffer({ id: 'o-1' }), treffer({ id: 'o-2', anzeigename: 'Kwidzyn' })]
    const markup = renderToStaticMarkup(<Ortsfeld text="a" zustand="bereit" treffer={zwei} hervorgehobenerIndex={1} {...OHNE_AKTION} />)
    expect((markup.match(/aria-selected="true"/g) ?? []).length).toBe(1)
  })

  it('ohne hervorgehobenerIndex (null) ist keine Zeile aria-selected="true"', () => {
    const zwei = [treffer({ id: 'o-1' }), treffer({ id: 'o-2', anzeigename: 'Kwidzyn' })]
    const markup = renderToStaticMarkup(<Ortsfeld text="a" zustand="bereit" treffer={zwei} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('aria-selected="true"')
  })

  it('gesperrt sperrt das Eingabefeld', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="" zustand="leer" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(
      <Ortsfeld text="Marienw" zustand="bereit" treffer={[treffer()]} hervorgehobenerIndex={0} {...OHNE_AKTION} />,
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  it('mit politischeKette: zeigt die Hierarchiezeile unter dem Treffernamen (docs/71 §3.2)', () => {
    const einTreffer = treffer({ anzeigename: 'Marienwerder', politischeKette: ['Kreis Marienwerder', 'Westpreußen', 'Preußen'] })
    const markup = renderToStaticMarkup(
      <Ortsfeld text="Marienw" zustand="bereit" treffer={[einTreffer]} hervorgehobenerIndex={null} {...OHNE_AKTION} />,
    )
    expect(markup).toContain('Kreis Marienwerder · Westpreußen · Preußen')
  })

  it('ohne politischeKette (leer): KEINE Hierarchiezeile', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="Marienw" zustand="bereit" treffer={[treffer()]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('·')
  })

  // AP-1.16 PR-C (docs/71_Designsystem.md §3.2 "Zwingend": Geltungszeitraum rechts neben jedem
  // Vorschlag). Die Tests hier prüfen den i18n-SCHLÜSSEL (`t()` interpoliert in dieser
  // Testumgebung ohne initialisierte i18next-Instanz nicht, analog `datumsfeld.test.tsx`), nicht
  // den übersetzten Text — die tatsächliche Übersetzung "bis 1945" prüft `felder.json` selbst.
  it('mit gueltigBisJahr: rendert die Geltungszeitraum-Zeile rechts neben dem Treffernamen (Schlüssel "ortsfeld_geltung_bis")', () => {
    const einTreffer = treffer({ anzeigename: 'Marienwerder', gueltigBisJahr: 1945 })
    const markup = renderToStaticMarkup(
      <Ortsfeld text="Marienw" zustand="bereit" treffer={[einTreffer]} hervorgehobenerIndex={null} {...OHNE_AKTION} />,
    )
    expect(markup).toContain('wz-ortsfeld__zeile-geltung')
    expect(markup).toContain('ortsfeld_geltung_bis')
  })

  it('mit gueltigVonJahr: rendert die Geltungszeitraum-Zeile (Schlüssel "ortsfeld_geltung_ab")', () => {
    const einTreffer = treffer({ anzeigename: 'Kwidzyn', gueltigVonJahr: 1945 })
    const markup = renderToStaticMarkup(
      <Ortsfeld text="Marienw" zustand="bereit" treffer={[einTreffer]} hervorgehobenerIndex={null} {...OHNE_AKTION} />,
    )
    expect(markup).toContain('wz-ortsfeld__zeile-geltung')
    expect(markup).toContain('ortsfeld_geltung_ab')
  })

  it('ohne Geltungsgrenzen (unbegrenzt gültig): KEIN Geltungszeitraum-Zusatz', () => {
    const markup = renderToStaticMarkup(<Ortsfeld text="Marienw" zustand="bereit" treffer={[treffer()]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('wz-ortsfeld__zeile-geltung')
  })
})

// Design-Review E6: Widerspruch-Hinweis am Ortsfeld — ohne Suche direkt unter dem Eingabekörper,
// während der Suche bleibt die Vorschlagsliste am Feld und der Hinweis folgt ihr; immer per
// aria-describedby verknüpft.
describe('Ortsfeld — Widerspruch-Hinweis (Design-Review E6)', () => {
  const grund = { aufAenderung: () => {}, aufAusgewaehlt: () => {}, aufNeuAnlegen: () => {}, hervorgehobenerIndex: null, treffer: [] }

  it('ohne Suche: folgt direkt auf das <input> und ist per aria-describedby verknüpft', () => {
    const markup = renderToStaticMarkup(<Ortsfeld {...grund} text="Marienwerder" zustand="leer" id="ort" hinweis="Ereignis liegt außerhalb" />)
    expect(markup).toMatch(/<input[^>]*aria-describedby="ort-hinweis"[^>]*\/?><div id="ort-hinweis" class="wz-ortsfeld__widerspruch">Ereignis liegt außerhalb<\/div><\/div>$/)
  })

  it('während der Suche: die Vorschlagsliste bleibt direkt am Feld, der Hinweis folgt ihr', () => {
    const markup = renderToStaticMarkup(<Ortsfeld {...grund} text="Mar" zustand="bereit" treffer={[treffer()]} id="ort" hinweis="Ereignis liegt außerhalb" />)
    expect(markup).toMatch(/<input[^>]*\/?><ul id="ort-liste"/)
    expect(markup).toMatch(/<\/ul><div id="ort-hinweis" class="wz-ortsfeld__widerspruch">/)
  })

  it('ohne hinweis: kein aria-describedby', () => {
    const markup = renderToStaticMarkup(<Ortsfeld {...grund} text="" zustand="leer" id="ort" />)
    expect(markup).not.toContain('aria-describedby')
  })
})
