// AP-1.12: Handler für `name.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `lesen()`, Feld-für-Feld-Vergleich; ist `nameGeaenderteFelder` leer (Rohfelder
// unverändert ODER Wirkung unverändert, U-130-rufname-noop), bleibt der Aufruf ein No-op (kein
// Repo-Schreibvorgang, kein neuer `geaendert_am`-Zeitstempel) — der Befehlsbus verwirft die dadurch
// leere Transaktion vollständig.
import type { NameAendernEin, NameAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameRepo from '../repositories/name-repo'
import type { NameZeile } from '../repositories/name-repo'
import { istMontierterOriginalText, montiereOriginalTextDerTeile, rekonstruiereFlach, zerlegeName, type FlacherName } from '../../core/name/zerlegung'
import { neueId } from '../id'

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

/** Regel für `original_text` (s. `nameGeaenderteFelder`): geändert, wenn der zu schreibende Text vom
 * gespeicherten abweicht — außer der Aufrufer gibt keinen mit und der gespeicherte ist eine
 * automatische Montage (dann folgt er nur den Teilen). */
function originalTextGeaendert(vorher: NameZeile, ein: NameAendernEin, flachEin: FlacherName): boolean {
  const geschrieben = ein.originalText ?? montiereOriginalTextDerTeile(flachEin)
  const folgtDenTeilen = ein.originalText === undefined && istMontierterOriginalText(vorher.original_text, flachAusZeile(vorher))
  return vorher.original_text !== geschrieben && !folgtDenTeilen
}

/** hueter #181 H2: die rohe Nutzlast gleicht Feld für Feld der gespeicherten flachen Sicht
 * (`nameRepo.lesen`) — ohne Umweg über `zerlegeName`. */
function rohUnveraendert(vorher: NameZeile, ein: NameAendernEin, flachEin: FlacherName): boolean {
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
    !originalTextGeaendert(vorher, ein, flachEin) &&
    vorher.sprache === (ein.sprache ?? null) &&
    vorher.gueltig_von === (ein.gueltigVon ?? null) &&
    vorher.gueltig_bis === (ein.gueltigBis ?? null)
  )
}

/**
 * AP-1.30 PR 4 (Koaleszenzschlüssel, `koaleszenz-schluessel.ts`): die Vertragsfelder, deren
 * GESPEICHERTER Wert sich durch `ein` ändern würde — verglichen wird die WIRKUNG, nicht die rohe
 * Nutzlast: `name.aendern` baut die Bestandteile neu auf (`zerlegeName`), die flache Sicht
 * (`nameRepo.lesen`) rekonstruiert sie wieder (`rekonstruiereFlach`). Erst so sind `rufnameIndex`/
 * `rufnameText` vergleichbar (beide sind nur zwei Sichten auf DAS eine `ist_rufname` eines Teils).
 *
 * `original_text`: zählt NICHT als eigene Änderung, wenn der Aufrufer keinen mitgibt und der
 * gespeicherte eine AUTOMATISCHE Montage der gespeicherten Teile ist (`istMontierterOriginalText` —
 * dieselbe Erkennung, mit der die Maske entscheidet, ob sie `originalText` mitschickt): dann folgt er
 * nur den Teilen (derselbe Montage-Weg wie `nameRepo.aktualisieren`). Das schließt die Anlege-Montage
 * ohne angehängten Rufnamen („Karl Gutnoff" zu den Teilen „Karl Hans Peter" + „Gutnoff") und einen
 * reinen Leerraum-Unterschied ein (U-130-rufname-noop, hueter #169 H3). Ersetzt die Montage dagegen
 * eine wortgetreue Schreibung, ist das eine zweite Änderung. Ein gespeichertes `null` gilt wie in der
 * Erkennung als automatisch (nichts Wortgetreues zu erhalten) — der flache Schreibpfad hinterlässt es
 * bei vorhandenen Teilen ohnehin nicht (`nameRepo.aktualisieren`/`einfuegen` montieren).
 *
 * Zugleich der No-op-Vergleich des Handlers (U-130-rufname-noop): eine leere Liste heißt „nichts zu
 * schreiben" — kein Schreibvorgang, keine Transaktion, kein Schlüssel. Leer ist sie in ZWEI Fällen:
 *  1. die Wirkung gleicht dem gespeicherten Stand. Deckt den angehängten Rufnamen der Maske ab („Karl"
 *     + `rufnameText` „Hans Peter" gegen gespeichert „Karl Hans Peter", Review H1 #168).
 *  2. die ROHFELDER gleichen der gespeicherten flachen Sicht (`rohUnveraendert`). Nötig, weil die
 *     Kern-Rundreise `rekonstruiereFlach ∘ zerlegeName` bei einem angehängten mehrwortigen Rufnamen
 *     NICHT die Identität ist: die flache Sicht „Karl Hans Peter" / Index 1 / „Hans Peter" zerlegte
 *     sich zu „Karl", „Hans"*, „Peter" — ein Rohecho schriebe einen Undo-Schritt und kürzte
 *     `rufname_text` still auf „Hans" (hueter #181 H2; offene Datenmodellfrage
 *     U-130-rufname-mehrteilig). Auf main verhinderte das der alleinige Rohvergleich.
 * `ist_bevorzugt` fehlt bewusst (AP-1.33: Wechsel über `befehl:hauptname.wechseln`).
 */
export function nameGeaenderteFelder(vorher: NameZeile, ein: NameAendernEin): readonly NameAendernFeld[] {
  const flachEin = flachAusEin(ein)
  if (rohUnveraendert(vorher, ein, flachEin)) return []
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
  if (originalTextGeaendert(vorher, ein, flachEin)) felder.push('originalText')
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
  if (nameGeaenderteFelder(vorher, ein).length === 0) {
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
