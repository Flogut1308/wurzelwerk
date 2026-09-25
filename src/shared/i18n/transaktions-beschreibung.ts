// AP-1.30 (PR 8): Übersetzung eines `transaktion.beschreibung`-Werts — EINE Wahrheit für das
// Undo-Menü des Hauptprozesses (`src/main/menue/menue.ts`) und den Verlauf der rechten Spalte im
// Renderer (`src/renderer/ansichten/profil/editor-rechte-spalte-logik.ts`). Früher lag die Funktion
// privat in `menue.ts`; hierher gezogen, weil beide Seiten dieselbe Zerlegung brauchen.
//
// `src/shared` (CLAUDE.md §2): kein Node, kein Electron, kein i18next-Import — die Übersetzung
// selbst liefert der Aufrufer als `t`.

/** Einfache Übersetzerform beider Aufrufer (i18next-Instanz des Menüs bzw. des Renderers). */
export type BeschreibungUebersetzer = (schluessel: string, optionen?: Record<string, unknown>) => string

/**
 * Zerlegt einen `transaktion.beschreibung`-Wert der Form `<namensraum>.<schlüssel>` (z. B.
 * `journal.person_angelegt`, s. `src/main/befehle/registrierung.ts`). `null`, wenn kein Namensraum-
 * Präfix vorhanden ist — dann ist der Wert kein i18n-Schlüssel (z. B. ältere freie Texte).
 */
export function transaktionsBeschreibungZerlegen(beschreibung: string): { readonly namensraum: string; readonly schluessel: string } | null {
  const trennstelle = beschreibung.indexOf('.')
  if (trennstelle <= 0 || trennstelle === beschreibung.length - 1) return null
  return { namensraum: beschreibung.slice(0, trennstelle), schluessel: beschreibung.slice(trennstelle + 1) }
}

/**
 * Übersetzt einen `transaktion.beschreibung`-Wert in den fertigen deutschen Satz — mit explizitem
 * `ns`, weil der i18next-Standard-`keySeparator` `.` sonst innerhalb des Standard-Namensraums nach
 * einem verschachtelten Schlüssel suchen würde. Ohne Präfix wird der Wert unverändert
 * zurückgegeben (defensiv: jede vom Befehlsbus erzeugte Beschreibung trägt eines).
 */
export function transaktionsBeschreibungUebersetzen(t: BeschreibungUebersetzer, beschreibung: string): string {
  const teile = transaktionsBeschreibungZerlegen(beschreibung)
  if (teile === null) return beschreibung
  return t(teile.schluessel, { ns: teile.namensraum })
}
