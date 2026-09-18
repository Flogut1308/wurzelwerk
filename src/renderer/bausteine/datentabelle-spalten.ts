// AP-1.6 Stufe 3 (C-16 „Spaltenwahl"): welche Spalten die `Datentabelle` überhaupt kennt, in
// welcher Reihenfolge sie erscheinen, und die reine Umschaltlogik für die Sichtbarkeit.
//
// ABWEICHUNG vom vollen Spaltensatz aus docs/72_Screens_und_Flows.md S-05 ("Name · Lebensdaten ·
// Geburtsort · Beruf · Konfidenz · Belege · Kinderzahl · benutzerdefinierte Felder"), CLAUDE.md §14
// Fall 1: `PersonListeZeile` (src/shared/schemata/person-liste.ts, AP-1.6 Stufe 1) trägt bisher nur
// `anzeigename`, `geburt_jahr`/`tod_jahr`, `geburt_ort_name` und die Konfidenz-/Widerspruchsfelder —
// Beruf, Belegzahl, Kinderzahl und benutzerdefinierte Felder gibt es im Abfragevertrag noch nicht.
// Die vier hier gebauten Spalten sind darum kein bewusster Scope-Schnitt am Design, sondern eine
// Datenvertrags-Grenze: nicht vorgreifen (CLAUDE.md §10), bis der Vertrag die übrigen Felder liefert
// (vermerkt in docs/80_Offene_Fragen.md, AP-1.6-Nachtrag Stufe 3).
export type DatentabelleSpalte = 'name' | 'lebensdaten' | 'geburtsort' | 'konfidenz'

/** Standardreihenfolge — auch die Reihenfolge, in die `spalteUmschalten` beim Wiedereinblenden zurückfällt. */
export const ALLE_DATENTABELLE_SPALTEN: readonly DatentabelleSpalte[] = ['name', 'lebensdaten', 'geburtsort', 'konfidenz']

/**
 * Schaltet eine Spalte sichtbar/unsichtbar. Zwei Regeln, beide Absicht:
 * - Die zuletzt verbleibende sichtbare Spalte lässt sich nicht ausblenden — eine Datentabelle ohne
 *   jede Spalte wäre kein Zustand, den die Oberfläche anbieten sollte.
 * - Wiedereinblenden fügt an der Standardposition ein (nicht ans Ende), damit die Spaltenreihenfolge
 *   nicht vom Klickverlauf abhängt.
 */
export function spalteUmschalten(sichtbar: readonly DatentabelleSpalte[], spalte: DatentabelleSpalte): readonly DatentabelleSpalte[] {
  const istSichtbar = sichtbar.includes(spalte)
  if (istSichtbar) {
    if (sichtbar.length <= 1) return sichtbar
    return sichtbar.filter((vorhandene) => vorhandene !== spalte)
  }
  return ALLE_DATENTABELLE_SPALTEN.filter((kandidat) => sichtbar.includes(kandidat) || kandidat === spalte)
}

/** Feste Rasterbreite je Spalte (Kopf und Zeilen teilen sich dieselbe Vorlage, sonst tanzen Spalten). */
const SPALTEN_BREITE: Readonly<Record<DatentabelleSpalte, string>> = {
  name: 'minmax(200px, 2fr)',
  lebensdaten: 'minmax(120px, 1fr)',
  geburtsort: 'minmax(160px, 1fr)',
  konfidenz: '96px',
}

/** CSS-`grid-template-columns`-Wert für die aktuell sichtbaren Spalten, in Standardreihenfolge. */
export function spaltenRasterVorlage(spalten: readonly DatentabelleSpalte[]): string {
  return ALLE_DATENTABELLE_SPALTEN.filter((spalte) => spalten.includes(spalte))
    .map((spalte) => SPALTEN_BREITE[spalte])
    .join(' ')
}
