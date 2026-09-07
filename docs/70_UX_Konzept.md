# Wurzelwerk — UI/UX-Konzept

Grundlage für die Designarbeit (Claude Design / Figma). Dieses Dokument beschreibt Struktur und
Prinzipien, nicht Farben und Pixel — die entstehen im Designschritt auf dieser Basis.

> **Nachtrag 24.08.2026 — die Designarbeit ist vorbereitet.** Aus diesem Dokument sind drei
> ausführende Dokumente entstanden, die es nicht ersetzen, sondern ausbuchstabieren:
>
> | Datei | Inhalt |
> |---|---|
> | `71_Designsystem.md` | Token-Vertrag, Atomic-Design-Inventar, alle Eingabefeldtypen, Barrierefreiheitsschwellen, Assets |
> | `72_Screens_und_Flows.md` | 34 Bildschirme in zwei Stufen, zehn Abläufe, Bedienkonzept, Tastaturkarte |
> | `73_Design_Briefing.md` | das an Claude Design angehängte Kontextdokument, mit Sperrliste und Beispieldaten |
> | `74_Prompts_Claude_Design.md` | die Prompt-Sequenz in sechs Wellen plus Handoff an Claude Code |
>
> **Entschieden dabei (E36):** Der Akzentton ist **gedecktes Petrol / Blaugrün**, Anker etwa
> `#35726E`. Er muss auf warmem Papierweiß und auf Anthrazit funktionieren und darf nicht mit
> den Datenfarben kollidieren — die brauchen Rot, Orange, Gelb und Grün für die Konfidenzstufen.
> Schriften und Symbolsatz erarbeitet Claude Design innerhalb der Kriterien aus
> `71_Designsystem.md` §1.3 und der Sperrliste in §4.

## 1. Die zentrale Designspannung

Der Datenbestand ist reich (Aussagen, Konfidenzen, Widersprüche, Zeitbezüge). Die Oberfläche
soll ruhig und einfach sein. Das ist kein Widerspruch, sondern eine Anforderung an
**Progressive Disclosure**: die Standardansicht zeigt die Schlussfolgerung, ein Klick zeigt den
Beleg, ein weiterer die Widersprüche.

Konkrete Regel: **Belegapparat ist immer erreichbar, aber nie im Weg.** Ein kleines Symbol am
Feld genügt (Anzahl Belege + Konfidenzfarbe); das Detail öffnet sich auf Wunsch.

## 2. Informationsarchitektur

```
Projektfenster
├─ Arbeitsbereich (Hauptbereich, umschaltbar)
│   ├─ Baum          — die Hauptansicht
│   ├─ Karte         — Orte und Zeit
│   ├─ Zeitleiste    — Ereignisse chronologisch
│   ├─ Liste         — Tabelle aller Personen
│   ├─ Netzwerk      — Paten/Zeugen (Phase 5)
│   └─ Quellen       — Quellen, Zitate, Archive, Aufgaben
├─ Seitenleiste links: Navigation, Filter, gespeicherte Ansichten
├─ Seitenleiste rechts: Detail der Auswahl (Person, Ereignis, Ort, Quelle)
├─ Kopfzeile: Suche, Zentrumsperson, Ansichtsmodus, Zeitregler
└─ Fußzeile: Speicherstatus, Personenzahl, Prüfhinweise
```

**Die Profilseite** ist keine eigene Ansicht, sondern eine überlagerte Vollseite. Begründung:
Der Kontext im Baum darf nicht verloren gehen; Schließen bringt einen exakt dorthin zurück.

## 3. Ansichten und ihre jeweils *eine* Frage

Jede Ansicht antwortet auf genau eine Frage. Wenn eine Ansicht zwei Fragen beantwortet, ist es
die falsche Ansicht.

| Ansicht | Frage | Kernelemente |
|---|---|---|
| Baum | Wie hängen diese Menschen zusammen? | Karten, Kanten, Ein-/Ausklapppunkte, Hervorhebung |
| Profil | Wer war dieser Mensch? | Ereignis-Zeitstrahl, Belege, Medien, Verwandte, Notizen |
| Karte | Wo lebten sie, wann? | Punkte/Linien, Zeitregler, Ortsliste |
| Zeitleiste | Was geschah gleichzeitig? | Personenbänder, Ereignismarken, historischer Kontext |
| Liste | Wo ist Person X? / Wer erfüllt Kriterium Y? | Spaltenwahl, Sortierung, Filter, Massenbearbeitung |
| Quellen | Woher weiß ich das? | Quellenbaum, Zitate, Scans, Aufgaben |
| Netzwerk | Wer verkehrte mit wem? | Paten-/Zeugen-Graph, Cluster |

## 4. Die Personenkarte im Baum

Vier Dichtestufen, automatisch nach Zoom, manuell übersteuerbar:

| Stufe | Inhalt |
|---|---|
| Punkt | nur Farbfläche + Geschlechtsform (weit herausgezoomt) |
| Kompakt | Rufname + Lebensdaten in Jahren |
| Standard | Vollname, Lebensdaten, Ort, Titelbild klein |
| Ausführlich | + Beruf, Konfession, Belegqualitäts-Indikator, Kinderzahl |

Global konfigurierbar, welche Felder auf welcher Stufe erscheinen (Anforderung A-01/C-03).
Wichtig: **die Kartengröße muss über den ganzen Baum einheitlich bleiben**, sonst zerfällt das
Layout optisch. Unterschiedliche Informationslage darf die Höhe nicht ändern — fehlende Werte
lassen Platz, sie stauchen die Karte nicht.

## 5. Visuelle Kodierung — ein konsistentes System

Vier voneinander unabhängige Kodierungskanäle, damit sie sich nicht ins Gehege kommen:

| Kanal | kodiert | Beispiel |
|---|---|---|
| **Kantenform** | Beziehungsart | durchgezogen = biologisch, gestrichelt = adoptiv/Stief, doppelt = Ehe, doppelt-durchkreuzt = Scheidung, punktiert = ungesichert |
| **Kantenfarbe** | aktuelle Hervorhebung | ausgewählte Blutlinie, Verwandtschaftspfad |
| **Kartenrahmen** | Status | ausgewählt, Zentrumsperson, Implex-Duplikat, lebend/privat |
| **Kartenfläche (optional)** | eine wählbare Datenebene | Belegqualität ODER Generation ODER Strang ODER Geschlecht — **immer nur eine gleichzeitig**, mit Legende |

Die letzte Regel ist entscheidend: Florians Idee nennt Farbmarkierung für Verwandtschaftsgrad
*und* Beziehungsart *und* Stränge. Alles gleichzeitig eingefärbt ergibt Chaos. Lösung: eine
"Datenebene"-Auswahl mit Legende, wie in einer Karten-App.

## 6. Der Zeitregler (Kernfeature C-13)

Ein einziger Regler in der Kopfzeile wirkt gleichzeitig auf **alle** offenen Ansichten:
- Baum: Personen, die zu diesem Datum nicht lebten, werden ausgegraut oder ausgeblendet (umschaltbar); Ehen erscheinen/verschwinden.
- Karte: Wohnorte zum Zeitpunkt; **Ortsnamen in der damals gültigen Form**.
- Profil: Alter der Person zum eingestellten Datum.

Zwei Modi: **Zeitpunkt** (ein Datum) und **Zeitraum** (von–bis, zeigt Bewegung/Aggregat).
Abspielfunktion für die Wanderung über Generationen.

Fachlicher Fallstrick, den die UI lösen muss: Bei unscharfen Datumsangaben ("um 1750") ist
"lebte diese Person 1752?" nicht mit ja/nein beantwortbar. Vorschlag: drei Zustände —
sicher lebend, möglicherweise lebend (visuell schwächer), sicher nicht lebend.

## 7. Erfassungsergonomie

Aus der Marktanalyse: der am häufigsten kritisierte Punkt bestehender Software.

- **Befehlspalette** (Cmd/Ctrl+K): jede Aktion und jede Person über Tippen erreichbar.
- **Aus jedem Kontext anlegen:** Am Personenprofil und an jeder Baumkarte gibt es "Vater/Mutter/Partner/Kind/Geschwister hinzufügen". Der berichtete Gramps-Frust ("cannot even marry my own wife") entsteht genau hier.
- **Durchgehende Tastaturbedienung**, inklusive Schnelleingabe ohne Maus. Tastenkürzel sind nach Einführung unantastbar (RootsMagic-8-Lehre).
- **Tolerante Eingabefelder:** "um 1750", "vor 1800", "14.3.1750", "März 1750" werden beim Tippen erkannt und in Struktur überführt — mit sichtbarer Interpretation ("verstanden als: etwa 1750"), damit man widersprechen kann.
- **Kirchenbuch-Modus** (A-14): ein Formular pro Registereintrag, das alle Beteiligten samt Rollen in einem Durchgang erfasst — deutlich schneller als personenweises Anlegen.

## 8. Das Zusammenführungs-Modal (Kernfeature D-04/D-05)

Der wichtigste Bildschirm des Produkts, weil er das größte Marktproblem löst.

Aufbau: drei Spalten — **A** (vorhanden) · **Ergebnis** · **B** (neu). Pro Feld eine Zeile.
- Identische Werte: zusammengeklappt, grau, "12 Felder identisch" ausklappbar.
- Ergänzungen (A leer, B gefüllt): automatisch übernommen, grün markiert, einzeln abwählbar.
- Konflikte: hervorgehoben, Auswahl A/B/eigener Wert; **beide behalten** ist eine gleichrangige Option (das Datenmodell kann Widersprüche, siehe B-04).
- Belege werden immer *addiert*, nie ersetzt.
- Fuß: "Rückgängig jederzeit möglich" mit Verweis auf die Zusammenführungshistorie.

## 9. Designsystem — Anforderungen

Ein einheitliches System für Eingaben, Elemente und Zustände (Florians ausdrückliche
Anforderung). Mindestumfang:

- **Tokens:** Farbe (semantisch: Fläche/Text/Rahmen/Akzent/Warnung/Erfolg, je hell und dunkel), Abstände (4er-Raster), Radien, Schatten, Typografie (Schriftgrade als Skala), Bewegungsdauern.
- **Komponenten:** Schaltfläche (4 Varianten), Eingabefeld, **Datumsfeld mit Unschärfe**, **Ortsfeld mit Hierarchie-Autovervollständigung**, **Personenwähler**, Auswahlfeld, Mehrfachauswahl, Umschalter, Reiter, Tabelle mit Sortierung, Karte/Panel, Modal, Seitenschublade, Hinweisstreifen, **Konfidenz-Anzeiger**, **Belegabzeichen**, Zeitregler, Leerzustand, Ladezustand, Fehlerzustand.
- **Zwei Themen** (hell/dunkel) von Anfang an über Tokens, nicht nachträglich.
- **Zwei Dichten** (komfortabel/kompakt) — bei tabellarischer Erfassung entscheidend.

**Entschieden (U1/U3):** eigene, auf beiden Plattformen identische Gestaltung; hell und dunkel
beide von Anfang an. Plattformkonventionen werden respektiert bei Fenstersteuerung, Menüleiste,
Tastenkürzeln und Systemdialogen — alles im Fenster ist eigenes Design.

## 10. Prinzipien für die Designarbeit

1. **Ruhe durch Weißraum, nicht durch Weglassen.** Der Baum ist die Bühne; alle Werkzeuge sind zurückgenommen.
2. **Ein Akzentfarbton.** Alle anderen Farben sind Datenkodierung mit Legende, nicht Dekoration.
3. **Typografie trägt die Hierarchie.** Wenige Schriftgrade, klare Abstufung — keine Rahmen und Schatten zur Gliederung.
4. **Zustände sind Teil des Designs.** Leer, Laden, Fehler, Zu-viel-Daten sind entworfen, nicht improvisiert.
5. **Nichts blinkt, nichts hüpft.** Bewegung nur, um Zusammenhang zu erklären (Ein-/Ausklappen, Zoom, Zeitregler).
6. **Unsicherheit hat eine visuelle Sprache.** Unscharfe Daten, geringe Konfidenz und Vermutungen sehen anders aus als gesicherte Fakten — konsistent über alle Ansichten.

---

## 11. Gestaltungsrichtung aus den Referenzen (U2)

Genannte Referenzen: **Notion, Obsidian, Claude, Figma, Apple-Software.** Diese fünf haben
weniger gemeinsam als es klingt — deshalb hier, was ich daraus ableite und was nicht.

**Was sie teilen (und was übernommen wird):**
- **Sehr wenig Chrom.** Keine schweren Werkzeugleisten, keine Rahmen um alles. Trennung durch Weißraum und feine 1-px-Linien, nicht durch Kästen.
- **Inhalt dominiert, Werkzeuge treten zurück** bis zur Interaktion. Notion und Obsidian zeigen Bedienelemente erst beim Überfahren.
- **Ruhige, fast neutrale Grundpalette** mit *einem* Akzent. Farbe bedeutet etwas.
- **Typografie trägt die Hierarchie.** Kleine Schriftgradskala, klare Sprünge, viel Zeilenabstand.
- **Weiche, kleine Radien** (6–10 px) und sehr zurückhaltende Schatten — nur zur Ebenentrennung bei Überlagerungen.
- **Tastaturzentrik.** Notion, Obsidian und Figma sind ohne Maus benutzbar; das deckt sich mit der Erfassungsergonomie in §7.

**Was ich davon *nicht* übernehme:**
- Notions Blockeditor-Paradigma. Deine Daten sind strukturiert, nicht dokumentartig. Ein "alles ist ein Block"-Modell würde die Präzision verschleiern, die das Datenmodell mühsam herstellt.
- Figmas dichte Werkzeugleisten. Das ist die Sprache eines Produktionswerkzeugs für ganztägige Arbeit — für eine App, die man abends eine Stunde benutzt, zu kalt und zu voll.
- Apples Grafit-Grau-Fensterrahmen als Vorbild — plattformspezifisch, widerspricht E15.

**Konkrete Ableitung für dieses Projekt:**

| Aspekt | Richtung |
|---|---|
| Grundton | Warmes, sehr leicht getöntes Papierweiß (hell) bzw. neutrales dunkles Anthrazit (dunkel) — nicht reines Weiß/Schwarz |
| Akzent | **ein** gedeckter Ton, ruhig, kein Signalfarbton. Er markiert Auswahl und Aktion, nichts weiter |
| Datenfarben | eine eigene, klar getrennte Palette für Datenebenen (Konfidenz, Generation, Strang) — immer mit Legende, immer nur eine Ebene aktiv (§5) |
| Schrift | eine gut lesbare humanistische Sans für die Oberfläche; für historische Originalzitate und Transkripte eine abgesetzte Schrift (Serif oder Mono), damit Quelle und Interpretation optisch unterscheidbar sind |
| Dichte | zwei Stufen; die kompakte Stufe ist für Tabellen und den Interview-Modus gedacht |
| Bewegung | 120–200 ms, nur für Zusammenhang (Ein-/Ausklappen, Zoom, Zeitregler). Nichts pulsiert |

**Die eine gestalterische Eigenständigkeit, die dieses Produkt braucht:** eine **visuelle Sprache
für Unsicherheit**. Unscharfe Datumsangaben, geringe Konfidenz, Erinnerungswissen und
Platzhalterpersonen müssen konsistent anders aussehen als gesicherte Fakten — über alle
Ansichten hinweg. Vorschlag: reduzierte Deckkraft für den Wert, gestrichelte Rahmen für
Platzhalter, ein vierstufiger Konfidenz-Indikator am Feld (§2.16 im Datenmodell) plus ein separates Zeichen für konkurrierende Angaben. Keine Referenz aus U2 hat so
etwas, weil keine dieser Apps mit Unsicherheit umgeht. Das ist die Stelle, an der die
Gestaltung eigenständig werden muss.

---

## 12. Der Interview-Modus (A-15) — die wichtigste neue Ansicht

Weil dein Bestand aus Gesprächen entsteht (E6), ist das die Ansicht, in der du in Phase 1 die
meiste Zeit verbringen wirst.

**Aufbau: zwei Spalten.**
- **Links: freies Textfeld.** Du tippst mit, wie du sprichst — oder wirfst hinterher deine Notizen hinein. Keine Struktur, keine Felder, kein Pflichtformat.
- **Rechts: erkannte Struktur.** Personen, Ereignisse, Orte, Beziehungen als Vorschlagskarten. Jede Karte hat drei Zustände: *Vorschlag* (grau), *bestätigt* (normal), *verworfen* (ausgeblendet). Bestätigen mit einer Taste.

**Kopfzeile der Sitzung:** Informant (Person aus dem Baum), Datum, Form (Gespräch/Telefon/Audio),
und ein Umschalter **"Selbsterlebtes / Vom Hörensagen"** — er setzt für alle folgenden Aussagen
die Vorgabe-Konfidenz. Wechselt der Erzähler mitten im Gespräch von eigenen Erinnerungen zu
"meine Mutter hat immer gesagt…", schaltest du um, und alles Weitere wird entsprechend
eingestuft.

**Regeln, die diese Ansicht vertrauenswürdig machen:**
1. **Nichts wird ohne Bestätigung geschrieben.** Vorschläge sind Vorschläge.
2. **Jeder bestätigte Datensatz behält den Originalwortlaut** aus dem Textfeld als Zitat. Nicht "geboren 1923", sondern "geboren 1923" *plus* "sie sagte: ‚der Karl war zwei Jahre jünger als ich, also 23er Jahrgang'".
3. **Vorgabe für Datumspräzision ist "etwa"**, nicht "exakt" (§14 im Domänendokument).
4. **Widersprüche werden angezeigt, nicht überschrieben.** Sagt Tante Erna 1923 und Onkel Fritz 1925, entsteht eine Konfliktkarte — beide Werte bleiben, mit ihren jeweiligen Belegen.
5. **Die Sitzung ist als Ganzes rückgängig machbar.**

**Warum das mehr wert ist als die Baumdarstellung:** Ein Gespräch mit einer 88-jährigen Tante
findet ein- oder zweimal statt. Wenn du es nur als Notizzettel festhältst, ist die Zuordnung zur
Quelle für immer verloren. Der Interview-Modus ist das einzige Feature dieser Software, dessen
Fehlen unwiederbringliche Datenverluste verursacht.

---

## 13. Die medizinische Ansicht (M-06)

Eigene Ansicht, nicht eine Datenebene im normalen Baum — weil sie anderen Regeln folgt:
- **Reduzierte Darstellung:** nur Name, Lebensdaten, Symbole. Kein Bild, keine Orte.
- **Symbolsprache** wie im Genogramm: Form für Geschlecht, Füllung für Betroffenheit, Symbol am Rand für Risikofaktoren.
- **Eine Kategorie zur Zeit** wählbar (Herz-Kreislauf, Krebs, …), sonst wird es unlesbar.
- **Konfidenz sichtbar:** aus Erinnerung stammende Diagnosen sind schraffiert, nicht voll gefüllt. Das ist hier keine Feinheit, sondern die einzige Absicherung dagegen, dass die Ansicht mehr Gewissheit suggeriert als vorhanden ist.
- **Fester Hinweis in der Ansicht:** „Übersicht familiärer Häufungen. Keine medizinische Aussage." Kein ausblendbarer Hinweis, sondern Teil des Kopfbereichs.
- **Export dieser Ansicht ist standardmäßig gesperrt** (M-08).
