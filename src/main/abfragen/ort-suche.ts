// AP-1.13 PR-C (docs/71_Designsystem.md §3.2, A-04, 55_Architektur.md §5.2). `abfrage:ort.suche` —
// read-only SQL gegen `ort`/`ortsname` (CLAUDE.md §2: SQL nur in src/main/repositories/,
// src/main/abfragen/ — hier über `ort-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte
// Parameter.
//
// SCOPE (CLAUDE.md §10, nicht vorgreifen): minimale Ortssuche fürs `Ortsfeld` — Tippsuche über
// JEDEN (auch historischen) `ortsname.name` + der zu `ein.jdn` datumsgültige Anzeigename
// (`src/core/ort/zeitbezug.ts::gueltigerOrtsname`, bereits geprüfter Kern-Code, keine zweite
// Implementierung). Die volle Ortsverwaltung bleibt AP-1.16 (docs/80_Offene_Fragen.md).
import type Database from 'better-sqlite3'
import { gueltigerOrtsname, type OrtsnameEintrag } from '../../core/ort/zeitbezug'
import { OrtTypEnum } from '../../shared/schemata/ort'
import type { OrtSucheAus, OrtSucheEin, OrtTreffer } from '../../shared/schemata/ort-suche'
import * as ortRepo from '../repositories/ort-repo'

const GRENZE_STANDARD = 20

/** `abfrage:ort.suche` (55_Architektur.md §5.2, AP-1.13 PR-C). Leerer `text` liefert bewusst KEINE
 * Treffer — sonst wäre jeder Tastendruck auf ein leeres Feld eine Blindabfrage über den gesamten
 * Ortsbestand (analog `volltextPersonenIds()` in `src/main/abfragen/suche.ts`, das einen leeren
 * `matchAusdruck` ebenfalls überspringt). */
export function ortSuche(db: Database.Database, ein: OrtSucheEin): OrtSucheAus {
  const text = ein.text.trim()
  if (text === '') return { treffer: [] }

  const grenze = ein.grenze ?? GRENZE_STANDARD
  const orte = ortRepo.suchen(db, { text, grenze })
  if (orte.length === 0) return { treffer: [] }

  const namenZeilen = ortRepo.namenLesen(
    db,
    orte.map((ort) => ort.id),
  )

  const namenJeOrt = new Map<string, OrtsnameEintrag[]>()
  for (const zeile of namenZeilen) {
    if (zeile.name === null) continue
    const eintrag: OrtsnameEintrag = {
      name: zeile.name,
      ...(zeile.gueltig_von === null ? {} : { gueltigVon: zeile.gueltig_von }),
      ...(zeile.gueltig_bis === null ? {} : { gueltigBis: zeile.gueltig_bis }),
      istBevorzugt: zeile.ist_bevorzugt === 1,
    }
    const liste = namenJeOrt.get(zeile.ort_id)
    if (liste === undefined) {
      namenJeOrt.set(zeile.ort_id, [eintrag])
    } else {
      liste.push(eintrag)
    }
  }

  // `OrtTypEnum.parse()` statt eines unbegründeten `as` (CLAUDE.md §4) — dasselbe Muster wie
  // `EreignisTypEnum.parse(zeile.typ)`/`ElternschaftTypEnum.parse(zeile.kantentyp)` in
  // `src/main/abfragen/person-detail.ts`: `ort.typ` ist bereits per `CHECK`-Klausel gesichert
  // (docs/schema/0002_kern.sql §2.4), das `parse()` macht daraus einen geprüften Zod-Typ statt
  // einer bloßen Behauptung.
  const treffer: OrtTreffer[] = orte.map((ort) => {
    const namen = namenJeOrt.get(ort.id) ?? []
    const gueltiger = gueltigerOrtsname(namen, ein.jdn)
    const anzeigename = gueltiger?.name ?? namen[0]?.name ?? ''
    return {
      id: ort.id,
      anzeigename,
      ...(ort.typ === null ? {} : { typ: OrtTypEnum.parse(ort.typ) }),
    }
  })

  return { treffer }
}
