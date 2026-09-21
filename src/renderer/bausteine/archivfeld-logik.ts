// AP-1.17 PR-C1 (docs/71_Designsystem.md §2.2/§3.2-Muster, docs/80_Offene_Fragen.md §29): reine
// Logik des `Archivfeld` — von der Komponente getrennt, damit Tastaturnavigation und die
// `befehl:archiv.anlegen`-Nutzlast ohne React/DOM geprüft werden können. Bewusst eine EIGENE
// Dopplung von `ortsfeldNaechsterIndex`/`ortsfeldZeileAktivieren` (analog deren eigener,
// dokumentierter Dopplung aus `personenwaehler-logik.ts`) statt eines dritten gemeinsamen Moduls
// — `Archivfeld` ist die dritte Instanz desselben Muster „Eingabekörper + Vorschlagsliste + feste
// Schlusszeile ‚... anlegen'" (`Personenwaehler`/`Ortsfeld`), KEIN neuer visueller Baustein
// (CLAUDE.md §14).
import type { ArchivAnlegenEin } from '../../shared/schemata/befehle'
import type { ArchivTreffer } from '../../shared/schemata/archiv-suche'

/** Eine Zeile der Vorschlagsliste — ein Treffer ODER die feste Schlusszeile „... als neues Archiv
 * anlegen". Nur EINE feste Schlusszeile, wie beim `Ortsfeld` (kein Platzhalter-Äquivalent). */
export type ArchivfeldZeile = { readonly art: 'treffer'; readonly treffer: ArchivTreffer } | { readonly art: 'neuAnlegen' }

/** Baut die vollständige, navigierbare Zeilenliste: alle Treffer, dann IMMER die feste
 * Schlusszeile — auch bei null Treffern. */
export function archivfeldZeilenAufbauen(treffer: readonly ArchivTreffer[]): readonly ArchivfeldZeile[] {
  return [...treffer.map((eintrag): ArchivfeldZeile => ({ art: 'treffer', treffer: eintrag })), { art: 'neuAnlegen' }]
}

export type ArchivfeldRichtung = 'hoch' | 'runter'

/** Nächster hervorgehobener Index bei einem Pfeiltastendruck — mit Umlauf. Bewusst dupliziert aus
 * `ortsfeldNaechsterIndex` (`ortsfeld-logik.ts`), s. Moduldoku oben. */
export function archivfeldNaechsterIndex(aktuell: number | null, richtung: ArchivfeldRichtung, anzahl: number): number | null {
  if (anzahl <= 0) return null
  if (aktuell === null) return richtung === 'runter' ? 0 : anzahl - 1
  if (richtung === 'runter') return (aktuell + 1) % anzahl
  return (aktuell - 1 + anzahl) % anzahl
}

/** Die zwei Callbacks, die eine `ArchivfeldZeile` beim Aktivieren (Enter/Klick) auslöst — exakt
 * die zwei `Archivfeld`-Props `aufAusgewaehlt`/`aufNeuAnlegen`. */
export interface ArchivfeldAktionen {
  readonly aufAusgewaehlt: (archivId: string) => void
  readonly aufNeuAnlegen: () => void
}

/** Verzweigt eine aktivierte Zeile auf die passende Aktion — EINE Stelle statt einer
 * Fallunterscheidung in der Komponente selbst und im Test. */
export function archivfeldZeileAktivieren(zeile: ArchivfeldZeile, aktionen: ArchivfeldAktionen): void {
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
 * Nutzlast für `befehl:archiv.anlegen` (`src/shared/schemata/befehle.ts`), Schlusszeile „... als
 * neues Archiv anlegen" — der Aufrufer ruft `useArchivAnlegen().mutate(archivfeldNeuAnlegenEin(text))`
 * (`src/renderer/brücke/befehl-hooks.ts`). NUR der Name, analog `ortsfeldNeuAnlegenEin`.
 */
export function archivfeldNeuAnlegenEin(text: string): ArchivAnlegenEin {
  return { name: text }
}
