// AP-1.30 (PR 4), Abnahme „Kein Speichern-Knopf: Blur oder 400 ms Debounce schreibt … Koaleszenz =
// ein Undo-Schritt, aber nur mit koaleszenzSchluessel (Befehl + Subjekt + Feld). Jeder Befehl, den
// der Autosave schreibt, bekommt einen Schlüssel". Hier, in `src/shared`, weil beide Seiten davon
// abhängen: der Hauptprozess vergibt die Schlüssel (`src/main/befehle/koaleszenz-schluessel.ts`), der
// Renderer entprellt mit derselben Frist (`profil-bearbeiten-debounce.ts`), und die Tests prüfen
// beides gegen genau diese Werte (`test/einheit/autosave-befehle-struktur.test.ts`,
// `test/einheit/koaleszenz-autosave.test.ts`, `test/e2e/ablauf-07-autosave-koaleszenz.spec.ts`).

/** Ruhephase, nach der ein Autosave-Feld seinen Entwurf schreibt (AP-1.30: „400 ms Debounce"). */
export const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * Die Befehle, die der Autosave des Personen-Editors schreibt oder schreiben wird (AP-1.30) — jeder
 * trägt einen Koaleszenzschlüssel `Befehl:Subjekt:Feld`. Stand PR 4: aus dem Renderer schreiben
 * `person.feldSetzen` (nur `notiz`) und `name.aendern` per Debounce/Blur; `ereignis`/`partnerschaft`/
 * `elternschaft`/`aussage.aendern` bekommen ihre Aufrufer mit den Reitern (hueter #156 H4). Die Schlüssel
 * gelten schon jetzt, damit kein späterer Reiter ohne sie schreibt. `person.feldSetzen` ändert je Aufruf genau eine Spalte;
 * die übrigen ersetzen eine ganze Zeile und bekommen den Schlüssel nur mit gesetztem Vertragsfeld
 * `feld` und nur, wenn sich tatsächlich nur dieses Feld ändert.
 */
export const AUTOSAVE_BEFEHLE = ['person.feldSetzen', 'name.aendern', 'ereignis.aendern', 'partnerschaft.aendern', 'elternschaft.aendern', 'aussage.aendern'] as const

export type AutosaveBefehl = (typeof AUTOSAVE_BEFEHLE)[number]
