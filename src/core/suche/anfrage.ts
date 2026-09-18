// AP-1.6 PR1, C-16/C-17, 55_Architektur.md §5.2. Reine Funktion (CLAUDE.md §4: kein Date.now/
// Math.random in src/core, kein DB-Zugriff) — baut aus rohem Nutzertext einen FTS5-`MATCH`-Ausdruck
// für `suche_fts` (docs/schema/0003_abgeleitet.sql).
//
// FTS5-Escaping (SQLite-Doku, "Full-text Query Syntax"): ein String in doppelten Anführungszeichen
// wird als einzelne Phrase behandelt, unabhängig davon, welche Zeichen er sonst enthält — ein
// Apostroph in "O'Brien"/"d'Aboville" hat darum INNERHALB der Anführungszeichen keine
// Sonderbedeutung und bricht die Anfrage nicht. Ein doppeltes Anführungszeichen als Literalzeichen
// wird verdoppelt (`"` → `""`), wie in SQL-Stringliteralen. Jedes Token wird einzeln gequotet und
// die Phrasen werden mit Leerzeichen aneinandergereiht — FTS5 verknüpft aufeinanderfolgende Phrasen
// ohne Operator implizit mit UND.
import { koelnerPhonetik } from '../name/koelner-phonetik'
import type { SucheAnfrage } from './typen'

function alsFts5PhraseQuoten(token: string): string {
  return `"${token.replace(/"/gu, '""')}"`
}

/** Baut aus rohem Sucheingabetext (`ein.text` von `abfrage:suche`) eine `SucheAnfrage`. */
export function sucheAnfrageBauen(roh: string): SucheAnfrage {
  const tokens = roh
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)

  const matchAusdruck = tokens.map(alsFts5PhraseQuoten).join(' ')
  const koelnerCodes = tokens.map((token) => koelnerPhonetik(token)).filter((code) => code !== '')

  return { matchAusdruck, tokens, koelnerCodes }
}
