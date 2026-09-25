// AP-1.30 PR 2 (docs/80_Offene_Fragen.md §32 V-4-ohne-namen) — rot zuerst (CLAUDE.md §5): an den
// Aufrufstellen, die einen Personen-Anzeigenamen zeigen, erscheint bei leerem Namen „(ohne Namen)"
// statt einer leeren Stelle; Platzhalter behalten „Platzhalter". `renderToStaticMarkup` wie
// `personenwaehler.test.tsx`/`quelle-bearbeiten.test.tsx` (vitest `environment: 'node'`).
// Beide Hook-Module werden vollständig durch Stummel ersetzt: jede Komponente, die hier gerendert
// wird, sieht nur die Daten, die der Test ihr gibt — kein QueryClient, kein IPC.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// Seiteneffekt: initialisiert die einzige i18next-Instanz synchron (Muster `quelle-bearbeiten.test.tsx`).
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailAus, PersonDetailBeziehung, PersonDetailKopf } from '../../src/shared/schemata/person-detail'
import type { PersonListeZeile, SucheTreffer } from '../../src/shared/schemata/person-liste'
import type { QuelleDetailKopf } from '../../src/shared/schemata/quelle-detail'

const personDetail: { aktuell: PersonDetailAus | undefined } = { aktuell: undefined }

function stummelHooks(original: Readonly<Record<string, unknown>>, stummel: () => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.keys(original).map((name) => [name, stummel]))
}

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...stummelHooks(original, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })),
    usePersonDetail: () => ({ data: personDetail.aktuell, isPending: false, isSuccess: personDetail.aktuell !== undefined, isError: false }),
  }
})

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return stummelHooks(original, () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }))
})

import { ProfilAnsicht } from '../../src/renderer/ansichten/profil/profil-ansicht'
import { QuelleBearbeitenInhalt } from '../../src/renderer/ansichten/quellen/quelle-bearbeiten'
import { Personenwaehler } from '../../src/renderer/bausteine/personenwaehler'
import { Tabellenzeile } from '../../src/renderer/bausteine/tabellenzeile'

const OHNE_NAMEN = '(ohne Namen)'

function listenZeile(ueberschreibung: Partial<PersonListeZeile> = {}): PersonListeZeile {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    geburt_jahr: null,
    tod_jahr: null,
    geburt_ort_name: null,
    konfidenz_min: null,
    hat_widerspruch: false,
    ist_platzhalter: false,
    beruf: null,
    belegzahl: 0,
    kinderzahl: 0,
    geburt_datum: null,
    tod_datum: null,
    ...ueberschreibung,
  }
}

function treffer(ueberschreibung: Partial<SucheTreffer> = {}): SucheTreffer {
  return { ...listenZeile(), quelle: 'volltext', ...ueberschreibung }
}

function kopf(ueberschreibung: Partial<PersonDetailKopf> = {}): PersonDetailKopf {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    konfidenz_min: null,
    ist_platzhalter: false,
    privat: false,
    geschlecht: null,
    platzhalter_grund: null,
    kennung: 1,
    lebend_status: null,
    ...ueberschreibung,
  }
}

function beziehung(ueberschreibung: Partial<PersonDetailBeziehung> = {}): PersonDetailBeziehung {
  return { person_id: 'p-2', anzeigename: 'Karl Beispiel', richtung: 'elternteil', kantentyp: 'biologisch', ist_platzhalter: false, ...ueberschreibung }
}

function detail(ueberschreibung: Partial<PersonDetailAus> = {}): PersonDetailAus {
  return {
    kopf: kopf(),
    namen: [],
    grunddaten: [],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 0,
    ...ueberschreibung,
  }
}

function profilMarkup(daten: PersonDetailAus): string {
  personDetail.aktuell = daten
  return renderToStaticMarkup(<ProfilAnsicht personId="p-1" aufSchliessen={() => {}} />)
}

/** Inhalt des ersten `<h1>` — der Profilkopf. */
function ueberschrift(markup: string): string {
  const treffer = /<h1[^>]*>(.*?)<\/h1>/.exec(markup)
  return treffer?.[1] ?? ''
}

describe('Liste — Tabellenzeile (§32 V-4-ohne-namen)', () => {
  it('leerer Anzeigename zeigt „(ohne Namen)"', () => {
    const markup = renderToStaticMarkup(<Tabellenzeile zeile={listenZeile({ anzeigename: '' })} spalten={['name']} />)
    expect(markup).toContain(OHNE_NAMEN)
  })

  it('Anzeigename nur aus Leerraum zeigt „(ohne Namen)"', () => {
    const markup = renderToStaticMarkup(<Tabellenzeile zeile={listenZeile({ anzeigename: '   ' })} spalten={['name']} />)
    expect(markup).toContain(OHNE_NAMEN)
  })

  it('der Ersatztext ist als Hilfstext gesetzt (tertiär wie Platzhalter)', () => {
    const markup = renderToStaticMarkup(<Tabellenzeile zeile={listenZeile({ anzeigename: '' })} spalten={['name']} />)
    expect(markup).toContain('wz-text--farbe-tertiaer')
  })

  it('Platzhalter behält „Platzhalter", ein Name bleibt der Name', () => {
    const platzhalter = renderToStaticMarkup(<Tabellenzeile zeile={listenZeile({ anzeigename: '', ist_platzhalter: true })} spalten={['name']} />)
    expect(platzhalter).toContain('Platzhalter')
    expect(platzhalter).not.toContain(OHNE_NAMEN)
    const name = renderToStaticMarkup(<Tabellenzeile zeile={listenZeile()} spalten={['name']} />)
    expect(name).toContain('Anna Beispiel')
    expect(name).not.toContain(OHNE_NAMEN)
  })
})

describe('Personenwähler/Suche (§32 V-4-ohne-namen)', () => {
  it('ein Treffer mit leerem Anzeigenamen zeigt „(ohne Namen)"', () => {
    const markup = renderToStaticMarkup(
      <Personenwaehler
        text="1890"
        zustand="bereit"
        treffer={[treffer({ anzeigename: '' })]}
        hervorgehobenerIndex={null}
        aufAenderung={() => {}}
        aufAusgewaehlt={() => {}}
        aufNeuAnlegen={() => {}}
        aufPlatzhalterAnlegen={() => {}}
      />,
    )
    expect(markup).toContain(OHNE_NAMEN)
  })
})

describe('Profil (§32 V-4-ohne-namen)', () => {
  it('Profilkopf: leerer Anzeigename zeigt „(ohne Namen)" als Überschrift', () => {
    expect(ueberschrift(profilMarkup(detail({ kopf: kopf({ anzeigename: '' }) })))).toBe(OHNE_NAMEN)
  })

  it('Profilkopf: Platzhalter behält „Platzhalter", ein Name bleibt der Name', () => {
    expect(ueberschrift(profilMarkup(detail({ kopf: kopf({ anzeigename: '', ist_platzhalter: true }) })))).toBe('Platzhalter')
    expect(ueberschrift(profilMarkup(detail()))).toBe('Anna Beispiel')
  })

  it('Beziehungen: ein Elternteil ohne Namen zeigt „(ohne Namen)" ohne Platzhalter-Rahmen', () => {
    const markup = profilMarkup(detail({ beziehungen: [beziehung({ anzeigename: '' })] }))
    expect(markup).toContain(OHNE_NAMEN)
    expect(markup).not.toContain('wz-profil-ansicht__beziehung--platzhalter')
  })
})

describe('Quelle — Informant (§32 V-4-ohne-namen)', () => {
  it('ein Informant ohne Namen zeigt „Ausgewählt: (ohne Namen)"', () => {
    const quelleKopf: QuelleDetailKopf = {
      id: 'quelle-1',
      typ: 'muendlich',
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
      informant_person_id: 'p-9',
      informant_anzeigename: '',
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
    }
    const markup = renderToStaticMarkup(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={{ kopf: quelleKopf, zitate: [] }} />)
    expect(markup).toContain(`Ausgewählt: ${OHNE_NAMEN}`)
  })
})
