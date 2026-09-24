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

**Nachtrag (24.09.2026, AP-1.34):** „Bitgleich" in Punkt 2 heißt: der kanonische Abzug (`test/invarianten/_kanonischer-abzug.ts`) **aller Basistabellen** stimmt Zeichen für Zeichen überein — ausgenommen ist nur eine **fest gepinnte, wörtliche Liste** in drei Kategorien, je mit Grund:
- **Journal** (ADR-018): `transaktion`, `aenderung`, `journal_kontext` — dort soll sich durch Undo/Redo etwas ändern.
- **Abgeleitet** (Architektur §5.3): `person_flach`, `name_phonetik`, `suche_fts_quelle`, `suche_fts` samt Schattentabellen `suche_fts_data`/`_idx`/`_docsize`/`_config` — separat gegen ihren vollständigen Neuaufbau geprüft (`abgeleitet-gleich.test.ts`, rohe Schreibfolgen ohne Undo); Konsistenz *nach* Undo belegt bisher nur `test/einheit/undo-abgeleitet.test.ts` und nur für `person_flach` (Folgepunkt `U-1.34-B4`).
- **Fachlich:** `kennung_zaehler` — eine vergebene Personen-Kennung wird nie neu vergeben; der Zähler läuft nur vorwärts (Trigger in 0007) und bleibt nach Undo bewusst stehen (AP-1.34, E14).

Die Liste wird ausdrücklich **nicht** aus `NICHT_JOURNALISIERT` abgeleitet. Jede andere und jede neu angelegte Tabelle wird automatisch verglichen (fail-closed). **Korrektur:** Bis zu diesem Nachtrag nahm der Abzug `NICHT_JOURNALISIERT` pauschal aus; `schema_migration`, `merge_protokoll` und `id_alias` fielen dadurch still aus dem Vergleich — sie werden jetzt verglichen. Eine Erweiterung der Liste braucht einen weiteren Nachtrag zu diesem ADR und eine Gegenprobe. Geprüft durch `test/invarianten/undo-bitgleich-ausnahmen.test.ts` (B-T1 bis B-T6: Liste gegen Schema, keine journalisierte Tabelle ausgenommen, übrige NICHT_JOURNALISIERT-Tabellen im Abzug, Mutationsprobe, `kennung_zaehler` bleibt draußen, neue Tabelle erscheint) und `test/invarianten/kennung-nie-neu-vergeben.test.ts` (K1 bis K3: Zähler weicht nach Undo roh ab, nächste Kennung größer als jede je gesehene, Redo stellt dieselbe Kennung her).

**Nachtrag (24.09.2026, AP-1.34 PR-B2, B-01):** Punkt 2 bekommt zwei Invarianten für Belege:
- **Jeder gesetzte Textanker liegt gültig in seinem Transkript und überlebt eine Transkriptänderung nur bei gleichem Ausschnitt an gleicher Stelle (E4).**
- **`feld` nur an Existenz-Aussagen, passend zum Subjekttyp.**

Geprüft durch `test/invarianten/textanker-gueltig.test.ts` (fester Seed, 250 Läufe, Befehlsfolgen aus demselben Generator wie `undo-bitgleich`, Profil `beleg`): **I1** nach jedem Schritt und nach jedem Undo bis zum Anfang — Anker nur mit Transkript, ganzzahlig, `0 ≤ von < bis ≤ Länge` in UTF-16-Codeeinheiten, keine Grenze in einem Ersatzpaar (F4; im Test unabhängig nachgebildet, nicht über `ankerPruefen`); **I2** um jeden Schritt — bei geändertem Transkript bleibt ein Anker genau dann, wenn `neu ≠ NULL`, `bis ≤ neu.length` und `neu.slice(von, bis) = alt.slice(von, bis)`, sonst beide Grenzen NULL bei unverändertem `feld`; alle übrigen Verknüpfungen bleiben einschließlich `geaendert_am` unverändert, die per `aussage_zitat.aendern` bearbeitete trägt genau die angeforderten Werte, eine neue Zeile gibt es nur als die per `aussage_zitat.anlegen` angeforderte mit genau deren `feld`/`von`/`bis`, und eine Zeile verschwindet nur nach einem Lösch- oder Kaskadenbefehl; **I3** nach jedem Schritt und Undo — `feld ≠ NULL` nur bei `praedikat = 'existenz'` und aus `BELEG_FELDER_JE_SUBJEKT[subjekt_typ]`. Begründung für eine eigene Invariante: `undo-bitgleich` nimmt jedes UPDATE zurück und sieht darum keinen Logikfehler der Entwertung (Mutationsproben: „Entwertung weg", „falsche Verknüpfung entwertet", „`feld` mitgelöscht" bleiben dort bitgleich).

Der Befehlsfolge-Generator (`_befehlsfolge-generator.ts`, Beleg-Teil `_befehlsfolge-beleg.ts`) erzeugt dafür Transkripte mit Umlauten, Kyrillisch und Emoji (Ersatzpaare, ZWJ-Folge; keine einsamen Surrogate — better-sqlite3 ersetzt sie durch U+FFFD), `aussage_zitat.anlegen` mit Anker und `feld`, `aussage_zitat.aendern` (setzen/ersetzen/entfernen/No-op) und `zitat.aendern` mit aus dem alten Transkript abgeleiteten Änderungen (gleich, hinter, im, vor dem Ausschnitt, gekürzt, weggelassen). Eine Aktion löst weiterhin höchstens einen erfolgreichen Befehl aus; fehlt einer Beleg-Aktion ihr Ziel, führt sie den nächsten fehlenden Schritt der Kette Quelle → Zitat → Aussage → Verknüpfung aus (Vorlauf). **Grundsatzänderung:** Der Generator erzeugte bisher nur gültige Eingaben. Die neue Ablehnungs-Aktion schickt bewusst einen ungültigen Anker (außerhalb, ohne Transkript, `von` bzw. `bis` im Ersatzpaar) bzw. ein ungültiges `feld` (Nicht-Existenz-Aussage, falscher Subjekttyp) über `aussage_zitat.anlegen`/`.aendern` und verlangt `VALIDIERUNG_WERTEBEREICH` ohne neue Transaktion — sonst ist die Folge rot. Ohne sie fiele ein entfernter Handler-Schutz nie auf, weil die Invarianten nur sehen, was in der Datenbank steht.

**Zwei Generator-Profile** (hueter-Review PR #119): `bestand` — Standard für `undo-bitgleich` und alle übrigen Aufrufer — behält exakt die Gewichte von main (d0a095b) und gibt den neuen Beleg-Aktionen nur Gewicht 1; so bleiben Deckung der Bestandsbefehle und Laufzeit auf main-Niveau. `beleg` — nur `textanker-gueltig` — gewichtet die Beleg-Aktionen hoch und nutzt den Vorlauf in allen Beleg-Aktionen.

**Deckungszähler:** `aktionAusfuehren()` meldet die tatsächlich getroffenen Zweige, am Datenbankergebnis gemessen (auch beim Anlegen wird die Zeile zurückgelesen). `textanker-gueltig` verlangt je Beleg-Zweig (`BELEG_PFLICHTZWEIGE`) und für das Undo einer Entwertung mehr als 0 Treffer. `undo-bitgleich` verlangt je Befehl sowie für Demote und Nachrücken mindestens 50 % des main-Werts (Literal-Tabelle im Test, gemessen auf d0a095b mit demselben Seed und `numRuns`), für neue Befehle und das Undo einer Entwertung eine feste Mindestzahl; ein beobachteter Befehl ohne Tabelleneintrag ist rot. Fällt ein Zähler unter die Schwelle, wird die Gewichtung korrigiert, nie Seed oder `numRuns`; die main-Werte werden nur mit einem weiteren Nachtrag neu gemessen. Nicht gedeckt: `feld` an `person`/`name` — dafür gibt es keine Existenz-Aussage (docs/80 §31 U-1.34-B2-feld-person-name).

## Quellen
- Electron-Versionen: https://endoflife.date/electron · Tauri: https://tauri.app/release/core/
- SQLite WAL: https://www.sqlite.org/wal.html · als Dateiformat: https://sqlite.org/aff_short.html
- Rendering-Messung: Horak et al. 2018, https://imld.de/cnt/uploads/Horak-2018-Graph-Performance.pdf
- d3-dag: https://github.com/erikbrinkman/d3-dag · topola: https://github.com/PeWu/topola · relatives-tree: https://github.com/SanichKotikov/relatives-tree
- McGuffin & Balakrishnan, InfoVis 2005: https://www.dgp.toronto.edu/~ravin/papers/infovis2005_geneology.pdf · PedVis: https://www.sci.utah.edu/~csilva/papers/tvcg2010a.pdf · TimeNets: http://vis.stanford.edu/files/2010-TimeNets-AVI.pdf
- GEDCOM 7: https://gedcom.io/specifications/FamilySearchGEDCOMv7.html · GEDCOM-L: https://genealogy.net/GEDCOM/GEDCOM551%20GEDCOM-L%20Addendum-R1.pdf
- PMTiles/MapLibre: https://docs.protomaps.com/pmtiles/maplibre · Natural Earth: https://registry.opendata.aws/naturalearth/
- Azure Trusted Signing: https://www.keyq.cloud/blog/windows-code-signing-with-azure-trusted-signing/ · macOS-Notarisierung: https://developer.apple.com/macos/distribution/
