import type { SyncAnbieter } from '../../shared/ipc/vertrag'

interface Erkennungsregel {
  readonly anbieter: SyncAnbieter
  /** Segmente relativ zu `heimat`. Ein Segment, das mit `*` endet, matcht per Präfix. */
  readonly relativesMuster: readonly string[]
}

/**
 * Ordner, unter denen die drei Anbieter üblicherweise ihre lokal gespiegelten Dateien ablegen
 * (macOS + Windows, ADR-002). Reihenfolge ist unerheblich, jede Regel wird geprüft.
 */
const REGELN: readonly Erkennungsregel[] = [
  { anbieter: 'dropbox', relativesMuster: ['Dropbox'] },
  { anbieter: 'dropbox', relativesMuster: ['Library', 'CloudStorage', 'Dropbox*'] },
  { anbieter: 'icloud', relativesMuster: ['Library', 'Mobile Documents', 'com~apple~CloudDocs'] },
  { anbieter: 'icloud', relativesMuster: ['Library', 'CloudStorage', 'iCloud*'] },
  { anbieter: 'onedrive', relativesMuster: ['OneDrive'] },
  { anbieter: 'onedrive', relativesMuster: ['OneDrive - *'] },
  { anbieter: 'onedrive', relativesMuster: ['Library', 'CloudStorage', 'OneDrive*'] },
]

/**
 * Zerlegt einen Pfad in Segmente. Absichtlich ein eigener, von `path.sep` unabhängiger Regex
 * (statt `path.parse`/`path.sep`): Ein injizierter `heimat`-Pfad kann eine andere Plattform
 * beschreiben als die, auf der der Code gerade läuft (Test auf macOS mit einem Windows-artigen
 * `heimat`), darum müssen sowohl `/` als auch `\` als Trenner erkannt werden.
 */
function segmente(pfad: string): readonly string[] {
  return pfad.split(/[\\/]+/).filter((teil) => teil.length > 0)
}

function segmentPasstZuMuster(segment: string, muster: string): boolean {
  return muster.endsWith('*') ? segment.startsWith(muster.slice(0, -1)) : segment === muster
}

/** Prüft, ob `pfadSegmente` mit `heimatSegmente` beginnt und direkt danach `relativesMuster` folgt. */
function pfadPasstUnterHeimat(
  pfadSegmente: readonly string[],
  heimatSegmente: readonly string[],
  relativesMuster: readonly string[],
): boolean {
  if (pfadSegmente.length < heimatSegmente.length + relativesMuster.length) {
    return false
  }

  const heimatTeil = pfadSegmente.slice(0, heimatSegmente.length)
  const musterTeil = pfadSegmente.slice(heimatSegmente.length, heimatSegmente.length + relativesMuster.length)

  const heimatPasst = heimatTeil.every((segment, i) => segment === heimatSegmente[i])
  const musterPasst = musterTeil.every((segment, i) => {
    const muster = relativesMuster[i]
    return muster !== undefined && segmentPasstZuMuster(segment, muster)
  })
  return heimatPasst && musterPasst
}

/**
 * Erkennt, ob `pfad` unterhalb eines Dropbox-, iCloud- oder OneDrive-Synchronisationsordners
 * innerhalb von `heimat` liegt (ADR-002: SQLite in solchen Ordnern kann korrumpieren). `heimat`
 * ist injizierbar statt fest `os.homedir()` — Determinismus für Tests, siehe
 * `test/einheit/sync-erkennung.test.ts`.
 */
export function syncAnbieterErkennen(pfad: string, heimat: string): SyncAnbieter | undefined {
  const pfadSegmente = segmente(pfad)
  const heimatSegmente = segmente(heimat)

  const treffer = REGELN.find((regel) => pfadPasstUnterHeimat(pfadSegmente, heimatSegmente, regel.relativesMuster))
  return treffer?.anbieter
}
