// AP-1.30 PR 7c (docs/80 §33 V-130-7-speicherfehler): Speicherstatus im Kopf des Editors. Reine
// Zustandsübergänge über die Schreibvorgänge DIESES Editors. Kernregel: ein späterer Erfolg an
// einem ANDEREN Feld hebt einen Fehler nicht auf — erst das erfolgreiche erneute Schreiben
// desselben Felds; sonst meldete „Gespeichert" fälschlich Datensicherheit.
import { describe, expect, it } from 'vitest'
import {
  EDITOR_SPEICHER_ANFANG,
  editorSpeicherAnzeige,
  editorSpeicherUebergang,
  type EditorSpeicherEreignis,
  type EditorSpeicherZustand,
} from '../../src/renderer/ansichten/profil/editor-speicherstatus-logik'

const UM = 1_750_000_000_000

function nach(...ereignisse: readonly EditorSpeicherEreignis[]): EditorSpeicherZustand {
  return ereignisse.reduce(editorSpeicherUebergang, EDITOR_SPEICHER_ANFANG)
}

const start = (nr: number, feld: string): EditorSpeicherEreignis => ({ art: 'gestartet', nr, feld })
const erfolg = (nr: number, feld: string, um = UM): EditorSpeicherEreignis => ({ art: 'erfolgreich', nr, feld, um })
const fehler = (nr: number, feld: string): EditorSpeicherEreignis => ({ art: 'fehlgeschlagen', nr, feld })

describe('editorSpeicherAnzeige / editorSpeicherUebergang', () => {
  it('vor dem ersten Schreiben: Ruhe (der Kopf zeigt nichts)', () => {
    expect(editorSpeicherAnzeige(EDITOR_SPEICHER_ANFANG)).toEqual({ zustand: 'ruhe' })
  })

  it('laufend: speichert; danach gespeichert mit Zeitpunkt des Erfolgs', () => {
    expect(editorSpeicherAnzeige(nach(start(1, 'a')))).toEqual({ zustand: 'speichert' })
    expect(editorSpeicherAnzeige(nach(start(1, 'a'), erfolg(1, 'a')))).toEqual({ zustand: 'gespeichert', gespeichertUm: UM })
  })

  it('zwei parallele Schreibvorgänge: speichert, bis beide fertig sind; Zeit = letzter Erfolg', () => {
    const zwischen = nach(start(1, 'a'), start(2, 'b'), erfolg(1, 'a', UM))
    expect(editorSpeicherAnzeige(zwischen)).toEqual({ zustand: 'speichert' })
    expect(editorSpeicherAnzeige(editorSpeicherUebergang(zwischen, erfolg(2, 'b', UM + 5)))).toEqual({ zustand: 'gespeichert', gespeichertUm: UM + 5 })
  })

  it('Fehlschlag: Fehler mit dem betroffenen Feld', () => {
    expect(editorSpeicherAnzeige(nach(start(1, 'a'), fehler(1, 'a')))).toEqual({ zustand: 'fehler', felder: ['a'] })
  })

  it('ein späterer Erfolg an einem ANDEREN Feld hebt den Fehler NICHT auf', () => {
    const z = nach(start(1, 'a'), fehler(1, 'a'), start(2, 'b'), erfolg(2, 'b'))
    expect(editorSpeicherAnzeige(z)).toEqual({ zustand: 'fehler', felder: ['a'] })
  })

  it('ein laufender Schreibvorgang an einem anderen Feld verdeckt den Fehler nicht', () => {
    expect(editorSpeicherAnzeige(nach(start(1, 'a'), fehler(1, 'a'), start(2, 'b')))).toEqual({ zustand: 'fehler', felder: ['a'] })
  })

  it('erst das erfolgreiche erneute Schreiben desselben Felds hebt den Fehler auf', () => {
    const z = nach(start(1, 'a'), fehler(1, 'a'), start(2, 'a'), erfolg(2, 'a', UM + 9))
    expect(editorSpeicherAnzeige(z)).toEqual({ zustand: 'gespeichert', gespeichertUm: UM + 9 })
  })

  it('während der Wiederholung desselben Felds: speichert; scheitert sie, bleibt der Fehler', () => {
    const wiederholung = nach(start(1, 'a'), fehler(1, 'a'), start(2, 'a'))
    expect(editorSpeicherAnzeige(wiederholung)).toEqual({ zustand: 'speichert' })
    expect(editorSpeicherAnzeige(editorSpeicherUebergang(wiederholung, fehler(2, 'a')))).toEqual({ zustand: 'fehler', felder: ['a'] })
  })

  it('ein älterer Fehlschlag, der nach einem neueren Erfolg desselben Felds eintrifft, ist überholt', () => {
    const z = nach(start(1, 'a'), start(2, 'a'), erfolg(2, 'a'), fehler(1, 'a'))
    expect(editorSpeicherAnzeige(z)).toEqual({ zustand: 'gespeichert', gespeichertUm: UM })
  })

  it('je Feld zählt nur der neueste Fehlschlag; mehrere Felder werden alle genannt', () => {
    const z = nach(start(1, 'a'), fehler(1, 'a'), start(2, 'a'), fehler(2, 'a'), start(3, 'b'), fehler(3, 'b'))
    expect(z.fehler).toEqual([
      { nr: 2, feld: 'a' },
      { nr: 3, feld: 'b' },
    ])
    expect(editorSpeicherAnzeige(z)).toEqual({ zustand: 'fehler', felder: ['a', 'b'] })
  })

  it('ein älterer Fehlschlag nach einem neueren desselben Felds überschreibt den neueren nicht', () => {
    // Die Wiederholung schreibt den Stand des neuesten Fehlschlags — ein später eintreffender
    // älterer darf ihn nicht verdrängen (hueter #161).
    const z = nach(start(1, 'a'), start(2, 'a'), fehler(2, 'a'), fehler(1, 'a'))
    expect(z.fehler).toEqual([{ nr: 2, feld: 'a' }])
    // Die Wiederholung (nr 3) gilt als laufend für den Fehler nr 2 — und nur dafür.
    expect(editorSpeicherAnzeige(editorSpeicherUebergang(z, start(3, 'a')))).toEqual({ zustand: 'speichert' })
  })

  it('ist rein: der Ausgangszustand bleibt unverändert', () => {
    const vorher = nach(start(1, 'a'), fehler(1, 'a'))
    const kopie = JSON.stringify(vorher)
    editorSpeicherUebergang(vorher, erfolg(2, 'a'))
    expect(JSON.stringify(vorher)).toBe(kopie)
  })
})
