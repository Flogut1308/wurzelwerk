## ADR-004 — Darstellung: SVG/React für Phase 2, Canvas-Pfad offen halten

**Status:** entschieden

**Kontext:** Zielgröße 2.000 Personen (E2). Belastbare Messung (Horak et al., TU Dresden 2018):
SVG und Canvas 2D verhalten sich nahezu identisch; Einbrüche ab etwa 400 Knoten bzw. 8.000
Grafikelementen; praktische Grenze rund 10.000 Elemente. WebGL hält ohne Textlabels 400.000
Knoten bei ~50 FPS, **mit** Text bricht es auf SVG-Niveau ein.

**Entscheidung:** SVG mit React für die interaktive Baumansicht, plus zwei nicht verhandelbare
Vorkehrungen:
1. **Viewport-Culling ab Beginn** — es werden nur sichtbare Knoten in den DOM gerendert. Damit sind auch 20.000 Personen im Datenbestand unkritisch, weil gleichzeitig selten mehr als ~300 Knoten sichtbar sind.
2. **Renderer hinter einer Schnittstelle** — Layout liefert reine Koordinaten, der Renderer konsumiert sie. Ein späterer Canvas- oder PixiJS-Renderer ist dann ein Austausch, keine Neuentwicklung.

**Begründung:** Bei 2.000 Personen ist SVG bequem (CSS-Styling, Treffererkennung und
Zugänglichkeit gratis) und liefert den Druck-/PDF-Pfad direkt mit. Ein WebGL-Renderer wäre für
diese Größe verfrühte Optimierung — und die Textlast würde seinen Vorteil ohnehin auffressen.

**Konsequenzen:** Wenn E2 später auf 100.000 hochgeht, ist ein Renderer-Austausch fällig
(überschaubar, weil abstrahiert). Level-of-Detail (weit herausgezoomt nur Rechtecke, mittel
Bitmap-Text, nah echter Text) wird trotzdem von Anfang an eingebaut, weil es auch bei 2.000
Personen die Übersicht verbessert.
