// AP-1.30 PR 9a (Rundreise, gleiche Fehlerklasse wie V-130-2a-rundreise): `befehl:aussage.aendern`
// ersetzt alle Werte einer Aussage — ein nicht mitgeschicktes Feld wird NULL, ein fehlendes `datum`
// entfernt das gespeicherte (O10). Diese reine Abbildung baut den Befehl aus dem Lesemodell
// (`PersonDetailAussage`) und EINER Änderung: was die Änderung nicht nennt, geht unverändert zurück.
//
// Das Datum geht dabei NICHT als Wert zurück, sondern über das Signal `datumBeibehalten` (V-E5-erhalt):
// eine Altbestands-Datumsgruppe (Zweitkalender, Doppeljahr, Sortierwerte) käme über den Vertrags-
// `Datumswert` nicht sicher bitgleich zurück, obwohl niemand sie angefasst hat.
//
// Geprüft durch `test/einheit/profil-aussage-rundreise.test.ts` über die Schlüssel von
// `aussageAendernEinSchema`. Rein, kein React (CLAUDE.md §2).
import { AussageAendernFeldEnum, type AussageAendernEin, type AussageAendernFeld } from '../../../shared/schemata/befehle'
import type { PersonDetailAussage } from '../../../shared/schemata/person-detail'

/** Eine Änderung an einer Aussage: je editierbarem Vertragsfeld (`AussageAendernFeldEnum`) optional
 * ein neuer Wert. Fehlt ein Feld, bleibt es unverändert; `null` entfernt es (außer `konfidenz`, die
 * `aussage.aendern` immer verlangt). */
export type AussageAenderung = {
  readonly [K in AussageAendernFeld]?: K extends 'konfidenz' ? number : Exclude<AussageAendernEin[K], undefined> | null
}

/** Neuer Wert, wenn die Änderung ihn nennt (`null` = entfernen), sonst der gespeicherte. */
function wahl<T>(neu: T | null | undefined, gespeichert: T | null): T | undefined {
  if (neu === undefined) return gespeichert ?? undefined
  return neu ?? undefined
}

/**
 * Baut `befehl:aussage.aendern` aus dem Lesestand und EINER Änderung. Nennt die Änderung genau ein
 * Feld, trägt der Befehl es als `feld` (Koaleszenzschlüssel des Autosave, AP-1.30 PR 4). `null`, wenn
 * weder die Änderung noch der Lesestand eine Konfidenz hat (Altbestand ohne Konfidenz — der Befehl
 * verlangt eine; die Oberfläche muss sie dann zuerst erfragen).
 */
export function aussageAendernEinAus(aussage: PersonDetailAussage, aenderung: AussageAenderung): AussageAendernEin | null {
  const konfidenz = aenderung.konfidenz ?? aussage.konfidenz
  if (konfidenz === null) return null
  const geaendert = AussageAendernFeldEnum.options.filter((feld) => aenderung[feld] !== undefined)
  const einzigesFeld = geaendert.length === 1 ? geaendert[0] : undefined
  const datum = aenderung.datum
  return {
    id: aussage.aussage_id,
    wertText: wahl(aenderung.wertText, aussage.wert_text),
    wertZahl: wahl(aenderung.wertZahl, aussage.wert_zahl),
    wertRefId: wahl(aenderung.wertRefId, aussage.wert_ref_id),
    ...(datum === undefined ? { datumBeibehalten: true } : datum === null ? {} : { datum }),
    konfidenz,
    begruendung: wahl(aenderung.begruendung, aussage.begruendung),
    unsicherheit: wahl(aenderung.unsicherheit, aussage.unsicherheit),
    gueltigVon: wahl(aenderung.gueltigVon, aussage.gueltig_von),
    gueltigBis: wahl(aenderung.gueltigBis, aussage.gueltig_bis),
    ...(einzigesFeld !== undefined ? { feld: einzigesFeld } : {}),
  }
}
