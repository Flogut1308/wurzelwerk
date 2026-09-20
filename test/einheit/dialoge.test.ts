// AP-1.26: ersetzt `test/einheit/import-dialog-kanaele.test.ts` — `src/main/import/dialog.ts` ist
// nach `src/main/dialoge.ts` verallgemeinert (AP-1.26, Commit 1) und bedient jetzt zusätzlich die
// beiden Ordnerwahl-Kanäle für „Neues Projekt"/„Projekt öffnen" (S-01). Die bisherigen
// Import-Dialog-Fälle (Weißliste, Zod-Schemata) wandern unverändert hierher; neu sind die beiden
// Projekt-Ordnerwahl-Kanäle in der Weißliste und der Abbruch-Nachweis für die zugehörigen
// Dialog-Funktionen.
//
// Dieser Test hängt bewusst NICHT an `dialoge.ts` für die Weißlisten-/Schema-Fälle (das importiert
// `electron`), sondern nur an der Weißliste (`ALLE_KANAELE`) und den Zod-Eingabeschemata — beides
// ist Electron-frei prüfbar. Die Abbruch-Fälle unten mocken `electron` gezielt (Muster
// `test/einheit/projekt-dienst.test.ts`).
//
// Rot auf dem Basisstand (vor diesem Paket): `ALLE_KANAELE` enthält die beiden neuen
// Projekt-Ordnerwahl-Kanäle noch nicht — ein echter, behavioraler AssertionError, kein bloßer
// Import-Auflösungsfehler.
import { describe, expect, it, vi } from 'vitest'
import { ALLE_KANAELE } from '../../src/shared/ipc/kanaele'
import { importBerichtSpeichernEinSchema, importDateiWaehlenEinSchema } from '../../src/shared/schemata/import-dialog'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })), showSaveDialog: vi.fn() },
}))

describe('Dialoge-Kanäle (AP-1.26)', () => {
  it('ALLE_KANAELE enthält die beiden Import-Dialog-Kanäle', () => {
    expect(ALLE_KANAELE).toContain('befehl:import.dateiWaehlen')
    expect(ALLE_KANAELE).toContain('befehl:import.berichtSpeichern')
  })

  // Behavioraler Rot-Beleg (nicht nur ein Import-Auflösungsfehler): diese beiden Kanäle existieren
  // im Basisstand noch nicht in der Weißliste.
  it('ALLE_KANAELE enthält die beiden neuen Projekt-Ordnerwahl-Kanäle (AP-1.26)', () => {
    expect(ALLE_KANAELE).toContain('befehl:projekt.elternordnerWaehlen')
    expect(ALLE_KANAELE).toContain('befehl:projekt.ordnerWaehlen')
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

describe('Projekt-Ordnerwahl-Dialoge — Abbruch (AP-1.26)', () => {
  it('projektElternordnerWaehlen liefert bei Abbruch null, ohne Ausnahme', async () => {
    const { projektElternordnerWaehlen } = await import('../../src/main/dialoge')
    await expect(projektElternordnerWaehlen()).resolves.toBeNull()
  })

  it('projektOrdnerWaehlen liefert bei Abbruch null, ohne Ausnahme', async () => {
    const { projektOrdnerWaehlen } = await import('../../src/main/dialoge')
    await expect(projektOrdnerWaehlen()).resolves.toBeNull()
  })
})
