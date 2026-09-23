// AP-1.33: die eine kanonische Zerlegung eines FLACHEN Namens (vornamen/rufname_index/rufname_text/
// nachname/praefix/titel_vor/zusatz_nach) in `name_part`-Bestandteile — und ihre Umkehrung. Reines
// TypeScript, KEIN Node/SQL/shared-Import (CLAUDE.md §2). Die Zerlegungsregel ist wortgleich zur
// Migration 0006 (docs/schema/0006_namensformen.sql §3): Vornamen an Leerzeichen splitten (0-basierter
// `sortier_index`, `ist_rufname = pos == rufname_index`), Nachname/Präfix/Titel(→'titel')/Zusatz(→
// 'suffix') je eine Zeile, `rufname_text` als zusätzlicher markierter Vorname NUR wenn er nicht schon
// als Vorname-Token vorkommt UND noch kein Rufname markiert ist. Genutzt von `src/main/repositories/
// name-repo.ts` (flache Schreib-/Leseschnittstelle über name_form + name_part) und — als Prüfmaterial
// über die Schichtgrenze — von `test/hilfsmittel/fixture-bauen.ts`.
import type { NamePartArt } from './typen'

/** Flache Namensfelder, wie sie die alte `name`-Tabelle (bzw. der Importvertrag) trägt. */
export interface FlacherName {
  readonly vornamen?: string | null | undefined
  readonly rufnameIndex?: number | null | undefined
  readonly rufnameText?: string | null | undefined
  readonly nachname?: string | null | undefined
  readonly praefix?: string | null | undefined
  readonly titelVor?: string | null | undefined
  readonly zusatzNach?: string | null | undefined
}

/** Ein zerlegter Bestandteil (ohne `id`/`name_form_id` — die vergibt der SQL-schreibende Aufrufer). */
export interface ZerlegterTeil {
  readonly art: NamePartArt
  readonly wert: string
  readonly istRufname: boolean
  readonly sortierIndex: number
}

function tokens(text: string | null | undefined): readonly string[] {
  if (text === null || text === undefined) return []
  return text
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
}

/**
 * Zerlegt einen flachen Namen in seine `name_part`-Bestandteile (Reihenfolge wie Migration 0006:
 * Vornamen, dann Nachname/Präfix/Titel/Suffix, dann ein etwaiger zusätzlicher Rufname-Text).
 */
export function zerlegeName(flach: FlacherName): readonly ZerlegterTeil[] {
  const teile: ZerlegterTeil[] = []

  const vornamen = tokens(flach.vornamen)
  vornamen.forEach((wert, index) => {
    teile.push({ art: 'vorname', wert, istRufname: index === (flach.rufnameIndex ?? -1), sortierIndex: index })
  })

  const einzeln: readonly (readonly [NamePartArt, string | null | undefined])[] = [
    ['nachname', flach.nachname],
    ['praefix', flach.praefix],
    ['titel', flach.titelVor],
    ['suffix', flach.zusatzNach],
  ]
  for (const [art, roh] of einzeln) {
    if (roh !== null && roh !== undefined && roh !== '') {
      teile.push({ art, wert: roh, istRufname: false, sortierIndex: 0 })
    }
  }

  const rufnameText = flach.rufnameText
  if (rufnameText !== null && rufnameText !== undefined && rufnameText !== '') {
    const schonVorname = vornamen.includes(rufnameText)
    const schonRufname = teile.some((teil) => teil.art === 'vorname' && teil.istRufname)
    if (!schonVorname && !schonRufname) {
      teile.push({ art: 'vorname', wert: rufnameText, istRufname: true, sortierIndex: vornamen.length })
    }
  }

  return teile
}

/**
 * Baut aus den flachen Feldern den „as written"-Anzeigetext (`name_form.original_text`):
 * `Titel Vornamen Präfix Nachname Zusatz`, leerzeichengetrennt, leere Segmente ausgelassen. `null`,
 * wenn nichts übrig bleibt.
 *
 * Warum das gebraucht wird (AP-1.33): der abgeleitete Trigger `abl_name_form_ai`
 * (0006_namensformen.sql) indiziert die FTS-Normalform aus `COALESCE(original_text, …aus name_part…)`
 * — er läuft aber beim Einfügen der Form, BEVOR ihre (per FK an die Form gebundenen) `name_part`-
 * Zeilen existieren können, und würde ohne `original_text` eine leere Normalform indizieren. Ein
 * späteres `abl_name_form_au`/`_bd`-`delete` rekonstruiert dann aus den DANN vorhandenen Teilen einen
 * nie indizierten Wert (contentless-FTS5 → „database disk image is malformed"). Ein gesetzter
 * `original_text` macht Index und Löschung parteinunabhängig deckungsgleich. Der flache Schreibpfad
 * (src/main/repositories/name-repo.ts, Fixtures, Import) füllt `original_text` darum hiermit, wenn
 * der Aufrufer keinen mitbringt.
 */
export function montiereOriginalText(flach: FlacherName): string | null {
  const segmente = [flach.titelVor, flach.vornamen, flach.praefix, flach.nachname, flach.zusatzNach].filter(
    (segment): segment is string => segment !== null && segment !== undefined && segment.trim() !== '',
  )
  const text = segmente.join(' ').trim()
  return text !== '' ? text : null
}

/** Ein bereits geladener Bestandteil (aus name_part), Eingabe der Rekonstruktion. */
export interface GeladenerTeil {
  readonly art: NamePartArt
  readonly wert: string
  readonly istRufname: boolean
  readonly sortierIndex: number
}

/** Das flache Ergebnis der Rekonstruktion — alle Felder immer gesetzt (`null`, wenn leer). */
export interface RekonstruierterName {
  readonly vornamen: string | null
  readonly rufnameIndex: number | null
  readonly rufnameText: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titelVor: string | null
  readonly zusatzNach: string | null
}

function ersterWert(teile: readonly GeladenerTeil[], art: NamePartArt): string | null {
  const treffer = teile.filter((teil) => teil.art === art).sort((a, b) => a.sortierIndex - b.sortierIndex)
  const erster = treffer[0]
  return erster !== undefined ? erster.wert : null
}

function verkette(teile: readonly GeladenerTeil[], art: NamePartArt): string | null {
  const treffer = teile
    .filter((teil) => teil.art === art)
    .sort((a, b) => a.sortierIndex - b.sortierIndex)
    .map((teil) => teil.wert)
  return treffer.length > 0 ? treffer.join(' ') : null
}

/**
 * Rekonstruiert die flachen Namensfelder aus geladenen `name_part`-Zeilen. Kanonisch: alle
 * Vorname-Teile stehen in `vornamen`, der markierte Rufname wird über `rufnameIndex` (seine
 * 0-basierte Position in der Vornamenkette) und zusätzlich als `rufnameText` (sein Wert) ausgewiesen
 * — die Migration/Zerlegung hat die Unterscheidung „Index vs. Text" bewusst in eine einheitliche
 * Markierung überführt (AP-1.33), die Rekonstruktion gibt beide Sichten zurück, damit sowohl die
 * flache Schreibschnittstelle als auch die Anzeige bedient sind.
 */
export function rekonstruiereFlach(teile: readonly GeladenerTeil[]): RekonstruierterName {
  const vornamenTeile = teile
    .filter((teil) => teil.art === 'vorname')
    .sort((a, b) => a.sortierIndex - b.sortierIndex)
  const rufnamePosition = vornamenTeile.findIndex((teil) => teil.istRufname)
  const rufname = rufnamePosition >= 0 ? vornamenTeile[rufnamePosition] : undefined
  return {
    vornamen: vornamenTeile.length > 0 ? vornamenTeile.map((teil) => teil.wert).join(' ') : null,
    rufnameIndex: rufnamePosition >= 0 ? rufnamePosition : null,
    rufnameText: rufname !== undefined ? rufname.wert : null,
    nachname: verkette(teile, 'nachname'),
    praefix: ersterWert(teile, 'praefix'),
    titelVor: ersterWert(teile, 'titel'),
    zusatzNach: ersterWert(teile, 'suffix'),
  }
}
