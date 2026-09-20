// AP-1.13 PR-B (docs/71_Designsystem.md §3.3, A-13 „aus jedem Kontext anlegen"): reine Logik des
// `Personenwaehler` — von der Komponente getrennt, damit Tastaturnavigation und die
// `befehl:person.anlegen`-Nutzlast ohne React/DOM geprüft werden können (analog
// `blaetterleiste-logik.ts`/`filterleiste-logik.ts`). `Personenwaehler` selbst bleibt wie jeder
// andere Baustein hier vollständig kontrolliert (kein `useState`, s. Kommentar zu
// `kalenderErweitert` in `datumsfeld.tsx`) — die Suche über `abfrage:suche`
// (`src/shared/schemata/person-liste.ts`) UND das Auslösen von `befehl:person.anlegen`
// (`src/shared/schemata/befehle.ts`) sind darum Sache des Aufrufers (`useSuche`/`usePersonAnlegen`,
// `src/renderer/brücke/*-hooks.ts`); dieses Modul legt nur die Nutzlast und die Indexrechnung
// verbindlich fest, damit kein Aufrufer sie abweichend nachbaut.
import type { PersonAnlegenEin } from '../../shared/schemata/befehle'
import type { SucheTreffer } from '../../shared/schemata/person-liste'
import { lebensdatenAnzeige } from './lebensdaten-anzeige'

/** Eine Zeile der Trefferliste — ein Treffer ODER eine der zwei festen Schlusszeilen (§3.3: „letzte
 * Zeilen ... immer die letzte Zeile, nie ein separater Knopf"). Die Reihenfolge von
 * `personenwaehlerZeilenAufbauen` legt fest, dass „neue Person anlegen" vor „Platzhalter anlegen"
 * steht — §3.3 nennt „als neue Person anlegen" zuerst, „als Platzhalter anlegen" als „zweite
 * letzte" Zeile. */
export type PersonenwaehlerZeile =
  | { readonly art: 'treffer'; readonly treffer: SucheTreffer }
  | { readonly art: 'neuAnlegen' }
  | { readonly art: 'platzhalterAnlegen' }

/** Baut die vollständige, navigierbare Zeilenliste: alle Treffer, dann IMMER die zwei festen
 * Schlusszeilen — auch bei null Treffern (§3.3 zeigt sie als Ausweg, wenn niemand passt). */
export function personenwaehlerZeilenAufbauen(treffer: readonly SucheTreffer[]): readonly PersonenwaehlerZeile[] {
  return [
    ...treffer.map((eintrag): PersonenwaehlerZeile => ({ art: 'treffer', treffer: eintrag })),
    { art: 'neuAnlegen' },
    { art: 'platzhalterAnlegen' },
  ]
}

export type PersonenwaehlerRichtung = 'hoch' | 'runter'

/**
 * Nächster hervorgehobener Index bei einem Pfeiltastendruck — mit Umlauf (nach dem letzten Eintrag
 * wieder zum ersten, davor). `aktuell === null` (noch nichts hervorgehoben) springt "runter" auf
 * den ersten Eintrag, "hoch" auf den letzten — wie ein natives `<select>`. `anzahl <= 0` kann bei
 * einer korrekt aufgebauten Zeilenliste nicht vorkommen (die zwei Schlusszeilen fehlen nie), bleibt
 * hier trotzdem sicher: `null`, statt eine Division durch 0/negativen Index zu riskieren.
 */
export function personenwaehlerNaechsterIndex(aktuell: number | null, richtung: PersonenwaehlerRichtung, anzahl: number): number | null {
  if (anzahl <= 0) return null
  if (aktuell === null) return richtung === 'runter' ? 0 : anzahl - 1
  if (richtung === 'runter') return (aktuell + 1) % anzahl
  return (aktuell - 1 + anzahl) % anzahl
}

/** Die drei Callbacks, die eine `PersonenwaehlerZeile` beim Aktivieren (Enter/Klick) auslöst —
 * exakt die drei `Personenwaehler`-Props `aufAusgewaehlt`/`aufNeuAnlegen`/`aufPlatzhalterAnlegen`. */
export interface PersonenwaehlerAktionen {
  readonly aufAusgewaehlt: (personId: string) => void
  readonly aufNeuAnlegen: () => void
  readonly aufPlatzhalterAnlegen: () => void
}

/** Verzweigt eine aktivierte Zeile auf die passende Aktion — EINE Stelle statt einer Fallunter-
 * scheidung in der Komponente selbst und im Test. */
export function personenwaehlerZeileAktivieren(zeile: PersonenwaehlerZeile, aktionen: PersonenwaehlerAktionen): void {
  switch (zeile.art) {
    case 'treffer':
      aktionen.aufAusgewaehlt(zeile.treffer.person_id)
      return
    case 'neuAnlegen':
      aktionen.aufNeuAnlegen()
      return
    case 'platzhalterAnlegen':
      aktionen.aufPlatzhalterAnlegen()
      return
  }
}

/** Verkettet Geburts-/Todesjahr zu einer Zeile ("1890 – 1961") — die Trefferzeile zeigt hier
 * bewusst die reinen Jahreszahlen (§3.3: „Lebensdaten"), nicht die volle Datums-Unschärfegruppe
 * `PersonListeZeile.geburt_datum`/`tod_datum` (die die Tabellenzeile für die genauere Spalte
 * verwendet, `tabellenzeile.tsx`) — der Personenwähler ist eine schmale Trefferliste zur
 * Unterscheidung zweier gleichnamiger Personen, keine Datenspalte mit Genauigkeitsanspruch. Nutzt
 * denselben Bindestrich-Verkettungsweg wie `lebensdaten-anzeige.ts` (dieselbe Begründung: der
 * Bindestrich lebt in einer .ts-Datei, kein JSX-Zeichenkettenliteral, CLAUDE.md §4). */
export function personenwaehlerLebensdatenText(geburtJahr: number | null, todJahr: number | null): string {
  return lebensdatenAnzeige(geburtJahr === null ? null : String(geburtJahr), todJahr === null ? null : String(todJahr))
}

/**
 * Nutzlast für `befehl:person.anlegen` (`src/shared/schemata/befehle.ts`), Schlusszeile „als neue
 * Person anlegen" (§3.3) — der Aufrufer ruft `usePersonAnlegen().mutate(personenwaehlerNeuAnlegenEin())`
 * in seinem `aufNeuAnlegen`. Keine Namensvergabe hier: `person.anlegen` kennt keine Namensspalte
 * (die liegt in der eigenen `name`-Tabelle, `befehl:name.anlegen`) — das bleibt dem Folgeschritt
 * des Aufrufers vorbehalten, dieses Arbeitspaket deckt nur den Personen-Stammsatz ab.
 */
export function personenwaehlerNeuAnlegenEin(): PersonAnlegenEin {
  return { privat: 0, ist_platzhalter: 0 }
}

/**
 * Nutzlast für `befehl:person.anlegen`, Schlusszeile „als Platzhalter anlegen" (§3.3, A-17) —
 * `ist_platzhalter: 1` mit `platzhalter_grund: 'nicht_identifiziert'`: aus dem Personenwähler heraus
 * entsteht ein Platzhalter immer, weil eine Suche keinen passenden Treffer ergab, nicht weil die
 * Person unehelich ist oder eine sonstige bekannte Forschungslücke vorliegt (die übrigen
 * `PlatzhalterGrundEnum`-Werte bleiben Formularen vorbehalten, die den Grund tatsächlich kennen).
 */
export function personenwaehlerPlatzhalterAnlegenEin(): PersonAnlegenEin {
  return { privat: 0, ist_platzhalter: 1, platzhalter_grund: 'nicht_identifiziert' }
}
