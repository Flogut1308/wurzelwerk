// Querläufer „Design-Fundament übernehmen" (Wissen/58) · CLAUDE.md §5, docs/71_Designsystem.md §1.2.
// Das Kontrast- und CVD-Gate für die Datenpaletten. §1.2 nennt seine vier Prüfregeln selbst
// „maschinell nachprüfbar" — sie sind die wichtigste Zusage des Token-Vertrags (Barrierefreiheit,
// G-09) und dürfen nicht ungeprüft bleiben. Alles rein rechnerisch, deterministisch, ohne neue
// Abhängigkeit.
//
// Formelquellen (im Kopf zitiert, damit die Schwellen nachvollziehbar sind):
//  - Relative Luminanz + Kontrastverhältnis: WCAG 2.1, Definition „relative luminance" und
//    „contrast ratio" (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
//  - Wahrgenommene Helligkeit L*: CIELAB (CIE 15:2004), Weißpunkt D65.
//  - Farbabstand ΔE: CIE76 (euklidisch in L*a*b*).
//  - Farbfehlsichtigkeit (Deuteranopie/Protanopie): Machado, Oliveira & Fernandes (2009),
//    „A Physiologically-based Model for Simulation of Color Vision Deficiency", Schweregrad 1,0
//    (Matrizen im linearen sRGB angewendet).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tokensPfad = fileURLToPath(new URL('../../src/renderer/gestaltung/tokens.css', import.meta.url))
const css = readFileSync(tokensPfad, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const schemaPfad = fileURLToPath(new URL('../../docs/schema/0002_kern.sql', import.meta.url))
const schemaSql = readFileSync(schemaPfad, 'utf8')

function blockInhalt(quelle: string, selektor: string): string {
  const start = quelle.indexOf(selektor)
  if (start === -1) throw new Error(`Selektor fehlt in tokens.css: ${selektor}`)
  const auf = quelle.indexOf('{', start)
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
function deklarationen(blockText: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of blockText.matchAll(/(--wz-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = t[1]
    const wert = t[2]
    if (name !== undefined && wert !== undefined) m.set(name, wert.trim())
  }
  return m
}
const rootDekl = deklarationen(blockInhalt(css, ':root {'))
const dunkelDekl = deklarationen(blockInhalt(css, ':root[data-theme="dunkel"] {'))
type Thema = 'hell' | 'dunkel'
/** Rollenwert im jeweiligen Thema: hell = :root, dunkel = Überschreibung sonst :root. */
function wert(name: string, theme: Thema): string {
  const v = theme === 'dunkel' ? (dunkelDekl.get(name) ?? rootDekl.get(name)) : rootDekl.get(name)
  if (v === undefined) throw new Error(`Rolle fehlt: ${name} (${theme})`)
  return v
}

// ---- Farbmathematik (reine Funktionen) ----
function kanal(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
const istHex = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v)
const gammaZuLinear = (c: number): number => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
function linRGB(h: string): [number, number, number] {
  const [r, g, b] = kanal(h)
  return [gammaZuLinear(r), gammaZuLinear(g), gammaZuLinear(b)]
}
function relLuminanz(h: string): number {
  const [r, g, b] = linRGB(h)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function kontrast(a: string, b: string): number {
  const la = relLuminanz(a)
  const lb = relLuminanz(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
function lab(h: string): [number, number, number] {
  const [r, g, b] = linRGB(h)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const lStern = (h: string): number => lab(h)[0]
function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
// Machado 2009, Schweregrad 1,0 — angewendet im linearen sRGB.
const CVD = {
  deuteranopie: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopie: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const
function linearZuGamma(v: number): number {
  const x = Math.max(0, Math.min(1, v))
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}
function simuliere(h: string, art: keyof typeof CVD): string {
  const [r, g, b] = linRGB(h)
  const m = CVD[art]
  const rr = m[0][0] * r + m[0][1] * g + m[0][2] * b
  const gg = m[1][0] * r + m[1][1] * g + m[1][2] * b
  const bb = m[2][0] * r + m[2][1] * g + m[2][2] * b
  const zwei = (v: number): string => Math.round(linearZuGamma(v) * 255).toString(16).padStart(2, '0')
  return `#${zwei(rr)}${zwei(gg)}${zwei(bb)}`
}

// ---- Die Datenpaletten aus §1.2 ----
function diagnoseKategorien(): string[] {
  const anfang = schemaSql.indexOf('CREATE TABLE diagnose')
  const treffer = schemaSql
    .slice(anfang)
    .match(/kategorie\s+TEXT\s+CHECK\s*\(\s*kategorie\s+IN\s*\(([^)]*)\)/i)
  if (treffer === null || treffer[1] === undefined) throw new Error('Diagnose-CHECK fehlt')
  return [...treffer[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((w): w is string => w !== undefined)
    .map((w) => w.replace(/_/g, '-'))
}
const konfidenz = [1, 2, 3, 4].map((i) => `--wz-daten-konfidenz-${i}`)
const generation = Array.from({ length: 12 }, (_, i) => `--wz-daten-generation-${i + 1}`)
const strang = Array.from({ length: 8 }, (_, i) => `--wz-daten-strang-${i + 1}`)
const geschlecht = ['m', 'f', 'u', 'x'].map((s) => `--wz-daten-geschlecht-${s}`)
const diagnose = diagnoseKategorien().map((k) => `--wz-daten-diagnose-${k}`)
const beziehung = [
  'biologisch', 'adoptiv', 'stief', 'pflege', 'ehe', 'partnerschaft', 'geschieden', 'ungesichert',
].map((s) => `--wz-daten-beziehung-${s}`)
const alleFills = [...konfidenz, ...generation, ...strang, ...geschlecht, ...diagnose, ...beziehung]
const themen: readonly Thema[] = ['hell', 'dunkel']

describe('Datenpaletten — Kontrast und CVD (docs/71 §1.2)', () => {
  it('R1: jede Datenfarbe erreicht ≥3:1 gegen --wz-flaeche-basis UND --wz-flaeche-erhoben (beide Themen)', () => {
    const verstoss: string[] = []
    for (const theme of themen) {
      const basis = wert('--wz-flaeche-basis', theme)
      const erhoben = wert('--wz-flaeche-erhoben', theme)
      for (const t of alleFills) {
        const v = wert(t, theme)
        if (!istHex(v)) continue
        const cb = kontrast(v, basis)
        const ce = kontrast(v, erhoben)
        if (cb < 3 || ce < 3) verstoss.push(`${theme}/${t}: basis=${cb.toFixed(2)} erhoben=${ce.toFixed(2)}`)
      }
    }
    expect(verstoss, `R1 (<3:1):\n${verstoss.join('\n')}`).toEqual([])
  })

  it('R2: auf jeder text-tragenden Datenfläche erreicht ein Standard-Textton (primär/invers) ≥4,5:1 (WCAG AA, G-09; beide Themen)', () => {
    // §1.2 Regel 2 sagt „Text DARAUF erreicht 4,5:1" — die Regel greift, WO Text auf der Farbe
    // liegt. Text-tragend sind Flächen: generation (Kartenhintergrund), strang, geschlecht,
    // diagnose (Legende/Ansicht). NICHT text-tragend und darum ausgenommen: konfidenz (der
    // `KonfidenzPunkt` ist ein Punkt, §2.1 — kein Text darauf) und beziehung (Kantenfarben, §1.2
    // „Farbe ist sekundär" / §5 „die Kantenform trägt die Hauptinformation"). R1 gilt für sie
    // weiter. Hinweis: die dunkle Konfidenzrampe könnte R1∧R2∧R3 ohnehin nicht zugleich erfüllen
    // (Re-Ramp nötig) — dokumentiert in 80_Offene_Fragen §11 (U-DF8).
    const textFlaechen = [...generation, ...strang, ...geschlecht, ...diagnose]
    const verstoss: string[] = []
    for (const theme of themen) {
      const tp = wert('--wz-text-primaer', theme)
      const ti = wert('--wz-text-invers', theme)
      for (const t of textFlaechen) {
        const v = wert(t, theme)
        if (!istHex(v)) continue
        const beste = Math.max(kontrast(tp, v), kontrast(ti, v))
        if (beste < 4.5) verstoss.push(`${theme}/${t}: ${beste.toFixed(2)}`)
      }
    }
    expect(verstoss, `R2 (Text <4,5:1):\n${verstoss.join('\n')}`).toEqual([])
  })

  it('R3: die ordinale Konfidenzpalette verläuft monoton in L* mit |ΔL*| ≥ 8 je Schritt (beide Themen)', () => {
    const verstoss: string[] = []
    for (const theme of themen) {
      const werte = konfidenz.map((t) => lStern(wert(t, theme)))
      let richtung = 0
      for (let i = 0; i < werte.length - 1; i++) {
        const a = werte[i]
        const b = werte[i + 1]
        if (a === undefined || b === undefined) continue
        const d = b - a
        if (i === 0) richtung = Math.sign(d)
        if (Math.abs(d) < 8) verstoss.push(`${theme}/${i + 1}→${i + 2}: ΔL*=${d.toFixed(1)}`)
        if (Math.sign(d) !== richtung) verstoss.push(`${theme}/${i + 1}→${i + 2}: nicht monoton`)
      }
    }
    expect(verstoss, `R3 (Konfidenz ΔL*):\n${verstoss.join('\n')}`).toEqual([])
  })

  it('R4: Konfidenzstufen bleiben unter Deuteranopie und Protanopie unterscheidbar (ΔE76 ≥ 5; beide Themen)', () => {
    // Ordinale Palette: die Reihenfolge muss auch bei CVD lesbar bleiben. ΔE76 ≥ 5 liegt deutlich
    // über der Wahrnehmungsschwelle (~2,3). Kategoriale Paletten (generation/strang/…) tragen ihre
    // Bedeutung laut §1.2 Regel 4 NIE über den Farbton allein, sondern über eine zweite Kodierung
    // (Position/Nummer/Form) — Deuteranopie kollabiert die Rot-Grün-Achse, 12 farbunterscheidbare
    // Stufen sind dort bauartbedingt unmöglich; deshalb ist hier die ordinale Palette das Prüfmaß.
    const verstoss: string[] = []
    for (const theme of themen) {
      const werte = konfidenz.map((t) => wert(t, theme))
      for (const art of ['deuteranopie', 'protanopie'] as const) {
        for (let i = 0; i < werte.length - 1; i++) {
          const a = werte[i]
          const b = werte[i + 1]
          if (a === undefined || b === undefined) continue
          const de = deltaE76(simuliere(a, art), simuliere(b, art))
          if (de < 5) verstoss.push(`${theme}/${art}/${i + 1}→${i + 2}: ΔE=${de.toFixed(1)}`)
        }
      }
    }
    expect(verstoss, `R4 (Konfidenz CVD):\n${verstoss.join('\n')}`).toEqual([])
  })
})
