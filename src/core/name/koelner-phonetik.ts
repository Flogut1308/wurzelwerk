// AP-0.7, C-16/C-17, ADR-014, 55_Architektur.md §5.2. Reine, deterministische Funktion
// (CLAUDE.md §4) - Trigger UND `alleAbgeleitetenNeuAufbauen()` rufen dieselbe SQL-Funktion
// `koelner_phonetik` (registriert in src/main/datenbank/verbindung.ts) auf, die nur diese
// Funktion hier aufruft. Das ist der Schlüssel zur Bitgleichheit zwischen Trigger-Pflege und
// vollständigem Neuaufbau von `name_phonetik`.
//
// Referenz: die "Kölner Phonetik" (Postel 1969) - ein Verfahren, das deutsche Nachnamen auf einen
// Zifferncode abbildet, damit lautähnliche Schreibweisen (Meyer/Maier, Schmidt/Schmitt) beim
// Suchen zusammenfinden. Ablauf: Buchstaben kontextabhängig zu Ziffern codieren, mehrfach
// aufeinanderfolgende gleiche Ziffern zu einer zusammenfassen, dann alle Ziffern "0" (Vokale)
// entfernen.

const VOKALGRUPPE = new Set(['A', 'E', 'I', 'J', 'O', 'U', 'Y'])
const C_KONTEXT_FUER_4 = new Set(['A', 'H', 'K', 'L', 'O', 'Q', 'R', 'U', 'X'])
const C_KONTEXT_FUER_4_OHNE_ANLAUT = new Set(['A', 'H', 'K', 'O', 'Q', 'U', 'X'])

/** Codiert einen einzelnen Buchstaben (`buchstaben[index]`) unter Berücksichtigung von Vor- und Nachfolger. */
function buchstabenCode(buchstaben: readonly string[], index: number): string {
  const buchstabe = buchstaben[index]
  const vorgaenger = index > 0 ? buchstaben[index - 1] : undefined
  const nachfolger = index + 1 < buchstaben.length ? buchstaben[index + 1] : undefined

  if (buchstabe === undefined) {
    return ''
  }
  if (VOKALGRUPPE.has(buchstabe)) {
    return '0'
  }
  if (buchstabe === 'H') {
    return '' // H trägt nie einen eigenen Code, bleibt aber für den Kontext der Nachbarn erhalten.
  }
  if (buchstabe === 'B') {
    return '1'
  }
  if (buchstabe === 'P') {
    return nachfolger === 'H' ? '3' : '1'
  }
  if (buchstabe === 'D' || buchstabe === 'T') {
    return nachfolger === 'C' || nachfolger === 'S' || nachfolger === 'Z' ? '8' : '2'
  }
  if (buchstabe === 'F' || buchstabe === 'V' || buchstabe === 'W') {
    return '3'
  }
  if (buchstabe === 'G' || buchstabe === 'K' || buchstabe === 'Q') {
    return '4'
  }
  if (buchstabe === 'X') {
    return vorgaenger === 'C' || vorgaenger === 'K' || vorgaenger === 'Q' ? '8' : '48'
  }
  if (buchstabe === 'L') {
    return '5'
  }
  if (buchstabe === 'M' || buchstabe === 'N') {
    return '6'
  }
  if (buchstabe === 'R') {
    return '7'
  }
  if (buchstabe === 'S' || buchstabe === 'Z') {
    return '8'
  }
  if (buchstabe === 'C') {
    const istAnlaut = index === 0
    if (istAnlaut && nachfolger !== undefined && C_KONTEXT_FUER_4.has(nachfolger)) {
      return '4'
    }
    if (
      !istAnlaut &&
      nachfolger !== undefined &&
      C_KONTEXT_FUER_4_OHNE_ANLAUT.has(nachfolger) &&
      vorgaenger !== 'S' &&
      vorgaenger !== 'Z'
    ) {
      return '4'
    }
    return '8'
  }
  return '' // Kein Buchstabe des deutschen Alphabets (nach der Normalisierung nicht erwartet).
}

/** Entfernt unmittelbar aufeinanderfolgende gleiche Ziffern (z. B. "886" -> "86"). */
function aufeinanderfolgendeGleicheZiffernZusammenfassen(ziffern: string): string {
  let ergebnis = ''
  for (const ziffer of ziffern) {
    if (ergebnis.length === 0 || ergebnis[ergebnis.length - 1] !== ziffer) {
      ergebnis += ziffer
    }
  }
  return ergebnis
}

/**
 * Kölner-Phonetik-Code für `text` (55_Architektur.md §5.2). Normalisiert vor der Codierung auf
 * das deutsche Alphabet: Umlaute verlieren ihr Trema (NFD + Diakritika entfernen, damit ä/ö/ü in
 * die Vokalgruppe fallen), ß wird zu "SS", alles außerhalb von A-Z wird verworfen.
 */
export function koelnerPhonetik(text: string): string {
  const ohneEszett = text.replace(/ß/giu, 'SS')
  const ohneDiakritika = ohneEszett.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
  const nurBuchstaben = ohneDiakritika.toUpperCase().replace(/[^A-Z]/gu, '')

  const buchstaben = Array.from(nurBuchstaben)
  let ziffern = ''
  for (let index = 0; index < buchstaben.length; index += 1) {
    ziffern += buchstabenCode(buchstaben, index)
  }

  const zusammengefasst = aufeinanderfolgendeGleicheZiffernZusammenfassen(ziffern)
  return zusammengefasst.replace(/0/gu, '')
}
