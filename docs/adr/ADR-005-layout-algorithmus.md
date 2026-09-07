## ADR-005 — Layout-Algorithmus: eigene Sugiyama-Pipeline, d3-dag als Baustein

**Status:** entschieden

**Kontext:** Ein Stammbaum ist ein gerichteter azyklischer Graph mit Paarknoten, nicht ein
Baum. `d3-hierarchy` (Reingold-Tilford) ist damit per Definition unbrauchbar, sobald ein Knoten
zwei Eltern hat. Generische Kräfte-Layouts kennen die harte Bedingung "Generation = Ebene" nicht
und produzieren Spaghetti.

**Entscheidung:** Eigene, deterministische Sugiyama-Pipeline:
1. **Ebenenzuweisung** aus Generationszahl bzw. geschätztem Geburtsjahr — nicht per Longest-Path, sonst rutschen Ehepartner auf verschiedene Ebenen.
2. **Paarknoten** als eigenständiges Layout-Objekt: Partner adjazent, Kinder hängen am Paarknoten.
3. **Kreuzungsreduktion** per Median-/Barycenter-Heuristik, Geschwister nach Geburtsdatum fixiert.
4. **Ahnenimplex**: Duplikatknoten mit sichtbarer Referenzmarkierung ("Ghost") statt langer Querkante — die Lösung, die McGuffin & Balakrishnan (InfoVis 2005) als Dual-Tree/Multi-Tree diskutieren.

Als Baustein für die Ordnungsphase: **d3-dag** (TypeScript-first, echtes Sugiyama für
Multi-Parent-DAGs; Messung des Autors: ~5,1 ms für 184 Knoten im Preset "fast", ~4× schneller
als dagre v3). Für den Druckpfad optional Graphviz `dot` per WASM (bessere Qualität, nicht
interaktiv).

**Referenzcode zum Abschauen:** `topola` (PeWu — echte Genealogie-Layouts: Ancestors,
Descendants, Hourglass, Relatives), `relatives-tree` / `react-family-tree` (SanichKotikov —
winzige Layout-Engine, Rendering offen gelassen, behandelt Mehrfachehen).

**Konsequenzen:** Layout **muss deterministisch** sein (kein `Math.random`, stabile Sortierung),
damit Golden-Tests möglich sind. Berechnung in einem Web Worker, Ergebnis als Koordinatenliste
cachen, bei Änderungen nur betroffene Teilgraphen neu layouten.
