// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): Schnappschuss-Dateinamen — kolonfrei, wegen
// Windows (`:` ist dort in Dateinamen verboten). Format: `YYYY-MM-DDTHH-MM-SSZ.sqlite`, ebenso
// `ersetzt-YYYY-MM-DDTHH-MM-SSZ.sqlite` (55_Architektur.md §6.2/§6.4). Diese Datei ist die einzige
// Stelle, die zwischen `zeitpunktMs` und Dateiname übersetzt — `erzeugen.ts`/`liste.ts`/
// `wiederherstellen.ts`/`aufbewahrung.ts` teilen sich das Format darüber, statt es einzeln
// nachzubauen.
export const SCHNAPPSCHUSS_ENDUNG = '.sqlite'
export const ERSETZT_PRAEFIX = 'ersetzt-'

const DATEINAME_MUSTER = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/

/**
 * `zeitpunktMs` als kolonfreien ISO-Zeit-Basisnamen (ohne Endung, ohne Millisekunden) - z. B.
 * `2026-09-10T12-00-00Z`. `new Date()`/`toISOString()` sind hier erlaubt (CLAUDE.md §4 verbietet
 * `Date` nur in `src/core/`).
 */
export function kolonfreieZeit(zeitpunktMs: number): string {
  const iso = new Date(zeitpunktMs).toISOString() // "2026-09-10T12:00:00.000Z"
  const ohneMillisekunden = iso.replace(/\.\d{3}Z$/, 'Z') // "2026-09-10T12:00:00Z"
  return ohneMillisekunden.replace(/:/g, '-') // "2026-09-10T12-00-00Z"
}

/**
 * Gegenstück zu `kolonfreieZeit()`: parst einen kolonfreien ISO-Zeit-Basisnamen zurück in
 * Millisekunden seit der Epoche. Liefert `undefined` bei jedem Format, das nicht exakt passt —
 * `src/main/schnappschuss/liste.ts` überspringt solche Dateien, statt zu werfen (ein fremder
 * Dateiname im `snapshots/`-Ordner ist kein Fehler, nur kein Kandidat).
 */
export function zeitAusDateiname(basisname: string): number | undefined {
  const treffer = DATEINAME_MUSTER.exec(basisname)
  if (treffer === null) {
    return undefined
  }
  const datum = treffer[1]
  const stunde = treffer[2]
  const minute = treffer[3]
  const sekunde = treffer[4]
  if (datum === undefined || stunde === undefined || minute === undefined || sekunde === undefined) {
    return undefined // defensiv (CLAUDE.md §4: kein `!`) - DATEINAME_MUSTER hat genau vier Gruppen.
  }
  const ms = Date.parse(`${datum}T${stunde}:${minute}:${sekunde}Z`)
  return Number.isNaN(ms) ? undefined : ms
}

/** Entfernt `SCHNAPPSCHUSS_ENDUNG` von `dateiname`, oder `undefined`, wenn sie fehlt. */
export function basisnameOhneEndung(dateiname: string): string | undefined {
  return dateiname.endsWith(SCHNAPPSCHUSS_ENDUNG) ? dateiname.slice(0, -SCHNAPPSCHUSS_ENDUNG.length) : undefined
}
