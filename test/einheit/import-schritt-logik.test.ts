// AP-1.4b PR-B: reine Schritt-/Sperrlogik des Import-Assistenten (S-10…S-13). Die `.tsx`-Ansichten
// werden — wie in AP-1.6 — nicht per Vitest getestet (React-/window-Umgebung), sondern über e2e;
// die entscheidbare Logik lebt hier und wird unit-geprüft. Rot auf dem Basisstand: das Modul
// existiert dort nicht.
import { describe, expect, it } from 'vitest'
import type { Trockenlaufbericht } from '../../src/shared/import/trockenlauf-bericht'
import { importSperrurteil, schrittNachTrockenlauf } from '../../src/renderer/ansichten/import/import-schritt-logik'

function bericht(ueberschreibung: { fehlerAnzahl: number; importGesperrt: boolean }): Trockenlaufbericht {
  return {
    zusammenfassung: {
      datei: 'a.json',
      vertragErzeugtAm: null,
      vertragWerkzeug: null,
      pruefsummeQuelltext: null,
      bereitsImportiertAm: null,
      fehlerAnzahl: ueberschreibung.fehlerAnzahl,
      hinweisAnzahl: 0,
      geaenderteZeilenAnzahl: 3,
      ruecknahmeArt: 'undo',
    },
    wirdAngelegt: [],
    wirdErgaenzt: [],
    moeglicheDubletten: [],
    fehler: [],
    hinweise: [],
    nichtVerarbeitetesMaterial: [],
    gesundheitsdaten: { diagnosenAnzahl: 0, risikofaktorenAnzahl: 0 },
    importGesperrt: ueberschreibung.importGesperrt,
  }
}

describe('Import-Schrittlogik (AP-1.4b)', () => {
  it('führt bei Fehlern in die Fehlerliste (S-12), sonst in den Bericht (S-11)', () => {
    expect(schrittNachTrockenlauf(bericht({ fehlerAnzahl: 2, importGesperrt: true }))).toBe('fehlerliste')
    expect(schrittNachTrockenlauf(bericht({ fehlerAnzahl: 0, importGesperrt: false }))).toBe('bericht')
  })

  it('sperrt „Importieren" genau dann, wenn der Bericht gesperrt ist, mit Grundschlüssel und Anzahl', () => {
    const gesperrt = importSperrurteil(bericht({ fehlerAnzahl: 3, importGesperrt: true }))
    expect(gesperrt.gesperrt).toBe(true)
    expect(gesperrt.grundSchluessel).not.toBeNull()
    expect(gesperrt.fehlerAnzahl).toBe(3)

    const frei = importSperrurteil(bericht({ fehlerAnzahl: 0, importGesperrt: false }))
    expect(frei.gesperrt).toBe(false)
    expect(frei.grundSchluessel).toBeNull()
  })
})
