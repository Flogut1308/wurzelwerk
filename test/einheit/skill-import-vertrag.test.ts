import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Konsistenztest für den Skill `wurzelwerk-import-vertrag` (AP-1.9, D-11). Kein `src/`-Code:
// Der Skill selbst ist eine Markdown-Definition unter `.claude/skills/`. Dieser Test stellt
// sicher, dass die zehn Verbote aus `docs/import-vertrag.md` §7.2 — der einzigen Wahrheitsquelle —
// wörtlich im Skill stehen, statt sie hier ein zweites Mal von Hand zu pflegen (und damit
// still abweichen zu können).

const WURZEL = resolve(__dirname, '..', '..')
const SKILL_PFAD = resolve(WURZEL, '.claude/skills/wurzelwerk-import-vertrag/SKILL.md')
const VERTRAG_PFAD = resolve(WURZEL, 'docs/import-vertrag.md')

function leseSkill(): string {
  if (!existsSync(SKILL_PFAD)) {
    throw new Error(`SKILL.md fehlt unter ${SKILL_PFAD}`)
  }
  return readFileSync(SKILL_PFAD, 'utf-8')
}

/** Extrahiert Frontmatter-Schlüssel aus einem einfachen `---\nkey: wert\n---`-Block. */
function leseFrontmatter(inhalt: string): Readonly<Record<string, string>> {
  const treffer = /^---\r?\n([\s\S]*?)\r?\n---/.exec(inhalt)
  if (!treffer || treffer[1] === undefined) {
    return {}
  }
  const werte: Record<string, string> = {}
  for (const zeile of treffer[1].split(/\r?\n/)) {
    const paar = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(zeile)
    if (paar && paar[1] !== undefined && paar[2] !== undefined) {
      werte[paar[1]] = paar[2].trim()
    }
  }
  return werte
}

/**
 * Extrahiert die zehn Regelsätze aus §7.2 von `docs/import-vertrag.md` — der einzigen
 * Wahrheitsquelle. Robust gegen Neunummerierung im Skill: geliefert wird der Text NACH der
 * führenden Nummerierung ("1. ", "2. ", …), damit eine andere Aufzählungsform im Skill (z. B.
 * als Verbotsliste ohne Nummern) die Prüfung nicht bricht.
 */
function leseZehnRegelnAusVertrag(): readonly string[] {
  const vertragstext = readFileSync(VERTRAG_PFAD, 'utf-8')
  const startMarke = '### 7.2 Die Regeln, die im Skill stehen müssen (D-11)'
  const endMarke = '### 7.3 Warum ein leerer Notizblock verdächtig ist'
  const startIndex = vertragstext.indexOf(startMarke)
  const endIndex = vertragstext.indexOf(endMarke)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('§7.2-Abschnitt in docs/import-vertrag.md nicht gefunden — Marken geändert?')
  }
  const abschnitt = vertragstext.slice(startIndex, endIndex)
  const regeln: string[] = []
  const zeilenMuster = /^\d+\.\s+(.+)$/gm
  let treffer: RegExpExecArray | null
  while ((treffer = zeilenMuster.exec(abschnitt)) !== null) {
    const inhalt = treffer[1]
    if (inhalt !== undefined) {
      regeln.push(inhalt)
    }
  }
  return regeln
}

describe('Skill wurzelwerk-import-vertrag', () => {
  it('liegt am festgelegten Ort und hat gültiges Frontmatter', () => {
    const inhalt = leseSkill()
    const frontmatter = leseFrontmatter(inhalt)
    expect(frontmatter.name).toBe('wurzelwerk-import-vertrag')
    expect(frontmatter.description).toBeTruthy()
  })

  it('extrahiert genau zehn Regeln aus §7.2 der Wahrheitsquelle', () => {
    const regeln = leseZehnRegelnAusVertrag()
    expect(regeln).toHaveLength(10)
  })

  it('enthält jede der zehn §7.2-Regeln wörtlich', () => {
    const inhalt = leseSkill()
    const regeln = leseZehnRegelnAusVertrag()
    for (const regel of regeln) {
      expect(inhalt, `Regel fehlt wörtlich im Skill: ${regel}`).toContain(regel)
    }
  })

  it('verweist auf das Schema und die drei Beispieldateien statt sie zu kopieren', () => {
    const inhalt = leseSkill()
    expect(inhalt).toContain('wurzelwerk-import/v1')
    expect(inhalt).toContain('docs/import-vertrag/wurzelwerk-import-v1.schema.json')
    expect(inhalt).toContain('fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json')
    expect(inhalt).toContain('fixtures/import/v1/gueltig/eigenstaendig/beispiel-2-widersprueche.json')
    expect(inhalt).toContain('fixtures/import/v1/gueltig/braucht-bestand/beispiel-3-interview.json')
  })

  it('nennt den Trockenlauf-Rückweg', () => {
    const inhalt = leseSkill()
    expect(inhalt).toContain('Trockenlauf-Bericht')
    expect(inhalt.toLowerCase()).toContain('iterativ')
  })

  it('benennt die §7.4-Ehrlichkeit (erfundenes Transkript nicht ausschließbar)', () => {
    const inhalt = leseSkill()
    expect(inhalt).toContain('§7.4')
    expect(inhalt).toContain('erfundene')
    expect(inhalt).toContain('Stichproben')
  })
})
