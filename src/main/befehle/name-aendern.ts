// AP-1.12: Handler für `name.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich; stimmen ALLE Felder bereits mit `ein`
// überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer
// `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { NameAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameRepo from '../repositories/name-repo'
import type { NameZeile } from '../repositories/name-repo'

function unveraendert(vorher: NameZeile, ein: NameAendernEin): boolean {
  return (
    vorher.typ === ein.typ &&
    vorher.schrift === (ein.schrift ?? null) &&
    vorher.umschrift_von === (ein.umschriftVon ?? null) &&
    vorher.umschrift_norm === (ein.umschriftNorm ?? null) &&
    vorher.vornamen === (ein.vornamen ?? null) &&
    vorher.rufname_index === (ein.rufnameIndex ?? null) &&
    vorher.rufname_text === (ein.rufnameText ?? null) &&
    vorher.nachname === (ein.nachname ?? null) &&
    vorher.praefix === (ein.praefix ?? null) &&
    vorher.titel_vor === (ein.titelVor ?? null) &&
    vorher.zusatz_nach === (ein.zusatzNach ?? null) &&
    vorher.original_text === (ein.originalText ?? null) &&
    vorher.sprache === (ein.sprache ?? null) &&
    vorher.ist_bevorzugt === (ein.istBevorzugt ?? null) &&
    vorher.gueltig_von === (ein.gueltigVon ?? null) &&
    vorher.gueltig_bis === (ein.gueltigBis ?? null)
  )
}

export function nameAendern(tx: Tx, ein: NameAendernEin): null {
  const vorher = nameRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  nameRepo.aktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    schrift: ein.schrift ?? null,
    umschriftVon: ein.umschriftVon ?? null,
    umschriftNorm: ein.umschriftNorm ?? null,
    vornamen: ein.vornamen ?? null,
    rufnameIndex: ein.rufnameIndex ?? null,
    rufnameText: ein.rufnameText ?? null,
    nachname: ein.nachname ?? null,
    praefix: ein.praefix ?? null,
    titelVor: ein.titelVor ?? null,
    zusatzNach: ein.zusatzNach ?? null,
    originalText: ein.originalText ?? null,
    sprache: ein.sprache ?? null,
    istBevorzugt: ein.istBevorzugt ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
