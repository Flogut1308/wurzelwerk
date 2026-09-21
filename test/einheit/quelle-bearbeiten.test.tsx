// AP-1.17 PR-C1 — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// `QuelleBearbeitenInhalt` (`renderToStaticMarkup`, Muster `ort-bearbeiten.test.tsx`). Befehl- UND
// Abfrage-Hooks hängen an `@tanstack/react-query` und werden darum gemockt, je EIN `mutate`-/
// `mutateAsync`-Spion pro Kanal.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// Seiteneffekt: initialisiert die einzige i18next-Instanz synchron (Muster `ort-bearbeiten.test.tsx`).
import '../../src/renderer/i18n/einrichten'

const quelleAendernMutate = vi.fn()
const archivAnlegenMutateAsync = vi.fn()
const personAnlegenMutateAsync = vi.fn()
const zitatAnlegenMutate = vi.fn()
const zitatAendernMutate = vi.fn()
const zitatLoeschenMutate = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useQuelleAendern: () => ({ mutate: quelleAendernMutate }),
  useArchivAnlegen: () => ({ mutateAsync: archivAnlegenMutateAsync }),
  usePersonAnlegen: () => ({ mutateAsync: personAnlegenMutateAsync }),
  useZitatAnlegen: () => ({ mutate: zitatAnlegenMutate }),
  useZitatAendern: () => ({ mutate: zitatAendernMutate }),
  useZitatLoeschen: () => ({ mutate: zitatLoeschenMutate }),
}))

vi.mock('../../src/renderer/brücke/abfrage-hooks', () => ({
  useArchivSuche: () => ({ data: undefined, isPending: false }),
  useSuche: () => ({ data: undefined, isPending: false }),
}))

import { QuelleBearbeitenInhalt } from '../../src/renderer/ansichten/quellen/quelle-bearbeiten'
import type { QuelleDetailAus, QuelleDetailKopf, QuelleDetailZitat } from '../../src/shared/schemata/quelle-detail'

function quelleKopf(ueberschreibung: Partial<QuelleDetailKopf> = {}): QuelleDetailKopf {
  return {
    id: 'quelle-1',
    typ: 'kirchenbuch',
    titel: null,
    autor: null,
    verlag: null,
    jahr: null,
    art: null,
    informationsart: null,
    archiv_id: null,
    archiv_name: null,
    signatur: null,
    notiz: null,
    informant_person_id: null,
    informant_anzeigename: null,
    gespraechsdatum_kalender: null,
    gespraechsdatum_modifikator: null,
    gespraechsdatum_praezision: null,
    gespraechsdatum_wert1: null,
    gespraechsdatum_wert2: null,
    gespraechsdatum_originaltext: null,
    gespraechsdatum_zweitkalender: null,
    gespraechsdatum_zweitwert: null,
    gespraechsdatum_doppeljahr: null,
    form: null,
    unmittelbarkeit: null,
    audio_medium_id: null,
    ...ueberschreibung,
  }
}

function zitatZeile(ueberschreibung: Partial<QuelleDetailZitat> = {}): QuelleDetailZitat {
  return {
    id: 'zitat-1',
    seite: null,
    eintragsnummer: null,
    band: null,
    jahr: null,
    zugriffsdatum_kalender: null,
    zugriffsdatum_modifikator: null,
    zugriffsdatum_praezision: null,
    zugriffsdatum_wert1: null,
    zugriffsdatum_wert2: null,
    zugriffsdatum_originaltext: null,
    zugriffsdatum_zweitkalender: null,
    zugriffsdatum_zweitwert: null,
    zugriffsdatum_doppeljahr: null,
    zeitmarke_sekunden: null,
    digitalisat_url: null,
    transkript: null,
    uebersetzung: null,
    konfidenz: null,
    medium_id: null,
    ...ueberschreibung,
  }
}

function quelleDetail(ueberschreibung: Partial<QuelleDetailAus> = {}): QuelleDetailAus {
  return { kopf: quelleKopf(), zitate: [], ...ueberschreibung }
}

describe('QuelleBearbeitenInhalt (AP-1.17 PR-C1)', () => {
  // `not.toContain('Mündliche Quelle')` wäre hier ein falscher Test — das Wort steht IMMER im
  // Markup, als Option des "typ"-Auswahlfelds (`<option value="muendlich">Mündliche Quelle</option>`,
  // unabhängig vom aktuell gewählten Typ). Die eindeutige Zusicherung ist die CSS-Klasse des
  // mündlich-Blocks selbst.
  it('typ "kirchenbuch": KEIN mündlich-Block sichtbar', () => {
    const markup = renderToStaticMarkup(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail({ kopf: quelleKopf({ typ: 'kirchenbuch' }) })} />)
    expect(markup).not.toContain('wz-quelle-bearbeiten__muendlich')
  })

  it('typ "muendlich": der mündlich-Block ERSCHEINT (Informant/Datum/Form/Unmittelbarkeit)', () => {
    const markup = renderToStaticMarkup(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail({ kopf: quelleKopf({ typ: 'muendlich' }) })} />)
    expect(markup).toContain('wz-quelle-bearbeiten__muendlich')
    expect(markup).toContain('Informant')
  })

  it('ohne Zitate: zeigt den Leerzustandstext', () => {
    const markup = renderToStaticMarkup(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail()} />)
    expect(markup).toContain('Noch kein Zitat erfasst.')
  })

  it('mit einem Zitat: zeigt dessen Seite/Transkript als vorbefüllte Werte', () => {
    const markup = renderToStaticMarkup(
      <QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail({ zitate: [zitatZeile({ seite: '42', transkript: 'Getauft wurde…' })] })} />,
    )
    expect(markup).toContain('value="42"')
    expect(markup).toContain('Getauft wurde…')
  })

  it('bereits gewähltes Archiv: der Archivfeld-Suchtext ist mit dem Archivnamen vorbefüllt', () => {
    const markup = renderToStaticMarkup(
      <QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail({ kopf: quelleKopf({ archiv_id: 'archiv-1', archiv_name: 'Landesarchiv Berlin' }) })} />,
    )
    expect(markup).toContain('value="Landesarchiv Berlin"')
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(
      <QuelleBearbeitenInhalt
        quelleId="quelle-1"
        daten={quelleDetail({ kopf: quelleKopf({ typ: 'muendlich' }), zitate: [zitatZeile({ seite: '1' })] })}
      />,
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  it('kein JSX-Zeichenkettenliteral — jeder sichtbare Text kommt aus i18n (Stichprobe)', () => {
    const markup = renderToStaticMarkup(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail()} />)
    expect(markup).toContain('Stammdaten')
    expect(markup).toContain('Zitate')
  })
})
