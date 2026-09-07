# Wurzelwerk — Projektkompass

> **Diese Datei zuerst lesen.** Sie ist der Einstiegspunkt für jeden neuen Chat und jedes
> neue Kontextfenster. Sie enthält keine Details, sondern verweist auf die Dokumente,
> die den jeweiligen Detailstand halten.

**Stand:** 06.09.2026 (6. Durchgang, Funktionsabgleich; zuvor 24.08.2026, 5. Durchgang Designvorbereitung) · **Phase:** Konzeption, Architekturplanung und **Designvorbereitung abgeschlossen** · **Nächste Meilensteine:** (1) Designarbeit in Claude Design nach `74_Prompts_Claude_Design.md`, (2) Phase 0 ab Arbeitspaket AP-0.1 aus `57_Phase0_Arbeitspakete.md` — die beiden laufen unabhängig voneinander

> **Status:** V2 (Konfidenzskala) ist **entschieden — vier Stufen** (E33). Der Anforderungskatalog
> für Phase 0–3 ist damit entscheidungsfrei. **Nächster Schritt: AP-0.1** (Repo, Werkzeugkette, CI)
> nativ mit Claude Code auf dem Mac — Startprompt in `75_Prompts_Claude_Code.md`.

---

## Was ist das Projekt?

Eine lokale Desktop-Anwendung (Windows + macOS) zur Erfassung, Verknüpfung, Analyse und
Darstellung eines großen genealogischen Datenbestands. Kein Login, keine Cloud, keine
Serverabhängigkeit. Anspruch: die fachliche Präzision der Forscher-Programme (Gramps,
Family Historian) mit der Gestaltungsqualität moderner Software.

Name: **Wurzelwerk** (entschieden 23.08.2026, E18). Repository: `wurzelwerk`.
Dateiendung bleibt bewusst `.ahnen` — sie ist damit unabhängig vom Produktnamen, und ein
späteres Umbenennen der Software macht keine Projektdateien unlesbar.

---

## Dokumentenkarte

| Datei | Inhalt | Wann lesen |
|---|---|---|
| `00_INDEX.md` | Diese Datei. Navigation, Status, Glossar-Verweis | immer zuerst |
| `10_Vision_Scope.md` | Produktvision, Zielnutzer, Abgrenzung, Roadmap-Phasen | bei Prioritätsfragen |
| `20_Domaenenwissen.md` | Genealogisches Fachwissen, Standards, Fallstricke | vor jeder Datenmodell- oder Feldentscheidung |
| `30_Markt.md` | Konkurrenzanalyse, Tabellenstakes, Differenzierung | bei Feature-Diskussionen |
| `40_Anforderungen.md` | Priorisierte Anforderungsliste (Must/Should/Could/Won't) | beim Planen von Arbeitspaketen |
| `50_Datenmodell.md` | Entitäten, Beziehungen, Schema-Entwurf (v0.3 mit Nachtrag) | bei jeder Implementierung am Kern |
| `55_Architektur.md` | Schichten, Ordnerstruktur, IPC-Vertrag, Datenzugriff, Journal, **Undo/Redo**, Frontend-Zustand, Layout-Vertrag, Migration, Fehler | vor jeder Implementierung, immer |
| `56_Import_Vertrag.md` | JSON-Schema `wurzelwerk-import/v1`, Prüfregeln, Trockenlauf, Anti-Erfindungs-Regeln; Beispiele in `56_Beispiele/` | bei allem, was mit Import oder dem Skill zu tun hat |
| `57_Phase0_Arbeitspakete.md` | Phase 0 und erster Teil Phase 1, je mit Anforderungs-ID, Abnahme und Tests | am Anfang jedes Arbeitschats |
| `CLAUDE.md` (Entwurf) | Verhaltensregeln für das Code-Repository | wandert mit dem ersten Commit ins Repo |
| `60_Technik_ADR.md` | Technologieentscheidungen mit Begründung (ADRs) | bevor eine Bibliothek eingeführt wird |
| `70_UX_Konzept.md` | Informationsarchitektur, Ansichten, Designprinzipien | vor Design- und Frontend-Arbeit |
| `71_Designsystem.md` | Token-Vertrag, Atomic-Design-Inventar, Eingabefeldtypen, Barrierefreiheit, Assets | bei jeder Frontend- und Designarbeit |
| `72_Screens_und_Flows.md` | 34 Bildschirme in zwei Stufen, zehn Abläufe, Bedienkonzept, Tastaturkarte | beim Bauen einer Ansicht |
| `73_Design_Briefing.md` | das Kontextdokument für Claude Design: Richtung, Sperrliste, Beispieldaten | wird angehängt, nicht gelesen |
| `74_Prompts_Claude_Design.md` | Prompt-Sequenz in sechs Wellen, Iterationshinweise, Handoff an Claude Code | wenn die Designarbeit beginnt |
| `75_Prompts_Claude_Code.md` | Startprompts für die agentische Umsetzung mit Claude Code, je Arbeitspaket | wenn ein Arbeitspaket gebaut wird |
| `80_Offene_Fragen.md` | Alle Entscheidungen, die Florian treffen muss | am Ende jeder Sitzung durchgehen |
| `90_Arbeitsweise_KI.md` | Wie über mehrere Chats hinweg gearbeitet wird | wenn ein neuer Chat beginnt |

---

## Bereits getroffene Grundentscheidungen

| # | Entscheidung | Datum | Referenz |
|---|---|---|---|
| E1 | GEDCOM 7 Import/Export **und** eigenes, verlustfreies Format | 23.08. | ADR-006 |
| E2 | Zielgröße ~2.000 Personen (Architektur bis 20.000 tragfähig) | 23.08. | ADR-004 |
| E3 | Quellen- und Belegverwaltung ist Kernfunktion, nicht Nachtrag | 23.08. | ADR-002 |
| E4 | Rein lokal, kein Login, kein Netzwerkzwang, Auto-Speicherung | 23.08. | ADR-002 |
| E5 | Stack: Electron + TypeScript + React + SQLite | 23.08. | ADR-001 |
| E6 | **Primäre Datenquelle sind Erinnerungen und Papier, nicht Kirchenbücher.** Erfassung aus unstrukturiertem Material ist das Kernfeature von Phase 1. | 23.08. | ADR-010 |
| E7 | Nutzung: Florian selbst + Weitergabe an Verwandtschaft (Lesemodus-Export, kein Mehrbenutzerbetrieb) | 23.08. | 10_Vision §3 |
| E8 | Deutsch primär, Englisch bald — Übersetzungsschicht ab Tag 1 | 23.08. | ADR-011 |
| E9 | Forschungsraum: Deutschland, Polen, Russland, Baltikum, Kanada; Tiefe bis etwa 1700 | 23.08. | 20_Domaenenwissen §13 |
| E10 | Gesundheitsmodul mit strukturierten Diagnosen **und** Risikofaktoren, plus medizinische Stammbaumansicht | 23.08. | 50_Datenmodell §2.12 |
| E11 | Benutzerdefinierte Profilfelder als eigenes Feld-Definitionssystem (Must, nicht Nice-to-have) | 23.08. | 50_Datenmodell §2.13 |
| E12 | Datumswerte eingebettet, Persona-Tabellen ab Phase 0, Ereignis/Aussage nach §2-Regel, Platzhalterpersonen erlaubt | 23.08. | 50_Datenmodell |
| E13 | Privates GitHub-Repository ab Tag 1, Windows-Build per CI | 23.08. | ADR-012 |
| E14 | Dateiendung `.ahnen` (Ordner; auf macOS optional als Bundle) | 23.08. | ADR-002 |
| E15 | Eigene, auf beiden Plattformen identische Gestaltung; hell und dunkel; Referenzen Notion/Obsidian/Apple | 23.08. | 70_UX §9 |
| E16 | DNA bleibt draußen | 23.08. | 40_Anforderungen W-03 |
| E17 | Reihenfolge der Analysefeatures: Zeitleiste → Karte → Netzwerk | 23.08. | 10_Vision §5 |
| E18 | **Name: Wurzelwerk**; Repository `wurzelwerk`; Dateiendung bleibt namensunabhängig `.ahnen` | 23.08. | 00_INDEX |
| E19 | Audio wird nur eingebunden, nicht in der App aufgenommen | 23.08. | A-16 |
| E20 | Automatische Umschrift kyrillischer Namen und Orte (ISO 9 / DIN 1460) wird mitgeliefert | 23.08. | A-19 |
| E21 | Konfidenzstufen: gesichert · wahrscheinlich · unsicher · Vermutung; "widersprüchlich" ist ein **Zustand**, keine Stufe | 23.08. | 50_Datenmodell §2.16 |
| E22 | Platzhalter werden bei Auflösung ersetzt, im Änderungsjournal nachvollziehbar | 23.08. | 50_Datenmodell §2.14 |
| E23 | Windows-Rechner ist perspektivisch verfügbar → Windows bleibt gleichrangiges Ziel | 23.08. | ADR-012 |
| E24 | Kein ICD-10; eigener Kategorienkatalog genügt | 23.08. | M-09 gestrichen |
| E25 | **Änderungsjournal per SQLite-Trigger, ganze Zeilen als JSON** statt Feld-Diffs im Anwendungscode. Ein Schreibvorgang ohne armierte Transaktion ist damit *unmöglich*, nicht bloß verboten. | 23.08. | ADR-017 |
| E26 | **Undo/Redo linear und aus dem Journal abgeleitet** (kein Stapel im Speicher → funktioniert nach Neustart), mit `defer_foreign_keys` in der Undo-Transaktion | 23.08. | ADR-018 |
| E27 | **Import-Rücknahme nach Schwellwert**: bis 500 Zeilen ein normaler Undo-Schritt, darüber über Schnappschuss. Löst den Widerspruch zwischen ADR-003 und ADR-010. | 23.08. | ADR-019 |
| E28 | **Migrationen nur vorwärts**, `user_version` + Prüfsummentabelle, Fixture-Datenbank je Version, Schnappschuss vor jeder Migration | 23.08. | ADR-020 |
| E29 | **Kein Speichern-Knopf, kein Puffer.** Auto-Speicherung ist eine Eigenschaft der Architektur: ein Befehl kehrt erst zurück, wenn seine Transaktion committet ist. Keine optimistischen Aktualisierungen in Phase 0/1. | 23.08. | ADR-022 |
| E30 | **Layout misst keinen Text** — Knotenmaße sind Eingabe des Layouts, nicht Ergebnis. Damit steht die Grenze aus ADR-009 in der Signatur. | 23.08. | ADR-023 |
| E31 | **Bezeichner: Fachbegriffe deutsch, Technik englisch.** Keine Übersetzungsschicht zwischen Schema und Code. | 23.08. | ADR-021 |
| E32 | **Im Protokoll stehen IDs, nie Inhalte**; Gesundheitstabellen erscheinen nicht einmal namentlich | 23.08. | ADR-024 |
| E33 | Konfidenzskala hat **vier** Stufen — die Angabe „5 Stufen" in B-03 ist überholt | 23.08. | E21, 50_DM N.1, **V2 bestätigen** |
| E34 | Code-Repository liegt als **eigener Ordner neben dem Konzeptordner** (`~/Claude/Projects/wurzelwerk`) | 23.08. | ADR-012, 80_OF A3 |
| E35 | **Phase 1 bleibt im Umfang wie dokumentiert**; gesteuert wird über die Reihenfolge der Arbeitspakete, nicht über Kürzung | 23.08. | 57_Arbeitspakete, 80_OF A1 |
| E36 | **Akzentfarbe: gedecktes Petrol / Blaugrün**, Anker etwa `#35726E`. Muss auf Papierweiß und Anthrazit tragen und darf nicht mit den Datenfarben kollidieren | 24.08. | 71_Designsystem §0, 73_Briefing §5.3 |
| E37 | **Tokennamen, Komponentennamen und Bildschirmnummern sind gesetzt, die Werte offen.** Damit ist jede Designiteration wertfrei für den Code | 24.08. | 71_Designsystem §0 |
| E38 | **Schriften und Symbolsatz erarbeitet Claude Design** innerhalb harter Kriterien (OFL, Kyrillisch, Tabellenziffern, echte Kursive) und einer Sperrliste gegen KI-Standardgriffe | 24.08. | 71_Designsystem §1.3 und §4 |
| E39 | **Prototyp deckt alle Ansichten bis Phase 5 ab**, in zwei Stufen: Phase 0/1 verbindlich und detailliert, spätere Phasen als Zielbild zum Härtetest des Designsystems | 24.08. | 72_Screens §0 |
| E40 | **Konfidenz und Widerspruch sind zwei getrennte Zeichen**, keine gemeinsame Skala — die Oberflächenentsprechung von E21 | 24.08. | 71_Designsystem §2.1 |
| E41 | **Foto-KI (Kolorierung/Restaurierung/Animation) erstmal ausgeschlossen** — Cloud/GPU, widerspricht der Offline-Linie; später als „Could" denkbar | 06.09. | 40_Anf W-07 |
| E42 | **KI-Bestandsauflösung** eingeführt: Bestandsauszug für den Skill (D-14) + Auflösungsschritt im Trockenlauf mit Verbinden/Getrennt/Später (D-15); „Vater von A ist B" verbindet beim Import, W-05 gewahrt | 06.09. | 56_Import, D-14/D-15 |
| E43 | **Funktionsabgleich MyHeritage/Legacy/FTB nachgezogen** (A-20/21/22, C-23/24/25, E-07/08, F-10, C-16 erweitert, B-09 vorgemerkt) | 06.09. | 40_Anf Nachtrag 4 |
| E44 | **Kartengrundlage: Natural Earth (gebündelt, PD)** als neutrale Basis, optional OSM/PMTiles-Regionsdownload; historische Grenzen Phase 6; Koordinaten via GOV/GeoNames/Wikidata | 06.09. | 80_OF V17 |
| E45 | **Schriften gewählt (Claude Design): Source Sans 3** (Oberfläche), **Source Serif 4** (Originalzitate/Transliteration), **IBM Plex Mono** (technisch); SIL OFL, offline, kyrillisch + Diakritika, Sperrliste-konform. Löst V10/V11. | 06.09. | Claude Design §1.8; 74_Prompts §13 |
| E46 | **Oberflächensprachen DE, RU, UK, EN ab Phase 1** (statt nur DE jetzt / EN Phase 6), Umschalter Kopfzeile + Einstellungen | 06.09. | G-08, 80_OF §8 |
| E47 | **Lebensstationen mit konfigurierbarem Stationsarten-Katalog** aufgenommen (A-23); verallgemeinert A-08; Modell-Abgleich mit Ereignis/Aussage offen (V18) | 06.09. | 40_Anf A-23, 80_OF V18 |
| E48 | **Vollständig agentische Entwicklung in Loops**; Anfängerfreundlichkeit ist kein Kriterium mehr. Stack bleibt (Electron/TS/React/SQLite) aus agentischen Gründen (Trainingsdaten→Durchsatz, eine Rendering-Engine). Loop-Guardrails in ADR-025. | 06.09. | ADR-025; ADR-001/009 Nachtrag |
| E49 | **Ein-Ordner-Struktur:** Konzeptdokumente unter `Ahnenforschung/Wissen/`, Code-Repo unter `Ahnenforschung/wurzelwerk/` (statt Repo *neben* dem Konzeptordner). Ersetzt die Ortsangabe aus E34/ADR-012; Absicht unverändert: `wurzelwerk/` ist ein eigenständiges Git-Repo, `Wissen/` liegt außerhalb davon und wird nicht getrackt. | 07.09. | ADR-012 Nachtrag, 80_OF A3 |

---

## Statuszeichen in allen Dokumenten

- `[offen]` — Entscheidung steht aus, gehört nach `80_Offene_Fragen.md`
- `[inferred]` — von Claude abgeleitet, nicht von Florian bestätigt
- `[unverified]` — Recherchestand nicht gegengeprüft
- `[Quelle: …]` — belegt

---

## Wo man anfängt

1. `00_INDEX.md` (diese Datei) — Status und Entscheidungen.
2. `57_Phase0_Arbeitspakete.md` — welches Paket als nächstes fällig ist.
3. `55_Architektur.md` — die Abschnitte, die das Paket nennt.
4. `CLAUDE.md` — sobald das Repository existiert, ist sie die Hausordnung.

`80_Offene_Fragen.md` §5 hält die acht Punkte, die aus der Architekturplanung offen sind.
Blockierend ist nur V2.
