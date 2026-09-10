# Entscheidungen und offene Fragen

**Stand 23.08.2026, 3. Durchgang. Alle gestellten Fragen sind beantwortet.** §3 hält das Protokoll der zweiten Runde, §4 nennt die einzige verbleibende inhaltliche Unklarheit.

---

## 1. Namensvorschläge

Kriterien: aussprechbar, nicht sperrig, im Deutschen und Englischen tragfähig (E8), nicht schon
von einem großen Genealogieprodukt besetzt `[unverified — vor der Festlegung prüfen]`.

### Die drei, die ich selbst nehmen würde

**Wurzelwerk** — botanisch das Wurzelgeflecht einer Pflanze. Fachlich ist das der treffendste
Name, den man vergeben kann: dein Datenbestand ist eben *kein* Baum, sondern ein Geflecht mit
Mehrfachverbindungen. Klingt gleichzeitig warm und handwerklich. Nachteil: im Englischen nicht
selbsterklärend.

**Stemma** — der wissenschaftliche Fachbegriff für ein Abstammungsdiagramm (aus der
Stemmatologie, ursprünglich griechisch für Ahnenkranz). Kurz, ungewöhnlich, funktioniert in
beiden Sprachen unverändert, klingt nach Werkzeug statt nach Hobby. Nachteil: erklärungsbedürftig.

**Herkommen** — altes deutsches Wort für Abstammung und Herkunft ("von gutem Herkommen").
Etwas aus der Mode gefallen und dadurch frei; hat einen ruhigen, erzählenden Klang, der zu einer
Software passt, die Erinnerungen sammelt.

### Weitere, nach Charakter geordnet

*Handwerklich-sachlich:* **Ahnenwerk** · **Stammwerk** · **Herkunftswerk** · **Ahnenbuch**
*Bildlich:* **Geflecht** · **Wurzelkarte** · **Verzweigt** · **Ahnengarten** · **Zweiglicht**
*Lateinisch-knapp:* **Atavus** (der Ur-ur-ur-Großvater) · **Linea** · **Prosapia** (Sippschaft) · **Radix** (Wurzel)
*Erzählend:* **Chronik** · **Familienchronik** · **Überliefert** · **Wortlaut**
*Nüchtern-modern:* **Sippenbuch** — **nicht empfohlen**: "Sippe" und "Sippenforschung" sind
durch die nationalsozialistische Ahnenforschung schwer vorbelastet und im deutschen
Genealogie-Umfeld heikel. Das solltest du wissen, bevor du es in Erwägung ziehst.

### Entschieden: **Wurzelwerk** (E18)

### Ursprüngliche Begründung
**Wurzelwerk.** Es ist der einzige Vorschlag, der die zentrale fachliche Einsicht dieses
Projekts im Namen trägt — dass Verwandtschaft ein Netz ist und kein Baum. Und der Name
funktioniert auf einem Poster über dem Wohnzimmersofa genauso wie in einem Repository.

Falls Englisch später gleichberechtigt sein soll, wäre **Stemma** die stärkere Wahl.

---

## 2. Beantwortet (Protokoll)

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| F1 | Name | offen, Vorschläge oben | — |
| F2 | Verteilung | Eigennutzung + Verwandtschaft | Lesemodus-Export statt Installer; Signierung vorerst nicht nötig → ADR-008 |
| F3 | Sprache | Deutsch, bald Englisch | Übersetzungsschicht ab Tag 1 → ADR-011 |
| F4 | Datenlage | Papier + Wissen in Köpfen | **Größte Änderung:** Erfassung aus unstrukturiertem Material wird Kernfeature; Import-Vertrag rückt in Phase 1 → ADR-010 |
| F5 | Raum | DE, PL, RU, Baltikum, Kanada; bis ~1700 | Kalender pro Datum zwingend, Ortsnamen-Historie unverzichtbar, Transliteration, Migrationskarte wird Must → 20_Domaenenwissen §13 |
| F6 | Kirchenbücher | noch nicht | Kirchenbuch-Modus → Phase 6 |
| F7 | Ahnenimplex | nicht bekannt | Architektur bleibt DAG-fähig, UI-Priorität gesenkt |
| F8 | DNA | draußen | W-03 endgültig |
| F9 | Gesundheit | strukturiert, mit Risikofaktoren | Eigener Anforderungsblock M-01…M-09, Tabellen `diagnose`/`risikofaktor`, eigene Ansicht, harte Exportsperre |
| D1 | Datumswerte | eingebettet | 50_Datenmodell §2.3 + Doppeldatierungsfelder |
| D2 | Personas | ab Phase 0 | keine Kernmigration später |
| D3 | Ereignis vs. Aussage | Vorschlag angenommen | Regel in 50_Datenmodell §5 |
| D4 | Unbekannte Eltern | Platzhalter | §2.14 mit fünf Schutzregeln |
| T1 | Repository | privates GitHub | ADR-012 |
| T2 | Entwicklung | nur Mac | **Risiko benannt**, CI-Windows-Build + Screenshots → ADR-012 |
| T3 | `.ahnen` | zugestimmt | E14 |
| T4 | GOV | siehe unten | — |
| U1 | Gestaltung | eigene, identisch | E15 |
| U2 | Referenzen | Notion, Obsidian, Claude, Figma, Apple | 70_UX §11 |
| U3 | Themen | hell und dunkel | Tokens ab Tag 1 |
| P1 | Reihenfolge | A: Erfassung zuerst | Roadmap 10_Vision §5 |
| P2 | Analysefeatures | Zeitleiste → Karte → Netzwerk | Phase 3 / Phase 5 |
| Neu | Eigene Profilfelder | gewünscht | A-18, Feld-Definitionssystem, Must |

### Antwort auf T4: Wofür brauchen wir GOV?

**GOV** ist das *Geschichtliche Ortsverzeichnis* des Vereins für Computergenealogie: eine
Datenbank von Ortsobjekten mit stabiler ID, in der jeder Ort seine **Namen mit Zeitraum** und
seine **Zugehörigkeiten mit Zeitraum** trägt — politisch und kirchlich getrennt.

Warum das bei *deinem* Forschungsraum (E9) mehr als Komfort ist, an einem Beispiel:

> Ein Ort in Ostpreußen heißt 1750 deutsch, gehört zum Kirchspiel X, Kreis Y, Provinz
> Ostpreußen, Königreich Preußen. 1871 gehört er zum Deutschen Reich. 1945 wird er polnisch
> oder sowjetisch, bekommt einen neuen Namen, einen neuen Kreis, einen neuen Staat. Ein Teil
> dieser Orte existiert heute nicht mehr.

Ohne Ortsdatenbank musst du diese Historie **für jeden Ort selbst eintippen**, und du hast
keine Möglichkeit, deine Schreibweise mit der Schreibweise anderer Forscher abzugleichen. Mit
GOV-Anbindung bekommst du: die vollständige Namens- und Zugehörigkeitshistorie geschenkt,
Koordinaten, und eine stabile ID, die deine Daten mit fremden Beständen verknüpfbar macht
(GEDCOM 7 transportiert sie offiziell seit 2024).

**Konkret gebraucht wird es für drei Dinge:** (1) der Zeitregler kann Ortsnamen "wie damals"
anzeigen, (2) die Karte weiß, wo ein untergegangener Ort lag, (3) beim Austausch mit Verwandten
oder Vereinen meint "Königsberg" nachweislich denselben Ort.

**Was zu klären ist:** Ob man GOV-Daten offline mitliefern darf oder nur online abfragen. Das ist
ausschließlich eine Lizenzfrage bei CompGen, kein technisches Problem. **Vorschlag:** Wir
verschieben das auf Phase 6 und bauen bis dahin die eigene Ortsentität so, dass eine GOV-ID
später einfach eingehängt werden kann (Tabelle `ort_externe_id` existiert bereits). Du verlierst
dadurch nichts.

---

## 3. Beantwortet, zweite Runde

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| N1 | Name | **Wurzelwerk** | E18; Repository `wurzelwerk`, Dateiendung bleibt `.ahnen` |
| N2 | Russlanddeutsche/Mennoniten? | unklar, könnte zutreffen | offen gehalten, siehe §4 |
| N3 | Audio | nur einbinden | E19, A-16; keine Aufnahmefunktion |
| N4 | Gesprächspartner/Zeitdruck | keine Rücksicht nötig | Dringlichkeitsargument in 10_Vision §5 zurückgenommen; Reihenfolge bleibt trotzdem "Erfassung zuerst", nun aus der Datenlage begründet |
| N5 | Kyrillisch | automatische Umschrift | E20, A-19, ADR-014 (ISO 9 als Standard, umkehrbar) |
| N6 | Konfidenzstufen | Vorschlag angenommen | E21; vier Stufen, "widersprüchlich" als abgeleiteter Zustand → 50_Datenmodell §2.16 |
| N7 | Platzhalter-Ersetzung | einverstanden | E22; eigene Transaktionsart im Journal |
| N8 | Windows | irgendwann möglich | E23; Windows bleibt gleichrangig, Testrunde spätestens Ende Phase 2 |
| N9 | ICD-10 | Katalog genügt | E24; M-09 gestrichen |

---

## 4. Verbleibend

**V1 — Wanderungsmuster (aus N2).** Ob die Kette Deutschland → Polen/Russland → Baltikum →
Kanada dem Muster der Russlanddeutschen oder Mennoniten folgt, ist noch offen. **Das blockiert
nichts:** Das Datenmodell ist mit zeitabhängigen Ortsobjekten, freien Ortstypen und dem
Feld-Definitionssystem (A-18) so gebaut, dass "Kolonie", "Mennonitengemeinde" oder jede andere
Kategorie später ohne Schemaänderung ergänzt werden kann.

Der Punkt klärt sich von selbst, sobald die ersten echten Orte und Gemeinden erfasst sind.
Wenn du willst, kann ich dann eine gezielte Quellenrecherche für die konkreten Regionen machen
(Wolhynien, Wolga, Schwarzmeer, Manitoba/Saskatchewan haben jeweils eigene, gut erschlossene
Bestände) — sinnvoll aber erst, wenn ein paar Ortsnamen bekannt sind.

**Damit ist die Konzeptionsphase abgeschlossen.** Für die Phasen 0 bis 3 gibt es keine
blockierenden Entscheidungen mehr.

---

## 5. Neu aus der Architekturplanung (23.08.2026)

Aus der Planung von Phase 0 und 1 (`55_Architektur.md`, `56_Import_Vertrag.md`) sind acht
Punkte offen. **Nur V2 blockiert ein Arbeitspaket** (AP-0.6), alles andere sind Vorgaben, die
schon gesetzt sind und die du bestätigen oder ändern kannst.

| # | Punkt | Vorschlag / Vorgabe | Blockiert | Wo entschieden wird |
|---|---|---|---|---|
| **V2** | **Konfidenz: 4 oder 5 Stufen?** E21 und `50_Datenmodell.md` §2.16 sagen vier; B-03 in `40_Anforderungen.md` und die Schemakommentare `1..5` sagen fünf. | **Vier** (E21 ist die jüngere, begründete Entscheidung). Geht als `CHECK (konfidenz BETWEEN 1 AND 4)` ins Schema. | **AP-0.6** — eine Änderung danach ist eine Datenmigration über alle belegtragenden Tabellen | **entschieden: vier (07.09.2026, E33)** |
| V3 | Persona-Phase: §2.8 sagt Phase 3, D2 sagt „leer bis Phase 4", B-05 sagt Phase 3 | Tabelle ab Phase 0, Befüllung Phase 3. In `50_Datenmodell.md` N.6 festgehalten. | nichts | erledigt, nur bestätigen |
| V4 | Netzwerkansicht: `70_UX_Konzept.md` §2 sagt Phase 4, C-20 und E17 sagen Phase 5 | Phase 5. `70_UX_Konzept.md` ist nachgezogen. | nichts | erledigt, nur bestätigen |
| V5 | Schwellwert für journalisierte Kleinimporte (ADR-019) | **500 geänderte Zeilen.** Darunter ein normaler Undo-Schritt, darüber Rücknahme über Schnappschuss. | nichts | wenn die ersten echten Importe da sind |
| V6 | Journal-Aufbewahrung (ADR-003 Konsequenz) | **30 Tage und mindestens 200 Transaktionen** bleiben rücknehmbar; älter wird nur `aenderung` aufgeräumt, die Historie bleibt lesbar. | nichts | wenn die Datei spürbar wächst |
| V7 | `synchronous = NORMAL` oder `FULL`? | **NORMAL** nach `50_Datenmodell.md` §3. Konkret: Ein Programmabsturz kostet keine committete Transaktion. Ein **Stromausfall** kann die letzten committeten Transaktionen kosten (die Datei bleibt intakt). `FULL` würde auch das abdecken, kostet aber je Feldänderung einen `fsync` — bei Auto-Speicherung spürbar. | nichts | hier, wenn du das anders willst |
| V8 | Sprache der Bezeichner im Code (ADR-021) | **Fachbegriffe deutsch, Technik englisch.** Begründung: Das Schema ist deutsch; eine Übersetzungsschicht zwischen Schema und Code ist die Fehlerquelle, die KI beim Umbenennen bedient. | nichts | hier, es prägt jede Datei |
| V9 | `55_Architektur.md` ist ~1.480 Zeilen und überschreitet die 800-Zeilen-Regel aus `90_Arbeitsweise_KI.md` §2 | Aufteilen, sobald es beim Arbeiten stört. Natürliche Schnittstelle: **55a** = Schichten, Ordnerstruktur, IPC, Datenzugriff (§1–3); **55b** = Journal, Undo, Zustand, Layout, Migration, Fehler (§4–13). | nichts | nach den ersten Arbeitspaketen |

### Was diese Runde geklärt hat (Protokoll)

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| A1 | Umfang Phase 1 | **wie dokumentiert**, nicht gekürzt | Die *Reihenfolge* in `57_Phase0_Arbeitspakete.md` ist so gewählt, dass nach AP-1.7 echte Daten sichtbar sind |
| A2 | Import-Vertrag oder Maske zuerst? | **Schema und Trockenlauf zuerst** | ADR-010 wörtlich; AP-1.3 bis AP-1.5 vor jeder Bearbeitungsmaske |
| A3 | Ort des Code-Repositories | **`~/Claude/Projects/Ahnenforschung/wurzelwerk`** (Konzept in `Wissen/` daneben; geändert 07.09., E49) | ADRs als Kopie in `docs/adr/`; Konzeptordner bleibt ungetrackt |

---

## 6. Neu aus der Designvorbereitung (24.08.2026)

Keiner dieser Punkte blockiert ein Arbeitspaket. V10 bis V12 klären sich durch die Designarbeit
selbst; V13 bis V16 sind Vorgaben, die ich gesetzt habe und die du bestätigen oder ändern kannst.

| # | Punkt | Vorschlag / Vorgabe | Wo entschieden wird |
|---|---|---|---|
| V10 | **Schriftfamilien** — welche drei (Oberfläche, Originalzitate, Technisches)? | Claude Design entscheidet nach den fünf Kriterien in `71_Designsystem.md` §1.3 und der Sperrliste in §4.1. Danach als E-Zeile in `00_INDEX.md` festhalten, weil es eine Lizenz- und Auslieferungsentscheidung ist | nach Welle 0 |
| V11 | **Symbolsatz** | dito. Ein einziger Satz, ~80 Symbole, kein Emoji, nicht die üblichen Verdächtigen | nach Welle 0 |
| V12 | **Konkrete Tokenwerte** | Ergebnis der Designarbeit. Die Namen sind gesetzt (E37), deshalb ist jede Iteration wertfrei für den Code | Welle 0 und 1 |
| V13 | Kompakte Dichte als Vorgabe im Interview-Modus? | **Ja**, vorgeschlagen — dort zählen Zeilen pro Bildschirm mehr als Ruhe | hier |
| V14 | Screenreader-Grenze bei der Baumansicht | **Akzeptiert:** die Listenansicht ist der barrierefreie Zugang zu denselben Daten. Ein Graph mit 2.000 Knoten ist für einen Screenreader kein sinnvolles Ziel. Steht in `71_Designsystem.md` §5 als bewusste Grenze, damit sie später nicht als Versehen erscheint | hier |
| V15 | Ist der Petrol-Akzent gesetzt oder auch offen? | Ich habe ihn als **gesetzt** behandelt (E36), weil du ihn ausgewählt hast, und den Rest der Sprache offen gelassen. Wenn auch der Akzent offen sein soll: `73_Design_Briefing.md` §5.3 und `71_Designsystem.md` §0 anpassen | hier |
| V16 | Reihenfolge Designarbeit und Phase 0 | **Unabhängig.** Phase 0 braucht kein Design (AP-0.1 bis AP-0.15 sind Fundament ohne sichtbares Feature); die Designarbeit braucht keinen Code. Beide können parallel laufen, treffen sich bei AP-1.6 | hier |

### Was diese Runde geklärt hat (Protokoll)

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| B1 | Akzentfarbe | **gedecktes Petrol / Blaugrün** | E36 |
| B2 | Schriften | Claude Design erarbeitet die Designsprache, **ohne** typische KI-Standardgriffe (kein Inter, kein Roboto) | E38, Sperrliste in `71_Designsystem.md` §4 und `73_Design_Briefing.md` §6 |
| B3 | Umfang des Prototyps | **alles bis Phase 5**, inklusive Karte, Zeitleiste und medizinischer Ansicht | E39, umgesetzt als Zweistufigkeit in `72_Screens_und_Flows.md` §0 |
| B4 | Leitfassung hell oder dunkel | **beide gleichrangig entwerfen** | jedes Artboard in beiden Themen; in `74_Prompts_Claude_Design.md` in jeder Welle verlangt |

---

## 7. Neu aus dem Funktionsabgleich (06.09.2026)

Aus dem Abgleich mit MyHeritage (Family Tree Builder), Legacy und der MyHeritage-Hilfe (`30_Markt`, `40_Anforderungen` Nachtrag 4). Nur ein neuer offener Punkt, der Rest ist gesetzt und bestätigbar.

| # | Punkt | Vorschlag / Vorgabe | Blockiert | Wo entschieden |
|---|---|---|---|---|
| V17 | **Kartengrundlage** — das Bild unter den Ortspunkten. G-02 verlangt vollständig offline, ein Online-Kachelserver fällt damit aus. | **Natural Earth (gebündelt, Public Domain)** als neutrale Basis — zeigt bewusst *keine* modernen Grenzen/Namen, damit die historischen Ortsnamen aus dem Zeitregler tragen. Optional ein **OSM/PMTiles-Regionsdownload** (MapLibre GL) für Detailwünsche; Attribution ODbL („© OpenStreetMap-Mitwirkende"). Historische Grenzen als eigene Ebene → Phase 6. | nichts (Phase 3) | hier bzw. bei Beginn Phase 3 |

**Koordinatenquellen** sind bereits geklärt und kein offener Punkt: `ort.koordinaten` + `ort_externe_id` (gov/geonames/wikidata), GOV wie in T4 (Phase 6, Lizenzfrage bei CompGen).

### Was diese Runde geklärt hat (Protokoll)

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| C1 | Foto-KI (Kolorierung/Restaurierung/Animation) | **erstmal raus** | E41, W-07; Cloud/GPU-Thema, widerspricht der Offline-Linie |
| C2 | KI-„Smartmatch" (Bestandsauflösung) | eingeführt | E42, D-14/D-15; „Vater von A ist B" verbindet beim Import, W-05 gewahrt |
| C3 | Kleinere B/C-Lücken aus dem Abgleich | alle nachgezogen | E43; A-20/21/22, C-23/24/25, E-07/08, F-10, C-16 erweitert, B-09 vorgemerkt |
| C4 | GEDCOM Im-/Export | bereits abgedeckt | D-07 (Must, Phase 4) Export+Import, D-08 (Could) 5.5.1-Import, D-09 Import-Bericht |

---

## 8. Neu aus dem Claude-Design-Abgleich (06.09.2026)

| # | Punkt | Vorschlag / Vorgabe | Blockiert | Wo entschieden |
|---|---|---|---|---|
| V18 | **Stationsarten ↔ Ereignis-/Aussagemodell** — Claude Design führt „Lebensstationen" mit konfigurierbarem Arten-Katalog (A-23) ein; der Import-Vertrag nutzt für `ereignis.typ` ein festes Enum und für Beruf/Wohnort `aussagen`. | Abbilden: eine Lebensstation ist entweder ein `ereignis` (Ort/Datum/Rollen) oder eine zeitraumfähige `aussage`; der Arten-Katalog ist ein Typ-/Felddefinitionssystem (Nähe zu A-18). Vor der Umsetzung von A-23 in `50_Datenmodell.md` klären. | A-23-**Umsetzung** (nicht die Konzeption) | bei der Datenmodell-Runde zu A-23 |

### Was diese Runde geklärt hat (Protokoll)

| # | Frage | Antwort | Wirkung |
|---|---|---|---|
| D1 | Schriften/Symbolik (V10/V11) | **Source Sans 3 / Source Serif 4 / IBM Plex Mono** | E45; SIL OFL, offline, Sperrliste-konform |
| D2 | Oberflächensprachen | **DE, RU, UK, EN ab Phase 1** | E46; G-08 erweitert |
| D3 | Lebensstationen + Arten-Katalog | in Scope (A-23) | E47; Modell-Abgleich V18 |
| D4 | „Aus Statistik ausschließen" | aufgenommen | A-24 |
| D5 | Fehlende Bildschirme | als Design-Prompt formuliert | 74_Prompts §14 (Wellen 7–9) |

---

## 9. Umsetzungsentscheidungen aus den Arbeitspaketen

| # | Punkt | Entscheidung | Grund | Wo |
|---|---|---|---|---|
| U-AP03 | **i18n-Ressourcen-Pfad** — AP-0.3 nennt als Ablageort `src/renderer/i18n/de/*.json`. | Ressourcen liegen unter **`src/shared/i18n/de/*.json`**; nur `einrichten.ts` bleibt unter `src/renderer/i18n/`. | Die Menü-Beschriftungen werden im **Main**-Prozess gebaut (`src/main/menue/menue.ts`), und **Main darf `src/renderer/` nie importieren** (CLAUDE.md §2, harte Grenze). `src/shared` ist die einzige Schicht, die Main **und** Renderer lesen dürfen. §2 gewinnt gegen die Pfadangabe der AP. | AP-0.3, PR #3 |
| U-AP08 | **Zeitstempel-Befüllung `erstellt_am`/`geaendert_am`** — Migration 0002 vermerkt „Befüllung Trigger AP-0.8". | Nicht per Trigger, sondern im **main-Befehlshandler** (AP-0.9) in **Millisekunden** (`Date.now()`) gesetzt. | SQLite-`BEFORE`-Trigger können `NEW.*` nicht setzen; eine Fill-Variante bräche die ADR-009-Redo-Bitgleichheit (Undo/Redo spielt gespeicherte JSON zurück). Die angewendete Migration 0002 bleibt unverändert (§6) — der Kommentar dort ist historisch. | AP-0.8/0.9, PR #12/#14 |
| U-AP10 | **Transaktionsklammer für Undo/Redo** — §2: „Nur `src/main/befehle/` öffnet Transaktionen". | `undo`/`redo` öffnen eine **eigene** `IMMEDIATE`-TX in `src/main/journal/undo.ts` mit kommentierter §2-Ausnahme (wie `trigger.ts`), `defer_foreign_keys=ON` in beiden Richtungen. | Undo/Redo ist keine fachliche Mutation über den Bus, sondern spielt Journalzeilen zurück; es braucht dieselbe atomare Klammer, kann aber nicht durch `befehle/` laufen (es ist kein Befehl). | AP-0.10, PR #18 |
| U-AP12 | **Fixture-Beschreibung erweitert** — AP-0.12 nennt den Umfang nur mit Personen/Namen/Elternschaften. | `FixtureBeschreibung` trägt zusätzlich optionale `ereignisse`/`beteiligungen`; Fixtures als **TS-Datenmodule** (keine committeten `.sqlite`); 20 000er-Korpus-Gesundheit im **Budget-Gate**, nicht im Per-PR-Gate. | `person`/`name`/`elternschaft` haben keine Datumsspalten — Datum lebt nur auf `ereignis`; ohne die Erweiterung wäre die geforderte Fixture „unscharfe-datumsangaben" nicht modellierbar. TS-Module sind diffbar/typgeprüft; ein 20k-`.sqlite` gehört weder in git noch in ein schnelles Gate. | AP-0.12, PR #21/#22 |
