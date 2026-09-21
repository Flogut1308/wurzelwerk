// AP-1.13 PR-C (docs/71_Designsystem.md §3.2, docs/arbeitspakete.md AP-1.13): reine Logik des
// `Ortsfeld` — von der Komponente getrennt, damit Tastaturnavigation und die
// `befehl:ort.anlegen`-Nutzlast ohne React/DOM geprüft werden können (analog
// `personenwaehler-logik.ts`, dessen Muster PR-C bewusst spiegelt). `Ortsfeld` selbst bleibt wie
// jeder Baustein hier vollständig kontrolliert (kein `useState`) — die eigentliche
// `abfrage:ort.suche`/`befehl:ort.anlegen`-Verdrahtung (`src/renderer/brücke/*-hooks.ts`) liegt
// beim Aufrufer.
//
// SCOPE (CLAUDE.md §10, nicht vorgreifen): §3.2 zeigt je Vorschlag die VOLLE zeitabhängige
// Zugehörigkeitskette (politisch/kirchlich getrennt, z. B. "Kreis Marienwerder · Westpreußen ·
// Preußen"). Diese volle Hierarchie-Pflege ist AP-1.16 — hier steht bewusst NUR der datumsgültige
// Name je Vorschlag (`OrtTreffer.anzeigename`, bereits vom Hauptprozess über
// `src/core/ort/zeitbezug.ts::gueltigerOrtsname` berechnet), s. docs/80_Offene_Fragen.md.
import type { OrtAnlegenEin } from '../../shared/schemata/befehle'
import type { OrtTreffer } from '../../shared/schemata/ort-suche'

/** Eine Zeile der Vorschlagsliste — ein Treffer ODER die feste Schlusszeile „... als neuen Ort
 * anlegen" (§3.2: „immer die letzte Zeile, nie ein separater Knopf"). Anders als beim
 * `Personenwaehler` gibt es hier nur EINE feste Schlusszeile (kein Platzhalter-Äquivalent für
 * Orte). */
export type OrtsfeldZeile = { readonly art: 'treffer'; readonly treffer: OrtTreffer } | { readonly art: 'neuAnlegen' }

/** Baut die vollständige, navigierbare Zeilenliste: alle Treffer, dann IMMER die feste
 * Schlusszeile — auch bei null Treffern (§3.2 zeigt sie als Ausweg, wenn kein Ort passt). */
export function ortsfeldZeilenAufbauen(treffer: readonly OrtTreffer[]): readonly OrtsfeldZeile[] {
  return [...treffer.map((eintrag): OrtsfeldZeile => ({ art: 'treffer', treffer: eintrag })), { art: 'neuAnlegen' }]
}

export type OrtsfeldRichtung = 'hoch' | 'runter'

/** Nächster hervorgehobener Index bei einem Pfeiltastendruck — mit Umlauf. Bewusst dupliziert aus
 * `personenwaehlerNaechsterIndex` (`personenwaehler-logik.ts`), statt eines gemeinsamen Moduls für
 * zwei Zeilen Indexrechnung — analog zur dokumentierten, bewussten Dopplung von `konfidenzStufe`
 * in `tabellenzeile.tsx`/`feld-konfidenz.tsx`. */
export function ortsfeldNaechsterIndex(aktuell: number | null, richtung: OrtsfeldRichtung, anzahl: number): number | null {
  if (anzahl <= 0) return null
  if (aktuell === null) return richtung === 'runter' ? 0 : anzahl - 1
  if (richtung === 'runter') return (aktuell + 1) % anzahl
  return (aktuell - 1 + anzahl) % anzahl
}

/** Die zwei Callbacks, die eine `OrtsfeldZeile` beim Aktivieren (Enter/Klick) auslöst — exakt die
 * zwei `Ortsfeld`-Props `aufAusgewaehlt`/`aufNeuAnlegen`. */
export interface OrtsfeldAktionen {
  readonly aufAusgewaehlt: (ortId: string) => void
  readonly aufNeuAnlegen: () => void
}

/** Verzweigt eine aktivierte Zeile auf die passende Aktion — EINE Stelle statt einer
 * Fallunterscheidung in der Komponente selbst und im Test. */
export function ortsfeldZeileAktivieren(zeile: OrtsfeldZeile, aktionen: OrtsfeldAktionen): void {
  switch (zeile.art) {
    case 'treffer':
      aktionen.aufAusgewaehlt(zeile.treffer.id)
      return
    case 'neuAnlegen':
      aktionen.aufNeuAnlegen()
      return
  }
}

/**
 * Nutzlast für `befehl:ort.anlegen` (`src/shared/schemata/befehle.ts`), Schlusszeile „... als
 * neuen Ort anlegen" (§3.2) — der Aufrufer ruft `useOrtAnlegen().mutate(ortsfeldNeuAnlegenEin(text))`
 * in seinem `aufNeuAnlegen`. NUR der Name (minimale Ortsverwaltung, s. Moduldoku oben) — `typ`
 * bleibt unbestimmt, wie ein schnell eingetippter Ortsname es ist, bevor jemand ihn einordnet.
 */
export function ortsfeldNeuAnlegenEin(text: string): OrtAnlegenEin {
  return { name: text }
}

/** Verkettet `OrtTreffer.politischeKette` zu EINER Zeile ("Kreis Marienwerder · Westpreußen ·
 * Preußen", §3.2) — der Trennpunkt lebt hier, in einer `.ts`-Datei, nicht als Zeichenkette in
 * einem JSX-Kindknoten (react/jsx-no-literals, CLAUDE.md §4), analog `lebensdatenAnzeige()`
 * (`lebensdaten-anzeige.ts`). Leere Kette -> leere Zeichenkette, der Aufrufer (`ortsfeld.tsx`)
 * zeigt die Hierarchiezeile dann gar nicht erst. */
export function ortsfeldHierarchieText(politischeKette: readonly string[]): string {
  return politischeKette.join(' · ')
}

/** Ein i18n-Schlüssel (`felder.json`) + dessen Interpolationswerte für den Geltungszeitraum eines
 * Treffers (docs/71_Designsystem.md §3.2 "Zwingend": Geltungszeitraum rechts neben jedem
 * Vorschlag, z. B. "bis 1945"/"ab 1945") — die Fallunterscheidung (nur Ende offen / nur Anfang
 * offen / beide gesetzt) lebt hier statt in JSX, analog `zeileText()` (`ortsfeld.tsx`). */
export type OrtsfeldGeltungszeitraum =
  | { readonly schluessel: 'ortsfeld_geltung_bis'; readonly werte: { readonly jahr: number } }
  | { readonly schluessel: 'ortsfeld_geltung_ab'; readonly werte: { readonly jahr: number } }
  | { readonly schluessel: 'ortsfeld_geltung_zwischen'; readonly werte: { readonly von: number; readonly bis: number } }

/**
 * Baut den Geltungszeitraum-Hinweis EINES Treffers aus `gueltigVonJahr`/`gueltigBisJahr`
 * (`OrtTreffer`, bereits vom Hauptprozess über `src/core/ort/zeitbezug.ts::geltungszeitraumJahre`
 * berechnet — KEIN zweiter Auflösungsweg hier). `undefined`, wenn beide Grenzen offen sind
 * (unbegrenzt gültig) — der Aufrufer (`ortsfeld.tsx`) zeigt dann keinen Zusatz.
 */
export function ortsfeldGeltungszeitraum(treffer: OrtTreffer): OrtsfeldGeltungszeitraum | undefined {
  const { gueltigVonJahr, gueltigBisJahr } = treffer
  if (gueltigVonJahr !== undefined && gueltigBisJahr !== undefined) {
    return { schluessel: 'ortsfeld_geltung_zwischen', werte: { von: gueltigVonJahr, bis: gueltigBisJahr } }
  }
  if (gueltigBisJahr !== undefined) {
    return { schluessel: 'ortsfeld_geltung_bis', werte: { jahr: gueltigBisJahr } }
  }
  if (gueltigVonJahr !== undefined) {
    return { schluessel: 'ortsfeld_geltung_ab', werte: { jahr: gueltigVonJahr } }
  }
  return undefined
}
