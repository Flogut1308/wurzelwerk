// AP-1.6 Stufe 3 (C-16 „Spaltenwahl"): welche Spalten die `Datentabelle` überhaupt kennt, in
// welcher Reihenfolge sie erscheinen, und die reine Umschaltlogik für die Sichtbarkeit.
//
// AP-1.10 PR-A (U-1.6-spalten-datenvertrag, jetzt geschlossen): `PersonListeZeile`
// (src/shared/schemata/person-liste.ts) trägt seitdem Beruf, Belegzahl und Kinderzahl — die drei
// fehlenden Spalten aus dem vollen S-05-Spaltensatz ("Name · Lebensdaten · Geburtsort · Beruf ·
// Konfidenz · Belege · Kinderzahl · benutzerdefinierte Felder") ergänzen darum die vier Spalten der
// Stufe-1-Fassung. Nur „benutzerdefinierte Felder" bleibt offen — das ist ein eigenständiges
// Feldsystem (A-18, `feld_definition`/`feld_wert`), kein einzelnes zusätzliches `PersonListeZeile`-
// Feld, und darum kein Fall für diese Stufe.
export type DatentabelleSpalte = 'name' | 'lebensdaten' | 'geburtsort' | 'beruf' | 'konfidenz' | 'belege' | 'kinderzahl'

/** Standardreihenfolge — auch die Reihenfolge, in die `spalteUmschalten` beim Wiedereinblenden zurückfällt. */
export const ALLE_DATENTABELLE_SPALTEN: readonly DatentabelleSpalte[] = ['name', 'lebensdaten', 'geburtsort', 'beruf', 'konfidenz', 'belege', 'kinderzahl']

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
  beruf: 'minmax(140px, 1fr)',
  konfidenz: '96px',
  belege: '88px',
  kinderzahl: '96px',
}

/** CSS-`grid-template-columns`-Wert für die aktuell sichtbaren Spalten, in Standardreihenfolge. */
export function spaltenRasterVorlage(spalten: readonly DatentabelleSpalte[]): string {
  return ALLE_DATENTABELLE_SPALTEN.filter((spalte) => spalten.includes(spalte))
    .map((spalte) => SPALTEN_BREITE[spalte])
    .join(' ')
}
