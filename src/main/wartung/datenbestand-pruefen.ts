// AP-0.13 — „Wartung → Datenbestand prüfen“: führt `integrity_check`, `foreign_key_check`, den
// Ableitungsvergleich und die Zyklusprüfung aus (`src/main/datenbank/integritaet.ts`,
// `datenbestandBericht`) und zeigt das Ergebnis an. Ein Fund verhindert/verändert nichts — er
// nennt nur den Weg (Schnappschuss sichern / „Abgeleitete Daten neu aufbauen“ ausführen).
//
// Berechnung strikt getrennt von Anzeige (Auftrag AP-0.13): `berichtNachrichtBauen` unten ist eine
// reine, Electron-freie Funktion (getestet in `test/einheit/wartung-datenbestand-pruefen.test.ts`).
// `wartungDatenbestandPruefen` selbst ist die dünne, NICHT getestete Hülle, die `dialog
// .showMessageBox` aufruft — analog zu `src/main/wartung/abgeleitete-neu-aufbauen.ts`, das
// ebenfalls unter `src/main/wartung/` liegt, aber ohne eigene Anzeige auskommt.
//
// docs/80_Offene_Fragen.md §9 (U-AP13): der Bericht nutzt bewusst einen nativen Dialog statt eines
// eigenen Renderer-Screens — es gibt noch kein Design-Fundament dafür (vor AP-1.6). Eine
// IPC-Abfrage mit Renderer-Anzeige kann nachgerüstet werden, sobald das Fundament steht.
import { dialog } from 'electron'
import i18next from 'i18next'
import menue from '../../shared/i18n/de/menue.json'
import { datenbestandBericht, type DatenbestandBericht } from '../datenbank/integritaet'
import { offenesProjektDatenbank } from '../projekt/projekt-dienst'
import { protokollInfo } from '../protokoll/logger'

/**
 * Eigene, schmale i18next-Instanz (ADR-011) — analog zu `src/main/menue/menue.ts`s `menueI18n`.
 * Kein Import von dort: `menue.ts` importiert bereits `wartungAbgeleiteteNeuAufbauen` aus
 * `src/main/wartung/`, ein Rückimport von `menue.ts` hier würde einen Zyklus erzeugen.
 */
const datenbestandI18n = i18next.createInstance()
void datenbestandI18n.init({
  lng: 'de',
  fallbackLng: false,
  ns: ['menue'],
  defaultNS: 'menue',
  resources: { de: { menue } },
  initAsync: false,
})

type Uebersetzer = (schluessel: string, optionen?: Record<string, unknown>) => string

/** Adapter statt `datenbestandI18n.t.bind(...)` direkt zu verwenden — dieselbe Begründung wie `menueUebersetzen` in `menue.ts` (`exactOptionalPropertyTypes`, CLAUDE.md §4). */
function uebersetzen(schluessel: string, optionen?: Record<string, unknown>): string {
  return optionen === undefined ? datenbestandI18n.t(schluessel) : datenbestandI18n.t(schluessel, optionen)
}

/** Gesamtzahl aller Funde über die vier Prüfungen hinweg (0 heißt: unauffällig). Ein gefundener Zyklus zählt als ein Fund. */
function fundeGesamt(bericht: DatenbestandBericht): number {
  return (
    bericht.integrityCheckFunde.length +
    bericht.fremdschluesselFunde.length +
    bericht.ableitungAbweichung.betroffeneTabellen.length +
    (bericht.zyklusGefunden ? 1 : 0)
  )
}

/**
 * Baut Titel + Nachricht für den Bericht-Dialog aus einem `DatenbestandBericht` — reine,
 * Electron-freie Funktion. `t` ist injizierbar (Test-Seam, analog zu `journalMenueBeschriftung` in
 * `menue.ts`).
 */
export function berichtNachrichtBauen(
  t: Uebersetzer,
  bericht: DatenbestandBericht,
): { readonly titel: string; readonly nachricht: string } {
  const titel = t('wartung_datenbestandPruefen_titel')
  const gesamt = fundeGesamt(bericht)
  if (gesamt === 0) {
    return { titel, nachricht: t('wartung_datenbestandPruefen_keineFunde') }
  }

  const zeilen: string[] = [t('wartung_datenbestandPruefen_funde', { anzahl: gesamt })]
  if (bericht.integrityCheckFunde.length > 0) {
    zeilen.push(t('wartung_datenbestandPruefen_integritaet', { anzahl: bericht.integrityCheckFunde.length }))
  }
  if (bericht.fremdschluesselFunde.length > 0) {
    zeilen.push(t('wartung_datenbestandPruefen_fremdschluessel', { anzahl: bericht.fremdschluesselFunde.length }))
  }
  if (bericht.ableitungAbweichung.betroffeneTabellen.length > 0) {
    zeilen.push(
      t('wartung_datenbestandPruefen_ableitung', {
        tabellen: bericht.ableitungAbweichung.betroffeneTabellen.join(', '),
      }),
    )
    zeilen.push(t('wartung_datenbestandPruefen_wegweiserNeuaufbau'))
  }
  if (bericht.zyklusGefunden) {
    zeilen.push(t('wartung_datenbestandPruefen_zyklus'))
  }
  zeilen.push(t('wartung_datenbestandPruefen_wegweiserSchnappschuss'))

  return { titel, nachricht: zeilen.join('\n') }
}

/**
 * `Wartung → Datenbestand prüfen`. Berechnet den Bericht für das offene Projekt und zeigt ihn über
 * einen nativen Dialog an. Wirft `PROJEKT_NICHT_GEOEFFNET`, wenn kein Projekt offen ist (wie
 * `wartungAbgeleiteteNeuAufbauen`) — `menue.ts`s `wartungBefehlAusfuehren`-Hülle fängt das ab.
 */
export function wartungDatenbestandPruefen(): null {
  const db = offenesProjektDatenbank()
  const bericht = datenbestandBericht(db)
  const { titel, nachricht } = berichtNachrichtBauen(uebersetzen, bericht)
  protokollInfo({ befehlsname: 'wartung.datenbestandPruefen', zeilenzahl: fundeGesamt(bericht) })
  void dialog.showMessageBox({ type: 'info', title: titel, message: nachricht })
  return null
}
