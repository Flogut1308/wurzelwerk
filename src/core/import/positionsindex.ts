// Positionsindex über den Rohtext einer Importdatei (56_Import_Vertrag.md §5 Punkt 4, AP-1.3b).
// Reines TypeScript (CLAUDE.md §2/§4): kein Node, kein `fs`, kein `Date`, kein `Math.random` — der
// Rohtext kommt fertig als `string` herein, der Aufrufer (`src/main/import/validierung.ts`) liest
// die Datei.
//
// Bewusst KEIN `JSON.parse()`: `JSON.parse` verwirft jede Positionsinformation, sobald der Baum
// steht. Stattdessen ein eigener Mini-Scanner, der beim Ablaufen des Rohtexts mitzählt, auf
// welcher Zeile (1-basiert) welcher JSON-Pfad beginnt — Zeichen für Zeichen, mit vollständiger
// Escape-Behandlung in Strings (§5: „ein Positionsindex über den Rohtext, der JSON-Pfade auf
// Zeilennummern abbildet").
//
// `pfadFormat` ist der EINZIGE Ort, der die kanonische Pfadschreibweise (`personen[3].feld`)
// kennt — verschoben aus `src/main/import/validierung.ts` (vormals `pfadZuText`), damit
// Positionsindex und Stufe-1/2-Validierung zeichengleiche Schlüssel bilden. Der Parametertyp
// `readonly PropertyKey[]` (statt `readonly (string | number)[]`) spiegelt genau das, was ein
// Zod-`$ZodIssue.path` liefert — ein `symbol`-Segment kommt dort nie vor, wird hier aber über
// `String(...)` trotzdem verlustfrei behandelt.

export interface Positionsindex {
  /** 1-basierte Zeilennummer, an der `pfad` (kanonisches Format, z. B. `personen[3].feld`) im
   * Rohtext beginnt — `undefined`, wenn der Pfad im Text nicht vorkommt (z. B. ein Pflichtfeld,
   * das ganz FEHLT, hat keine Position). */
  readonly zeileFuer: (pfad: string) => number | undefined
}

/** Kanonische Pfadschreibweise des Import-Vertrags: Zahlensegmente als `[3]` ohne Punkt davor,
 * Zeichenkettensegmente durch `.` getrennt (`personen[3].unsicherheit`, §5 Punkt 2). */
export function pfadFormat(pfad: readonly PropertyKey[]): string {
  let text = ''
  for (const teil of pfad) {
    if (typeof teil === 'number') {
      text += `[${teil}]`
    } else {
      text += text.length > 0 ? `.${String(teil)}` : String(teil)
    }
  }
  return text
}

type Segment = string | number

interface Scanner {
  readonly text: string
  pos: number
  zeile: number
}

function zeichenBei(scanner: Scanner): string {
  return scanner.text[scanner.pos] ?? ''
}

function vorwaerts(scanner: Scanner): void {
  if (scanner.text[scanner.pos] === '\n') {
    scanner.zeile += 1
  }
  scanner.pos += 1
}

function ueberspringeLeerraum(scanner: Scanner): void {
  while (scanner.pos < scanner.text.length && /\s/.test(zeichenBei(scanner))) {
    vorwaerts(scanner)
  }
}

/** Erwartet, dass `scanner` auf dem öffnenden `"` steht. Überliest die komplette Zeichenkette
 * inklusive `\"`- und aller anderen Escapes (`\\`, `\/`, `\n`, `\uXXXX`, …) — eine naive Suche nach
 * dem nächsten `"` würde bei `\"` mitten in der Zeichenkette fälschlich abbrechen (§4 Stufe 2,
 * Kopfkommentar `validierung.ts`: „Scheintreffer" ist genau die Fehlerklasse, die hier vermieden
 * werden soll). Der Rückgabewert (Schlüssel-/Stringinhalt) wird für Objektschlüssel gebraucht. */
function leseString(scanner: Scanner): string {
  let ergebnis = ''
  vorwaerts(scanner) // öffnendes Anführungszeichen
  while (scanner.pos < scanner.text.length) {
    const zeichen = zeichenBei(scanner)
    if (zeichen === '"') {
      vorwaerts(scanner)
      break
    }
    if (zeichen === '\\') {
      vorwaerts(scanner) // Backslash überspringen
      const escapeZeichen = zeichenBei(scanner)
      if (escapeZeichen === 'u') {
        vorwaerts(scanner) // 'u'
        for (let i = 0; i < 4; i += 1) vorwaerts(scanner) // vier Hex-Ziffern
      } else {
        ergebnis += escapeZeichen
        vorwaerts(scanner)
      }
      continue
    }
    ergebnis += zeichen
    vorwaerts(scanner)
  }
  return ergebnis
}

/** Zahlen, `true`, `false`, `null` — überliest bis zum nächsten Trenner, ohne den Wert selbst zu
 * benötigen (nur die Position zählt hier). */
function leseLiteral(scanner: Scanner): void {
  while (scanner.pos < scanner.text.length && !/[,}\]\s]/.test(zeichenBei(scanner))) {
    vorwaerts(scanner)
  }
}

function leseObjekt(scanner: Scanner, pfad: readonly Segment[], eintraege: Map<string, number>): void {
  vorwaerts(scanner) // '{'
  ueberspringeLeerraum(scanner)
  if (zeichenBei(scanner) === '}') {
    vorwaerts(scanner)
    return
  }
  for (;;) {
    ueberspringeLeerraum(scanner)
    const zeileSchluessel = scanner.zeile
    const schluessel = leseString(scanner)
    ueberspringeLeerraum(scanner)
    vorwaerts(scanner) // ':'
    ueberspringeLeerraum(scanner)
    const kindPfad = [...pfad, schluessel]
    eintraege.set(pfadFormat(kindPfad), zeileSchluessel)
    leseWert(scanner, kindPfad, eintraege, zeileSchluessel)
    ueberspringeLeerraum(scanner)
    if (zeichenBei(scanner) === ',') {
      vorwaerts(scanner)
      continue
    }
    break
  }
  ueberspringeLeerraum(scanner)
  if (zeichenBei(scanner) === '}') vorwaerts(scanner)
}

function leseArray(scanner: Scanner, pfad: readonly Segment[], eintraege: Map<string, number>): void {
  vorwaerts(scanner) // '['
  ueberspringeLeerraum(scanner)
  if (zeichenBei(scanner) === ']') {
    vorwaerts(scanner)
    return
  }
  let index = 0
  for (;;) {
    ueberspringeLeerraum(scanner)
    const kindPfad = [...pfad, index]
    leseWert(scanner, kindPfad, eintraege)
    index += 1
    ueberspringeLeerraum(scanner)
    if (zeichenBei(scanner) === ',') {
      vorwaerts(scanner)
      continue
    }
    break
  }
  ueberspringeLeerraum(scanner)
  if (zeichenBei(scanner) === ']') vorwaerts(scanner)
}

/**
 * Liest den Wert an der aktuellen Scanner-Position unter `pfad`. `erzwungeneZeile` kommt von
 * `leseObjekt` (die Zeile des Schlüssels, schon registriert) — für Array-Elemente und die Wurzel
 * ist sie `undefined`, dort registriert diese Funktion selbst an der eigenen Wertzeile.
 */
function leseWert(scanner: Scanner, pfad: readonly Segment[], eintraege: Map<string, number>, erzwungeneZeile?: number): void {
  ueberspringeLeerraum(scanner)
  if (erzwungeneZeile === undefined) {
    eintraege.set(pfadFormat(pfad), scanner.zeile)
  }
  const zeichen = zeichenBei(scanner)
  if (zeichen === '{') {
    leseObjekt(scanner, pfad, eintraege)
  } else if (zeichen === '[') {
    leseArray(scanner, pfad, eintraege)
  } else if (zeichen === '"') {
    leseString(scanner)
  } else {
    leseLiteral(scanner)
  }
}

/**
 * Baut den Positionsindex über den kompletten Rohtext einer Importdatei (§5 Punkt 4). Der Rohtext
 * muss kein gültiges JSON sein, damit diese Funktion nicht wirft — sie liest bestmöglich, bis der
 * Text zu Ende ist oder eine Struktur nicht mehr auflösbar ist (in dem Fall bleiben weitere Pfade
 * einfach unregistriert, `zeileFuer` liefert für sie `undefined`).
 */
export function bauePositionsindex(rohtext: string): Positionsindex {
  const eintraege = new Map<string, number>()
  const scanner: Scanner = { text: rohtext, pos: 0, zeile: 1 }
  try {
    leseWert(scanner, [], eintraege)
  } catch {
    // Bestbemüht (s. o.) — ein unerwartetes Ende mitten in der Struktur darf den Index nicht zum
    // Werfen bringen, nur unvollständig lassen.
  }
  return {
    zeileFuer: (pfad: string) => eintraege.get(pfad),
  }
}
