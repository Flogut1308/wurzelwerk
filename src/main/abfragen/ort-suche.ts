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
import { gueltigerOrtsname, hierarchieZuDatum, type OrtsnameEintrag, type ZugehoerigkeitEintrag } from '../../core/ort/zeitbezug'
import { OrtTypEnum } from '../../shared/schemata/ort'
import type { OrtSucheAus, OrtSucheEin, OrtTreffer } from '../../shared/schemata/ort-suche'
import * as ortRepo from '../repositories/ort-repo'

const GRENZE_STANDARD = 20

interface ZugehoerigkeitGeschichteZeile {
  readonly ort_id: string
  readonly uebergeordnet_id: string
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** ALLE `ortszugehoerigkeit`-Zeilen EINER `art`, mit Gültigkeitszeitraum — Grundlage für
 * `hierarchieZuDatum()` (AP-1.16 PR-C, mehrstufige Kette). Direkte SQL hier statt über
 * `ort-repo.ts::zugehoerigkeitenLesen` (das liefert nur `ortId`/`uebergeordnetId` für den
 * Zyklusschutz, ohne Gültigkeitszeitraum) — SQL ist auch in `src/main/abfragen/` ein
 * entschiedener Ort (CLAUDE.md §2). Für die zu erwartende Ortsanzahl (Ahnenforschung, kein
 * Massendatensatz) ist ein vollständiges Auslesen unkritisch, analog `ortRepo.zugehoerigkeitenLesen`. */
function politischeZugehoerigkeitenNachOrtLaden(db: Database.Database): ReadonlyMap<string, readonly ZugehoerigkeitEintrag[]> {
  const zeilen = db
    .prepare<
      [],
      ZugehoerigkeitGeschichteZeile
    >(`SELECT ort_id, uebergeordnet_id, gueltig_von, gueltig_bis FROM ortszugehoerigkeit WHERE art = 'politisch'`)
    .all()

  const karte = new Map<string, ZugehoerigkeitEintrag[]>()
  for (const zeile of zeilen) {
    const eintrag: ZugehoerigkeitEintrag = {
      uebergeordnetId: zeile.uebergeordnet_id,
      art: 'politisch',
      ...(zeile.gueltig_von === null ? {} : { gueltigVon: zeile.gueltig_von }),
      ...(zeile.gueltig_bis === null ? {} : { gueltigBis: zeile.gueltig_bis }),
    }
    const liste = karte.get(zeile.ort_id)
    if (liste === undefined) {
      karte.set(zeile.ort_id, [eintrag])
    } else {
      liste.push(eintrag)
    }
  }
  return karte
}

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

  // Politische Hierarchiekette je Treffer (AP-1.16 PR-C, docs/71 §3.2) — NUR mit `jdn` (ohne
  // Ereignisdatum gibt es keinen eindeutigen Gültigkeitszeitpunkt für eine mehrstufige Kette, s.
  // `OrtTreffer.politischeKette`-Kopfkommentar). `hierarchieZuDatum()` selbst ist der einzige
  // Auflösungsweg (`src/core/ort/zeitbezug.ts`) — hier wird nur die dafür nötige Datenbasis geladen.
  const jdn = ein.jdn
  const ketteJeOrt = new Map<string, readonly string[]>()
  if (jdn !== undefined) {
    const zugehoerigkeitenNachOrt = politischeZugehoerigkeitenNachOrtLaden(db)
    for (const ort of orte) {
      ketteJeOrt.set(ort.id, hierarchieZuDatum(zugehoerigkeitenNachOrt, ort.id, 'politisch', jdn))
    }
  }

  // Namen werden für die Treffer UND jeden in einer Kette entdeckten Vorfahren geladen (EIN
  // gemeinsamer `IN (...)`-Aufruf statt vieler einzelner) — `gueltigerOrtsname()` braucht je Ort
  // dessen volle Namensgeschichte, nicht nur den bevorzugten Namen.
  const vorfahrenIds = new Set<string>()
  for (const kette of ketteJeOrt.values()) {
    for (const uebergeordnetId of kette) vorfahrenIds.add(uebergeordnetId)
  }
  const alleOrtIds = [...new Set([...orte.map((ort) => ort.id), ...vorfahrenIds])]

  const namenZeilen = ortRepo.namenLesen(db, alleOrtIds)

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
  function anzeigenameZuJdn(ortId: string): string {
    const namen = namenJeOrt.get(ortId) ?? []
    const gueltiger = gueltigerOrtsname(namen, jdn)
    return gueltiger?.name ?? namen[0]?.name ?? ''
  }

  const treffer: OrtTreffer[] = orte.map((ort) => {
    const anzeigename = anzeigenameZuJdn(ort.id)
    const politischeKette = (ketteJeOrt.get(ort.id) ?? [])
      .map((uebergeordnetId) => anzeigenameZuJdn(uebergeordnetId))
      .filter((name) => name !== '')
    return {
      id: ort.id,
      anzeigename,
      politischeKette,
      ...(ort.typ === null ? {} : { typ: OrtTypEnum.parse(ort.typ) }),
    }
  })

  return { treffer }
}
