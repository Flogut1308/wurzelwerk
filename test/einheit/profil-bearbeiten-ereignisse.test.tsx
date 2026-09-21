// AP-1.15 PR-A: `profil-bearbeiten-logik.ts` (reine Ereignis-Umrechnungen, Muster
// `profil-bearbeiten-namen.test.tsx`) UND `EreignisseBearbeitenAbschnitt` (`renderToStaticMarkup`,
// vitest läuft mit `environment: 'node'`). Befehl- UND Abfrage-Hooks hängen an
// `@tanstack/react-query` (brauchen einen `QueryClientProvider`) und werden darum gemockt, je EIN
// `mutate`-Spion pro Kanal.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// Seiteneffekt: initialisiert die einzige i18next-Instanz synchron (Muster `profil-bearbeiten-namen.test.tsx`).
import '../../src/renderer/i18n/einrichten'

const ereignisAnlegenMutate = vi.fn()
const ereignisLoeschenMutate = vi.fn()
const beteiligungLoeschenMutate = vi.fn()
const ortAnlegenMutateAsync = vi.fn()
const personAnlegenMutateAsync = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useEreignisAnlegen: () => ({ mutate: ereignisAnlegenMutate }),
  useEreignisLoeschen: () => ({ mutate: ereignisLoeschenMutate }),
  useBeteiligungLoeschen: () => ({ mutate: beteiligungLoeschenMutate }),
  useOrtAnlegen: () => ({ mutateAsync: ortAnlegenMutateAsync }),
  usePersonAnlegen: () => ({ mutateAsync: personAnlegenMutateAsync }),
}))

vi.mock('../../src/renderer/brücke/abfrage-hooks', () => ({
  useSuche: () => ({ data: undefined, isPending: false }),
  useOrtSuche: () => ({ data: undefined, isPending: false }),
}))

import { EreignisseBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-ereignisse'
import {
  EREIGNIS_ENTWURF_LEER,
  ereignisAnlegenEinAusEntwurf,
  ereignisDatumwertAusEntwurf,
  ereignisEntwurfAbsendbar,
  ereignisEntwurfDatumIstGueltig,
  ereignisEntwurfJdn,
  weitererBeteiligterLeer,
  type EreignisEntwurfWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailEreignis } from '../../src/shared/schemata/person-detail'

function ereignis(ueberschreibung: Partial<PersonDetailEreignis> = {}): PersonDetailEreignis {
  return {
    ereignis_id: 'ereignis-1',
    beteiligung_id: 'beteiligung-1',
    typ: 'taufe',
    rolle: 'hauptperson',
    datum_wert1: '1850-03-14',
    datum_sort_von: 1000,
    ort_name: 'Kwidzyn',
    beschreibung: null,
    ...ueberschreibung,
  }
}

describe('profil-bearbeiten-logik: Ereignisse (AP-1.15 PR-A)', () => {
  it('ereignisEntwurfDatumIstGueltig: leerer Text ist gültig (Datum ist optional)', () => {
    expect(ereignisEntwurfDatumIstGueltig('')).toBe(true)
    expect(ereignisEntwurfDatumIstGueltig('   ')).toBe(true)
  })

  it('ereignisEntwurfDatumIstGueltig: auflösbarer Text ist gültig, unbekanntes Format nicht', () => {
    expect(ereignisEntwurfDatumIstGueltig('14.3.1850')).toBe(true)
    expect(ereignisEntwurfDatumIstGueltig('völliger Unsinn')).toBe(false)
  })

  it('ereignisDatumwertAusEntwurf: leerer Text -> undefined', () => {
    expect(ereignisDatumwertAusEntwurf('', 'gregorian')).toBeUndefined()
  })

  it('ereignisDatumwertAusEntwurf: ein auflösbares Datum trägt kalender/modifikator/praezision/wert1', () => {
    const wert = ereignisDatumwertAusEntwurf('14.3.1850', 'gregorian')
    expect(wert?.kalender).toBe('gregorian')
    expect(wert?.modifikator).toBe('exakt')
    expect(wert?.praezision).toBe('tag')
    expect(wert?.wert1).toBe('1850-03-14')
  })

  it('ereignisEntwurfAbsendbar: ohne Konfidenz nicht absendbar', () => {
    expect(ereignisEntwurfAbsendbar(EREIGNIS_ENTWURF_LEER)).toBe(false)
  })

  it('ereignisEntwurfAbsendbar: mit Konfidenz UND gültigem (leerem) Datum absendbar', () => {
    const entwurf: EreignisEntwurfWerte = { ...EREIGNIS_ENTWURF_LEER, konfidenz: 3 }
    expect(ereignisEntwurfAbsendbar(entwurf)).toBe(true)
  })

  it('ereignisEntwurfAbsendbar: eine unaufgelöste weitere Beteiligten-Zeile sperrt das Absenden', () => {
    const entwurf: EreignisEntwurfWerte = {
      ...EREIGNIS_ENTWURF_LEER,
      konfidenz: 3,
      weitereBeteiligte: [weitererBeteiligterLeer('zeile-1')],
    }
    expect(ereignisEntwurfAbsendbar(entwurf)).toBe(false)
  })

  it('ereignisAnlegenEinAusEntwurf: null ohne Konfidenz', () => {
    expect(ereignisAnlegenEinAusEntwurf('person-1', EREIGNIS_ENTWURF_LEER)).toBeNull()
  })

  it('ereignisAnlegenEinAusEntwurf: Hauptperson IMMER zuerst mit rolle hauptperson, danach die aufgelösten weiteren Beteiligten', () => {
    const entwurf: EreignisEntwurfWerte = {
      ...EREIGNIS_ENTWURF_LEER,
      typ: 'taufe',
      konfidenz: 3,
      weitereBeteiligte: [{ schluessel: 'zeile-1', personId: 'person-2', rolle: 'pate' }],
    }
    expect(ereignisAnlegenEinAusEntwurf('person-1', entwurf)).toEqual({
      typ: 'taufe',
      ortId: undefined,
      datum: undefined,
      beteiligungen: [
        { personId: 'person-1', rolle: 'hauptperson' },
        { personId: 'person-2', rolle: 'pate' },
      ],
      konfidenz: 3,
    })
  })

  it('weitererBeteiligterLeer: personId null, Standardrolle informant', () => {
    expect(weitererBeteiligterLeer('zeile-1')).toEqual({ schluessel: 'zeile-1', personId: null, rolle: 'informant' })
  })

  it('ereignisEntwurfJdn: leerer Text -> undefined (Ortsfeld sucht ohne jdn, AP-1.16 PR-C)', () => {
    expect(ereignisEntwurfJdn('')).toBeUndefined()
    expect(ereignisEntwurfJdn('   ')).toBeUndefined()
  })

  it('ereignisEntwurfJdn: nicht auflösbarer Text -> undefined', () => {
    expect(ereignisEntwurfJdn('völliger Unsinn')).toBeUndefined()
  })

  it('ereignisEntwurfJdn: auflösbares Datum liefert seinen sortVon-JDN', () => {
    expect(ereignisEntwurfJdn('14.3.1850')).toBeTypeOf('number')
  })
})

describe('EreignisseBearbeitenAbschnitt (AP-1.15 PR-A)', () => {
  it('ohne Ereignisse: zeigt den Leerzustandstext, KEINE Liste', () => {
    const markup = renderToStaticMarkup(<EreignisseBearbeitenAbschnitt personId="person-1" ereignisse={[]} />)
    expect(markup).not.toContain('wz-profil-bearbeiten-ereignisse__liste')
    expect(markup).toContain('Noch kein Ereignis erfasst.')
  })

  it('mit einem Ereignis: zeigt eine Zeile MIT "Beteiligung entfernen" UND "Ereignis löschen"', () => {
    const markup = renderToStaticMarkup(<EreignisseBearbeitenAbschnitt personId="person-1" ereignisse={[ereignis()]} />)
    expect(markup).toContain('wz-profil-bearbeiten-ereignisse__zeile')
    expect(markup).toContain('Beteiligung entfernen')
    expect(markup).toContain('Ereignis löschen')
  })

  it('mit mehreren Ereignissen: eine Zeile je Beteiligung', () => {
    const markup = renderToStaticMarkup(
      <EreignisseBearbeitenAbschnitt
        personId="person-1"
        ereignisse={[ereignis({ beteiligung_id: 'a' }), ereignis({ beteiligung_id: 'b', typ: 'geburt' })]}
      />,
    )
    expect((markup.match(/wz-profil-bearbeiten-ereignisse__zeile"/g) ?? []).length).toBe(2)
  })

  it('das "neues Ereignis erfassen"-Formular ist ein echtes <form>, ohne gewählte Konfidenz gesperrt', () => {
    const markup = renderToStaticMarkup(<EreignisseBearbeitenAbschnitt personId="person-1" ereignisse={[]} />)
    expect(markup).toContain('<form')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Ereignis anlegen</)
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(<EreignisseBearbeitenAbschnitt personId="person-1" ereignisse={[ereignis()]} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  it('kein JSX-Zeichenkettenliteral — jeder sichtbare Text kommt aus i18n (Stichprobe)', () => {
    const markup = renderToStaticMarkup(<EreignisseBearbeitenAbschnitt personId="person-1" ereignisse={[ereignis()]} />)
    expect(markup).toContain('Ereignisse')
    expect(markup).toContain('Taufe')
  })
})
