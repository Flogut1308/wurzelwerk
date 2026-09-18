// `pnpm symbole` — einmaliger, nachvollziehbarer Abzug des Symbolsatzes (AP-1.11, ADR-027,
// docs/71_Designsystem.md §6). Lädt NUR die tatsächlich benutzten Phosphor-SVG (`ALLE_SYMBOLE` aus
// `src/renderer/gestaltung/symbole/namen.ts`) von einem GEPINNTEN Release-Tag über `curl`, normiert
// sie (viewBox erzwungen, jede Festfarbe → `currentColor`, Skripte/externe Verweise verworfen) und
// schreibt sowohl die `.svg`-Dateien als auch die generierte TS-Registry
// (`registrierung.generiert.ts`). Ein zweiter Lauf erzeugt keinen Git-Diff (reine, deterministische
// Funktionen über einen fest verdrahteten Tag — kein `Date.now`, kein `Math.random`).
//
// Liegt bewusst außerhalb `src/` (CLAUDE.md §2): Netzzugriff (`curl`) und Dateisystemzugriff sind
// hier erlaubt, im Renderer (der die erzeugten Dateien später nur importiert) nicht.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLE_SYMBOLE, type SymbolName } from '../src/renderer/gestaltung/symbole/namen'

/**
 * Gepinnter Tag von `phosphor-icons/core` (ADR-027-Nachtrag AP-1.11) — Commit
 * `d42782b2abe747d904b971ccab48b182a1455f86`, geprüft 18.09.2026 (jüngster Tag zu diesem
 * Zeitpunkt). Bei einer künftigen Aktualisierung: Tag hier UND in
 * `docs/lizenzen/MIT-Phosphor.txt` UND im ADR-027-Nachtrag gemeinsam ändern.
 */
const PHOSPHOR_TAG = 'v2.0.8'
const PHOSPHOR_ROH_BASIS = `https://raw.githubusercontent.com/phosphor-icons/core/${PHOSPHOR_TAG}/assets`

const SYMBOLE_WURZEL = fileURLToPath(new URL('../src/renderer/gestaltung/symbole', import.meta.url))
const REGULAR_ORDNER = join(SYMBOLE_WURZEL, 'regular')
const FILL_ORDNER = join(SYMBOLE_WURZEL, 'fill')
const EIGEN_ORDNER = join(SYMBOLE_WURZEL, 'eigen')
const REGISTRY_DATEI = join(SYMBOLE_WURZEL, 'registrierung.generiert.ts')

/** Die zwei selbst gezeichneten Symbole (ADR-027: „zwei Lücken bleiben und werden gezeichnet") —
 * für sie gibt es keine Phosphor-Quelle, ihre `.svg`-Datei liegt bereits unter `symbole/eigen/` und
 * wird von diesem Skript NICHT überschrieben. */
const EIGENE_SYMBOLE: ReadonlySet<SymbolName> = new Set(['trauung', 'beerdigung'])

/**
 * Fachsymbol → Phosphor-Quellname (72_Screens_und_Flows.md §6-Zuordnung, ADR-027). Eine Abweichung
 * vom ursprünglichen Auftragstext: `platzhalter` sollte `user-circle-dashed` sein — dieses Symbol
 * existiert bei Phosphor nicht (geprüft 18.09.2026, Tag v2.0.8). Ersetzt durch `user-circle`
 * (docs/80_Offene_Fragen.md, §14 Fall 2 — die gestrichelte Kennzeichnung von Platzhaltern trägt
 * bereits `tabellenzeile.css`, A-17).
 */
const PHOSPHOR_QUELLNAME: Readonly<Record<Exclude<SymbolName, 'trauung' | 'beerdigung'>, string>> = {
  geburt: 'baby',
  taufe: 'drop',
  tod: 'cross',
  auswanderung: 'boat',
  beruf: 'briefcase',
  militaer: 'medal-military',
  quelle: 'scroll',
  zitat: 'quotes',
  archiv: 'archive',
  platzhalter: 'user-circle',
  implex: 'arrows-merge',
  widerspruch: 'warning-diamond',
  interview: 'chat-text',
  audio: 'waveform',
  'caret-up': 'caret-up',
  'caret-down': 'caret-down',
  tray: 'tray',
  funnel: 'funnel',
  'warning-circle': 'warning-circle',
  x: 'x',
}

function curlText(url: string): string {
  // `-f`: HTTP-Fehler (404 etc.) als nicht-Null-Exitcode statt einer Fehlerseite als „Erfolg".
  // `-sS`: still, aber Fehlermeldungen auf stderr sichtbar. `-L`: Redirects folgen (raw.githubusercontent.com
  // redirected üblicherweise nicht, aber defensiv).
  return execFileSync('curl', ['-fsSL', url], { encoding: 'utf8' })
}

/**
 * Normiert ein rohes Phosphor-SVG (AP-1.11-Auftrag): `viewBox="0 0 256 256"` erzwingen, jede
 * Festfarbe (`fill`/`stroke` außer `currentColor`) → `currentColor`, `<script>`/`href`/`xlink:href`/
 * `<image>` verwerfen. Phosphor liefert bereits normgerechte SVG (geprüft) — diese Funktion ist
 * trotzdem keine reine Formalität, sondern die tatsächliche Absicherung gegen eine künftige
 * Tag-Aktualisierung, die davon abweicht.
 */
export function svgNormieren(roh: string): string {
  let ergebnis = roh.trim()

  // Skripte, externe Bildverweise und Verweisattribute vollständig entfernen.
  ergebnis = ergebnis.replace(/<script[\s\S]*?<\/script>/gi, '')
  ergebnis = ergebnis.replace(/<image\b[^>]*\/?>(?:[\s\S]*?<\/image>)?/gi, '')
  ergebnis = ergebnis.replace(/\s(?:xlink:href|href)\s*=\s*"[^"]*"/gi, '')

  // Jede Festfarbe in fill=/stroke= (außer bereits currentColor) → currentColor.
  ergebnis = ergebnis.replace(/\b(fill|stroke)\s*=\s*"(?!currentColor")[^"]*"/gi, '$1="currentColor"')

  // viewBox erzwingen, unabhängig davon, was die Quelle mitbringt.
  if (/viewBox\s*=\s*"[^"]*"/i.test(ergebnis)) {
    ergebnis = ergebnis.replace(/viewBox\s*=\s*"[^"]*"/i, 'viewBox="0 0 256 256"')
  } else {
    ergebnis = ergebnis.replace(/<svg\b/i, '<svg viewBox="0 0 256 256"')
  }

  return ergebnis
}

interface SymbolQuellen {
  readonly regular: string
  readonly fill: string
}

function symbolBeschaffen(name: SymbolName): SymbolQuellen {
  if (EIGENE_SYMBOLE.has(name)) {
    const inhalt = readFileSync(join(EIGEN_ORDNER, `${name}.svg`), 'utf8').trim()
    // Eigenzeichnungen tragen NUR ein Regular-Gewicht (ADR-027: „Regular-Gewicht" für Trauung/
    // Beerdigung) — das Fill-Gewicht der Registry fällt für sie auf denselben Inhalt zurück
    // (dokumentierte Wiederverwendung, kein fehlendes Asset).
    return { regular: inhalt, fill: inhalt }
  }

  const quellname = PHOSPHOR_QUELLNAME[name as Exclude<SymbolName, 'trauung' | 'beerdigung'>] // as: eigene Symbole sind oben per EIGENE_SYMBOLE.has(name) ausgeschlossen; Set.has verengt den Typ nicht
  const regularRoh = curlText(`${PHOSPHOR_ROH_BASIS}/regular/${quellname}.svg`)
  const fillRoh = curlText(`${PHOSPHOR_ROH_BASIS}/fill/${quellname}-fill.svg`)
  return { regular: svgNormieren(regularRoh), fill: svgNormieren(fillRoh) }
}

/** TS-Bezeichnerliteral für einen Symbolnamen (kann `-` enthalten, z. B. `caret-up`) — als
 * JS-String-Objektschlüssel, nicht als Bare-Identifier. */
function schluesselLiteral(name: SymbolName): string {
  return `'${name}'`
}

/** Ein SVG-Markup als TS-Template-Literal-Wert — Backticks/`${` im Quellinhalt escapen (Phosphor-SVG
 * enthält keine, defensiv trotzdem). */
function templateLiteralWert(inhalt: string): string {
  const escaped = inhalt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `\`${escaped}\``
}

function registryQuelltext(regular: ReadonlyMap<SymbolName, string>, fill: ReadonlyMap<SymbolName, string>): string {
  function record(eintraege: ReadonlyMap<SymbolName, string>): string {
    const zeilen = ALLE_SYMBOLE.map((name) => {
      const inhalt = eintraege.get(name)
      if (inhalt === undefined) {
        throw new Error(`registryQuelltext: kein Eintrag für "${name}"`)
      }
      return `  ${schluesselLiteral(name)}: ${templateLiteralWert(inhalt)},`
    })
    return `{\n${zeilen.join('\n')}\n}`
  }

  return `// Erzeugt von \`pnpm symbole\` (skripte/symbole-holen.ts) — NICHT von Hand ändern.
// Symbolsatz-Registry (AP-1.11, ADR-027): inline-SVG je \`SymbolName\`, in Regular- und Fill-Gewicht.
// Quelle: phosphor-icons/core, siehe docs/lizenzen/MIT-Phosphor.txt. Zwei Ausnahmen (Trauung,
// Beerdigung) sind Eigenzeichnungen aus symbole/eigen/ — ihr Fill-Eintrag ist eine bewusste Kopie
// des Regular-Eintrags (kein zweites Gewicht gezeichnet, siehe ADR-027).
import type { SymbolName } from './namen'

export const SYMBOLE_REGULAR: Readonly<Record<SymbolName, string>> = ${record(regular)}

export const SYMBOLE_FILL: Readonly<Record<SymbolName, string>> = ${record(fill)}
`
}

/** Entfernt jede `.svg`-Datei aus `ordner`, deren Name nicht (mehr) in `ALLE_SYMBOLE` steht — ein
 * aus der Liste entfernter Symbolname hinterlässt sonst eine stille Dateileiche. */
function verwaisteDateienAufraeumen(ordner: string, erlaubteNamen: ReadonlySet<string>): void {
  let eintraege: readonly string[]
  try {
    eintraege = readdirSync(ordner)
  } catch {
    return
  }
  for (const datei of eintraege) {
    if (!datei.endsWith('.svg')) continue
    const name = datei.slice(0, -'.svg'.length)
    if (!erlaubteNamen.has(name)) {
      throw new Error(
        `symbole-holen: verwaiste Datei ${join(ordner, datei)} — Name "${name}" steht nicht (mehr) in ALLE_SYMBOLE. Von Hand entfernen.`,
      )
    }
  }
}

function hauptlauf(): void {
  mkdirSync(REGULAR_ORDNER, { recursive: true })
  mkdirSync(FILL_ORDNER, { recursive: true })

  const regularEintraege = new Map<SymbolName, string>()
  const fillEintraege = new Map<SymbolName, string>()

  for (const name of ALLE_SYMBOLE) {
    console.log(`Beschaffe ${name}…`)
    const { regular, fill } = symbolBeschaffen(name)
    regularEintraege.set(name, regular)
    fillEintraege.set(name, fill)

    if (!EIGENE_SYMBOLE.has(name)) {
      writeFileSync(join(REGULAR_ORDNER, `${name}.svg`), `${regular}\n`, 'utf8')
      writeFileSync(join(FILL_ORDNER, `${name}.svg`), `${fill}\n`, 'utf8')
    }
  }

  const erlaubteNamen = new Set<string>(ALLE_SYMBOLE)
  verwaisteDateienAufraeumen(REGULAR_ORDNER, erlaubteNamen)
  verwaisteDateienAufraeumen(FILL_ORDNER, erlaubteNamen)
  verwaisteDateienAufraeumen(EIGEN_ORDNER, new Set([...EIGENE_SYMBOLE]))

  writeFileSync(REGISTRY_DATEI, registryQuelltext(regularEintraege, fillEintraege), 'utf8')
  console.log(`Registry geschrieben: ${REGISTRY_DATEI}`)
}

hauptlauf()
