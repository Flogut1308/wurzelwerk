// AP-1.4b, S-10…S-13: reine, React-freie Entscheidungslogik des Import-Assistenten. Die Ansicht
// entscheidet nichts selbst (Abnahme): der Schritt nach dem Trockenlauf und die Sperre von
// „Importieren" leiten sich allein aus dem Bericht ab (56_Import_Vertrag.md §6.2, Feld
// `importGesperrt`, in `src/main/import/bericht.ts::baueBericht` = `fehler.length > 0` gesetzt).
// Unit-getestet in `test/einheit/import-schritt-logik.test.ts`.
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'

/** Die vier Schritte des Assistenten (S-10 Datei, S-11 Bericht, S-12 Fehlerliste, S-13 Ergebnis). */
export type ImportSchritt = 'datei-waehlen' | 'bericht' | 'fehlerliste' | 'ergebnis'

/**
 * Nach dem Trockenlauf: bei Fehlern die Fehlerliste (S-12, Flow-Diagramm 72 §596–611), sonst der
 * Trockenlauf-Bericht (S-11). Der Bericht selbst zeigt seinen Fehlerblock ohnehin — der Sprung in
 * die dedizierte Liste ist die „ja"-Kante des Flows.
 */
export function schrittNachTrockenlauf(bericht: Trockenlaufbericht): ImportSchritt {
  return bericht.importGesperrt ? 'fehlerliste' : 'bericht'
}

/** Das Sperr-Urteil für den „Importieren"-Knopf — Grund als i18n-Schlüssel, nie als Text. */
export interface Sperrurteil {
  readonly gesperrt: boolean
  /** i18n-Schlüssel des Sperrgrunds (Namespace `import`), oder `null`, wenn nicht gesperrt. */
  readonly grundSchluessel: string | null
  readonly fehlerAnzahl: number
}

/**
 * „Importieren" ist gesperrt genau dann, wenn der Bericht Fehler trägt (`importGesperrt`). Der
 * Grund steht daneben (Abnahme) — der Schlüssel wird hier gewählt, der Text kommt aus i18n mit
 * `{{anzahl}}`-Interpolation der `fehlerAnzahl`.
 */
export function importSperrurteil(bericht: Trockenlaufbericht): Sperrurteil {
  const fehlerAnzahl = bericht.zusammenfassung.fehlerAnzahl
  if (bericht.importGesperrt) {
    return { gesperrt: true, grundSchluessel: 'sperre_grund', fehlerAnzahl }
  }
  return { gesperrt: false, grundSchluessel: null, fehlerAnzahl }
}
