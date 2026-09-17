import { app } from 'electron'
import { z } from 'zod'
import { ALLE_FEHLERCODES } from '../../shared/fehler/codes'
import { MANIFEST_SCHEMAVERSION } from '../../shared/konstanten'
import { personAnlegenEinSchema, personFeldSetzenEinSchema, personLoeschenEinSchema } from '../../shared/schemata/befehle'
import { schnappschussErzeugenEinSchema, schnappschussWiederherstellenEinSchema } from '../../shared/schemata/schnappschuss'
import type { Ein } from '../../shared/ipc/vertrag'
import { journalVerlauf } from '../abfragen/journal-verlauf'
import { fuehreAus } from '../befehle/bus'
import { importAusfuehren } from '../befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../befehle/import-trockenlauf'
import { importPruefen } from '../import/pruefen'
import { journalStatusMelden } from '../journal/journal-status-melder'
import { redo, undo } from '../journal/undo'
import { undoZiel } from '../repositories/journal-repo'
import { sendeEreignis } from './ereignisse'
import { protokollFehler } from '../protokoll/logger'
import {
  offenesProjektDatenbank,
  offenesProjektPfade,
  projektAnlegen,
  projektOeffnen,
  projektSchliessen,
  projektZuletzt,
} from '../projekt/projekt-dienst'
import { schnappschussErzeugen } from '../schnappschuss/erzeugen'
import { schnappschussListeLesen } from '../schnappschuss/liste'
import { schnappschussWiederherstellen } from '../schnappschuss/wiederherstellen'
import { wartungAbgeleiteteNeuAufbauen } from '../wartung/abgeleitete-neu-aufbauen'
import { registriere } from './huelle'

const journalVerlaufEingabeSchema: z.ZodType<Ein<'abfrage:journal.verlauf'>> = z.object({
  grenze: z.number().int().positive(),
})

// Erzwingt strukturell, dass dieses Schema zu `ProtokollMeldenEin` passt — eine Abweichung ist
// ein Typfehler hier, nicht erst zur Laufzeit im Renderer.
const protokollMeldenEingabeSchema: z.ZodType<Ein<'befehl:protokoll.melden'>> = z.object({
  quelle: z.enum(['fehlergrenze', 'fenster']),
  nachricht: z.string(),
  stack: z.string().optional(),
  code: z.enum(ALLE_FEHLERCODES).optional(),
})

const projektAnlegenEingabeSchema: z.ZodType<Ein<'befehl:projekt.anlegen'>> = z.object({
  elternordner: z.string(),
  name: z.string(),
})

const projektOeffnenEingabeSchema: z.ZodType<Ein<'befehl:projekt.oeffnen'>> = z.object({
  pfad: z.string(),
  syncBestaetigt: z.boolean().optional(),
})

const importPruefenEingabeSchema: z.ZodType<Ein<'abfrage:import.pruefen'>> = z.object({
  pfad: z.string(),
})

const importTrockenlaufEingabeSchema: z.ZodType<Ein<'befehl:import.trockenlauf'>> = z.object({
  pfad: z.string(),
})

const importAusfuehrenEingabeSchema: z.ZodType<Ein<'befehl:import.ausfuehren'>> = z.object({
  pfad: z.string(),
})

/**
 * Registriert alle Kanäle aus AP-0.2 (§2.4). Wird einmal beim Start aufgerufen
 * (`src/main/index.ts`).
 */
export function ipcRegistrierung(): void {
  registriere('abfrage:version', z.null(), () => ({
    app: app.getVersion(),
    schema: MANIFEST_SCHEMAVERSION,
    electron: process.versions.electron,
  }))

  // Log-only-Handler ohne Transaktion/Journal — kein Vorgriff auf den Befehlsbus (AP-0.9).
  // Datenschutz (§7): `nachricht`/`stack` können Laufzeitinhalte tragen und werden bewusst NICHT
  // protokolliert — nur Quelle, Fehlercode und Vorgangs-ID.
  registriere('befehl:protokoll.melden', protokollMeldenEingabeSchema, (ein, ktx) => {
    protokollFehler({ vorgangsId: ktx.vorgangsId, quelle: ein.quelle, code: ein.code })
    return null
  })

  registriere('befehl:projekt.anlegen', projektAnlegenEingabeSchema, (ein) => projektAnlegen(ein))
  registriere('befehl:projekt.oeffnen', projektOeffnenEingabeSchema, (ein, ktx) => projektOeffnen(ein, ktx))
  registriere('befehl:projekt.schliessen', z.null(), () => {
    projektSchliessen()
    return null
  })
  registriere('abfrage:projekt.zuletzt', z.null(), () => projektZuletzt())

  registriere('befehl:wartung.abgeleiteteNeuAufbauen', z.null(), () => wartungAbgeleiteteNeuAufbauen())

  registriere('befehl:person.anlegen', personAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'person.anlegen', ein))
  registriere('befehl:person.feldSetzen', personFeldSetzenEinSchema, (ein) =>
    fuehreAus(offenesProjektDatenbank(), 'person.feldSetzen', ein),
  )
  registriere('befehl:person.loeschen', personLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'person.loeschen', ein))

  // `undo()`/`redo()` laufen NICHT über `fuehreAus()`/den Befehlsbus (55_Architektur.md §4.9,
  // Kopfkommentar `src/main/journal/undo.ts`) - die beiden Ereignisse, die der Bus sonst selbst
  // auslöst, gehen darum hier von Hand raus, direkt nach dem erfolgreichen Aufruf.
  registriere('befehl:journal.undo', z.null(), () => {
    const db = offenesProjektDatenbank()
    const ergebnis = undo(db)
    sendeEreignis('ereignis:datenGeaendert', { transaktionId: ergebnis.transaktionId, ursache: 'journal.undo' })
    journalStatusMelden(db)
    return ergebnis
  })
  registriere('befehl:journal.redo', z.null(), () => {
    const db = offenesProjektDatenbank()
    const ergebnis = redo(db)
    sendeEreignis('ereignis:datenGeaendert', { transaktionId: ergebnis.transaktionId, ursache: 'journal.redo' })
    journalStatusMelden(db)
    return ergebnis
  })
  registriere('abfrage:journal.verlauf', journalVerlaufEingabeSchema, (ein) => journalVerlauf(offenesProjektDatenbank(), ein.grenze))

  registriere('befehl:schnappschuss.erzeugen', schnappschussErzeugenEinSchema, () =>
    schnappschussErzeugen(offenesProjektDatenbank(), offenesProjektPfade()),
  )
  registriere('abfrage:schnappschuss.liste', z.null(), () => schnappschussListeLesen(offenesProjektPfade().snapshotsPfad))
  registriere('befehl:schnappschuss.wiederherstellen', schnappschussWiederherstellenEinSchema, (ein, ktx) => {
    schnappschussWiederherstellen(ein, ktx)
    return null
  })

  // ENTSCHIEDEN: `abfrage:`, nicht `befehl:` — die Prüfung schreibt nichts (§11, ADR-016;
  // U-AP1.3b-kanal in docs/80_Offene_Fragen.md).
  registriere('abfrage:import.pruefen', importPruefenEingabeSchema, (ein) => importPruefen(offenesProjektDatenbank(), ein.pfad))

  // `befehl:`, NICHT `abfrage:` — der Trockenlauf schreibt während der Ausführung (in einer
  // Transaktion, die anschließend zurückgerollt wird, 56_Import_Vertrag.md §6.1, AP-1.4a).
  registriere('befehl:import.trockenlauf', importTrockenlaufEingabeSchema, (ein) => importTrockenlaufDurchfuehren(offenesProjektDatenbank(), ein.pfad))

  // AP-1.5, ADR-019: der echte Import. `undoZiel()` NACH dem Schreiben liefert die soeben
  // committete Import-Transaktion (klein oder groß, beide Wege setzen `rueckgaengig_moeglich = 1`
  // per Schema-Default) — für das `ereignis:datenGeaendert`, das der Bus (`fuehreAus()`) sonst
  // selbst auslöst (dieser Kanal läuft NICHT über den Bus, s. Kopfkommentar von `import-ausfuehren.ts`).
  // Bei `importGesperrt` wurde nichts geschrieben — dann geht kein Ereignis raus.
  registriere('befehl:import.ausfuehren', importAusfuehrenEingabeSchema, (ein) => {
    const db = offenesProjektDatenbank()
    const bericht = importAusfuehren(db, ein)
    if (!bericht.importGesperrt) {
      const ziel = undoZiel(db)
      if (ziel !== undefined) {
        sendeEreignis('ereignis:datenGeaendert', { transaktionId: ziel.id, ursache: 'import.ausfuehren' })
      }
      journalStatusMelden(db)
    }
    return bericht
  })
}
