## ADR-023 — Layout-Vertrag: Knotenmaße sind Eingabe

**Status:** entschieden · **konkretisiert ADR-004 und ADR-005**

**Entscheidung:** In Phase 0 entsteht nur `src/core/layout/vertrag.ts` — Typen, keine
Implementierung. `berechneLayout(eingabe, optionen)` ist eine reine, deterministische Funktion.
Die **Knotenbreite und -höhe sind Teil der Eingabe**, nicht des Ergebnisses. Die Ausgabe sind
abstrakte Layout-Einheiten, keine Pixel. Ein Test prüft, dass das Modul zur Laufzeit nichts
exportiert.

**Begründung:** Die Grenze „Layout kennt kein Rendering" (ADR-009 Punkt 8) hält nur, wenn sie
**in der Signatur steht**. Wäre die Knotengröße Ergebnis, bräuchte die Engine eine
Textmessung, also ein `document` — und die Grenze wäre schon im Typ gebrochen, bevor die erste
Zeile Code entsteht. Der Renderer misst die Personenkarte einmal (sie ist über den ganzen Baum
gleich groß, `70_UX_Konzept.md` §4) und gibt das Maß hinein. Layout-Einheiten statt Pixel
machen die Golden-Tests aus ADR-009 Punkt 3 auf jedem Rechner identisch.

**Konsequenz:** Phase 1 importiert dieses Modul nicht. Der Renderer-Austausch SVG → Canvas
(ADR-004) bleibt ein Austausch und keine Neuentwicklung, weil das Layout nur Koordinaten liefert.
