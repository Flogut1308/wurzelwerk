// AP-1.6 Stufe 3 (C-16): reine Formatierung der Lebensdaten-Zelle. Eigene Datei statt Inline-Code
// in `tabellenzeile.tsx`, damit sie ohne DOM getestet werden kann und weil sie kein JSX-Literal ist
// (`react/jsx-no-literals`, CLAUDE.md §4) — der Bindestrich lebt hier in einer .ts-Funktion, nicht
// als Zeichenkette in einem JSX-Kindknoten.
//
// ABWEICHUNG von docs/72_Screens_und_Flows.md S-05 („eine Zeile mit unscharfem Datum: etwa 1890 –
// 1961"), CLAUDE.md §14 Fall 1: `PersonListeZeile.geburt_jahr`/`tod_jahr` sind einfache
// `number | null` (src/shared/schemata/person-liste.ts) — der Abfragevertrag trägt noch keine
// Unschärfe-/Modifikator-Information für die Listenzeile. Die Zelle zeigt darum nur den Jahreswert,
// ohne einen erfundenen „etwa"-Zusatz. Vermerkt in docs/80_Offene_Fragen.md, AP-1.6-Nachtrag Stufe 3.
export function lebensdatenAnzeige(geburtJahr: number | null, todJahr: number | null): string {
  if (geburtJahr === null && todJahr === null) return ''
  const von = geburtJahr === null ? '' : String(geburtJahr)
  const bis = todJahr === null ? '' : String(todJahr)
  return `${von}–${bis}`
}
