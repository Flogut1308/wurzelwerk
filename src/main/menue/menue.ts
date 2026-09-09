import { Menu, type MenuItemConstructorOptions } from 'electron'
import i18next from 'i18next'
import journal from '../../shared/i18n/de/journal.json'
import menue from '../../shared/i18n/de/menue.json'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { JournalStatusNutzlast } from '../../shared/ipc/vertrag'
import { JOURNAL_STATUS_KEIN_PROJEKT, journalStatusBeobachterSetzen, journalStatusMelden } from '../journal/journal-status-melder'
import { redo, undo } from '../journal/undo'
import { sendeEreignis } from '../ipc/ereignisse'
import { protokollFehler } from '../protokoll/logger'
import { offenesProjektDatenbank } from '../projekt/projekt-dienst'
import { wartungAbgeleiteteNeuAufbauen } from '../wartung/abgeleitete-neu-aufbauen'
import { TASTENKUERZEL } from './tastenkuerzel'

/**
 * Eigene i18next-Instanz für den Hauptprozess (ADR-011, AP-0.3) — react-i18next ist
 * Renderer-only (§2). `initAsync: false`, weil die Ressourcen gebündelt sind: `init()` muss
 * abgeschlossen sein, bevor `menueErzeugen()` zum ersten Mal `t(...)` aufruft, und dieser Aufruf
 * passiert synchron in `app.whenReady()` (siehe `src/main/index.ts`).
 *
 * Namensraum `journal` kommt seit AP-0.10 dazu: `transaktion.beschreibung` speichert einen
 * vollständigen i18n-Schlüssel im Format `<namensraum>.<schlüssel>` (z. B.
 * `journal.person_angelegt`, s. `src/main/befehle/registrierung.ts`) - ein anderer Namensraum als
 * `menue` selbst, darum getrennt geladen und über `transaktionsBeschreibungUebersetzen()` unten
 * mit explizitem `ns` aufgelöst (i18next-Standard-`keySeparator` `.` würde sonst innerhalb von
 * `menue` nach einem verschachtelten Schlüssel `journal.person_angelegt` suchen, den es dort nicht
 * gibt).
 */
const menueI18n = i18next.createInstance()
void menueI18n.init({
  lng: 'de',
  fallbackLng: false,
  ns: ['menue', 'journal'],
  defaultNS: 'menue',
  resources: { de: { menue, journal } },
  initAsync: false,
})

type MenueUebersetzer = (schluessel: string, optionen?: Record<string, unknown>) => string

/**
 * Adapter statt `menueI18n.t.bind(menueI18n)` direkt als `MenueUebersetzer` zu verwenden:
 * i18next `TFunction` hat mehrere, sehr spezifische Überladungen (u. a. für `defaultValue` an
 * Position 2) - eine `bind()`-Zuweisung an den bewusst einfacheren `MenueUebersetzer`-Typ oben
 * scheitert unter `exactOptionalPropertyTypes` (CLAUDE.md §4) an einer dieser Überladungen. Der
 * Adapter ruft `menueI18n.t(...)` stattdessen mit genau der hier gebrauchten, einfachen Form auf.
 */
function menueUebersetzen(schluessel: string, optionen?: Record<string, unknown>): string {
  return optionen === undefined ? menueI18n.t(schluessel) : menueI18n.t(schluessel, optionen)
}

/**
 * Übersetzt einen `transaktion.beschreibung`-Wert (`<namensraum>.<schlüssel>`, z. B.
 * `journal.person_angelegt`) in den fertigen deutschen Satz (s. Kommentar bei `menueI18n` oben).
 */
function transaktionsBeschreibungUebersetzen(t: MenueUebersetzer, beschreibungSchluessel: string): string {
  const trennstelle = beschreibungSchluessel.indexOf('.')
  if (trennstelle === -1) {
    // Defensiv: jede von `src/main/befehle/registrierung.ts` erzeugte Beschreibung trägt ein
    // `<namensraum>.`-Präfix. Dieser Zweig sollte nie erreicht werden (kein `!`, CLAUDE.md §4).
    return beschreibungSchluessel
  }
  const namensraum = beschreibungSchluessel.slice(0, trennstelle)
  const schluessel = beschreibungSchluessel.slice(trennstelle + 1)
  return t(schluessel, { ns: namensraum })
}

/** Beschriftung + Aktivierung eines der beiden Journal-Menüpunkte (Rückgängig/Wiederholen). */
export interface JournalMenueEintrag {
  readonly label: string
  readonly enabled: boolean
}

/**
 * Reine Beschriftungslogik der zwei Journal-Menüpunkte (AP-0.10-Auftrag, testbar ohne Electron in
 * `test/einheit/menue-undo-beschriftung.test.ts`): mit Ziel „Rückgängig: {{beschreibung}}“, ohne
 * Ziel schlicht „Rückgängig“ und `enabled: false`. `status` ist `undefined`, wenn kein Projekt
 * offen ist (kein Journal, also nichts rücknehmbar).
 */
export function journalMenueBeschriftung(
  t: MenueUebersetzer,
  status: JournalStatusNutzlast | undefined,
): { readonly rueckgaengig: JournalMenueEintrag; readonly wiederholen: JournalMenueEintrag } {
  const s = status ?? JOURNAL_STATUS_KEIN_PROJEKT

  function eintrag(moeglich: boolean, beschreibungSchluessel: string | null, ohneZielSchluessel: string, mitZielSchluessel: string): JournalMenueEintrag {
    if (!moeglich) {
      return { label: t(ohneZielSchluessel), enabled: false }
    }
    if (beschreibungSchluessel === null) {
      return { label: t(ohneZielSchluessel), enabled: true }
    }
    return {
      label: t(mitZielSchluessel, { beschreibung: transaktionsBeschreibungUebersetzen(t, beschreibungSchluessel) }),
      enabled: true,
    }
  }

  return {
    rueckgaengig: eintrag(s.undoMoeglich, s.undoBeschreibung, 'journal.rueckgaengig', 'journal.rueckgaengig_mit_ziel'),
    wiederholen: eintrag(s.redoMoeglich, s.redoBeschreibung, 'journal.wiederholen', 'journal.wiederholen_mit_ziel'),
  }
}

/**
 * Führt `undo()`/`redo()` direkt aus (kein Umweg über `befehl:journal.undo`/`.redo` - das native
 * Menü läuft im Hauptprozess, ein IPC-Roundtrip zu sich selbst wäre unnötig). Sendet danach
 * dieselben beiden Ereignisse, die der Befehlsbus bei einem Erfolg auslösen würde
 * (`ereignis:datenGeaendert`, `ereignis:journalStatus` inkl. Menü-Aktualisierung über
 * `journalStatusMelden()`). Ohne offenes Projekt oder ohne Undo-/Redo-Ziel bleibt der Menüpunkt
 * `enabled: false` (s. `journalMenueBeschriftung`) - dieser Zweig fängt trotzdem defensiv jede
 * Ausnahme ab, analog zum bestehenden `wartung_abgeleiteteNeuAufbauen`-Handler unten (Menübefehle
 * laufen nicht über die IPC-Hülle, §7).
 */
function journalBefehlAusfuehren(art: 'undo' | 'redo'): void {
  try {
    const db = offenesProjektDatenbank()
    const ergebnis = art === 'undo' ? undo(db) : redo(db)
    sendeEreignis('ereignis:datenGeaendert', { transaktionId: ergebnis.transaktionId, ursache: `journal.${art}` })
    journalStatusMelden(db)
  } catch (fehler) {
    protokollFehler({
      befehlsname: `journal.${art}`,
      code: fehler instanceof WurzelFehler ? fehler.code : 'INTERN_UNERWARTET',
    })
  }
}

/**
 * Baut das Menü für den übergebenen Journalstatus. `status: undefined` heißt „kein Projekt
 * offen“ - beide Journal-Menüpunkte sind dann ausgegraut (s. `journalMenueBeschriftung`).
 */
export function menueErzeugen(status: JournalStatusNutzlast | undefined): Menu {
  const t = menueUebersetzen
  const journalEintraege = journalMenueBeschriftung(t, status)
  const vorlage: MenuItemConstructorOptions[] = [
    {
      label: t('wurzelwerk'),
      submenu: [{ label: t('beenden'), accelerator: TASTENKUERZEL.beenden, role: 'quit' }],
    },
    {
      label: t('bearbeiten'),
      submenu: [
        {
          label: journalEintraege.rueckgaengig.label,
          accelerator: TASTENKUERZEL.rueckgaengig,
          enabled: journalEintraege.rueckgaengig.enabled,
          click: () => journalBefehlAusfuehren('undo'),
        },
        {
          label: journalEintraege.wiederholen.label,
          accelerator: TASTENKUERZEL.wiederholen,
          enabled: journalEintraege.wiederholen.enabled,
          click: () => journalBefehlAusfuehren('redo'),
        },
        { type: 'separator' },
        { label: t('ausschneiden'), role: 'cut' },
        { label: t('kopieren'), role: 'copy' },
        { label: t('einfuegen'), role: 'paste' },
      ],
    },
    {
      label: t('wartung'),
      submenu: [
        {
          label: t('wartung_abgeleiteteNeuAufbauen'),
          click: () => {
            try {
              wartungAbgeleiteteNeuAufbauen()
            } catch (fehler) {
              // Menübefehle laufen nicht über die IPC-Hülle (§7) - die Ausnahme darf den
              // Hauptprozess trotzdem nie verlassen, darum wird sie hier selbst protokolliert.
              protokollFehler({
                befehlsname: 'wartung.abgeleiteteNeuAufbauen',
                code: fehler instanceof WurzelFehler ? fehler.code : 'INTERN_UNERWARTET',
              })
            }
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(vorlage)
}

/** Baut das Menü für den übergebenen Journalstatus neu und setzt es als Anwendungsmenü. */
export function menueAktualisieren(status: JournalStatusNutzlast | undefined): void {
  Menu.setApplicationMenu(menueErzeugen(status))
}

/**
 * Setzt beim Start das anfängliche (ausgegraute) Menü UND registriert `menueAktualisieren()` als
 * Beobachter bei `journalStatusMelden()` (`src/main/journal/journal-status-melder.ts`) - so
 * erreicht ein Undo/Redo-Status, egal ob durch einen Befehl über den Bus (`src/main/befehle/
 * bus.ts`), durch `befehl:journal.undo`/`.redo` (`src/main/ipc/registrierung.ts`) oder durch das
 * Menü selbst ausgelöst, immer auch das Menü - ohne dass eine dieser Stellen `menue.ts` direkt
 * importieren müsste (CLAUDE.md §12-Auftrag AP-0.10: kein Import `bus.ts` → `menue.ts`).
 */
export function menueInitialisieren(): void {
  journalStatusBeobachterSetzen(menueAktualisieren)
  menueAktualisieren(undefined)
}
