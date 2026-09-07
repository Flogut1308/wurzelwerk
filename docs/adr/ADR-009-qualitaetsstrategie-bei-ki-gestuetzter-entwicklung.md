## ADR-009 — Qualitätsstrategie bei KI-gestützter Entwicklung

**Status:** entschieden

KI-Code sieht plausibel aus und ist genau deshalb gefährlich. Die Strategie setzt auf
**maschinell prüfbare Invarianten**, nicht auf Code-Review durch einen Anfänger.

1. **Fixture-Korpus als Fundament.** Ordner mit Testbäumen: Minimalbaum, Mehrfachehen, Adoption, Cousinenheirat (Ahnenimplex), fehlende Daten, kaputte Kodierungen, unscharfe Datumsangaben, sowie generierte Bäume mit 200/2.000/20.000 Personen. **Jeder Bug wird zuerst als neue Fixture reproduziert.**
2. **Invariantentests** (Property-Based, z. B. `fast-check`) — das wirksamste Mittel gegen Halluzinationen im Layout:
   - Niemand ist eigener Vorfahre (Zyklusfreiheit)
   - Generation(Kind) > Generation(Elternteil) für jede Kante
   - Ehepartner liegen auf derselben Ebene
   - Keine zwei Knoten überlappen
   - Import → Export → Import ist idempotent
   - Undo(Aktion) stellt den Datenbestand bitgleich wieder her
3. **Golden-Tests für Layout.** Layout deterministisch → Koordinaten als JSON-Snapshot einchecken; jede Abweichung wird bewusst abgesegnet. Zusätzlich SVG-Renderings als Bild-Snapshots für den Druckpfad.
4. **Performance-Budget als harte Testzusicherung** ("Layout 2.000 Knoten < 300 ms", "Panning > 50 FPS"), sonst schleichen unbemerkte Regressionen ein.
5. **Migrationstests.** Für jede Schemaversion eine alte Beispieldatenbank im Repository; der Test öffnet und migriert sie. Das ist die Fehlerkategorie, die Nutzerdaten zerstört.
6. **Crash-Sicherheit automatisiert:** Prozess mitten in Transaktionen mit `SIGKILL` beenden, danach `PRAGMA integrity_check`.
7. **E2E mit Playwright** (unterstützt Electron direkt) für die fünf zentralen Abläufe.
8. **Arbeitsregeln:** kleine Commits, jeder Commit mit grünem CI; Architekturgrenzen früh festgelegt (Layout kennt kein Rendering, Rendering kennt keine Datenbank); KI nie ohne Test einen Bugfix machen lassen; `strict: true`, kein `any`.

---

**Nachtrag (06.09.2026, E48):** Diese Strategie war gegen „Code-Review durch einen Anfänger" formuliert; sie gilt unverändert und **stärker** gegen agentische Loops — deren Fitnessfunktion genau diese maschinenprüfbaren Invarianten sind. Die Loop-spezifischen Guardrails stehen in ADR-025.

## Quellen
- Electron-Versionen: https://endoflife.date/electron · Tauri: https://tauri.app/release/core/
- SQLite WAL: https://www.sqlite.org/wal.html · als Dateiformat: https://sqlite.org/aff_short.html
- Rendering-Messung: Horak et al. 2018, https://imld.de/cnt/uploads/Horak-2018-Graph-Performance.pdf
- d3-dag: https://github.com/erikbrinkman/d3-dag · topola: https://github.com/PeWu/topola · relatives-tree: https://github.com/SanichKotikov/relatives-tree
- McGuffin & Balakrishnan, InfoVis 2005: https://www.dgp.toronto.edu/~ravin/papers/infovis2005_geneology.pdf · PedVis: https://www.sci.utah.edu/~csilva/papers/tvcg2010a.pdf · TimeNets: http://vis.stanford.edu/files/2010-TimeNets-AVI.pdf
- GEDCOM 7: https://gedcom.io/specifications/FamilySearchGEDCOMv7.html · GEDCOM-L: https://genealogy.net/GEDCOM/GEDCOM551%20GEDCOM-L%20Addendum-R1.pdf
- PMTiles/MapLibre: https://docs.protomaps.com/pmtiles/maplibre · Natural Earth: https://registry.opendata.aws/naturalearth/
- Azure Trusted Signing: https://www.keyq.cloud/blog/windows-code-signing-with-azure-trusted-signing/ · macOS-Notarisierung: https://developer.apple.com/macos/distribution/
