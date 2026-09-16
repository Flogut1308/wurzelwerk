/**
 * Stufe-1-Prüfbefunde des Import-Vertrags `wurzelwerk-import/v1` (56_Import_Vertrag.md §4,
 * AP-1.3a). `ALLE_IMP_CODES` ist die einzige Quelle der Wahrheit für IMP-101…IMP-107; `ImpCode`
 * wird daraus abgeleitet.
 *
 * Bewusst eine EIGENE, von `ALLE_FEHLERCODES` (src/shared/fehler/codes.ts) getrennte Union:
 * IMP-Codes sind Berichtsbefunde eines Prüflaufs (`pruefeStufe1`) über eine Importdatei — kein
 * Fehlerzustand der Anwendung, der als `Ergebnis<T>`-Fehler über IPC fliegt (§7). Eine Vermischung
 * beider Listen würde zwei völlig verschiedene Konzepte (Anwendungsfehler vs. Dateibefund) in
 * einer Union verschmelzen. Festgehalten in docs/80_Offene_Fragen.md (U-AP1.3a).
 */
export const ALLE_IMP_CODES = ['IMP-101', 'IMP-102', 'IMP-103', 'IMP-104', 'IMP-105', 'IMP-106', 'IMP-107'] as const

export type ImpCode = (typeof ALLE_IMP_CODES)[number]

/**
 * Ein einzelner Stufe-1-Befund (56_Import_Vertrag.md §5 — Format der Fehlermeldung). Stufe 1
 * kennt nur den Schweregrad `fehler` (Stufe 2/3/4 kennen zusätzlich `hinweis`, hier nicht
 * gebraucht). Die Zeilennummer (§5 Punkt 4) kommt erst mit AP-1.3b — ein Positionsindex über den
 * Rohtext ist bewusst nicht Teil dieses Arbeitspakets.
 */
export interface Stufe1Befund {
  readonly schweregrad: 'fehler'
  readonly code: ImpCode
  readonly pfad: string
  readonly kennung?: string
  readonly datei: string
}
