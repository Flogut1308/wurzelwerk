/**
 * Prüfung eines Projektnamens (AP-0.23, §11): Der Name wird Teil eines Ordnernamens
 * (`Name.ahnen`), darum gelten die Windows-Dateisystemregeln plattformunabhängig — auch auf
 * macOS, damit ein auf Windows angelegtes Projekt dort ebenfalls funktioniert und umgekehrt.
 *
 * Reine Funktion, kein `node:fs`/`node:path`/`node:os` — `src/shared` darf kein Node (§2).
 */

const PFADTRENNER = /[/\\]/
const VERBOTENE_ZEICHEN = /[<>:"|?*\x00-\x1F]/
const RESERVIERTER_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i
const ENDET_AUF_PUNKT_ODER_LEERZEICHEN = /[ .]$/

export function projektnameGueltig(name: string): boolean {
  if (name.trim() === '') {
    return false
  }
  if (name === '.' || name === '..') {
    return false
  }
  if (PFADTRENNER.test(name)) {
    return false
  }
  if (VERBOTENE_ZEICHEN.test(name)) {
    return false
  }
  if (RESERVIERTER_NAME.test(name)) {
    return false
  }
  if (ENDET_AUF_PUNKT_ODER_LEERZEICHEN.test(name)) {
    return false
  }
  return true
}
