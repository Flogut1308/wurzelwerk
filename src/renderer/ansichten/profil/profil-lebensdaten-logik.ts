// AP-1.30 PR 1 (V-D9-anzeige, docs/80 §32 V-D9-anzeige, Entscheidungen §33 V-130-1-*): Zeilenbildung der Grunddaten in der Profil-Lesesicht
// (`GrunddatenAbschnitt`, profil-ansicht.tsx). Rein, ohne React/DOM/i18n — die Ansicht übersetzt.
//
// WOHER ein Lebensdatum kommt, entscheidet allein der Kern (`lebensdatumAufloesen`,
// src/core/person/lebensdaten.ts) über `abfrage:person.detail.lebensdaten`; hier wird nur abgebildet:
// a) Der Ereigniswert steht in der Zeile des Prädikats, NUR wenn keine führende Aussage existiert —
//    keine zusätzliche Zeile, keine festen „fehlt"-Zeilen.
// b) Eine Ereignis-Zeile trägt nur die Herkunft (keine Sicherheit/Belege: das Lesemodell liefert
//    Konfidenz und Belege des Ereignisses bisher nicht), nicht editierbar.
// c) Ereignisdaten über den vorhandenen Formatierer (`lebensdatenFormatergebnis` → `formatiere`);
//    Aussage-Werte bleiben unverändert (`feld.wert`), sonst änderten sich e2e/Bildvergleich.
// d) Todesangaben aus Ereignissen nur bei `lebend_status = 'verstorben'` (wie die Tod-Gruppe der
//    Kernangaben, D5).
// e) Ein Ereignis nur mit Originaltext zeigt den Originaltext, als solcher gekennzeichnet.
// f) Herkunft als Schlüssel „aus dem Ereignis Geburt/Tod" (profil.json).
// Altbestand (V-5-altbestand): gibt es ein Grunddatenfeld, aber keine führende Aussage (z. B. eine
// Orts-Aussage nur mit Zahl), zeigt die Zeile den Ereigniswert bzw. keinen Wert — nie die Zahl.
import { lebensdatenFormatergebnis } from '../../bausteine/lebensdaten-anzeige'
import type { Formatergebnis } from '../../../core/datum/typen'
import { lebensdatumArt } from '../../../core/person/lebensdaten'
import type { PersonDetailGrunddatenFeld, PersonDetailKopf, PersonDetailLebensdatum } from '../../../shared/schemata/person-detail'

/** ADR-026: `existenz` ist die importinterne Trägeraussage (kein Fakt für Menschen), ausgeblendet. */
const PRAEDIKAT_EXISTENZ = 'existenz'

export type HerkunftSchluessel = 'herkunft_ereignis_geburt' | 'herkunft_ereignis_tod'

/** Anzeigewert einer Ereignis-Zeile; der Aufrufer übersetzt `datum` (Namensraum `datum`). */
export type EreignisWert =
  | { readonly art: 'datum'; readonly ergebnis: Formatergebnis }
  | { readonly art: 'originaltext'; readonly text: string }
  | { readonly art: 'text'; readonly text: string }
  | { readonly art: 'unbekannt' }

export type GrunddatenZeile =
  | { readonly art: 'aussage'; readonly praedikat: string; readonly feld: PersonDetailGrunddatenFeld; readonly wert: string | null }
  | { readonly art: 'ereignis'; readonly praedikat: PersonDetailLebensdatum['angabe']; readonly herkunftSchluessel: HerkunftSchluessel; readonly wert: EreignisWert }

export interface GrunddatenZeilenEingabe {
  readonly grunddaten: readonly PersonDetailGrunddatenFeld[]
  readonly lebensdaten: readonly PersonDetailLebensdatum[]
  readonly lebendStatus: PersonDetailKopf['lebend_status']
}

function ereignisWert(eintrag: PersonDetailLebensdatum): EreignisWert {
  if (eintrag.angabe === 'geburtsort' || eintrag.angabe === 'todesort') {
    return eintrag.ort_name === null ? { art: 'unbekannt' } : { art: 'text', text: eintrag.ort_name }
  }
  const ergebnis = lebensdatenFormatergebnis(eintrag.datum)
  if (ergebnis !== null) return { art: 'datum', ergebnis }
  if (eintrag.datum_originaltext !== null) return { art: 'originaltext', text: eintrag.datum_originaltext }
  return { art: 'unbekannt' }
}

/** Ist der Ereigniswert dieses Lebensdatums sichtbar (Herkunft Ereignis, Todesangaben nur bei „verstorben")? */
function ereignisSichtbar(eintrag: PersonDetailLebensdatum, lebendStatus: GrunddatenZeilenEingabe['lebendStatus']): boolean {
  if (eintrag.herkunft !== 'ereignis') return false
  return lebensdatumArt(eintrag.angabe) === 'geburt' || lebendStatus === 'verstorben'
}

function ereignisZeile(eintrag: PersonDetailLebensdatum): GrunddatenZeile {
  const herkunftSchluessel: HerkunftSchluessel = lebensdatumArt(eintrag.angabe) === 'geburt' ? 'herkunft_ereignis_geburt' : 'herkunft_ereignis_tod'
  return { art: 'ereignis', praedikat: eintrag.angabe, herkunftSchluessel, wert: ereignisWert(eintrag) }
}

/** Code-Unit-Vergleich — dieselbe Ordnung wie `ORDER BY praedikat` (SQLite BINARY) der Abfrage. */
function nachPraedikat(a: GrunddatenZeile, b: GrunddatenZeile): number {
  if (a.praedikat < b.praedikat) return -1
  if (a.praedikat > b.praedikat) return 1
  return 0
}

/** Zeilen der Grunddaten-Liste in Prädikatreihenfolge (ohne `existenz`). */
export function grunddatenZeilen({ grunddaten, lebensdaten, lebendStatus }: GrunddatenZeilenEingabe): readonly GrunddatenZeile[] {
  const lebensdatumVon = new Map<string, PersonDetailLebensdatum>(lebensdaten.map((eintrag) => [eintrag.angabe, eintrag]))
  const zeilen: GrunddatenZeile[] = []
  const belegtePraedikate = new Set<string>()

  for (const feld of grunddaten) {
    if (feld.praedikat === PRAEDIKAT_EXISTENZ) continue
    belegtePraedikate.add(feld.praedikat)
    const eintrag = lebensdatumVon.get(feld.praedikat)
    if (eintrag === undefined || eintrag.herkunft === 'aussage') {
      zeilen.push({ art: 'aussage', praedikat: feld.praedikat, feld, wert: feld.wert })
    } else if (ereignisSichtbar(eintrag, lebendStatus)) {
      zeilen.push(ereignisZeile(eintrag))
    } else {
      zeilen.push({ art: 'aussage', praedikat: feld.praedikat, feld, wert: null })
    }
  }

  for (const eintrag of lebensdaten) {
    if (belegtePraedikate.has(eintrag.angabe) || !ereignisSichtbar(eintrag, lebendStatus)) continue
    zeilen.push(ereignisZeile(eintrag))
  }

  return zeilen.sort(nachPraedikat)
}
