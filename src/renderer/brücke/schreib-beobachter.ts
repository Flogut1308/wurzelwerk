// AP-1.30 PR 7c (docs/80 §33 V-130-7-speicherfehler): Schreibvorgänge einer Ansicht beobachten,
// ohne dass die Abschnitte davon wissen. Eine Ansicht (heute nur „Person bearbeiten") stellt über
// `SchreibBeobachterKontext` einen Beobachter bereit; die Befehls-Hooks der Autosave-Schreibwege
// (`befehl-hooks.ts`) melden jeden Aufruf über `beobachtetAusfuehren` an ihn. Ohne Anbieter (z. B.
// die Lesesicht) ist der Beobachter `null` und der Aufruf läuft unverändert.
//
// Der Umfang ist damit durch den React-Baum bestimmt: nur Schreibvorgänge aus diesem Editor (dieser
// Person, dieser Sitzung) zählen — ein globaler Zustand über alle Ansichten wäre die andere Frage
// (docs/80 V-130-7-speicherfehler, Folgepunkt „globaler Hinweis").
import { createContext } from 'react'
import type { Ein } from '../../shared/ipc/vertrag'

export interface SchreibBeobachter {
  /**
   * Führt `ausfuehren` aus und meldet Start, Erfolg und Fehlschlag unter dem Feldschlüssel `feld`.
   * Gibt das Ergebnis unverändert zurück bzw. lehnt mit demselben Fehler ab — die Mutation des
   * Aufrufers sieht keinen Unterschied. Für „erneut versuchen" merkt sich der Beobachter
   * `ausfuehren` selbst (dieselbe Funktion, dieselben Variablen).
   */
  readonly beobachten: <T>(feld: string, ausfuehren: () => Promise<T>) => Promise<T>
}

export const SchreibBeobachterKontext = createContext<SchreibBeobachter | null>(null)

export function beobachtetAusfuehren<T>(beobachter: SchreibBeobachter | null, feld: string, ausfuehren: () => Promise<T>): Promise<T> {
  return beobachter === null ? ausfuehren() : beobachter.beobachten(feld, ausfuehren)
}

/** Feldschlüssel für `person.feldSetzen`: jedes Personenfeld ist ein eigener Wert. */
export function schreibFeldPersonFeldSetzen(ein: Ein<'befehl:person.feldSetzen'>): string {
  return `person.feldSetzen:${ein.id}:${ein.feld}`
}

/**
 * Feldschlüssel für `name.aendern`: der Befehl ersetzt die ganze Namenszeile (V-130-2a-rundreise),
 * und jeder Schreibvorgang schickt den vollständigen aktuellen Entwurf. Ein späterer Erfolg an
 * derselben Zeile hat darum auch den zuvor gescheiterten Wert geschrieben — der Schlüssel ist die
 * Zeile, nicht das einzelne Namensfeld.
 */
export function schreibFeldNameAendern(ein: Ein<'befehl:name.aendern'>): string {
  return `name.aendern:${ein.id}`
}

/**
 * Feldschlüssel für `aussage.aendern` (AP-1.30 PR 9a): wie `name.aendern` ersetzt der Befehl die ganze
 * Aussage, und die Abbildung `aussageAendernEinAus` (profil-aussage-logik.ts) schickt jedes Mal den
 * vollständigen Stand — der Schlüssel ist die Aussage, nicht das einzelne Feld.
 */
export function schreibFeldAussageAendern(ein: Ein<'befehl:aussage.aendern'>): string {
  return `aussage.aendern:${ein.id}`
}

/** Feldschlüssel für `ereignis.aendern` (AP-1.30 PR 9a): der Befehl ersetzt die ganze Ereigniszeile —
 * dieselbe Begründung wie bei `schreibFeldAussageAendern`. */
export function schreibFeldEreignisAendern(ein: Ein<'befehl:ereignis.aendern'>): string {
  return `ereignis.aendern:${ein.id}`
}
