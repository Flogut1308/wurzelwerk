// AP-1.4a, 56_Import_Vertrag.md §6.2: die strukturierten Berichtstypen des Trockenlaufs. Der
// Trockenlauf ist der echte Import in einer Transaktion, die zurückgerollt wird (§6.1) — der
// Bericht hier ist die typisierte Form dessen, was `src/main/import/bericht.ts::baueBericht()`
// aus den tatsächlichen `aenderung`-Zeilen der Transaktion baut, NICHT aus der JSON-Struktur
// nachgezählt.
import type { Befund } from './imp-codes'

/** Wie die Transaktion zurückgenommen würde (55_Architektur.md §6.3, §6.2 Gestaltungsentscheidung
 * 1): "Undo" für die übliche Größenordnung, "Schnappschuss" ab der Schwelle in `RUECKNAHME_SCHWELLE_ZEILEN`. */
export type RuecknahmeArt = 'undo' | 'schnappschuss'

/** Ab dieser Anzahl geänderter Zeilen empfiehlt der Bericht einen Schnappschuss statt eines
 * einzelnen Undo-Schritts (56_Import_Vertrag.md §6.2 Beispiel: "Schwelle 500"). */
export const RUECKNAHME_SCHWELLE_ZEILEN = 500

export interface TrockenlaufZusammenfassung {
  readonly datei: string
  readonly vertragErzeugtAm: string | null
  readonly vertragWerkzeug: string | null
  readonly pruefsummeQuelltext: string | null
  /** ISO-Datum eines früheren Laufs mit identischer Prüfsumme, sonst `null` (Stufe 4, §6.2 Gestaltungsentscheidung 7). */
  readonly bereitsImportiertAm: string | null
  readonly fehlerAnzahl: number
  readonly hinweisAnzahl: number
  readonly geaenderteZeilenAnzahl: number
  readonly ruecknahmeArt: RuecknahmeArt
}

/** Ein Eintrag im Block "WIRD ANGELEGT" (§6.2 Punkt 2 der Tabelle): Zähler je Tabelle. */
export interface TrockenlaufAngelegtEintrag {
  readonly tabelle: string
  readonly anzahl: number
}

/** Ein Eintrag im Block "WIRD ERGÄNZT" (§6.2 Gestaltungsentscheidung 2): eine einzelne neue
 * Aussage (+ Beleg) an einer bereits bestehenden `db:`-Person/-Entität — nie eine Anzahl allein. */
export interface TrockenlaufErgaenzungEintrag {
  readonly subjektKennung: string
  readonly praedikat: string
  readonly wertText: string | null
  readonly wertZahl: number | null
  /** `true`, wenn ein bereits bestehender bevorzugter Wert widersprochen wird (IMP-402). */
  readonly istKonflikt: boolean
}

/** Ein Eintrag im Block "MÖGLICHE DUBLETTEN" (§6.2 Gestaltungsentscheidung 4: Punktwert MIT Begründung). */
export interface TrockenlaufDublettenEintrag {
  readonly neueKennung: string
  readonly bestehendeKennung: string
  readonly punktwert: number
  readonly begruendung: string
}

/** Ein Eintrag im Block "NICHT VERARBEITETES MATERIAL" (§6.2 Gestaltungsentscheidung 5: immer
 * sichtbar, auch leer). Entspricht `UnverarbeiteteNotiz` im Vertrag (§7.1). */
export interface TrockenlaufNotizEintrag {
  readonly text: string
  readonly warum: string
}

/** Der Block "GESUNDHEITSDATEN" (§6.2 Gestaltungsentscheidung 6, §7/§8 M-08): NUR Anzahlen, nie Inhalte. */
export interface TrockenlaufGesundheitsdaten {
  readonly diagnosenAnzahl: number
  readonly risikofaktorenAnzahl: number
}

/**
 * Der vollständige, strukturierte Trockenlauf-Bericht (56_Import_Vertrag.md §6.2). `importGesperrt`
 * ist `true` genau dann, wenn `zusammenfassung.fehlerAnzahl > 0` — bei einer gesperrten Datei bleiben
 * `wirdAngelegt`/`wirdErgaenzt`/`moeglicheDubletten` leer (kein "wird angelegt" für eine Datei, die
 * gar nicht geschrieben wurde).
 */
export interface Trockenlaufbericht {
  readonly zusammenfassung: TrockenlaufZusammenfassung
  readonly wirdAngelegt: readonly TrockenlaufAngelegtEintrag[]
  readonly wirdErgaenzt: readonly TrockenlaufErgaenzungEintrag[]
  readonly moeglicheDubletten: readonly TrockenlaufDublettenEintrag[]
  readonly fehler: readonly Befund[]
  readonly hinweise: readonly Befund[]
  readonly nichtVerarbeitetesMaterial: readonly TrockenlaufNotizEintrag[]
  readonly gesundheitsdaten: TrockenlaufGesundheitsdaten
  readonly importGesperrt: boolean
}
