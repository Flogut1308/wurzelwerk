// AP-0.11, 55_Architektur.md §6.2/§6.4 (F-04, ADR-003): "bewusst grob und unbequem" - Projekt
// schließen, aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` verschieben (NIE löschen),
// gewählten Schnappschuss zurückkopieren, wieder öffnen. Kein Zurückspielen im laufenden Betrieb
// (§6.2: Fenster und Abfragecache würden sonst auf einen Datenbestand zeigen, den es nicht mehr
// gibt).
import { app } from 'electron'
import { copyFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Kontext } from '../ipc/huelle'
import type { SchnappschussWiederherstellenEin } from '../../shared/ipc/vertrag'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { schemaBasisverzeichnis } from '../datenbank/migration/schema-basis'
import { offenesProjektDatenbank, offenesProjektPfade, projektOeffnen, projektSchliessen } from '../projekt/projekt-dienst'
import { personKennungenLesen, zaehlerstaendeLesen, zaehlerTabelleVorhanden } from '../repositories/kennung-repo'
import { ERSETZT_PRAEFIX, kolonfreieZeit, SCHNAPPSCHUSS_ENDUNG } from './dateiname'
import { wiederhergestellteDateiAngleichen, type ErsetzterKennungsstand } from './kennung-angleichen'

/**
 * Stellt den unter `ein.id` bekannten Schnappschuss wieder her (55_Architektur.md §6.2/§6.4).
 * Wirft `PROJEKT_NICHT_GEOEFFNET` (über `offenesProjektPfade()`), wenn kein Projekt offen ist, und
 * `DATEI_NICHT_LESBAR`, wenn kein Schnappschuss mit dieser `id` existiert - beides GEPRÜFT, bevor
 * das Projekt geschlossen wird (ein Fehlschlag darf das offene Projekt nicht antasten). `jetzt` ist
 * injizierbar (Standard `Date.now`) — Test-Seam für den Dateinamen von `ersetzt-<Zeit>.sqlite`.
 *
 * AP-1.34 (A2a, Nutzer 24.09.2026): „nie neu vergeben" gilt wie bei `importZuruecknehmen()` (E12)
 * — der Schnappschuss trägt den Zählerstand seiner Entstehung, Kennungen aus der Zeit danach würden
 * sonst erneut vergeben. Darum wird `kennung_zaehler` vor dem Schließen gesichert und nach dem
 * Zurückkopieren je Bereich nur vorgezogen (nie gesenkt; bei Gleichstand wird nichts geschrieben,
 * `chk_kennung_zaehler_vorwaerts` feuert nicht). Ein Schnappschuss ≥v7 behält seine eigenen
 * Kennungen (O-3).
 *
 * AP-1.34 (A2b, H6b): zusätzlich wird die Zuordnung `id → kennung` gesichert. Die zurückkopierte
 * Datei wird VOR dem Öffnen migriert (`wiederhergestellteDateiAngleichen`); liegt sie vor 0007,
 * übernehmen ihre Personen im Migrations-Hook die Kennungen der ersetzten Datei, übrige werden ab
 * dem gesicherten Zählerstand nummeriert (O-2). `projektOeffnen` findet danach eine aktuelle Datei
 * vor (Migration No-op). Scheitert das Angleichen, wird wie beim Kopierfehler zurückgerollt; das
 * Projekt bleibt wieder öffenbar. Ein `WurzelFehler` aus dem Angleichen behält dabei seinen Code,
 * alles andere wird `INTERN_UNERWARTET`.
 */
export function schnappschussWiederherstellen(
  ein: SchnappschussWiederherstellenEin,
  ktx: Kontext,
  jetzt: () => number = Date.now,
): void {
  const pfade = offenesProjektPfade() // wirft PROJEKT_NICHT_GEOEFFNET

  const quellPfad = join(pfade.snapshotsPfad, `${ein.id}${SCHNAPPSCHUSS_ENDUNG}`)
  if (!existsSync(quellPfad)) {
    throw new WurzelFehler('DATEI_NICHT_LESBAR')
  }

  const ordnerPfad = pfade.ordnerPfad
  const ersetztPfad = join(pfade.snapshotsPfad, `${ERSETZT_PRAEFIX}${kolonfreieZeit(jetzt())}${SCHNAPPSCHUSS_ENDUNG}`)

  const bisherigeDb = offenesProjektDatenbank()
  // Das offene Projekt ist stets auf SCHEMA_VERSION migriert (projektOeffnen); der Wächter bleibt
  // defensiv. `kennung_zaehler` und `person.kennung` kommen beide mit 0007.
  const kennungsstand: ErsetzterKennungsstand = zaehlerTabelleVorhanden(bisherigeDb)
    ? { zaehler: zaehlerstaendeLesen(bisherigeDb), kennungen: personKennungenLesen(bisherigeDb) }
    : { zaehler: [], kennungen: new Map() }

  projektSchliessen()

  try {
    renameSync(pfade.dbPfad, ersetztPfad) // NIE löschen (§6.2/§6.4)
  } catch {
    throw new WurzelFehler('DATEI_KEIN_PLATZ')
  }

  try {
    copyFileSync(quellPfad, pfade.dbPfad)
  } catch {
    // C2 (hueter-Auflage): Rückroll, statt das Projekt ohne `dbPfad` steckenzulassen - ein
    // erneuter Wiederherstellungsversuch würde sonst schon an der fehlenden Datei scheitern.
    renameSync(ersetztPfad, pfade.dbPfad)
    throw new WurzelFehler('DATEI_KEIN_PLATZ')
  }

  try {
    // Schließt seinen Handle auch im Fehlerfall selbst (Windows: vor dem rename unten zu).
    wiederhergestellteDateiAngleichen(pfade.dbPfad, kennungsstand, {
      schemaBasis: schemaBasisverzeichnis(),
      appVersion: app.getVersion(),
    })
  } catch (u) {
    // Wie der Rückroll oben (Muster `importZuruecknehmen()`): die kopierte Datei wird durch die
    // ersetzte überschrieben, das Projekt bleibt im Vorher-Zustand öffenbar. Ein bereits
    // typisierter Fehler (`DATENBANK_INTEGRITAET`, `PROJEKT_NEUERE_SCHEMAVERSION`,
    // `PROJEKT_MIGRATION_GEAENDERT`) wird durchgereicht (hueter-H3) — nur Unbekanntes wird umgepackt.
    renameSync(ersetztPfad, pfade.dbPfad)
    throw u instanceof WurzelFehler ? u : new WurzelFehler('INTERN_UNERWARTET', u instanceof Error ? u.message : String(u))
  }

  projektOeffnen({ pfad: ordnerPfad }, ktx)
}
