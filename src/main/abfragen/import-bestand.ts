// Stufe 2 des Import-Vertrags (56_Import_Vertrag.md §4 IMP-202): prüft, welche referenzierten
// `db:<uuid>`-Kennungen im Projekt tatsächlich existieren. Das EINZIGE SQL in diesem Modul
// (CLAUDE.md §2 Satz 4) — read-only, KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
import type Database from 'better-sqlite3'

/** Die sieben Kern-Tabellen mit eigener `id`-Spalte, gegen die eine `db:`-Kennung zeigen kann
 * (50_Datenmodell.md §2). `interview_sitzung` trägt die Interviews — der Import-Vertrag nennt das
 * Feld `interviews`, das Kernschema die Tabelle `interview_sitzung` (docs/schema/0002_kern.sql). */
const KERN_TABELLEN = ['person', 'ort', 'quelle', 'ereignis', 'partnerschaft', 'medium', 'interview_sitzung'] as const

interface IdZeile {
  readonly id: string
}

const DB_PRAEFIX = 'db:'

/**
 * Prüft, welche der `kandidaten` (volle `db:<uuid>`-Kennungen, wie sie im Import-Vertrag stehen)
 * im Bestand existieren — über alle sieben Kern-Tabellen. Rückgabe: die Teilmenge von
 * `kandidaten`, die auf einen vorhandenen Datensatz trifft (in IRGENDEINER der Tabellen).
 */
export function vorhandeneKennungen(db: Database.Database, kandidaten: readonly string[]): ReadonlySet<string> {
  if (kandidaten.length === 0) return new Set()

  const bareIdZuKennung = new Map<string, string>()
  for (const kennung of kandidaten) {
    bareIdZuKennung.set(kennung.slice(DB_PRAEFIX.length), kennung)
  }

  const platzhalter = kandidaten.map((_, i) => `@id${i}`).join(', ')
  const parameter: Record<string, string> = {}
  kandidaten.forEach((kennung, i) => {
    parameter[`id${i}`] = kennung.slice(DB_PRAEFIX.length)
  })

  const gefunden = new Set<string>()
  for (const tabelle of KERN_TABELLEN) {
    const zeilen = db.prepare<Record<string, string>, IdZeile>(`SELECT id FROM ${tabelle} WHERE id IN (${platzhalter})`).all(parameter)
    for (const zeile of zeilen) {
      const kennung = bareIdZuKennung.get(zeile.id)
      if (kennung !== undefined) gefunden.add(kennung)
    }
  }
  return gefunden
}
