// @vitest-environment jsdom
//
// A-02, AP-1.30 PR 11e-1, Review #215 (B1/B2/H2; docs/80 §33 V-130-11e-1). Übernommen aus der
// Gegenbeispiel-Datei des Reviewers (`h215-gegenbeispiele.test.tsx`), angepasst an den Weg der Oberfläche:
// der Reiter Person führt jede Vornamen-Änderung über `mitVornamen` (vorheriger Entwurf → neuer Entwurf),
// darum prüft `pos` den Entwurf NACH `mitVornamen`, nicht einen von Hand gespreizten Eintrag.
//
// Maßstab (B1): die Markierung folgt dem markierten Wort oder entfällt — sie springt NIE auf ein anderes
// Wort. B2: kein Hilfsfeld im Entwurf, das das Echo des eigenen Schreibens „fremd" aussehen lässt.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({ protokollFehler: vi.fn(), protokollInfo: vi.fn(), protokollDebug: vi.fn() }))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'
import {
  NAMEN_EINTRAG_LEER,
  geaendertesNamensFeld,
  mitRufnameAusAuswahl,
  mitVornamen,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const BASIS: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'geburtsname', nachname: 'G' }
function gewaehlt(vornamen: string, index: string): NamenEintragWerte {
  return mitRufnameAusAuswahl({ ...BASIS, vornamen }, index)
}
function pos(e: NamenEintragWerte, vornamen: string): string {
  return rufnameAuswahlWert(mitVornamen(e, vornamen))
}
/** Der markierte Vorname nach der Änderung — `''`, wenn keiner markiert ist. */
function markiert(e: NamenEintragWerte, vornamen: string): string {
  const nachher = mitVornamen(e, vornamen)
  const wert = rufnameAuswahlWert(nachher)
  return rufnameAuswahlVornamen(nachher).find((option) => option.wert === wert)?.vorname ?? ''
}

describe('h215 B1: keine falsche Markierung (Soll = das markierte Wort oder keine Markierung)', () => {
  it('G1 vorne eingefügt vor markiertem ERSTEN Wort: Friedrich bleibt markiert (nicht Karl)', () => {
    expect(pos(gewaehlt('Friedrich', '0'), 'Karl Friedrich')).toBe('1')
  })
  it('G2 in der Mitte eingefügt vor markiertem LETZTEN Wort: Friedrich bleibt markiert (nicht W)', () => {
    expect(pos(gewaehlt('Karl Friedrich', '1'), 'Karl W Friedrich')).toBe('2')
  })
  it('G3 in der Mitte eingefügt vor markiertem MITTLEREN Wort', () => {
    expect(pos(gewaehlt('Karl Friedrich Wilhelm', '1'), 'Karl Otto Friedrich Wilhelm')).toBe('2')
  })
  it('G4 Johann Johann, zweites markiert, vorne Hans eingefügt', () => {
    expect(pos(gewaehlt('Johann Johann', '1'), 'Hans Johann Johann')).toBe('2')
  })
  it('G5 Einfügen per Zwischenablage ersetzt alles durch ein anderes Wort: keine Markierung auf fremdem Namen', () => {
    expect(pos(gewaehlt('Karl Friedrich', '1'), 'Anna')).toBe('')
  })
  it('G6 Kontrolle: vorne umschreiben, die Markierung bleibt am unveränderten Friedrich', () => {
    expect(pos(gewaehlt('Karl Friedrich', '1'), 'Carl Friedrich')).toBe('1')
  })
  it('G7 mehrdeutig eingefügt („Johann Johann" → „Johann Johann Johann" in einem Schritt): Markierung entfällt statt zu raten', () => {
    expect(pos(gewaehlt('Johann Johann', '1'), 'Johann Johann Johann')).toBe('')
    expect(pos(gewaehlt('Johann Johann', '0'), 'Johann Johann Johann')).toBe('')
  })
  it('G8 ersetzt durch Vertauschen („Karl Friedrich" → „Friedrich Karl", Karl markiert): Markierung entfällt', () => {
    expect(pos(gewaehlt('Karl Friedrich', '0'), 'Friedrich Karl')).toBe('')
  })
  it('G9 das markierte Wort und ein Nachbar in einem Schritt geändert: Markierung entfällt', () => {
    expect(pos(gewaehlt('Karl Friedrich Wilhelm', '1'), 'Karl Fritz Willi')).toBe('')
  })
  it('das markierte Wort umgeschrieben (gleiche Wortzahl, nur dieses Wort anders): die Markierung wandert mit', () => {
    expect(markiert(gewaehlt('Karl Friedrich', '1'), 'Karl Friedric')).toBe('Friedric')
    expect(markiert(gewaehlt('Johann Georg Johann', '2'), 'Johann Georg Jo')).toBe('Jo')
    expect(pos(gewaehlt('Johann Georg Johann', '2'), 'Johann Georg Jo')).toBe('2')
  })
  it('das markierte Wort gelöscht: Markierung entfällt, springt nicht auf den Nachbarn', () => {
    expect(pos(gewaehlt('Karl Friedrich', '1'), 'Karl')).toBe('')
    expect(pos(gewaehlt('Karl Friedrich', '0'), 'Friedrich')).toBe('')
    expect(pos(gewaehlt('Karl Friedrich Wilhelm', '1'), 'Karl Wilhelm')).toBe('')
  })
  it('ein anderes Wort gelöscht: die Markierung bleibt am markierten Wort', () => {
    expect(pos(gewaehlt('Karl Friedrich Wilhelm', '2'), 'Karl Wilhelm')).toBe('1')
    expect(pos(gewaehlt('Karl Friedrich Wilhelm', '0'), 'Karl Wilhelm')).toBe('0')
  })
  it('Rufname ohne Index: ein davor gleich umgeschriebenes Wort zieht die Markierung nicht auf sich', () => {
    const ohneIndex = { ...BASIS, vornamen: 'Karl Friedrich', rufname: 'Friedrich', rufnameIndex: null }
    expect(pos(ohneIndex, 'Friedrich Friedrich')).toBe('1')
  })
  it('ohne Markierung setzt eine Vornamen-Änderung keine (kein Rufname erfunden)', () => {
    const ohne = { ...BASIS, vornamen: 'Karl Friedrich' }
    expect(mitVornamen(ohne, 'Karl Fritz')).toEqual({ ...ohne, vornamen: 'Karl Fritz' })
  })
})

describe('h215 H2: mehrwortiger angehängter Rufname', () => {
  const HANS_PETER = { ...BASIS, vornamen: 'Karl Hans Peter', rufname: 'Hans Peter', rufnameIndex: 1 }
  it('„Hans Peter" → „Hans Pete": die Markierung entfällt, sie zerfällt nicht auf das halbe Wort „Hans"', () => {
    expect(pos(HANS_PETER, 'Karl Hans Pete')).toBe('')
    expect(nameAendernEinAusEintrag('n-1', mitVornamen(HANS_PETER, 'Karl Hans Pete'))).toMatchObject({ vornamen: 'Karl Hans Pete', rufnameText: undefined, rufnameIndex: undefined })
  })
  it('ein anderer Vorname umgeschrieben: „Hans Peter" bleibt als EINE Einheit markiert', () => {
    expect(markiert(HANS_PETER, 'Carl Hans Peter')).toBe('Hans Peter')
    expect(nameAendernEinAusEintrag('n-1', mitVornamen(HANS_PETER, 'Carl Hans Peter'))).toMatchObject({ vornamen: 'Carl', rufnameText: 'Hans Peter' })
  })
})

type Db = ReturnType<typeof oeffnen>
function lies(db: Db, personId: string, id: string): NamenEintragWerte {
  const n = personDetail(db, { personId }).namen.find((k) => k.id === id)
  if (n === undefined) throw new Error('fehlt')
  return namenEintragAusPersonDetailName(n)
}
function gespeichert(db: Db, personId: string, id: string): readonly unknown[] {
  const n = personDetail(db, { personId }).namen.find((k) => k.id === id)
  return [n?.vornamen, n?.rufname_text, n?.rufname_index]
}

describe('h215 DB-Rundreise: Einfügen vor dem markierten ersten Vornamen', () => {
  it('„Friedrich" (Rufname) → „Karl Friedrich" in einem Schreibvorgang: Rufname bleibt Friedrich', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Friedrich', rufnameText: 'Friedrich', nachname: 'G' })
      // Draft-behalten-Pfad: ein einziger Schreibvorgang des Endstands gegen den gelesenen Stand.
      const gelesen = lies(db, personId, id)
      const naechster = { ...gelesen, vornamen: 'Karl Friedrich' }
      fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(id, naechster, geaendertesNamensFeld(gelesen, naechster)))
      expect(gespeichert(db, personId, id)).toEqual(['Karl Friedrich', 'Friedrich', 1])
    } finally {
      db.close()
    }
  })

  it('dasselbe über den Weg der Oberfläche (`mitVornamen`) in einem Schritt', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Friedrich', rufnameText: 'Friedrich', nachname: 'G' })
      const gelesen = lies(db, personId, id)
      const naechster = mitVornamen(gelesen, 'Karl Friedrich')
      fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(id, naechster, geaendertesNamensFeld(gelesen, naechster)))
      expect(gespeichert(db, personId, id)).toEqual(['Karl Friedrich', 'Friedrich', 1])
    } finally {
      db.close()
    }
  })

  // Grenze (docs/80 V-130-11e-1): Zeichen für Zeichen VOR dem markierten Wort getippt, wächst erst das
  // markierte Wort selbst („KFriedrich" … „KarlFriedrich"), das Leerzeichen spaltet es dann in zwei. Welche
  // Hälfte „das" Wort ist, ist nicht entscheidbar — die Markierung entfällt, sie springt nicht auf „Karl".
  it('Zeichen für Zeichen vor dem markierten Wort getippt: am Ende keine Markierung, nie „Karl"', () => {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Friedrich', rufnameText: 'Friedrich', nachname: 'G' })
      for (const vornamen of ['KFriedrich', 'KaFriedrich', 'KarFriedrich', 'KarlFriedrich', 'Karl Friedrich']) {
        const gelesen = lies(db, personId, id)
        const naechster = mitVornamen(gelesen, vornamen)
        fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(id, naechster, geaendertesNamensFeld(gelesen, naechster)))
        const stand = gespeichert(db, personId, id)
        expect(stand[1]).not.toBe('Karl')
      }
      expect(gespeichert(db, personId, id)).toEqual(['Karl Friedrich', null, null])
    } finally {
      db.close()
    }
  })
})

interface Steuerung {
  entwurf: NamenEintragWerte | undefined
  setEntwurf: (w: NamenEintragWerte) => void
}
function Harness({ wert, aufCommit, s }: { readonly wert: NamenEintragWerte; readonly aufCommit: (w: NamenEintragWerte) => void; readonly s: Steuerung }) {
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  s.entwurf = entwurf
  s.setEntwurf = setEntwurf
  return null
}

describe('h215 B2: Echo-Schutz (U-130-fix-ablauf07-nachladen) mit echter NamenEintragWerte-Zeile', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  /** Schreiben, vor dem Nachladen weitertippen, dann das Echo nachladen — der neuere Anschlag muss stehen. */
  function anschlagVorEcho(anlegen: { readonly vornamen: string; readonly rufnameText?: string }, erster: string, zweiter: string): NamenEintragWerte | undefined {
    const db = oeffnen(':memory:')
    migrieren(db)
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'G', ...anlegen })
      const s: Steuerung = { entwurf: undefined, setEntwurf: () => {} }
      let gelesen = lies(db, personId, id)
      const aufCommit = vi.fn((e: NamenEintragWerte) => {
        fuehreAus(db, 'name.aendern', nameAendernEinAusEintrag(id, e, geaendertesNamensFeld(gelesen, e)))
      })
      const zeige = (w: NamenEintragWerte) => act(() => root.render(<Harness wert={w} aufCommit={aufCommit} s={s} />))
      zeige(gelesen)
      const eins = s.entwurf
      if (eins === undefined) throw new Error('kein Entwurf')
      act(() => s.setEntwurf(mitVornamen(eins, erster)))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufCommit).toHaveBeenCalledTimes(1)
      const zwei = s.entwurf
      if (zwei === undefined) throw new Error('kein Entwurf')
      act(() => s.setEntwurf(mitVornamen(zwei, zweiter))) // vor dem Nachladen
      gelesen = lies(db, personId, id) // Echo des ersten Schreibens
      zeige(gelesen)
      const ergebnis = s.entwurf
      // Aushängen, solange die Datenbank offen ist (der Unmount-Flush schreibt den ausstehenden Entwurf).
      act(() => root.unmount())
      root = createRoot(container)
      return ergebnis
    } finally {
      db.close()
    }
  }

  it('Anschlag in den Vornamen zwischen Schreiben und Nachladen geht nicht verloren', () => {
    expect(anschlagVorEcho({ vornamen: 'Karl' }, 'Karl F', 'Karl Fr')?.vornamen).toBe('Karl Fr')
  })

  it('auch mit gesetztem Rufnamen an einem anderen Vornamen', () => {
    expect(anschlagVorEcho({ vornamen: 'Karl', rufnameText: 'Karl' }, 'Karl F', 'Karl Fr')).toMatchObject({ vornamen: 'Karl Fr', rufname: 'Karl', rufnameIndex: 0 })
  })

  it('beim Umschreiben des markierten Worts: der Anschlag bleibt, der Rufname folgt ihm', () => {
    expect(anschlagVorEcho({ vornamen: 'Karl Friedrich', rufnameText: 'Friedrich' }, 'Karl Friedric', 'Karl Friedri')).toMatchObject({
      vornamen: 'Karl Friedri',
      rufname: 'Friedri',
      rufnameIndex: 1,
    })
  })
})
