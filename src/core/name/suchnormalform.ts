// AP-0.7, C-16/C-17, ADR-014. Reine, deterministische Funktion (CLAUDE.md §4: kein Date.now,
// kein Math.random, kein process/globalThis in src/core) - dieselbe Eingabe liefert immer dieselbe
// Ausgabe, das ist die Voraussetzung für Golden-/Property-Tests UND für die Bitgleichheit
// zwischen inkrementellen Triggern und `alleAbgeleitetenNeuAufbauen()` (55_Architektur.md §5.2):
// Trigger UND vollständiger Neuaufbau rufen exakt dieselbe SQL-Funktion `suchnormalform` auf
// (registriert in src/main/datenbank/verbindung.ts), die ihrerseits nur diese Funktion hier
// aufruft.
//
// Drei Schritte (freigegebene Entscheidung, AP-0.7-Plan):
// 1. Kyrillisch -> Latein über eine feste Mapping-Tabelle (ISO-9-nah; einzelne Buchstaben wie
//    "щ" bilden bewusst auf mehrere ASCII-Zeichen ab, z.B. "sc" statt eines Diakritikums - das
//    macht Schritt 2 für kyrillischen Text zu einem No-op).
// 2. Unicode-Normalform NFD + Entfernen kombinierender Diakritika (deckt lateinische Akzente wie
//    Wróbel, Müller ab).
// 3. Kleinschreibung + Entfernen von Apostrophen, Bindestrichen und Leerraum (Trennzeichen tragen
//    für die Sortier-/Suchnormalform keine Information, z. B. d'Aboville -> daboville).

/**
 * Kyrillisch-zu-Latein-Tabelle, ISO-9-nah (nicht ISO-9-exakt: einzelne Zuordnungen weichen bewusst
 * ab, damit das Ergebnis ohne Diakritika auskommt, siehe Kopfkommentar). Schlüssel sind
 * Kleinbuchstaben; die Umwandlung schlägt pro Zeichen dessen Kleinschreibung nach, Groß-/
 * Kleinschreibung der Eingabe wird erst in Schritt 3 vereinheitlicht.
 */
const KYRILLISCH_ZU_LATEIN: ReadonlyMap<string, string> = new Map([
  ['а', 'a'],
  ['б', 'b'],
  ['в', 'v'],
  ['г', 'g'],
  ['д', 'd'],
  ['е', 'e'],
  ['ё', 'e'],
  ['ж', 'zh'],
  ['з', 'z'],
  ['и', 'i'],
  ['й', 'j'],
  ['к', 'k'],
  ['л', 'l'],
  ['м', 'm'],
  ['н', 'n'],
  ['о', 'o'],
  ['п', 'p'],
  ['р', 'r'],
  ['с', 's'],
  ['т', 't'],
  ['у', 'u'],
  ['ф', 'f'],
  ['х', 'h'],
  ['ц', 'c'],
  ['ч', 'ch'],
  ['ш', 'sh'],
  ['щ', 'sc'],
  ['ъ', ''],
  ['ы', 'y'],
  ['ь', ''],
  ['э', 'e'],
  ['ю', 'yu'],
  ['я', 'ya'],
  // Ukrainische/weißrussische Ergänzungsbuchstaben (kommen in ostslawischen Herkunftsorten vor).
  ['і', 'i'],
  ['ї', 'yi'],
  ['є', 'ye'],
  ['ґ', 'g'],
  ['ў', 'u'],
])

function kyrillischZuLatein(text: string): string {
  let ergebnis = ''
  for (const zeichen of text) {
    const lateinisch = KYRILLISCH_ZU_LATEIN.get(zeichen.toLowerCase())
    ergebnis += lateinisch ?? zeichen
  }
  return ergebnis
}

/** Kombinierende diakritische Zeichen (Unicode-Block U+0300-U+036F), nach NFD-Zerlegung übrig. */
const KOMBINIERENDE_DIAKRITIKA = /[\u0300-\u036f]/gu

/** Apostrophe (gerade und typografisch), Bindestriche und jeglicher Leerraum. */
const TRENNZEICHEN = /['’\-\s]+/gu

/**
 * Sortier-/Suchnormalform (55_Architektur.md §5.1, ADR-014): diakritika- und schriftsystemfrei,
 * kleingeschrieben, ohne Trennzeichen. Wird sowohl für `person_flach.sortier_*` als auch für die
 * `normalform`-Spalte von `suche_fts` verwendet.
 */
export function suchnormalform(text: string): string {
  const transliteriert = kyrillischZuLatein(text)
  const ohneDiakritika = transliteriert.normalize('NFD').replace(KOMBINIERENDE_DIAKRITIKA, '')
  return ohneDiakritika.toLowerCase().replace(TRENNZEICHEN, '')
}
