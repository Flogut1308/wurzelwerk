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
| U-AP13a | **Anzeige des Datenbestand-Berichts** — AP-0.13 nennt nur "zeigt einen Bericht", ohne Bildschirm-Vorgabe. | Bericht läuft über einen **nativen Electron-Dialog** (`dialog.showMessageBox`, `src/main/wartung/datenbestand-pruefen.ts`), bewusst **kein** eigener Renderer-Screen. | Es gibt vor dem Design-Fundament (AP-1.6) noch keinen Bildschirm/Baustein für einen Prüfbericht (CLAUDE.md §14 Fall 1); ein nativer Dialog liefert die Funktion, ohne eine neue visuelle Sprache zu erfinden. Kann nachgerüstet werden: eine `abfrage:`-IPC-Variante mit Renderer-Anzeige, sobald das Fundament steht. | AP-0.13 |
| U-AP13b | **Kein neuer Fehlercode für Prüf-Funde** — §7 verlangt für jeden `FehlerCode` einen i18n-Eintrag. | `datenbestandBericht()`/`ableitungAbweichung()` werfen nicht und bekommen **keinen** neuen Eintrag in `src/shared/fehler/codes.ts`. | Ein Fund (Integritäts-/Fremdschlüssel-/Ableitungs-/Zyklus-Abweichung) ist kein Fehlerzustand der Anwendung, sondern ein Berichtsergebnis für die Nutzerin — er verhindert/verändert nichts. Ein Fehlercode wäre semantisch falsch (§7 ist für Ausnahmen gedacht, die über IPC als `Ergebnis<T>`-Fehler laufen). | AP-0.13 |
| U-AP13c | **Laufzeit des SIGKILL-Tests** — `test/absturz/sigkill.test.ts` startet 24 echte Kindprozesse. | Test läuft vorerst im **normalen Per-PR-Gate** (`pnpm test`), lokal/macOS ~3,7 s für alle 24 Läufe. Falls die Windows-CI-Laufzeit sich als unverhältnismäßig hoch herausstellt, in die **langsamen Gates** (`test:e2e`/`test:budget`-Lauf) verschieben. | Absturzsicherheit ist laut CLAUDE.md §5 eine reguläre Testkategorie (`test/absturz/`), kein per se langsamer Gate-Kandidat; die gemessene lokale Laufzeit rechtfertigt noch keine Sonderbehandlung. Windows-Prozessstart (`node --import tsx`) ist aber unbekannt langsamer — offener Beobachtungspunkt für die erste Windows-CI-Runde. | AP-0.13 |
| U-AP15a | **Fenster-Anker der Koaleszenz** (55_Architektur.md §4.8) nennt kein festes Ankerverfahren für das 2-Sekunden-Fenster. | **Gleitendes Fenster** als Default: jede erfolgreich zusammengefasste Änderung setzt `transaktion.zeitpunkt` der verdichteten Zeile auf den Zeitpunkt der jüngsten Teiländerung — eine weitere schnelle Änderung bekommt dadurch wieder das volle Fenster. Alternative (nicht gewählt): **Anker = erste Änderung** (festes Fenster ab der ersten Teiländerung, unabhängig von Nachzüglern). | Ein gleitendes Fenster bildet fortlaufendes Tippen (z. B. in einem Notizfeld) natürlicher ab als ein hartes Zeitlimit, das mitten in einer zusammenhängenden Eingabe abreißt. Reine Implementierungsentscheidung ohne Datenmodell-/Architekturkonsequenz — bei Bedarf per Folge-AP auf den festen Anker umstellbar. | AP-0.15 |
| U-AP15b | **Hochwassermarke im SIGKILL-Test** (`test/absturz/kind-prozess.ts`, AP-0.13) zählte bisher erfolgreiche `fuehreAus()`-Aufrufe, nicht persistierte `transaktion`-Zeilen. | Umgestellt auf `COUNT(*) FROM transaktion` unmittelbar nach jedem Aufruf — die reine Aufruf-Zählung wäre seit der Koaleszenz (AP-0.15) systematisch zu hoch und hätte `sigkill.test.ts` nach jedem Merge fälschlich rot laufen lassen, obwohl kein Byte verlorenging. | Koaleszenz verdichtet mehrere erfolgreiche `person.feldSetzen(notiz)`-Aufrufe zu EINER `transaktion`-Zeile (das ist ihr Zweck) — ein Aufruf-Zähler und die tatsächlich persistierte Zeilenzahl laufen dadurch bewusst auseinander. `COUNT(*)` bleibt die richtige Grundlage für die WAL-Absturzzusage ("kein bereits committeter Stand geht verloren"), unabhängig von Koaleszenz. Kein Architektur-/Scope-Punkt, reine Testanpassung an eine erwartete Verhaltensänderung. | AP-0.15 |
| U-AP16 | **Rot-Beleg-Rezept von AP-0.16 korrigiert** — das Paket verlangt „Fenstertitel in `hauptfenster.ts` verfälschen, Job rot sehen". | Der wirksame Hebel ist der **Renderer-Dokumenttitel** (`src/renderer/index.html` `<title>`), nicht das `BrowserWindow`-`title`-Attribut. Rot-Beleg B wurde darüber geführt. | `expect(page).toHaveTitle(...)` liest den **Dokumenttitel** der geladenen Seite; das `BrowserWindow`-`title` ist davon entkoppelt, sobald der Renderer sein eigenes `<title>` lädt. Belegt: Job mit verfälschtem `hauptfenster.ts`-Titel lief **grün** durch, erst der verfälschte Dokumenttitel machte ihn rot. Kein Scope-/Datenmodellpunkt — reine Rezeptkorrektur (CLAUDE.md §14: weiterbauen, vermerken). | AP-0.16, PR #29 |
| U-AP17 | **`app.getAppPath()` im unverpackten `out/`-Lauf** — AP-0.17 verlangt „eine Auflösung für Entwicklung, Test und Paket". Der SPIKE ergab, dass `getAppPath()` bei `electron out/main/index.js` (`test:e2e`/`build`-Vorstufe) das Einstiegsverzeichnis **`out/main`** liefert, nicht das Repo-Root. | Basisverzeichnis wird **Parameter** von `migrationsDateiPfad`/`migrationsRohInhaltLesen`/`generierteTriggerAnwenden`; `schemaBasisverzeichnis()` (neu, `app.getAppPath()`+`docs/schema`) ist die einzige Laufzeit-Auflösung, `laeufer.ts` fällt für Vitest/Skripte auf `process.cwd()` zurück. `docs/schema/**` geht byte-identisch über `electron-builder.yml` `files:` in die asar; ein `electron.vite.config.ts`-Plugin (`cpSync`, roh) legt es zusätzlich nach `out/main`. `journal-trigger-anwenden.ts` mitgezogen (läuft zwingend auf dem Anlege-Pfad). | Byte-Identität (Prüfsummen in `registrierung.ts`, §6) verbietet String-Einbettung/EOL-Normalisierung — `cpSync`/electron-builder kopieren roh. **Offener Folgepunkt (Nutzer bestätigt):** den automatisierten E2E langfristig gegen das **electron-builder-Paket** statt gegen `out/` laufen lassen, damit der Verpackungsbug maschinell rot wird (schwerer: Pfad zum Binary, längere CI). Für AP-0.17 belegt ihn ein menschlich angesehener `pnpm build`-Lauf (anlegen→schließen→öffnen: ABNAHME OK). | AP-0.17, PR #30 |
| U-AP18 | **Umfangserweiterung + Einzelinstanz-Abnahme (§14)** — AP-0.18 listet als Umfang nur `index.ts`/`projekt-dienst.ts`/`projekt-dienst.test.ts`/e2e. | (a) Neues Modul `src/main/lebenszyklus.ts` (`appLebenszyklusVerdrahten`) + `test/einheit/lebenszyklus.test.ts` **zusätzlich** angelegt, damit das `before-quit`/Einzelinstanz-Wiring als **schneller, deterministischer** Einheitswächter prüfbar ist (statt allein am build-abhängigen e2e zu hängen). `index.ts` wird dünn. (b) Die Einzelinstanz-Abnahme („zweite Instanz fokussiert die erste") wird **auf Einheitsebene mit Fake-`app`** geprüft, **nicht** per zweitem Electron-Start im e2e. | (a) `index.ts` hat Import-Nebenwirkungen (`whenReady` beim Laden) und ist als Einheit schwer testbar; die Extraktion ist ein sauberer Seam ohne Architekturbruch (`src/main` darf `electron`, §2). (b) Fensterfokus zweier echter Instanzen ist OS-/Compositor-abhängig und damit flaky — eine nichtdeterministisch rote Prüfung wird von der Loop „wegoptimiert" (CLAUDE.md §13). Reine Test-/Struktur­entscheidung ohne Datenmodell-/Scope-Folge. | AP-0.18, PR #31 |
| U-AP19 | **Pauschale Fehlerabbildung im `oeffnen()`-Fehlerpfad** (hueter-Auflage AP-0.19, nicht-blockierend) — `projekt-dienst.ts` bildet in `projektUebernehmen` JEDEN Nicht-`WurzelFehler`-Wurf aus `oeffnen()` auf `DATENBANK_INTEGRITAET` ab. | **Folge-PR:** auf tatsächliche SQLite-Korruptionscodes eingrenzen (analog `sqliteCodeZuFehlerCode` in `src/main/ipc/huelle.ts`), damit `ENOSPC`/`EACCES`/`EMFILE` beim Öffnen nicht fälschlich als „Datenbankintegrität verletzt" gemeldet werden. Eigener PR mit Rot-Test (§5), nicht in AP-0.19 nachgeschoben. | Sehr seltene Fehlerklasse, eng auf `oeffnen()` begrenzt → kein Blocker für AP-0.19; die AP behebt Sperre+Leck, die Fehlertext-Präzisierung ist orthogonal und verdient einen eigenen roten Beleg. | AP-0.19, PR #32 |
| U-AP20 | **`ereignis:`-Vertrag nur senderseitig geschlossen** (hueter-Auflage AP-0.20, nicht-blockierend) — `sendeEreignis` bindet Kanal↔Nutzlast (typgeprüft), aber die Empfängerseite `window.wurzelwerk.abonnieren` in `src/renderer/brücke/global.d.ts` ist weiter `(kanal: string, hoerer: (nutzlast: unknown) => void)`. Ein Tippfehler im Kanalnamen beim Abonnieren fällt tsc nicht auf (Preload-Weißliste ignoriert ihn still als No-op). | **Folge-AP:** `abonnieren` an `EreignisKanal`/`EreignisNutzlast<K>` binden (z. B. generisch `abonnieren<K extends EreignisKanal>(kanal: K, hoerer: (n: EreignisNutzlast<K>) => void)`), Preload-Signatur + `global.d.ts` nachziehen; passt zu AP-0.25 (Werkzeug-/Vertragshygiene). | Vorbestehend (`global.d.ts` nicht im AP-0.20-Diff), außerhalb des AP-0.20-Scopes (`sendeEreignis`-Bindung) → kein Blocker; die Senderichtung — der belegte Befund „Tippfehler sendet still ins Nichts" — ist geschlossen. | AP-0.20, PR #33 |
| U-AP21 | **Deckungsgrenzen der Invariante `journal-schluessel`** (opus-hueter-Auflagen AP-0.21 PR-B, alle nicht-blockierend) — drei Punkte: (1) der Aritäts-`throw` in `datensatzIdZerlegen` (`basis.ts`) ist testweit ungedeckt; (2) der Round-Trip rekonstruiert `datensatz_id` in JS statt das reale trigger-erzeugte `aenderung.datensatz_id` zu prüfen → eine `pkSpalten`-vs-`datensatzIdSql`-Reihenfolgedivergenz bliebe unsichtbar; (3) die vier Verbund-PK-journalisierten Tabellen (`ort_externe_id`, `partnerschaft_person`, `aussage_zitat`, `medium_zuordnung`) sind im gesamten AP-0.12-Korpus leer → der reale Daten-Round-Trip deckt sie nicht ab (nur der synthetische Anti-Vakuum-Block). | **Folge-PRs (außerhalb des geschützten Pfads):** (1) Negativtest in `test/einheit/` (`datensatzIdZerlegen('a|b|c', ['x','y'])` wirft). (2)+(3) Fixture-/Generator-Korpus um Verbund-PK-Zeilen anreichern und den Round-Trip gegen das reale `aenderung.datensatz_id` einer trigger-erzeugten Zeile führen — passt zu AP-0.25 bzw. einer Korpus-Erweiterung. | Die Invariante selbst ist nachweislich nicht vakuös (Mutation `split('|')→split(':')` → rot, vom synthetischen Block gefangen); die drei Punkte sind Deckungs-/Scope-Grenzen, keine Lücke der Kernaussage → kein Blocker. | AP-0.21, PR #35 |
| U-AP1.1 | **i18n-Ressourcen ohne Renderer-Namensraum-Registrierung** — AP-1.1 legt `src/shared/i18n/de/datum.json` an (von `src/core/datum/formatierer.ts` referenziert, Schlüssel `datum:um`/`vor`/`nach`/`zwischen`/`tag_monat_jahr`/`monat_jahr`/`jahr`/`jahrzehnt`/`originaltext`), registriert den Namensraum `datum` aber **nicht** in `src/renderer/i18n/einrichten.ts` (`ns`/`resources`). | Bewusst verschoben: AP-1.1 ist reiner Kernumfang (Phase 1, kein Bildschirm) — die Registrierung ist eine Ein-Zeilen-Ergänzung, sobald ein Renderer-Baustein den `datum`-Namensraum tatsächlich braucht (frühestens AP-1.6 Design-Fundament o. ä.). | AP-1.1 PR-A |
| U-AP1.1-K | **Rechenfehler im Abnahmebeispiel korrigiert (§14)** — der AP-1.1-Abnahmetext nannte `1700-02-18 jul. = 1700-03-01 greg.`; das ist um einen Tag falsch. 1700 ist julianisches, aber kein gregorianisches Schaltjahr, der Zehn-Tage-Versatz gilt bis zum julianischen Schalttag. | Korrigiert auf **`1700-02-18 jul. = 1700-02-28 greg.`** (JDN 2342031, unabhängig gegen Anker `2000-01-01 greg. = JDN 2451545` sowie durch `hueter` nachgerechnet). `test/einheit/datum-kalender.test.ts` nutzt das korrigierte Paar plus `1700-03-01 jul. = 1700-03-12 greg.` als Beleg des Elf-Tage-Sprungs. `docs/arbeitspakete.md` im selben PR nachgezogen; die externe Quelle `../Wissen/57` wird separat angeglichen. | AP-1.1 PR-A |
| U-AP1.3a | **IMP-Codes bewusst nicht in `ALLE_FEHLERCODES` gemischt** — §7 verlangt für jeden `FehlerCode` einen i18n-Eintrag; die neue geschlossene Union `ALLE_IMP_CODES` (`src/shared/import/imp-codes.ts`, IMP-101…IMP-107) ist eine EIGENE Liste. | Getrennt gehalten: `ALLE_FEHLERCODES` bleibt die AppFehler-/IPC-`Ergebnis<T>`-Union (§7); die IMP-Codes sind Berichtsbefunde eines Prüflaufs (`pruefeStufe1`) über eine Importdatei, kein Anwendungsfehlerzustand. Eigener i18n-Namensraum `src/shared/i18n/de/import.json` (Schlüssel `import.fehler.IMP_101` … `IMP_107`, je `titel`/`beschreibung`/`was_tun` nach §5), eigener Vollständigkeitstest statt Erweiterung von `i18n-vollstaendig.test.ts`. | AP-1.3a |
| U-AP1.3a-i18n | **`import.json` (wie zuvor `datum.json`, U-AP1.1) ohne Renderer-Namensraum-Registrierung** — es gibt vor der Import-Oberfläche (frühestens AP-1.4b) noch keinen Bildschirm, der den Namensraum `import` braucht. | Bewusst verschoben: `src/renderer/i18n/einrichten.ts` bleibt unverändert; die Registrierung ist eine Ein-Zeilen-Ergänzung, sobald ein Renderer-Baustein den Namensraum tatsächlich anzeigt. | AP-1.3a |
| U-AP1.3a-cov | **Lücken in der fixturebasierten Gleichwertigkeit (Ajv/Zod)** — der Fixture-Korpus (AP-1.3a) deckt ~8 Constraint-Familien nicht ab: `koordinaten`-Grenzen (lat/lon min/max), `doppeljahr`-Muster, `kategorie: krebs` → `organ`-Pflicht, `umschrift_von` → `umschrift_norm`-Pflicht, Konfidenz-/`alter_bei_diagnose`-Grenzwerte, `externe_ids.system`-Enum, Aussage-`anyOf` (`wert_text`/`wert_zahl`/`wert_ref`). Vom `hueter` einzeln am Zod-/JSON-Schema-Quellcode geprüft und divergenzfrei befunden — aber ohne eigene Fixture bliebe eine künftige Divergenz in genau diesen Familien vom Gleichwertigkeitstest unbemerkt. | **Folge-PR:** je Constraint-Familie mindestens eine gezielte Grenz-Fixture unter `fixtures/import/v1/fehlerhaft/` (bzw. eine zusätzliche `gueltig/`-Variante an der Grenze) ergänzen, konsistent mit der bestehenden „kein Generator, handgeschriebene Fixtures"-Linie aus AP-1.3a. Kein Blocker für AP-1.3a selbst — die Fitnessfunktion ist für den bestehenden Korpus bereits scharf, die Lücke betrifft nur ungetestete zusätzliche Familien. | AP-1.3a, hueter-Review PR #55 |
| U-AP1.3b-kanal | **Kanalname für die Stufe-1/2-Prüfung** — der AP-1.3b-Auftrag nannte `befehl:import.pruefen`. | Registriert als **`abfrage:import.pruefen`** (`ein: { pfad: string }`, `aus: PruefBericht`, `src/shared/ipc/{kanaele,vertrag}.ts`, `src/main/ipc/registrierung.ts`). | Die Prüfung schreibt nichts (kein `BEGIN`, kein Journal, keine `aenderung`-Zeile) — `befehl:`-Kanäle sind laut `docs/architektur.md` §11/ADR-016 für mutierende, journalisierte Vorgänge reserviert. Ein lesender Vorgang gehört unter `abfrage:`, auch wenn er (wie hier) mehrere Prüfschritte kapselt. | AP-1.3b |

---

## 10. Neu aus dem Codereview (14.09.2026)

| ID | Frage | Stand |
|---|---|---|
| U-R1 | **Ruleset „Standard" bindet nichts.** Bypass-Actor ist die Repository-Rolle *Admin* im Modus `always`, und `required_signatures` wird von jedem Commit verletzt (keiner ist signiert). Entweder Commit-Signierung einrichten (SSH-Signing, ~5 Minuten) oder `required_signatures` aus dem Ruleset nehmen. Beides ist besser als zwölf „Bypassed rule violations" pro Kettenlauf — in dem Rauschen geht die eine echte Verletzung unter. | offen, Eigentümerentscheidung |
| U-R2 | **Merge-Gate serverseitig statt per Skript.** Die drei Jobs (`pruefen (macos-latest)`, `pruefen (windows-latest)`, `langsame Gates`) als `required_status_checks` ins Ruleset. Dann verhindert der Server den Rot-Merge, statt dass ein Mensch oder `gh pr checks` ihn verhindern soll. Macht den maschinellen Weg aus `CLAUDE.md` §9 überflüssig. | offen, Eigentümerentscheidung |
| U-R3 | **Repo ist öffentlich.** `CLAUDE.md` §9 sagte „privates Repo" — korrigiert. Personendaten liegen keine im Repo (Fixtures sind generiert), aber die Sichtbarkeit sollte eine bewusste Entscheidung sein, keine übersehene. | benannt, Entscheidung offen |

---

## 11. Design-Fundament übernehmen (Querläufer, `Wissen/58`)

Abweichungen zwischen dem Roh-Design-Export und `71_Designsystem.md` §1, beim Übertragen des Token-Vertrags nach `src/renderer/gestaltung/tokens.css` (CLAUDE.md §14: weiterbauen und vermerken, nicht stillschweigend füllen oder ignorieren).

| ID | Punkt | Stand |
|---|---|---|
| U-DF1 | **17 additive Tokens im Export, die §1 nicht benennt** — übernommen, weil sie dem Namensschema `--wz-…` folgen und von Bildschirmentwürfen gebraucht werden, ohne eine §1-Rolle umzubenennen: §1.8-Mehrsprachigkeit (`--wz-sprachen-ui`, `--wz-name-hauptname-marke`, `--wz-name-transliteration`, `--wz-name-schrift-etikett`), Typo-Helfer (`--wz-laufweite-titel-gross`, `--wz-laufweite-beschriftung`, `--wz-ziffern-tabelle`), Fokus-/Strich-Details (`--wz-rahmen-fokus-breite`, `--wz-rahmen-fokus-versatz`, `--wz-rahmen-gestrichelt-muster`), nachgetragene Datenrollen (`--wz-daten-kante`, `--wz-rahmen-verweis`, `--wz-flaeche-verweis`, `--wz-daten-spanne-belegt`, `--wz-daten-spanne-moeglich`, `--wz-rahmen-raster`, `--wz-muster-erinnerung`) und `--wz-trefferflaeche-min`. | vermerkt — Vorschlag: in `71` §1 aufnehmen |
| U-DF2 | **`--wz-beleg-*`-Tokens fehlen in der Tokenquelle.** `00_INDEX_Design.md` nennt `--wz-beleg-selbst-erlebt-*` / `--wz-beleg-hoerensagen-*` als Teil der Tokenkategorien, sie stehen aber **nicht** in der maßgeblichen `Wurzelwerk Designsprache.dc.html`, sondern nur in den Bildschirm-Dateien, und `71` §1 benennt sie nicht. Nicht übernommen (Quelle laut Auftrag ausschließlich die Designsprache-Datei). | offen — gehören Beleg-Rollen ins Token-Fundament? |
| U-DF3 | **Benennung der Abstände.** `71` §1.4 schreibt „`--wz-abstand-0` bis `--wz-abstand-24`", listet aber 13 Werte bis 96. Der Export benennt **nach Wert** (`--wz-abstand-96` …), konsistent mit der Werteliste; das Quelldokument markiert diese Benennung selbst als Abnahmepunkt. Export-Benennung übernommen. | vermerkt — Benennung nach Wert bestätigen |
| U-DF4 | **Diagnose-Kategorien folgten dem Export statt dem Schema (§14 Fall 2 — Review PR #48, „B1").** Der Design-Export (`Wurzelwerk Designsprache.dc.html`) führt `--wz-daten-diagnose-{nerven-psyche, bewegung, verdauung, sinne}`. Bindend ist aber die ausgelieferte CHECK-Bedingung `diagnose.kategorie` in `docs/schema/0002_kern.sql` (Schema v1, seit AP-0.6 auf `main`, in jeder migrierten DB aktiv): `herz_kreislauf, krebs, stoffwechsel, neuro_psych, atemwege, nieren, autoimmun, angeboren_genetisch, infektion, unfall, sonstiges`. Die Bausession hatte den Export **treu** übertragen (Fall 2, nicht Fall 1). Repo angeglichen (`neuro-psych/nieren/autoimmun/angeboren-genetisch`, Werte umgehängt); der Test leitet die Liste jetzt aus dem Schema-CHECK ab, damit künftige Divergenz rot wird (ADR-025). | **Repo behoben (PR #48).** Offen: **die Designquelle nachziehen** — sonst holt der nächste Export→Bildschirm-Bau den Fehler zurück. |
| U-DF5 | **Latent dieselbe Fehlerklasse bei `--wz-daten-beziehung-*` (Review-Nachtrag PR #48).** Tokens: `biologisch, adoptiv, stief, pflege, ehe, partnerschaft, geschieden, ungesichert`. Der ausgelieferte `elternschaft.typ`-CHECK (`0002_kern.sql:163`) führt `biologisch, adoptiv, stief, pflege, zieh, anerkannt, leihmutter, unbekannt` — `zieh/anerkannt/leihmutter/unbekannt` kommen in `70/71/72` **kein einziges Mal** vor (weder Kantenform §6 noch Farbe), und drei Tokens (`ehe/partnerschaft/geschieden`) sind keine Elternschaftstypen (Ehe/Scheidung sind Kantenformen §6 auf der Partner-/Ereignisseite). §1.2 bindet `-beziehung-` — anders als `-diagnose-` — an keine konkrete Schema-Enum, daher kein Test-Zwang. | **nicht blockierend** (Graph/Kanten erst Phase 2). Vor dem Kanten-Rendering Beziehungspalette gegen `elternschaft.typ` / `partnerschaft.typ` / §6-Kantenformen abgleichen. |
| U-DF6 | **Farbliteral-Prüfung erfasst nur `.css` und kein modernes Farbmodell (Review „D1").** `keine-literale.test.ts` fängt `#hex/rgb()/hsl()`, nicht `oklch()/oklab()/lab()/lch()/color()` und keine benannten Farben (`white`), und scannt nur `.css` — nicht `.tsx/.ts`. §1.7 Regel 2 gilt aber für „Komponentendateien", die ab AP-1.6 als `.tsx` mit möglichen Inline-Styles entstehen. | offen — **vor AP-1.6** auf `.tsx/.ts` ausweiten und um die modernen Farbmodelle + benannte Farben ergänzen. |
| U-DF7 | **`tabular-nums` beim UI-Font ist ein No-op (Review-Genauigkeit).** Source Sans 3 (`--wz-familie-ui`, trägt `--wz-schrift-zahl-tabelle`) hat **kein `tnum`-GSUB-Feature**; `--wz-ziffern-tabelle: tabular-nums` bewirkt dort nichts. Spalten tanzen trotzdem nicht, weil die Default-Ziffern von Source Sans 3 bereits gleiche Laufweite haben (Advance 472). Source Serif 4 hat echtes `tnum`, IBM Plex Mono ist monospaced. | vermerkt — Ergebnis korrekt; bei einem Font-Wechsel mit proportionalen Default-Ziffern trägt der Token die Zusage nicht. |
| U-DF8 | **Datenpaletten-Kontrast/CVD-Gate (D3) + Palette nachgestimmt.** `test/gestaltung/datenpaletten.test.ts` prüft §1.2 maschinell in beiden Themen (R1 ≥3:1 Fläche, R2 ≥4,5:1 Text, R3 ΔL*≥8 Konfidenz, R4 ΔE76≥5 unter Deuteranopie/Protanopie; Formelquellen im Kopf). Gegen die echten Werte war **R2 rot**; sechs text-tragende Hell-Flächen nachgedunkelt (`generation-6/-8`, `geschlecht-u`, `diagnose-autoimmun/-angeboren-genetisch/-sonstiges`; ΔL* 1–2, Farbton erhalten). **R2-Umfang** (Nutzerentscheid): nur text-tragende Flächen; `konfidenz` (Punkte, §2.1) und `beziehung` (Kanten, §5) tragen keinen Text und sind ausgenommen. | **Gate grün.** Offen: die **dunkle Konfidenzrampe** erfüllt R1∧R2∧R3 nicht zugleich (R1 verlangt L*≥50, R3 ≤49,8, R2 ≥56/≤44 — unlösbar ohne hellere Neuspreizung aller vier Stufen); bewusst vertagt, weil das die eingefrorene Ordinalpalette sichtbar ändert. |

**Review-Ergebnis (PR #48 — `hueter` + mechanische Verifikation):** U-DF4 (B1), die Deckung der Systemvorgabe (D2: `@media(prefers-color-scheme: dark)` deckungsgleich mit `[data-theme="dunkel"]`), die Beleg-Rollen (U-DF2) und das Datenpaletten-Gate (U-DF8/D3) sind im PR umgesetzt — je eigener Commit, Rot-Beleg vorab (eiserne Regel §5). Die Zählung im PR-Rumpf ist korrigiert: **139 §1-Rollen + 18 additiv = 157 `:root`-Deklarationen** (die frühere „140" zählte `--wz-schrift-koerper` doppelt — es ist zugleich §1.3-Typo-Rolle und §1.6-Dichtetoken).

---

## 12. Beleg-/Konfidenz-Anbindung an Schema (Kettenlauf-Halt, 17.09.2026)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.4a-beleg** | ~~Befund: Schema v1 habe kein Heim für `belege`/`konfidenz` an Person/Ereignis/Kante.~~ **GESCHLOSSEN 17.09.2026 — der Befund war falsch.** `aussage` (`0002_kern.sql:316`) nimmt alle vier Subjekttypen auf und trägt `konfidenz`; `aussage_zitat` (:344) ist die Belegverknüpfung; die abgeleitete Schicht liest die Personenkonfidenz **bereits** aus `aussage` (`0003_abgeleitet.sql:65`, gehalten von `abl_aussage_ai/au/ad` seit AP-0.7, abgesichert durch `abgeleitet-gleich`). `konfidenz`-Spalten an der Entität wären toter Ballast oder erzwängen einen Umbau von AP-0.7; eine `entity_zitat`-Tabelle legte einen zweiten Belegpfad neben `aussage_zitat`. Zudem ist `$defs/Beleg` spaltenweise die `zitat`-Tabelle, nicht die hier angenommene `typ`/`inhalt`/`quelle`-Form. **Entschieden:** keine `konfidenz`-Spalten, keine `entity_zitat`; Existenzbehauptung als Aussage (`praedikat='existenz'`, `wert_text='ja'`) — **ADR-026**, Konvention in `50` §2.7. `elternschaft.konfidenz` wird nicht mehr geschrieben (nullable, keine Migration). **Ersetzt durch U-1.4a-luecken.** | — | — | AP-1.4a, Prüfbericht 17.09.2026 |
| **U-1.4a-luecken** | ~~Die Migration, die es wirklich braucht.~~ **GESCHLOSSEN 17.09.2026.** Vier Vertragsfelder ohne Ziel im Schema — `$defs/Beleg.zeitmarke_sekunden` (8× in `beispiel-3-interview.json`), `$defs/Person.unsicherheit` (Pflicht bei `konfidenz ≤ 2`, IMP-206), `$defs/Aussage.unsicherheit` (≠ `begruendung`), `$defs/Aussage.gueltig_von`/`gueltig_bis` (A-08, benutzt in `beispiel-1-einfach.json:70/213`) — sowie ein geschlossenes CHECK auf `aussage.subjekt_typ`, das `diagnose` und `risikofaktor` aussperrte, obwohl `56` §2.3 für beide `belege` verlangt. | **Umgesetzt in AP-1.3c**, `docs/schema/0005_import_luecken.sql`: vier `ALTER TABLE ... ADD COLUMN` + CHECK-Erweiterung (6→8 Werte) per Tabellenneubau von `aussage` (Details und das dabei gefundene, sanktionierte Drei-Phasen-Neubaumuster: ADR-026-Nachtrag). Alle fünf in **einer** Migration, wie geplant. | Keine — Migration angewendet, `test/migration/import-luecken.test.ts` deckt Aufstieg, Datenerhalt und CHECK-Grenze ab. | AP-1.3c (erledigt) |
| **U-1.4a-icd10** | `diagnose.icd10` existiert als Spalte (`0002_kern.sql:497`), obwohl `56` §3.7 „**Kein ICD-10**" sagt (E24). | **Hingenommen.** Eine Spalte zu viel, die niemand füllt; sie zu entfernen wäre in SQLite ein zweiter Tabellenneubau. Bei der nächsten ohnehin fälligen Aufräummigration mitnehmen. | nicht blockierend | AP-1.3c, Prüfbericht 17.09.2026 |

---

## 13. Trockenlauf, Bericht, Plausibilität (AP-1.4a, kopflos)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.4a-imp302-beispiel2** | ~~`beispiel-2-widersprueche.json` trug für `tmp:erna` kein Geburtsdatum, wodurch die absichtlich falsche Elternkante `elternschaften[1]` (`tmp:august -> tmp:erna`) mit einer korrekten IMP-302-Implementierung nicht auslösen konnte.~~ **GELÖST — Fixture vervollständigt (Erna 1896).** Alle drei Kopien (`fixtures/import/v1/gueltig/`, `docs/56_Beispiele/`, `../Wissen/56_Beispiele/`, synchron gehalten) bekamen ein neues `ereignisse[]`-Element `tmp:e-geb-erna` (Geburt, exakt 1896 — der Sollwert aus `56_Import_Vertrag.md` §6.2: August „geb. etwa 1890" + 6 Jahre). `zusammenfassung.ereignisse` entsprechend auf 2 angehoben (IMP-105 bleibt grün, `import-schema-zod-gleich`/`import-zusammenfassung` unverändert grün). Der Trockenlauf-Bericht meldet jetzt genau EINEN Stufe-3-Fund: IMP-302 auf `elternschaften[1]` ("Elternteil wäre 6 Jahre alt gewesen") — nicht auf `elternschaften[0]` (Platzhaltervater ohne Geburtsdatum). | Keine offene Abweichung mehr. | `test/einheit/trockenlauf-bericht.test.ts` (aktualisiert), `test/einheit/plausibilitaet.test.ts` (unverändert, deckt IMP-302 zusätzlich isoliert ab). | Erledigt — Kettenlauf-Folgeauftrag, 17.09.2026 |
| **U-1.4a-blocklabel** | §14: Die sieben/acht Blocklabels des Trockenlauf-Berichts (`ZUSAMMENFASSUNG`, `WIRD ANGELEGT`, …, `GESUNDHEITSDATEN`, `src/main/import/bericht.ts`) stehen als deutsche String-Konstanten im Code, nicht über `i18next`/`src/renderer/i18n/de/`. | Wie zuvor bei `datum.json` (U-AP1.1): Es gibt vor der Import-Oberfläche (frühestens AP-1.4b) keinen Bildschirm, der diese Texte anzeigt — `bericht.ts` ist ein kopfloses Textartefakt (`alsText()`), kein UI-Baustein. | Keine Auswirkung auf AP-1.4a (keine Oberfläche in diesem AP). | Bei AP-1.4b: Blocklabels in `src/shared/i18n/de/import.json` überführen, `alsText()`/Renderer-Anzeige darauf umstellen. |
| **U-1.4a-imp-codes-erweiterung** | `ALLE_IMP_CODES` (`src/shared/import/imp-codes.ts`) wächst um IMP-301…IMP-310 (Stufe 3) und IMP-401…IMP-404 (Stufe 4) — `Befund.schweregrad` wird von der Literalunion `'fehler'` auf `'fehler' \| 'hinweis'` erweitert (additiv, s. U-AP1.3a: IMP-Codes bleiben bewusst eine von `ALLE_FEHLERCODES` getrennte Union). | Keine neue Entscheidung nötig — folgt demselben, bereits in U-AP1.3a begründeten Muster. Hier nur vermerkt, weil `pnpm test` (`import-fehlercodes-stufe1.test.ts`s Vollständigkeitscheck über `ALLE_IMP_CODES`) dadurch automatisch verlangt, dass JEDER neue Code einen `import.json`-Eintrag (`titel`/`beschreibung`/`was_tun`) bekommt — erledigt in diesem PR. | Keine. | — |

---

## 14. Import ausführen, Herkunft, Rücknahme (AP-1.5 PR-A, hueter-Auflage PR #62)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.5-imp502-503** | `56_Import_Vertrag.md` §4 Stufe 5 nennt IMP-502 („Mediendatei nicht kopierbar") und IMP-503 („Schnappschuss vor dem Import fehlgeschlagen") als Ausführungsfehler des ECHTEN Imports — aber `ALLE_IMP_CODES` (`src/shared/import/imp-codes.ts`) endet bei IMP-404: Stufe 5 ist kein Berichtsbefund eines Prüflaufs (die Sondierung ist zu diesem Zeitpunkt bereits erfolgreich durchlaufen), sondern ein Fehlerzustand der Anwendung während der Echtschreibung. | Als eigene `FehlerCode`s umgesetzt (dasselbe Trennungsmuster wie U-AP1.3a): `IMPORT_MEDIUM_NICHT_KOPIERBAR` (IMP-502, geworfen in `src/main/import/medienkopie.ts`) und `IMPORT_SCHNAPPSCHUSS_FEHLGESCHLAGEN` (IMP-503, geworfen in `src/main/befehle/import-ausfuehren.ts`), mit `titel`/`was_tun`-Einträgen in `src/shared/i18n/de/fehler.json` (§7). `ALLE_IMP_CODES` bleibt unverändert. | `test/einheit/i18n-vollstaendig.test.ts` verlangt beide Einträge automatisch — erledigt im selben PR. | Keine. |
| **U-1.5-medium-dateiname** | Der AP-1.5-Auftrag listete `src/main/repositories/medium-repo.ts` nicht unter den zu ändernden Dateien — aber das Ergebnis der Medienkopie (`medienkopie.ts`, Originaldateiname) braucht ein Ziel in der Datenbank, sonst wäre die Abnahme „Mediendateien werden kopiert" nicht nachweisbar. | Ergänzt: die Spalte `medium.dateiname` existiert bereits im ausgelieferten Schema (`docs/schema/0002_kern.sql`, Migration v2, seit AP-0.6 auf `main`) und war bisher ungenutzt (Kopfkommentar von `medium-repo.ts`: „entstehen erst beim Dateikopieren, AP-1.5"). Sie wird jetzt beim Import befüllt — **keine neue Migration nötig**, reine Nutzung einer schon vorhandenen Spalte. | `MediumEinfuegenEin` trägt zusätzlich `dateiname: string \| null`; bestehende Aufrufer/Tests (AP-1.3d, Default `null` ohne Medienauflösung) bleiben unverändert grün. | Keine. |
| **U-1.5-ipc-reconnect** | Nach einer Großimport-Rücknahme (`importZuruecknehmen()` in `src/main/journal/undo.ts`, ADR-019) schließt `undo()` das übergebene `db`-Handle intern (Datei-Wiederherstellungsweg: aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite`, Schnappschuss zurückkopieren) und öffnet es NICHT wieder. Der IPC-Handler `befehl:journal.undo` (`src/main/ipc/registrierung.ts`) reicht dieses jetzt geschlossene Handle danach unverändert an `journalStatusMelden(db)` weiter. | **Bewusst nicht in AP-1.5 PR-A behoben.** Der volle Reconnect (`src/main/projekt/projekt-dienst.ts` müsste seinen globalen `offenesProjekt`-Zustand nach einer Großimport-Rücknahme neu öffnen, analog zu `schnappschussWiederherstellen()`) ist ein Umbau der Projekt-Lebenszyklus-Verdrahtung — kein Teil des im AP-1.5-Auftrag genannten Dateiumfangs, und von keinem der vier geforderten Unit-Tests berührt (die rufen `importAusfuehren()`/`undo()` direkt auf einer eigenen Testverbindung auf, nicht über die IPC-/`registrierung.ts`-Schicht). | Betrifft ausschließlich den echten IPC-Pfad der laufenden Electron-App (Menü „Rückgängig" nach einem Großimport) — die vier AP-1.5-Einheitstests sind davon nicht betroffen und bleiben aussagekräftig. | **Offen — muss vor Nutzererreichbarkeit über einen IPC-/E2E-Nachzug geschlossen werden**, z. B. im Zuge von AP-1.4b/der Import-Ansicht: `befehl:journal.undo` muss nach einer erkannten Großimport-Rücknahme `projektSchliessen()`/`projektOeffnen()` erneut durchlaufen, statt das alte Handle weiterzureichen. |

---

## 15. Listenansicht — Atome (AP-1.6 Stufe 2, CLAUDE.md §14)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.6-ladeschimmer-statisch** | §14 Fall 2: Der Atomname `Ladeschimmer` (`71` §2.1, Formen Zeile·Block·Kreis) impliziert eine über die Fläche laufende Animation — aber `71` §1.5 erlaubt ausdrücklich nur fünf bewegte Fälle (Baum ein-/ausklappen, Zoom, Zeitregler, Überlagerung, Seitenschublade) und verbietet wörtlich „einen Ladebalken, der sich bewegt, ohne Fortschritt zu kennen". Ein Lade-Skelett kennt seinen Fortschritt nie — die beiden Regeln widersprechen sich für genau dieses Atom. | `src/renderer/bausteine/ladeschimmer.tsx` ist **statisch**: eine ruhige Platzhalterfläche (`--wz-flaeche-hover`) ohne Animation, Grund im Kopfkommentar von `ladeschimmer.css` vermerkt. Der Name bleibt (Inventarname aus §2.1, keine neue Bezeichnung erfunden), das Verhalten weicht ab. | Erfüllt den „lädt"-Zustand aus S-05, ohne die Bewegungssperrliste zu verletzen. | Keine — reine Designentscheidung, keine Scope-Frage. Bei einer künftigen Designüberarbeitung von §1.5 (z. B. eine sechste erlaubte Bewegung „dezenter Ladeplatzhalter") ließe sich eine echte Schimmer-Animation nachrüsten. |
| **U-1.6-atome-scope** | Die Beispielliste möglicher Atome für Liste/Suche nannte u. a. „Ikonknopf" (`SchaltflaecheSymbol`), „Auswahlfeld", „Leerzustandsblock" und einen Trefferzähler. Gebaut wurden nur die sieben Atome, die S-05 (Konfidenzspalte, Platzhalter-/Privat-Filter, „lädt"-Zustand) unmittelbar braucht: `Text`, `Schaltflaeche`, `Eingabekoerper`, `Umschalter`, `KonfidenzPunkt`, `WiderspruchZeichen`, `Ladeschimmer`. | Bewusst **nicht** gebaut: `SchaltflaecheSymbol`/`Symbol` (kein Symbolsatz ausgeliefert, `71` §6 „Symbolsatz … Phase 0" — ein Icon-Atom bräuchte erfundene Icons, das widerspräche §14 „keine neue visuelle Sprache erfinden"); `Auswahlfeld`/`Leerzustandsblock` (beides **Moleküle** aus `71` §2.2, nicht Atome aus §2.1 — gehören zur Stufe, die die eigentlichen `tabelle.tsx`/`suchfeld.tsx`-Bausteine baut); `Zaehler` (hängt am Suchfeld-Trefferzähler, der noch keinen Konsumenten hat); `Kontrollkaestchen`/`Abzeichen`/`Trennlinie`/`TastenKappe`/`Fortschritt`/`Optionsfeld` (kein S-05-Pflichtbedarf in dieser Stufe). | Keine — nächste AP-1.6-Stufe (Moleküle/Organismen) entscheidet dort neu, mit echten Konsumenten. | Bei Bedarf vor der nächsten Stufe erneut gegen S-05 abgleichen. |

---

## 16. Listenansicht — Moleküle und Datentabelle (AP-1.6 Stufe 3, CLAUDE.md §14)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.6-spalten-datenvertrag** | `72_Screens_und_Flows.md` S-05 nennt als Spalten „Name · Lebensdaten · Geburtsort · Beruf · Konfidenz · Belege · Kinderzahl · benutzerdefinierte Felder". `PersonListeZeile` (`src/shared/schemata/person-liste.ts`, AP-1.6 Stufe 1) trägt aber nur `anzeigename`, `geburt_jahr`/`tod_jahr`, `geburt_ort_name` sowie die Konfidenz-/Widerspruchsfelder — Beruf, Belegzahl, Kinderzahl und benutzerdefinierte Felder gibt es im Abfragevertrag noch nicht. §14 Fall 1 (geplante Funktion ohne Datengrundlage), keine Design-Lücke, sondern eine Datenvertrags-Grenze. | `datentabelle-spalten.ts` kennt nur die vier vorhandenen Spalten (`name`, `lebensdaten`, `geburtsort`, `konfidenz`). Keine erfundenen Platzhalterspalten für Felder, die der Vertrag nicht liefert. | Die Spaltenwahl-Logik (`spalteUmschalten`) ist bereits reduzierbar/erweiterbar gebaut — sobald der Vertrag weitere Felder trägt, ergänzt eine künftige Stufe nur `ALLE_DATENTABELLE_SPALTEN` und `SPALTEN_BREITE`. | Nicht vorgreifen (§10) — offen, bis ein AP den Abfragevertrag um Beruf/Belege/Kinderzahl/benutzerdefinierte Felder erweitert. |
| **U-1.6-lebensdaten-unschaerfe** | S-05 verlangt explizit eine entworfene Beispielzeile „etwa 1890 – 1961" (Unschärfe-Modifikator sichtbar). `PersonListeZeile.geburt_jahr`/`tod_jahr` sind einfache `number \| null` ohne Modifikator-/Präzisionsinformation. | `lebensdatenAnzeige()` (`datentabelle-format.ts`) zeigt nur den Jahreswert, ohne einen erfundenen „etwa"-Zusatz vorzutäuschen, wo keine Unschärfe-Information vorliegt. | Die Tabelle zeigt echte, aber ungenauere Information als der Entwurf zeigt — besser als eine erfundene Genauigkeitsangabe. | Der volle Datumsvertrag (`src/core/datum`) kennt Modifikator/Präzision bereits — eine künftige Stufe kann `PersonListeZeile` um ein `geburt_modifikator`-Feld erweitern und `lebensdatenAnzeige()` entsprechend schärfen. |
| **U-1.6-sortierspalten-kollaps** | `PersonListeSortierungEnum` kennt vier Sortierschlüssel (`nachname`, `vornamen`, `geburt`, `tod`), S-05 zeigt aber nur zwei sichtbare Spalten dafür (Name, Lebensdaten). Eine 1:1-Zuordnung Spalte↔Sortierschlüssel geht nicht auf. | Jede sichtbare Spalte bekommt genau einen Sortierschlüssel als Vorgabe (Name→`nachname`, Lebensdaten→`geburt`) — die jeweils andere Achse (`vornamen`/`tod`) ist über die Kopfzelle vorerst nicht erreichbar. §14 Fall 2: an das angepasst, was eine einzelne Kopfzelle eindeutig leisten kann. | Sortierung nach Vorname oder Sterbejahr bleibt möglich (der Vertrag trägt es), nur nicht per Klick auf genau diese beiden Spalten in dieser Stufe. | Eine spätere Stufe könnte eine Sortiermenü-Erweiterung (Rechtsklick/Chevron an der Kopfzelle) für die zweite Achse ergänzen — kein Scope-Punkt dieser Stufe. |
| **U-1.6-gestrichelt-dom** | `--wz-rahmen-gestrichelt-muster: 4px 2px` (`71` §1.1) ist laut Kommentar „Muster ist Teil des Tokens" — das liest sich wie eine SVG-`stroke-dasharray`-Spezifikation, aber `Tabellenzeile` ist eine DOM-Zeile. | `tabellenzeile.css` nutzt `border-style: dashed` mit der Rahmenfarbe des Tokens; das exakte 4px/2px-Muster wird nicht nachgebildet (kein `background-image`-Gradienten-Hack, der auf jedem Zoomlevel/Theme anders aussähe als andere gestrichelte Elemente). | Platzhalterzeilen sind sofort als gestrichelt erkennbar (A-17-Anforderung erfüllt), nur die exakte Strichlänge weicht vom Token-Kommentar ab. | Wird relevant, sobald die Baumansicht (Phase 2, SVG-Kanten) dasselbe Token für `stroke-dasharray` verwendet — dann zwei Konsumenten, ein Token, zwei Annäherungen; ggf. zwei Tokens (`--wz-rahmen-gestrichelt-svg`/`-dom`) im Designreview klären. |
| **U-1.6-leerzustand-ohne-symbol** | `71` §2.2 beschreibt `LeerzustandBlock` als „Symbol + Satz + Aktion". Kein Symbolsatz ausgeliefert (§6 Phase-0-Asset, wie schon in §15 für die Atome vermerkt). | `LeerzustandBlock` rendert ohne Symbol — Titel/Text/Aktion tragen die Bedeutung allein, kein erfundenes Icon. | Konsistent mit der Stufe-2-Entscheidung, kein Bruch der visuellen Sprache. | Nachrüstbar, sobald ein Symbolsatz existiert — keine Scope-Frage. |
| **U-1.6-zaehler-nicht-gebaut** | `71` §2.2 listet `Zaehler` als eigenständiges Molekül; der Auftrag nannte es „ggf." (optional). | Nicht als eigenes Molekül gebaut — Suchfeld (`suchfeld_treffer`) formatiert seine Trefferzahl direkt über i18n-Interpolation, ohne ein wiederverwendbares `Zaehler`-Molekül dazwischenzuschalten. | Keine zusätzliche, noch konsumentenlose Komponente (§10 „keine Moleküle, die S-05 nicht braucht"). | Sobald ein zweiter Konsument mit echtem Formatierungsbedarf (z. B. Fußzeile „1.284 Personen") ansteht, lohnt die Extraktion. |
| **U-1.6-filterleiste-vier-filter** | S-05 nennt als Filterleiste „Platzhalter, `privat`, Konfidenzstufe, „hat Widerspruch", Zeitraum, Ort, Strang" — sieben Filter. `PersonListeFilter` (Stufe 1) kennt nur die ersten vier. | `Filterleiste` baut genau die vier vom Vertrag getragenen Filter. Zeitraum/Ort/Strang fehlen bewusst. | Deckt den aktuellen Abfragevertrag vollständig ab, ohne UI für nicht existierende Filterfelder vorzutäuschen. | Nicht vorgreifen (§10) — wird nachgezogen, sobald `PersonListeFilter` um diese Felder erweitert wird. |

---

## 17. Listenansicht — Verdrahtung (AP-1.6 Stufe 4, CLAUDE.md §14)

| ID | Befund / Frage | Entscheidung | Konsequenz | Offen |
|---|---|---|---|---|
| **U-1.6-suche-ohne-filter-sortierung-seite** | `abfrage:suche` (Stufe 1, `SucheEin`) kennt nur `text`/`grenze` — keine Filter, keine Sortierung, keine Seite. `ListenAnsicht` zeigt Filterleiste und Spaltenkopf-Sortierung aber auch während einer aktiven Suche weiter an (§14 Fall 2: kein Kontrollelement verschwindet mitten in der Bedienung). | Filter/Sortierzustand bleiben während einer Suche im Zustand erhalten und wirken sofort wieder, sobald das Suchfeld geleert wird — sie wirken aber NICHT auf die aktuell angezeigten Suchtreffer (der Vertrag trägt sie dort nicht). Die Blätterleiste wird während einer aktiven Suche ausgeblendet, statt eine nicht existierende Seitenzahl vorzutäuschen. | Kein stillschweigend wirkungsloses Bedienelement (Sortierklick tut während der Suche sichtbar nichts an der Trefferliste), aber auch keine UI, die während der Suche komplett verschwindet und die Bedienung unterbricht. | Eine künftige Erweiterung von `abfrage:suche` um Filter/Sortierung/Seite (falls Bedarf entsteht) macht diese Lücke überflüssig — kein Scope-Punkt dieser Stufe. |
| **U-1.6-start-liste-zustand** | `72`/`70` treffen keine Aussage, WIE zwischen Start- und Listenansicht gewechselt wird (kein Router im Scope, CLAUDE.md §10 „kein Mehrbenutzerbetrieb" o. ä. nennt das nicht explizit, aber Phase 1 hat sonst keinen zweiten Bildschirmwechsel). | `App` hält einen einfachen `ProjektInfo \| null`-Zustand und rendert `StartAnsicht`/`ListenAnsicht` bedingt — kein React-Router, keine URL. Die Start-Ansicht meldet ein geöffnetes Projekt nur noch über einen Callback nach oben, statt selbst einen „Projekt offen"-Zustand zu zeigen. | Konsistent mit „kein Router erfinden, wenn ein einfacher Zustand reicht" (Auftragstext AP-1.6 Stufe 4). | Keine — reine Verdrahtungsentscheidung, kein Scope-Punkt. Eine spätere Ansicht (Profil, S-07) kann denselben Musteransatz (Zustand in `App` oder ein spezialisierter Ansichts-Stack) fortführen oder durch einen Router ablösen, sobald mehr als zwei Ansichten existieren. |
| **U-1.6-e2e-fixture** | `test/e2e/ablauf-01-import-und-liste.spec.ts` (Stufe 4) importierte ursprünglich zur Laufzeit eine abgeleitete tmp-Kopie von `fixtures/import/v1/gueltig/beispiel-3-interview.json`: die eingecheckte Originaldatei referenziert eine bereits vorhandene `db:018f2c44-…`-Person und eine nicht mitgelieferte Audiodatei (§2.1, IMP-202/IMP-208) und ist darum in einem frischen Projekt nicht fehlerfrei importierbar — der Einheitstest `test/einheit/import-schreiben-belege.test.ts` braucht aber genau diese `db:`-Referenz und darf die Datei nicht verlieren. | **Gelöst (18.09.2026):** eine eigene, self-contained e2e-Fixture `test/e2e/fixtures/import-erna-und-walter-wruck.json` (+ Platzhalter-Audiodatei `test/e2e/fixtures/audio/erna-wruck-interview.m4a`) eingecheckt — inhaltlich abgeleitet aus `beispiel-3-interview.json` (dieselben zwei Personen, Erna und Walter Wruck), aber mit `db:` → `tmp:erna` aufgelöst und mitgelieferter Audiodatei statt Laufzeit-Ableitung. Bewusst NICHT unter `fixtures/import/v1/gueltig/` (das `import-schema-zod-gleich.test.ts` und `import-fehlercodes-stufe1.test.ts` vollständig durchlaufen — eine zusätzliche Datei dort nähme ungewollt an deren Prüfungen teil), sondern unter `test/e2e/fixtures/`, das keine andere Suite einsammelt. Die eingecheckte Originaldatei bleibt unverändert. | Der e2e-Test liest keine Laufzeit-generierte Datei mehr — die Fixture ist wie jede andere eingecheckte Testfixture versionierbar und diffbar. | Keine offene Abweichung mehr. |
