// Schnittstelle der Layout-Engine (Andockstelle für Phase 2), 55_Architektur.md §8.
// Nur Typen, KEINE Implementierung — Phase 0/AP-0.14 baut ausschließlich diese Datei, damit
// Phase 2 anfangen kann, ohne dass Phase 1 die Engine kennt oder importiert. Diese Datei darf
// außer Typen nichts exportieren (kein `const`, keine Funktion, kein Default-Export) und wird
// NICHT aus `src/core/index.ts` re-exportiert — der Laufzeit-Null-Export muss am Modul selbst
// gelten (`test/schema/layout-vertrag.test.ts`, AP-0.14 PR-B).

/**
 * Core-lokale Spiegelung von `src/shared/schemata/elternschaft.ts` `ElternschaftTypEnum`.
 * `src/core` darf `src/shared` nicht importieren (CLAUDE.md §2), deshalb ist dies ein reiner
 * Typ, kein Re-Export. Drift zwischen beiden Schichten bricht
 * `test/einheit/elternschaft-typ-konsistenz.test.ts`.
 */
export type ElternschaftTyp =
  | 'biologisch'
  | 'adoptiv'
  | 'stief'
  | 'pflege'
  | 'zieh'
  | 'anerkannt'
  | 'leihmutter'
  | 'unbekannt'

/** Eingabe: reiner Graph. Keine Datenbank-, keine React-, keine SVG-Typen. */
export interface LayoutEingabe {
  readonly personen: readonly LayoutPerson[]
  readonly paare: readonly LayoutPaar[]
  readonly kanten: readonly LayoutKante[]
}

export interface LayoutPerson {
  readonly id: string
  readonly ebenenHinweis?: number // Generation, wenn bekannt (ADR-005 Punkt 1)
  readonly geburtSortVon?: number // julianische Tageszahl, für die Schätzung
  readonly geschlecht?: 'M' | 'F' | 'U' | 'X'
  readonly istPlatzhalter?: boolean
  /** Knotenmaß. Wird vom Renderer gemessen und hier hereingegeben — siehe Regel unten. */
  readonly breite: number
  readonly hoehe: number
}

export interface LayoutPaar {
  readonly id: string
  readonly partnerIds: readonly string[] // 1..n, Mehrfachehen erlaubt
  readonly beginnSortVon?: number // für die Reihenfolge mehrerer Ehen
}

export interface LayoutKante {
  readonly id: string
  readonly vonId: string // Personen- oder Paar-ID
  readonly zuId: string
  readonly art: 'elternschaft' | 'partnerschaft'
  readonly elternschaftTyp?: ElternschaftTyp // für die Kantenform, UX §5
  readonly gesichert: boolean
}

export interface LayoutOptionen {
  readonly diagrammtyp: 'ahnentafel' | 'nachkommen' | 'sanduhr' | 'verwandte'
  readonly wurzelId: string
  readonly generationenAufwaerts: number
  readonly generationenAbwaerts: number
  readonly ebenenAbstand: number
  readonly geschwisterAbstand: number
  readonly paarAbstand: number
  readonly implexAlsGhost: boolean // ADR-005 Punkt 4
}

export interface LayoutErgebnis {
  readonly knoten: readonly LayoutKnoten[]
  readonly kantenPfade: readonly LayoutKantenPfad[]
  readonly grenzen: {
    readonly minX: number
    readonly minY: number
    readonly maxX: number
    readonly maxY: number
  }
  readonly kennzahlen: {
    readonly kreuzungen: number
    readonly dauerMs: number
    readonly knotenAnzahl: number
    readonly ghostAnzahl: number
  }
}

export interface LayoutKnoten {
  readonly id: string
  readonly personId: string
  readonly x: number
  readonly y: number // linke obere Ecke, Layout-Einheiten
  readonly breite: number
  readonly hoehe: number
  readonly ebene: number
  readonly istGhost: boolean
  readonly ghostOriginalKnotenId?: string
}

export interface LayoutKantenPfad {
  readonly id: string
  readonly punkte: readonly { readonly x: number; readonly y: number }[]
  readonly art: LayoutKante['art']
  readonly elternschaftTyp?: ElternschaftTyp
}

/** Reine Funktion. Wirft nie. Deterministisch. Implementierung: Phase 2. */
export type BerechneLayout = (e: LayoutEingabe, o: LayoutOptionen) => LayoutErgebnis
