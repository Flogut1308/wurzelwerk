// AP-1.30 (PR 4), Abnahme „Jeder Befehl, den der Autosave schreibt, bekommt einen Schlüssel
// (Befehl + Subjekt + Feld); ohne ihn ist Akzeptanzkriterium 1a nicht erfüllt" — Strukturtest:
//
// 1. Jeder Befehl in `AUTOSAVE_BEFEHLE` (src/shared/autosave.ts) hat in der Registrierung eine
//    Schlüsselfunktion und liefert für eine Ein-Feld-Änderung genau `Befehl:Subjekt:Feld`.
// 2. Abgleich mit den Renderer-Aufrufstellen: jede Datei, die den Autosave-Hook
//    (`useEntwurfMitVerzoegertemCommit`) benutzt, schreibt über Mutations-Hooks aus
//    `src/renderer/brücke/befehl-hooks.ts`; jeder dort benutzte ändernde Befehl (`*.aendern`,
//    `person.feldSetzen`) steht in `AUTOSAVE_BEFEHLE` — oder ausdrücklich in
//    `BEKANNT_OHNE_SCHLUESSEL` (Editoren außerhalb von AP-1.30, Folgepaket). Die Ausnahmeliste darf
//    nur schrumpfen: ein Eintrag, den keine Aufrufstelle mehr braucht oder der inzwischen einen
//    Schlüssel hat, macht den Test rot.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { REGISTRIERUNG } from '../../src/main/befehle/registrierung'
import { AUTOSAVE_BEFEHLE } from '../../src/shared/autosave'
import { SZENARIEN } from '../hilfsmittel/autosave-szenarien'

/** Autosave-Editoren außerhalb von AP-1.30 (Orte, Quellen, Negativbefunde) — schreiben debounced,
 * tragen aber (noch) keinen Koaleszenzschlüssel. Nur schrumpfen lassen (s. Kopfkommentar). */
const BEKANNT_OHNE_SCHLUESSEL: ReadonlySet<string> = new Set([
  'negativbefund.aendern',
  'ortsname.aendern',
  'ortszugehoerigkeit.aendern',
  'quelle.aendern',
  'zitat.aendern',
])

const RENDERER = join(__dirname, '../../src/renderer')

function alleTsx(verzeichnis: string): readonly string[] {
  return readdirSync(verzeichnis).flatMap((eintrag) => {
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) return alleTsx(pfad)
    return pfad.endsWith('.tsx') ? [pfad] : []
  })
}

/** `useXyz` → Befehlsname, gelesen aus `befehl-hooks.ts` (`export function useXyz(): … Ein<'befehl:NAME'>`). */
function hookZuBefehl(): ReadonlyMap<string, string> {
  const quelle = readFileSync(join(RENDERER, 'brücke/befehl-hooks.ts'), 'utf8')
  const karte = new Map<string, string>()
  for (const treffer of quelle.matchAll(/export function (use\w+)\(\)[^\n]*Ein<'befehl:([\w.-]+)'>/gu)) {
    const hook = treffer[1]
    const befehl = treffer[2]
    if (hook !== undefined && befehl !== undefined) karte.set(hook, befehl)
  }
  return karte
}

function autosaveAufrufstellen(): ReadonlyMap<string, readonly string[]> {
  const hooks = hookZuBefehl()
  const ergebnis = new Map<string, readonly string[]>()
  for (const datei of alleTsx(RENDERER)) {
    const quelle = readFileSync(datei, 'utf8')
    if (!quelle.includes('useEntwurfMitVerzoegertemCommit(') && !quelle.includes('useEntwurfMitVerzoegertemCommit<')) continue
    const befehle = [...hooks.entries()]
      .filter(([hook]) => new RegExp(`\\b${hook}\\(\\)`, 'u').test(quelle))
      .map(([, befehl]) => befehl)
      .filter((befehl) => befehl.endsWith('.aendern') || befehl === 'person.feldSetzen')
    ergebnis.set(datei, befehle)
  }
  return ergebnis
}

describe('AUTOSAVE_BEFEHLE — jeder Autosave-Befehl trägt einen Koaleszenzschlüssel (AP-1.30 PR 4)', () => {
  for (const befehl of AUTOSAVE_BEFEHLE) {
    it(`${befehl}: Ein-Feld-Änderung → Schlüssel „Befehl:Subjekt:Feld"`, () => {
      expect(REGISTRIERUNG[befehl].koaleszenzSchluessel).toBeTypeOf('function')
      const db = oeffnen(':memory:')
      try {
        migrieren(db)
        const lauf = SZENARIEN[befehl].aufbauen(db)
        expect(lauf.schluessel(1, 'feld')).toBe(lauf.erwarteterSchluessel)
        expect(lauf.erwarteterSchluessel.startsWith(`${befehl}:`)).toBe(true)
      } finally {
        db.close()
      }
    })
  }

  it('die Hook-Karte aus befehl-hooks.ts ist nicht leer (sonst prüft der Abgleich unten nichts)', () => {
    const karte = hookZuBefehl()
    expect(karte.get('usePersonFeldSetzen')).toBe('person.feldSetzen')
    expect(karte.get('useNameAendern')).toBe('name.aendern')
  })

  it('jede Autosave-Aufrufstelle im Renderer schreibt nur Befehle aus AUTOSAVE_BEFEHLE (oder aus der bekannten Ausnahmeliste)', () => {
    const stellen = autosaveAufrufstellen()
    expect(stellen.size).toBeGreaterThan(0)
    const autosave: ReadonlySet<string> = new Set(AUTOSAVE_BEFEHLE)
    const ohneSchluessel = [...stellen.entries()].flatMap(([datei, befehle]) =>
      befehle.filter((b) => !autosave.has(b) && !BEKANNT_OHNE_SCHLUESSEL.has(b)).map((b) => `${datei}: ${b}`),
    )
    expect(ohneSchluessel).toEqual([])
    // Profil-Editor (AP-1.30): Notiz und Namen laufen über den Autosave.
    const alle = new Set([...stellen.values()].flat())
    expect(alle.has('person.feldSetzen')).toBe(true)
    expect(alle.has('name.aendern')).toBe(true)
  })

  it('die Ausnahmeliste schrumpft nur: jeder Eintrag wird noch gebraucht und hat noch keinen Schlüssel', () => {
    const alle = new Set([...autosaveAufrufstellen().values()].flat())
    const autosave: ReadonlySet<string> = new Set(AUTOSAVE_BEFEHLE)
    for (const befehl of BEKANNT_OHNE_SCHLUESSEL) {
      expect(alle.has(befehl), `${befehl} wird von keiner Autosave-Aufrufstelle mehr geschrieben`).toBe(true)
      expect(autosave.has(befehl), `${befehl} steht inzwischen in AUTOSAVE_BEFEHLE`).toBe(false)
    }
  })
})
