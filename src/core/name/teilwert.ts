// AP-1.30 Bugfix U-130-randleerraum-altbestand (A-02, A-19; docs/80 §33 V-130-fix-randleerraum,
// V-130-11c-1b, V-130-11-E4): die EINE Regel, ob der Wert eines Namensteils gegenüber dem gespeicherten
// unverändert ist. Genutzt vom Handler `namensform.uebernehmen` (schreibt nur Geändertes, No-op AP-0.22,
// unveränderter Altbestand bleibt E4) und vom Modal „Namensform bearbeiten" (`namensform-entwurf.ts`: E9-
// Nachfrage, Korrektur einer Umschrift). Zwei getrennte Regeln liefen bei ungetrimmtem Altbestand
// („Gutnoff " aus der flachen Brücke) auseinander. Reines TypeScript (CLAUDE.md §2).

/**
 * Ist `entwurf` gegenüber dem gespeicherten Wert `gespeichert` unverändert?
 * 1. gleicher Rohwert — auch ungetrimmter Altbestand, unberührt;
 * 2. beide leer bzw. nur Leerraum — einen Leerraum-Teil (`' '`) zu leeren ändert nichts
 *    (U-130-11-0b-leerraum-teil);
 * 3. gleicher getrimmter Wert UND der Entwurf trägt selbst Randleerraum — ein angehängtes Leerzeichen ist
 *    keine Änderung (Review #208 H1/H4);
 * 4. sonst geändert — auch die Bereinigung von ungetrimmtem Altbestand („Gutnoff " → „Gutnoff").
 * Leerraum ist, was `String.prototype.trim` entfernt (einschließlich NBSP U+00A0).
 */
export function teilWertUnveraendert(gespeichert: string, entwurf: string): boolean {
  if (entwurf === gespeichert) return true
  const getrimmt = entwurf.trim()
  if (getrimmt === '' && gespeichert.trim() === '') return true
  return getrimmt === gespeichert.trim() && entwurf !== getrimmt
}
