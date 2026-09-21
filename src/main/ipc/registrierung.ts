import { app } from 'electron'
import { z } from 'zod'
import { ALLE_FEHLERCODES } from '../../shared/fehler/codes'
import { MANIFEST_SCHEMAVERSION } from '../../shared/konstanten'
import {
  personAnlegenEinSchema,
  personFeldSetzenEinSchema,
  personLoeschenEinSchema,
  nameAnlegenEinSchema,
  nameAendernEinSchema,
  nameLoeschenEinSchema,
  elternschaftAnlegenEinSchema,
  elternschaftAendernEinSchema,
  elternschaftLoeschenEinSchema,
  partnerschaftAnlegenEinSchema,
  partnerschaftAendernEinSchema,
  partnerschaftLoeschenEinSchema,
  ereignisAnlegenEinSchema,
  ereignisAendernEinSchema,
  ereignisLoeschenEinSchema,
  beteiligungLoeschenEinSchema,
  aussageAnlegenEinSchema,
  aussageLoeschenEinSchema,
  ortAnlegenEinSchema,
  ortAendernEinSchema,
  ortsnameAnlegenEinSchema,
  ortsnameAendernEinSchema,
  ortsnameLoeschenEinSchema,
  ortszugehoerigkeitAnlegenEinSchema,
  ortszugehoerigkeitAendernEinSchema,
  ortszugehoerigkeitLoeschenEinSchema,
  ortExterneIdAnlegenEinSchema,
  ortExterneIdLoeschenEinSchema,
} from '../../shared/schemata/befehle'
import { personListeEinSchema, sucheEinSchema } from '../../shared/schemata/person-liste'
import { personDetailEinSchema } from '../../shared/schemata/person-detail'
import { ortSucheEinSchema } from '../../shared/schemata/ort-suche'
import { ortDetailEinSchema } from '../../shared/schemata/ort-detail'
import { importBerichtSpeichernEinSchema, importDateiWaehlenEinSchema } from '../../shared/schemata/import-dialog'
import { schnappschussErzeugenEinSchema, schnappschussWiederherstellenEinSchema } from '../../shared/schemata/schnappschuss'
import type { Ein } from '../../shared/ipc/vertrag'
import { journalVerlauf } from '../abfragen/journal-verlauf'
import { ortDetail } from '../abfragen/ort-detail'
import { ortSuche } from '../abfragen/ort-suche'
import { personDetail } from '../abfragen/person-detail'
import { personListe } from '../abfragen/person-liste'
import { pruefhinweise } from '../abfragen/pruefhinweise'
import { suche } from '../abfragen/suche'
import { fuehreAus } from '../befehle/bus'
import { importAusfuehren } from '../befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../befehle/import-trockenlauf'
import { berichtSpeichern, importDateiWaehlen, projektElternordnerWaehlen, projektOrdnerWaehlen } from '../dialoge'
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

  // AP-1.26, S-01: „Pfade wählt man nie durch Tippen" — die Startansicht wählt den übergeordneten
  // Ordner (Neues Projekt) bzw. den Projektordner (Projekt öffnen) über den nativen Dialog aus
  // `dialoge.ts` (verallgemeinert aus dem Import-Assistenten, AP-1.4b). `befehl:`, nicht
  // `abfrage:` — ein nativer Dialog ist eine Nebenwirkung im Hauptprozess (analog zu
  // `befehl:import.dateiWaehlen`). Kein offenes Projekt nötig.
  registriere('befehl:projekt.elternordnerWaehlen', z.null(), () => projektElternordnerWaehlen())
  registriere('befehl:projekt.ordnerWaehlen', z.null(), () => projektOrdnerWaehlen())

  registriere('abfrage:projekt.zuletzt', z.null(), () => projektZuletzt())

  registriere('befehl:wartung.abgeleiteteNeuAufbauen', z.null(), () => wartungAbgeleiteteNeuAufbauen())

  registriere('befehl:person.anlegen', personAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'person.anlegen', ein))
  registriere('befehl:person.feldSetzen', personFeldSetzenEinSchema, (ein) =>
    fuehreAus(offenesProjektDatenbank(), 'person.feldSetzen', ein),
  )
  registriere('befehl:person.loeschen', personLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'person.loeschen', ein))

  // AP-1.12: Schreibbefehle für name/elternschaft/partnerschaft/ereignis/aussage — dasselbe Muster
  // wie die drei `person.*`-Kanäle oben (über den Befehlsbus, `db` per D-DB-Injektion).
  registriere('befehl:name.anlegen', nameAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'name.anlegen', ein))
  registriere('befehl:name.aendern', nameAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'name.aendern', ein))
  registriere('befehl:name.loeschen', nameLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'name.loeschen', ein))

  registriere('befehl:elternschaft.anlegen', elternschaftAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'elternschaft.anlegen', ein))
  registriere('befehl:elternschaft.aendern', elternschaftAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'elternschaft.aendern', ein))
  registriere('befehl:elternschaft.loeschen', elternschaftLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'elternschaft.loeschen', ein))

  registriere('befehl:partnerschaft.anlegen', partnerschaftAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'partnerschaft.anlegen', ein))
  registriere('befehl:partnerschaft.aendern', partnerschaftAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'partnerschaft.aendern', ein))
  registriere('befehl:partnerschaft.loeschen', partnerschaftLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'partnerschaft.loeschen', ein))

  registriere('befehl:ereignis.anlegen', ereignisAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ereignis.anlegen', ein))
  registriere('befehl:ereignis.aendern', ereignisAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ereignis.aendern', ein))
  registriere('befehl:ereignis.loeschen', ereignisLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ereignis.loeschen', ein))
  registriere('befehl:beteiligung.loeschen', beteiligungLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'beteiligung.loeschen', ein))

  registriere('befehl:aussage.anlegen', aussageAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'aussage.anlegen', ein))
  registriere('befehl:aussage.loeschen', aussageLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'aussage.loeschen', ein))

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

  // AP-1.4b, S-10/S-11/S-13: die nativen Dialoge des Import-Assistenten. `befehl:`, nicht
  // `abfrage:` — ein nativer Dialog ist eine Nebenwirkung im Hauptprozess (analog zum Trockenlauf).
  // Kein offenes Projekt nötig: Datei wählen und Bericht speichern hängen an keiner Datenbank.
  registriere('befehl:import.dateiWaehlen', importDateiWaehlenEinSchema, () => importDateiWaehlen())
  registriere('befehl:import.berichtSpeichern', importBerichtSpeichernEinSchema, (ein) => berichtSpeichern(ein))

  // AP-1.6 PR1: reine Lesevorgänge (Personenliste, Suche) — `abfrage:`, nicht `befehl:` (§11,
  // ADR-016), kein Journal-/Ereignis-Bezug.
  registriere('abfrage:person.liste', personListeEinSchema, (ein) => personListe(offenesProjektDatenbank(), ein))
  registriere('abfrage:suche', sucheEinSchema, (ein) => suche(offenesProjektDatenbank(), ein))

  // AP-1.7 PR-A: Profilseite (lesend) — `abfrage:`, kein Journal-/Ereignis-Bezug.
  registriere('abfrage:person.detail', personDetailEinSchema, (ein) => personDetail(offenesProjektDatenbank(), ein))

  // AP-1.8 PR-A (F-07): Bestandsprüfung (Fußzeile + Liste) — `abfrage:`, schreibt nichts (§11,
  // ADR-016). Kein `ein`, analog `abfrage:version`.
  registriere('abfrage:pruefhinweise', z.null(), () => pruefhinweise(offenesProjektDatenbank()))

  // AP-1.13 PR-C (docs/71 §3.2, A-04): minimale Ortsverwaltung fürs `Ortsfeld` — Suche (lesend,
  // `abfrage:`) + einfaches Anlegen (schreibend, über den Befehlsbus wie `person.anlegen` oben).
  registriere('abfrage:ort.suche', ortSucheEinSchema, (ein) => ortSuche(offenesProjektDatenbank(), ein))
  registriere('abfrage:ort.detail', ortDetailEinSchema, (ein) => ortDetail(offenesProjektDatenbank(), ein))
  registriere('befehl:ort.anlegen', ortAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ort.anlegen', ein))

  // AP-1.16 PR-A: volle Ortsverwaltung — Stammfelder ändern, weitere Namen, Zugehörigkeitsketten
  // (politisch/kirchlich), externe Kennungen. Dasselbe Muster wie oben, über den Befehlsbus.
  // Bewusst KEIN `befehl:ort.loeschen` (Kaskaden-Entscheidung offen, docs/80_Offene_Fragen.md).
  registriere('befehl:ort.aendern', ortAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ort.aendern', ein))
  registriere('befehl:ortsname.anlegen', ortsnameAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ortsname.anlegen', ein))
  registriere('befehl:ortsname.aendern', ortsnameAendernEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ortsname.aendern', ein))
  registriere('befehl:ortsname.loeschen', ortsnameLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ortsname.loeschen', ein))
  registriere('befehl:ortszugehoerigkeit.anlegen', ortszugehoerigkeitAnlegenEinSchema, (ein) =>
    fuehreAus(offenesProjektDatenbank(), 'ortszugehoerigkeit.anlegen', ein),
  )
  registriere('befehl:ortszugehoerigkeit.aendern', ortszugehoerigkeitAendernEinSchema, (ein) =>
    fuehreAus(offenesProjektDatenbank(), 'ortszugehoerigkeit.aendern', ein),
  )
  registriere('befehl:ortszugehoerigkeit.loeschen', ortszugehoerigkeitLoeschenEinSchema, (ein) =>
    fuehreAus(offenesProjektDatenbank(), 'ortszugehoerigkeit.loeschen', ein),
  )
  registriere('befehl:ort-externe-id.anlegen', ortExterneIdAnlegenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ort-externe-id.anlegen', ein))
  registriere('befehl:ort-externe-id.loeschen', ortExterneIdLoeschenEinSchema, (ein) => fuehreAus(offenesProjektDatenbank(), 'ort-externe-id.loeschen', ein))
}
