// AP-1.12: Handler für `name.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich; stimmen ALLE Felder bereits mit `ein`
// überein, bleibt der Aufruf ein No-op (kein Repo-Schreibvorgang, kein neuer
// `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch leere Transaktion vollständig.
import type { NameAendernEin, NameAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameRepo from '../repositories/name-repo'
import type { NameZeile } from '../repositories/name-repo'
import { montiereOriginalText, rekonstruiereFlach, zerlegeName, type FlacherName } from '../../core/name/zerlegung'
import { neueId } from '../id'

/** Der `original_text`, den `nameRepo.aktualisieren()` effektiv schreiben würde (montiert, wenn der
 * Aufrufer keinen mitgibt) — nötig, damit der No-op-Vergleich nicht wegen des automatisch gesetzten
 * `original_text` fälschlich eine Änderung sieht. */
function effektiverOriginalText(ein: NameAendernEin): string | null {
  return (
    ein.originalText ??
    montiereOriginalText({
      vornamen: ein.vornamen,
      rufnameIndex: ein.rufnameIndex,
      rufnameText: ein.rufnameText,
      nachname: ein.nachname,
      praefix: ein.praefix,
      titelVor: ein.titelVor,
      zusatzNach: ein.zusatzNach,
      vatersname: ein.vatersname,
    })
  )
}

// AP-1.33: `ist_bevorzugt` (Hauptname) ist NICHT mehr über `name.aendern` editierbar — der Wechsel
// läuft über `befehl:hauptname.wechseln` (das „genau ein Hauptname je Person"-Constraint verbietet
// einen In-Place-Tausch, s. `name-form-repo.ts`). Der No-op-Vergleich lässt `ist_bevorzugt` darum aus.
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
    vorher.vatersname === (ein.vatersname ?? null) &&
    vorher.original_text === effektiverOriginalText(ein) &&
    vorher.sprache === (ein.sprache ?? null) &&
    vorher.gueltig_von === (ein.gueltigVon ?? null) &&
    vorher.gueltig_bis === (ein.gueltigBis ?? null)
  )
}

function flachAusEin(ein: NameAendernEin): FlacherName {
  return {
    vornamen: ein.vornamen,
    rufnameIndex: ein.rufnameIndex,
    rufnameText: ein.rufnameText,
    nachname: ein.nachname,
    praefix: ein.praefix,
    titelVor: ein.titelVor,
    zusatzNach: ein.zusatzNach,
    vatersname: ein.vatersname,
  }
}

function flachAusZeile(vorher: NameZeile): FlacherName {
  return {
    vornamen: vorher.vornamen,
    rufnameIndex: vorher.rufname_index,
    rufnameText: vorher.rufname_text,
    nachname: vorher.nachname,
    praefix: vorher.praefix,
    titelVor: vorher.titel_vor,
    zusatzNach: vorher.zusatz_nach,
    vatersname: vorher.vatersname,
  }
}

/**
 * AP-1.30 PR 4 (Koaleszenzschlüssel, `koaleszenz-schluessel.ts`): die Vertragsfelder, deren
 * GESPEICHERTER Wert sich durch `ein` ändern würde — verglichen wird die WIRKUNG, nicht die rohe
 * Nutzlast: `name.aendern` baut die Bestandteile neu auf (`zerlegeName`), die flache Sicht
 * (`nameRepo.lesen`) rekonstruiert sie wieder (`rekonstruiereFlach`). Erst so sind `rufnameIndex`/
 * `rufnameText` vergleichbar (beide sind nur zwei Sichten auf DAS eine `ist_rufname` eines Teils).
 *
 * `original_text`: zählt NICHT als eigene Änderung, wenn der Aufrufer keinen mitgibt und der
 * gespeicherte die automatische Montage der gespeicherten Teile war — dann folgt er nur den Teilen
 * (derselbe Montage-Weg wie `nameRepo.aktualisieren`). Ersetzt die Montage dagegen eine wortgetreue
 * Schreibung, ist das eine zweite Änderung.
 *
 * Bewusst getrennt vom No-op-Vergleich `unveraendert()` oben (roh, seit AP-0.22 unverändert): wo die
 * beiden abweichen (z. B. ein fehlender `rufnameText`, der dieselben Teile ergibt), schreibt der
 * Handler, aber diese Liste ist leer — und ohne Änderung gibt es keinen Schlüssel.
 */
export function nameGeaenderteFelder(vorher: NameZeile, ein: NameAendernEin): readonly NameAendernFeld[] {
  const flachEin = flachAusEin(ein)
  const wirkung = rekonstruiereFlach(zerlegeName(flachEin))
  const felder: NameAendernFeld[] = []
  if (vorher.typ !== ein.typ) felder.push('typ')
  if (vorher.schrift !== (ein.schrift ?? null)) felder.push('schrift')
  if (vorher.umschrift_von !== (ein.umschriftVon ?? null)) felder.push('umschriftVon')
  if (vorher.umschrift_norm !== (ein.umschriftNorm ?? null)) felder.push('umschriftNorm')
  if (vorher.vornamen !== wirkung.vornamen) felder.push('vornamen')
  if (vorher.rufname_index !== wirkung.rufnameIndex) felder.push('rufnameIndex')
  if (vorher.rufname_text !== wirkung.rufnameText) felder.push('rufnameText')
  if (vorher.nachname !== wirkung.nachname) felder.push('nachname')
  if (vorher.praefix !== wirkung.praefix) felder.push('praefix')
  if (vorher.titel_vor !== wirkung.titelVor) felder.push('titelVor')
  if (vorher.zusatz_nach !== wirkung.zusatzNach) felder.push('zusatzNach')
  if (vorher.vatersname !== wirkung.vatersname) felder.push('vatersname')
  const geschrieben = ein.originalText ?? montiereOriginalText(flachEin)
  const folgtDenTeilen = ein.originalText === undefined && vorher.original_text === montiereOriginalText(flachAusZeile(vorher))
  if (vorher.original_text !== geschrieben && !folgtDenTeilen) felder.push('originalText')
  if (vorher.sprache !== (ein.sprache ?? null)) felder.push('sprache')
  if (vorher.gueltig_von !== (ein.gueltigVon ?? null)) felder.push('gueltigVon')
  if (vorher.gueltig_bis !== (ein.gueltigBis ?? null)) felder.push('gueltigBis')
  return felder
}

export function nameAendern(tx: Tx, ein: NameAendernEin): null {
  const vorher = nameRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  if (unveraendert(vorher, ein)) {
    return null
  }
  nameRepo.aktualisieren(
    tx,
    {
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
      vatersname: ein.vatersname ?? null,
      originalText: ein.originalText ?? null,
      sprache: ein.sprache ?? null,
      gueltigVon: ein.gueltigVon ?? null,
      gueltigBis: ein.gueltigBis ?? null,
      geaendertAm: Date.now(),
    },
    neueId,
  )
  return null
}
