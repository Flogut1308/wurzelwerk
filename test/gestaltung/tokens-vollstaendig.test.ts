// Querläufer „Design-Fundament übernehmen" (Wissen/58) · CLAUDE.md §5, docs/71_Designsystem.md §7.
// Fitnessfunktion für den Token-Vertrag: Jede in §1 benannte Rolle existiert, und jede Farbrolle
// existiert in BEIDEN Themen. Eine fehlende Rolle in der dunklen Fassung ist genau der Fehler, der
// erst beim Umschalten auffällt (§7 Punkt 1) — er soll hier auffallen, nicht beim Nutzer.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tokensPfad = fileURLToPath(new URL('../../src/renderer/gestaltung/tokens.css', import.meta.url))
const css = readFileSync(tokensPfad, 'utf8')
// Kommentare entfernen, damit eine auskommentierte Rolle nicht fälschlich als vorhanden zählt.
const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Inhalt des ausgeglichenen `{…}`-Blocks direkt hinter `selektor`. */
function blockInhalt(quelle: string, selektor: string): string {
  const start = quelle.indexOf(selektor)
  if (start === -1) throw new Error(`Selektor fehlt in tokens.css: ${selektor}`)
  const auf = quelle.indexOf('{', start)
  if (auf === -1) throw new Error(`Kein { nach Selektor: ${selektor}`)
  let tiefe = 0
  for (let i = auf; i < quelle.length; i++) {
    if (quelle[i] === '{') tiefe += 1
    else if (quelle[i] === '}') {
      tiefe -= 1
      if (tiefe === 0) return quelle.slice(auf + 1, i)
    }
  }
  throw new Error(`Block nicht geschlossen: ${selektor}`)
}

/** name → Wert für alle `--wz-…:`-Deklarationen eines Blocktexts. */
function deklarationen(blockText: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const treffer of blockText.matchAll(/(--wz-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = treffer[1]
    const wert = treffer[2]
    if (name !== undefined && wert !== undefined) m.set(name, wert.trim())
  }
  return m
}

const rootDekl = deklarationen(blockInhalt(ohneKommentare, ':root {'))
const dunkelDekl = deklarationen(blockInhalt(ohneKommentare, ':root[data-theme="dunkel"] {'))
const hellDekl = deklarationen(blockInhalt(ohneKommentare, ':root[data-theme="hell"] {'))
const kompaktDekl = deklarationen(blockInhalt(ohneKommentare, ':root[data-dichte="kompakt"] {'))

// Alle irgendwo deklarierten Rollen (auch im Systemvorgabe-@media-Block).
const alleDekl = new Set<string>()
for (const treffer of ohneKommentare.matchAll(/(--wz-[a-z0-9-]+)\s*:/g)) {
  const name = treffer[1]
  if (name !== undefined) alleDekl.add(name)
}

const FARB_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

/** Die in docs/71_Designsystem.md §1 namentlich festgelegten Rollen (der Vertrag, ausführbar). */
function bereich(praefix: string, teile: readonly string[]): string[] {
  return teile.map((t) => `--wz-${praefix}-${t}`)
}
const statusArten = ['info', 'erfolg', 'warnung', 'fehler', 'neutral'] as const
const paragraf1Rollen: readonly string[] = [
  // §1.1 Flächen
  ...bereich('flaeche', ['grund', 'basis', 'erhoben', 'ueberlagert', 'vertieft', 'hover', 'aktiv', 'auswahl', 'gesperrt']),
  // §1.1 Text
  ...bereich('text', ['primaer', 'sekundaer', 'tertiaer', 'invers', 'gesperrt', 'akzent', 'original']),
  // §1.1 Rahmen und Linien
  ...bereich('rahmen', ['fein', 'standard', 'stark', 'fokus', 'akzent', 'gestrichelt']),
  // §1.1 Akzent
  ...bereich('akzent', ['basis', 'hover', 'aktiv', 'schwach', 'auf-akzent']),
  // §1.1 Status (je -basis, -flaeche, -rahmen, -text)
  ...statusArten.flatMap((a) => bereich(`status-${a}`, ['basis', 'flaeche', 'rahmen', 'text'])),
  // §1.2 Datenebenen
  ...Array.from({ length: 4 }, (_, i) => `--wz-daten-konfidenz-${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `--wz-daten-generation-${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `--wz-daten-strang-${i + 1}`),
  ...bereich('daten-geschlecht', ['m', 'f', 'u', 'x']),
  ...bereich('daten-diagnose', [
    'atemwege', 'herz-kreislauf', 'stoffwechsel', 'krebs', 'nerven-psyche', 'bewegung',
    'verdauung', 'sinne', 'infektion', 'unfall', 'sonstiges',
  ]),
  ...bereich('daten-beziehung', [
    'biologisch', 'adoptiv', 'stief', 'pflege', 'ehe', 'partnerschaft', 'geschieden', 'ungesichert',
  ]),
  // §1.3 Typografie: Rollen + Familien
  ...bereich('schrift', [
    'titel-gross', 'titel', 'titel-klein', 'koerper', 'koerper-klein', 'beschriftung',
    'hilfe', 'original', 'technisch', 'zahl-tabelle',
  ]),
  ...bereich('familie', ['ui', 'original', 'technisch']),
  // §1.4 Abstände (nach Wert benannt), Radien, Schatten
  ...[0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96].map((n) => `--wz-abstand-${n}`),
  ...bereich('radius', ['klein', 'standard', 'gross', 'modal', 'voll']),
  ...bereich('schatten', ['keiner', 'panel', 'popover', 'modal']),
  // §1.5 Bewegung
  ...bereich('dauer', ['sofort', 'kurz', 'mittel', 'lang']),
  ...bereich('kurve', ['standard', 'hinein', 'hinaus']),
  // §1.6 Dichte
  '--wz-zeilenhoehe-tabelle', '--wz-abstand-feld', '--wz-innenabstand-zelle',
]

describe('tokens.css — Vollständigkeit des Token-Vertrags (docs/71 §1)', () => {
  it('definiert jede in §1 benannte Rolle in :root', () => {
    const fehlend = paragraf1Rollen.filter((r) => !rootDekl.has(r))
    expect(fehlend, `In :root fehlende §1-Rollen: ${fehlend.join(', ')}`).toEqual([])
  })

  it('definiert keine Rolle ausschließlich in einem Themen- oder Medienblock (§1.7 Regel 1)', () => {
    const nurAusserhalbRoot = [...alleDekl].filter((r) => !rootDekl.has(r))
    expect(nurAusserhalbRoot, `Rollen ohne :root-Definition: ${nurAusserhalbRoot.join(', ')}`).toEqual([])
  })

  it('führt jede Farbrolle in BEIDEN expliziten Themen (§1.1: „jede Rolle existiert in beiden Themen")', () => {
    const farbrollen = [...rootDekl].filter(([, wert]) => FARB_LITERAL.test(wert)).map(([name]) => name)
    expect(farbrollen.length).toBeGreaterThan(80) // Schutz gegen versehentlich leere Erkennung
    const fehltDunkel = farbrollen.filter((r) => !dunkelDekl.has(r))
    const fehltHell = farbrollen.filter((r) => !hellDekl.has(r))
    expect(fehltDunkel, `Farbrollen ohne Dunkel-Fassung: ${fehltDunkel.join(', ')}`).toEqual([])
    expect(fehltHell, `Farbrollen ohne explizite Hell-Fassung: ${fehltHell.join(', ')}`).toEqual([])
  })

  it('hält die Namenmengen von Hell- und Dunkelthema deckungsgleich', () => {
    const nurDunkel = [...dunkelDekl.keys()].filter((r) => !hellDekl.has(r))
    const nurHell = [...hellDekl.keys()].filter((r) => !dunkelDekl.has(r))
    expect(nurDunkel, `nur im Dunkelthema: ${nurDunkel.join(', ')}`).toEqual([])
    expect(nurHell, `nur im Hellthema: ${nurHell.join(', ')}`).toEqual([])
  })

  it('überschreibt in der kompakten Dichte genau die vier Dichtetokens (§1.6)', () => {
    expect([...kompaktDekl.keys()].sort()).toEqual(
      ['--wz-abstand-feld', '--wz-innenabstand-zelle', '--wz-schrift-koerper', '--wz-zeilenhoehe-tabelle'],
    )
  })
})
