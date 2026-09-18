// AP-1.4b PR-A: die zwei neuen Dialog-Kanäle des Import-Assistenten. `befehl:import.dateiWaehlen`
// öffnet den nativen Datei-Öffnen-Dialog (liefert einen Pfad oder `null` bei Abbruch),
// `befehl:import.berichtSpeichern` schreibt den Trockenlauf-/Ergebnisbericht als Text (der Rückweg
// zum Skill, F-03). Beide sind `befehl:`, nicht `abfrage:` — ein nativer Dialog ist eine
// Nebenwirkung im Hauptprozess (analog zur Begründung von `befehl:import.trockenlauf`).
//
// Dieser Test hängt bewusst NICHT an `dialog.ts` (das importiert `electron`), sondern nur an der
// Weißliste (`ALLE_KANAELE`) und den Zod-Eingabeschemata — beides ist Electron-frei prüfbar. Rot
// auf dem Basisstand: Kanäle und Schemamodul existieren dort nicht.
import { describe, expect, it } from 'vitest'
import { ALLE_KANAELE } from '../../src/shared/ipc/kanaele'
import { importBerichtSpeichernEinSchema, importDateiWaehlenEinSchema } from '../../src/shared/schemata/import-dialog'

describe('Import-Dialog-Kanäle (AP-1.4b PR-A)', () => {
  it('ALLE_KANAELE enthält die beiden neuen Dialog-Kanäle', () => {
    expect(ALLE_KANAELE).toContain('befehl:import.dateiWaehlen')
    expect(ALLE_KANAELE).toContain('befehl:import.berichtSpeichern')
  })

  it('dateiWaehlen nimmt keine Eingabe (null)', () => {
    expect(importDateiWaehlenEinSchema.safeParse(null).success).toBe(true)
    expect(importDateiWaehlenEinSchema.safeParse({ pfad: 'x' }).success).toBe(false)
  })

  it('berichtSpeichern nimmt einen vollständigen Trockenlaufbericht', () => {
    const bericht = {
      zusammenfassung: {
        datei: 'a.json',
        vertragErzeugtAm: null,
        vertragWerkzeug: null,
        pruefsummeQuelltext: null,
        bereitsImportiertAm: null,
        fehlerAnzahl: 0,
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
      importGesperrt: false,
    }
    expect(importBerichtSpeichernEinSchema.safeParse({ bericht }).success).toBe(true)
    // ohne `bericht`-Feld abgelehnt
    expect(importBerichtSpeichernEinSchema.safeParse({}).success).toBe(false)
    // fremde ruecknahmeArt abgelehnt
    const kaputt = { bericht: { ...bericht, zusammenfassung: { ...bericht.zusammenfassung, ruecknahmeArt: 'irgendwas' } } }
    expect(importBerichtSpeichernEinSchema.safeParse(kaputt).success).toBe(false)
  })
})
