/**
 * Prüfbefunde des Import-Vertrags `wurzelwerk-import/v1` (56_Import_Vertrag.md §4, AP-1.3a +
 * AP-1.3b). `ALLE_IMP_CODES` ist die einzige Quelle der Wahrheit für IMP-101…IMP-107 (Stufe 1,
 * Schema) und IMP-201…IMP-209 (Stufe 2, Referenzen/Struktur); `ImpCode` wird daraus abgeleitet.
 *
 * Bewusst eine EIGENE, von `ALLE_FEHLERCODES` (src/shared/fehler/codes.ts) getrennte Union:
 * IMP-Codes sind Berichtsbefunde eines Prüflaufs (`pruefeImport`) über eine Importdatei — kein
 * Fehlerzustand der Anwendung, der als `Ergebnis<T>`-Fehler über IPC fliegt (§7). Eine Vermischung
 * beider Listen würde zwei völlig verschiedene Konzepte (Anwendungsfehler vs. Dateibefund) in
 * einer Union verschmelzen. Festgehalten in docs/80_Offene_Fragen.md (U-AP1.3a).
 */
export const ALLE_IMP_CODES = [
  'IMP-101',
  'IMP-102',
  'IMP-103',
  'IMP-104',
  'IMP-105',
  'IMP-106',
  'IMP-107',
  'IMP-201',
  'IMP-202',
  'IMP-203',
  'IMP-204',
  'IMP-205',
  'IMP-206',
  'IMP-207',
  'IMP-208',
  'IMP-209',
] as const

export type ImpCode = (typeof ALLE_IMP_CODES)[number]

/**
 * Ein einzelner Prüfbefund (56_Import_Vertrag.md §5 — Format der Fehlermeldung). Stufe 1 und
 * Stufe 2 kennen beide nur den Schweregrad `fehler` (Stufe 3/4, HINWEIS, sind nicht Teil dieses
 * Arbeitspakets). `zeile` (§5 Punkt 4) kommt aus dem Positionsindex (`src/core/import/positionsindex.ts`,
 * AP-1.3b) und bleibt `undefined`, wenn der Pfad im Rohtext nicht auffindbar ist (z. B. ein
 * Pflichtfeld, das komplett fehlt).
 */
export interface Befund {
  readonly schweregrad: 'fehler'
  readonly code: ImpCode
  readonly pfad: string
  readonly kennung?: string
  readonly datei: string
  readonly zeile?: number
}

/**
 * Alias für `Befund` (AP-1.3b: Stufe 1 und Stufe 2 teilen sich denselben Befund-Typ — vormals ein
 * eigener, auf Stufe 1 beschränkter Typ ohne `zeile`). Bestehender Name bleibt erhalten, damit
 * `src/main/import/validierung.ts` und ältere Importstellen nicht angefasst werden müssen.
 */
export type Stufe1Befund = Befund

/** Ergebnis eines vollständigen Prüflaufs (`pruefeImport`, §4/§6): `akzeptiert` ist `true`, wenn
 * weder Stufe 1 noch Stufe 2 einen Befund ergeben haben — nur dann ist ein Import möglich. */
export interface PruefBericht {
  readonly akzeptiert: boolean
  readonly befunde: readonly Befund[]
}
