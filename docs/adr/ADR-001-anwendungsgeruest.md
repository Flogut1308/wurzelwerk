## ADR-001 — Anwendungsgerüst: Electron + TypeScript + React

**Status:** entschieden (23.08.2026, Entscheidung an Claude delegiert)

**Kontext:** Windows + macOS, offline, aufwendige interaktive Grafik, Entwicklung mit
KI-Unterstützung durch einen Entwickler mit Grundkenntnissen.

**Entscheidung:** Electron (aktuell 43.4.1, Stand 19.08.2026) + TypeScript + React.

**Begründung, nach Gewicht:**
1. **Menge korrekten Beispielcodes** ist bei KI-gestützter Entwicklung der stärkste Beschleuniger. Electron hat rund elf Jahre Ökosystem. Tauri v2 (Core 2.11.5, 01.07.2026) ist jung genug, dass Modelle regelmäßig v1-APIs halluzinieren.
2. **Eine Rendering-Engine auf beiden Plattformen.** Tauri nutzt die System-WebView: WebView2/Chromium auf Windows, WKWebView auf macOS. Bei einer grafiklastigen App bedeutet das zwei Grafik-Stacks mit unterschiedlichen Eigenheiten bei Textmetriken, Canvas und WebGL. Mit Electron heißt "läuft auf meinem Mac" auch "läuft auf Windows".
3. **Keine zweite Sprache.** Tauri erzwingt Rust für alles jenseits der WebView (Dateizugriff, SQLite, Bildverarbeitung). Für einen Anfänger ist das Ownership-Modell der teuerste Posten im Projekt.

**Verworfene Alternativen:**
- *Tauri v2*: 3–10 MB Installer statt 80–150 MB, 60–120 MB RAM statt 150–250 MB. Diese Vorteile sind für eine Genealogie-App irrelevant, weil Medien und Daten mehr wiegen. Tauri lohnt nur, wenn Bundle-Größe ein Produktziel ist.
- *Flutter Desktop*: konsistente eigene Engine, aber kleiner Desktop-Anteil im Ökosystem und Dart als weitere Sprache.
- *Avalonia / .NET MAUI*: gute Performance, aber deutlich weniger Trainingsdaten (Avalonia) bzw. schwierige Desktop-Reife.
- *Native (Swift + WinUI)*: beste Systemintegration, aber zwei getrennte Apps — doppelter Aufwand, für ein Ein-Personen-Projekt unrealistisch.

**Konsequenzen:** Größerer Installer und höherer RAM-Verbrauch werden akzeptiert. Die
Architektur muss die Grenze Hauptprozess/Renderer disziplinieren (kein direkter
Datenbankzugriff aus dem Renderer, alles über typisierte IPC-Kanäle).

---

**Nachtrag (06.09.2026, E48):** Begründung §3 („keine zweite Sprache, weil Rust-Ownership für einen Anfänger teuer ist") ist gegenstandslos — es wird vollständig agentisch in Loops entwickelt, Anfängerfreundlichkeit ist kein Kriterium mehr. Die Entscheidung bleibt: §1 (Trainingsdaten-Menge → Agenten-Durchsatz pro Loop) und §2 (eine Rendering-Engine → keine WebView-Varianz bei WebGL/Canvas, gerade weil Windows erst spät im Feedback der Loop erscheint) tragen sie unabhängig von Anfängerfreundlichkeit. Siehe ADR-025.
