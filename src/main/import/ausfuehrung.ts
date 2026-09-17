// AP-1.5, 56_Import_Vertrag.md §6.3 (ADR-019): Schreib-Orchestrierung des ECHTEN Imports, auf
// einer bereits offenen Transaktion (KEIN `BEGIN`/`COMMIT` hier, CLAUDE.md §2 Regel 3 — der
// Aufrufer, `src/main/befehle/import-ausfuehren.ts`, öffnet/committet). Reihenfolge:
//   Medien kopieren (§3.8, NUR hier — nicht in der Sondierung) → schreibeImport() (derselbe
//   Schreibweg wie Sondierung/Trockenlauf, `src/main/import/schreiben.ts`) → import_lauf anlegen
//   → je real geschriebenem Datensatz eine import_herkunft-Zeile.
import { dirname } from 'node:path'
import type { ImportDatei } from '../../shared/schemata/import-v1'
import { neueId as neueIdStandard } from '../id'
import type { Tx } from '../repositories/basis'
import { importHerkunftAnlegen, importLaufAnlegen } from '../repositories/import-herkunft-repo'
import { medienKopieren } from './medienkopie'
import { schreibeImport, type SchreibErgebnis } from './schreiben'

export interface AusfuehrungKontext {
  /** Pfad der Importdatei — Grundlage für `import_lauf.datei` und die Medienquelle (relativ dazu, §3.8). */
  readonly pfad: string
  readonly erstelltAm: number
  readonly transaktionId: string
  /** Der Projekt-Medienordner (`<projektordner>/medien`, AP-1.5). */
  readonly medienPfad: string
  readonly neueId?: () => string
}

/** Herkunftsfähige Top-Level-Arrays des Vertrags (§2.1, eigenes `id`-Feld) + ihr Tabellenname
 * (E-7-Diskriminator `import_herkunft.datensatz_typ`). Explizit ein Feld nach dem anderen, wie in
 * `src/main/import/schreiben.ts` (Pass 1) — keine dynamische `keyof`-Indizierung, damit kein
 * unbegründetes `as` nötig wird (CLAUDE.md §4). */
function herkunftKandidaten(datei: ImportDatei, kennungen: ReadonlyMap<string, string>): ReadonlyArray<{ readonly datensatzId: string; readonly datensatzTyp: string }> {
  const eintraege: Array<{ readonly datensatzId: string; readonly datensatzTyp: string }> = []
  const sammle = (arr: readonly { readonly id: string }[] | undefined, tabelle: string): void => {
    for (const eintrag of arr ?? []) {
      if (eintrag.id.startsWith('db:')) continue // §2.1 Schutzregel: eine `db:`-Referenz erzeugt keine neue Zeile → keine Herkunft.
      const uuid = kennungen.get(eintrag.id)
      if (uuid === undefined) continue // defensiv (CLAUDE.md §4) — `schreibeImport()` hat jede Kennung aus Pass 1 aufgelöst.
      eintraege.push({ datensatzId: uuid, datensatzTyp: tabelle })
    }
  }
  sammle(datei.personen, 'person')
  sammle(datei.orte, 'ort')
  sammle(datei.ereignisse, 'ereignis')
  sammle(datei.partnerschaften, 'partnerschaft')
  sammle(datei.medien, 'medium')
  sammle(datei.interviews, 'interview_sitzung')
  sammle(datei.quellen, 'quelle')
  return eintraege
}

/**
 * Der eigentliche Schreibpfad des echten Imports (AP-1.5): kopiert Medien (falls welche im
 * Vertrag stehen), schreibt die Datei über `schreibeImport()` und füllt `import_lauf`/
 * `import_herkunft`. Läuft identisch für den kleinen (Journal an) und den großen Import (Journal
 * aus) — der Unterschied liegt ausschließlich in der Journal-Armierung des Aufrufers.
 */
export function schreibeImportLauf(tx: Tx, datei: ImportDatei, kontext: AusfuehrungKontext): SchreibErgebnis {
  const neueId = kontext.neueId ?? neueIdStandard
  const importOrdner = dirname(kontext.pfad)

  const medienAufloesung =
    datei.medien !== undefined && datei.medien.length > 0 ? medienKopieren(datei.medien, importOrdner, kontext.medienPfad, { neueId }) : undefined

  const ergebnis = schreibeImport(tx, datei, {
    erstelltAm: kontext.erstelltAm,
    neueId,
    ...(medienAufloesung !== undefined ? { medienAufloesung } : {}),
  })

  const importLaufId = neueId()
  importLaufAnlegen(tx, {
    id: importLaufId,
    datei: kontext.pfad,
    pruefsumme: datei.pruefsumme_quelltext ?? null,
    vertragsversion: datei.vertrag,
    zeitpunkt: kontext.erstelltAm,
    transaktionId: kontext.transaktionId,
    erstelltAm: kontext.erstelltAm,
    geaendertAm: kontext.erstelltAm,
  })

  for (const kandidat of herkunftKandidaten(datei, ergebnis.kennungen)) {
    importHerkunftAnlegen(tx, {
      id: neueId(),
      importLaufId,
      datensatzId: kandidat.datensatzId,
      datensatzTyp: kandidat.datensatzTyp,
      erstelltAm: kontext.erstelltAm,
      geaendertAm: kontext.erstelltAm,
    })
  }

  return ergebnis
}
