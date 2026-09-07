# Wurzelwerk — Prompts für Claude Design

**Stand:** 24.08.2026 · **Für:** claude.ai/design (Projekt „Wurzelwerk")
**Voraussetzung:** die Vorbereitung aus §1 ist erledigt.

Jeder Prompt steht in einem eigenen Codeblock zum Kopieren. Über jedem Prompt steht in einer
Zeile, wann er zu verwenden ist. Die Prompts sind aufeinander abgestimmt und werden **in dieser
Reihenfolge** benutzt.

---

## 1. Vorbereitung — einmal, vor dem ersten Prompt

Diese Schritte ersetzen keine Prompts, sondern sie machen die Prompts kurz. Ein Projekt mit
angehängtem Kontext braucht keine Wiederholung des Kontexts in jedem Prompt.

1. **Projekt anlegen** in Claude Design, Name „Wurzelwerk".
2. **Diese drei Dateien anhängen** (Projektkontext, nicht in den Chat kopieren):
   - `73_Design_Briefing.md` — Produkt, Nutzer, Richtung, Sperrliste, Beispieldaten, **Anhang A mit allem Rohmaterial**
   - `71_Designsystem.md` — Token-Vertrag, Komponenteninventar, Eingabefeldtypen
   - `72_Screens_und_Flows.md` — Bildschirmliste mit Aufbau und Zuständen
3. **Kein Design-System importieren.** Es gibt keins; es entsteht in Welle 0.
4. **Kein Repository verknüpfen.** Es gibt noch keinen Code, und ein leeres Repository stiftet nur Verwirrung.

**Nur diese drei, und alle drei sind Markdown.** Claude Design verarbeitet **keine
JSON-Dateien** — die Beispieldaten aus `56_Beispiele/` sind deshalb im Klartext in **Anhang A**
des Briefings enthalten: Interviewmaterial mit Zeitmarken (A.1), der vollständige
Trockenlauf-Bericht (A.2) und die Fehlermeldungen im verbindlichen Format (A.3). Es muss nichts
weiter angehängt werden. Falls auch Markdown nicht angenommen wird, nennt Anhang A.4 vier
Fallbacks in der Reihenfolge, in der man sie probiert.

**Warum die Dateien angehängt und nicht eingefügt werden:** Angehängter Projektkontext gilt für
alle Chats im Projekt. Eingefügter Text gilt nur für den einen Chat — und für längere Arbeit ist
ohnehin ein neuer Chat pro Welle sinnvoll.

---

## 2. Die sechs Wellen

| Welle | Ergebnis | Warum in dieser Reihenfolge |
|---|---|---|
| **0** | Designsprache, drei Richtungen zur Wahl | Ohne festgelegte Sprache wird jeder folgende Bildschirm neu erfunden |
| **1** | Token-Blatt und Komponentenbibliothek | Die Bausteine, aus denen alles Weitere zusammengesetzt wird |
| **2** | Gerüst, Liste, Profil | Die Ansichten, die die Sprache unter echter Datenlast prüfen |
| **3** | Import-Strecke | Der zweitwichtigste Bildschirm des Produkts |
| **4** | Interview-Modus und Zustandsbibliothek | Der wichtigste Bildschirm, plus der Beweis, dass Zustände entworfen sind |
| **5** | Formularfelder, Feldsystem, Gesundheit, Quellen | Hier kommen alle Eingabefeldtypen zusammen |
| **6** | Zielbild: Baum, Karte, Zeitleiste, Zusammenführung, medizinische Ansicht | Der Härtetest des Systems |

Jede Welle ist ein eigener Chat im Projekt. Nach jeder Welle einmal gegen die Abnahmeprüfliste
in `73_Design_Briefing.md` §9 gehen.

---

## 3. Welle 0 — Die Designsprache

*Ganz am Anfang. Der einzige Prompt, der drei Alternativen verlangt statt eines Ergebnisses.*

```
Erarbeite die Designsprache für Wurzelwerk. Kontext, Nutzer, Richtung und Sperrliste
stehen im angehängten Design-Briefing — lies es vollständig, besonders §4 (visuelle
Sprache für Unsicherheit), §5.3 (konkrete Richtung) und §6 (Sperrliste).

Baue DREI Richtungen als drei Artboards nebeneinander, je 1440 breit. Jede Richtung
ist ein vollständiges Blatt und zeigt:

1. Schriftmuster: die drei Familien (Oberfläche, Originalzitate, Technisches) in
   ihren Rollen. Setze als Muster:
   – "Karl Friedrich Gutnoff" als Profiltitel
   – "1901 – 1974 · Marienwerder" als Lebensdaten
   – "Щербаков · Ščerbakov" in einer Tabellenzeile
   – "so um 1890 rum, sagt Erna" als Originalzitat in der abgesetzten Schrift
   – "tmp:august-wruck   IMP-302   sha256-a1b2c3…" in der technischen Schrift
   – eine Tabellenspalte mit den Jahren 1890 1901 1927 1961 1974 als Nachweis,
     dass die Ziffern gleich breit laufen
   Nenne bei jeder Richtung die konkreten Schriftnamen und begründe in einem Satz,
   warum diese Schrift die fünf Kriterien aus §6 erfüllt.

2. Farbpalette in beiden Themen, hell und dunkel gleichrangig:
   – die Flächen-, Text- und Rahmenrollen
   – eine Akzent-Farbe mit ihren Zuständen
   – die vier Statusfarben
   – die vierstufige Konfidenzpalette
   – zwölf Generationsfarben
   Zeige die Konfidenzpalette zusätzlich in Graustufen — sie muss auch gedruckt als
   Reihenfolge lesbar sein.

3. Ein Musterelement, dreimal: eine Personenkarte mit
   (a) vollständigen, gesicherten Daten
   (b) lückenhaften Daten mit Konfidenz 2 und einem unscharfen Datum
   (c) als Platzhalter ohne Namen
   Alle drei müssen exakt dieselbe Höhe haben.

4. Die vier Zeichen der Unsicherheitssprache: Konfidenzanzeiger (4 Stufen),
   Widerspruchszeichen, Kennzeichnung eines unscharfen Datums, Platzhalterrahmen.
   Konfidenz und Widerspruch sind zwei getrennte Zeichen, keine gemeinsame Skala.

Die drei Richtungen sollen sich in Haltung unterscheiden, nicht nur in Farbwerten.
Nenne jede Richtung mit einem Wort und schreibe je zwei Sätze dazu, was sie behauptet
und wofür sie sich schlechter eignet.

Nicht: Bildschirme entwerfen. Nicht: Komponenten über die vier oben genannten hinaus.
```

*Danach, wenn eine Richtung gewählt ist. Ersetze die Platzhalter in Klammern.*

```
Ich nehme Richtung "(Name)" als Grundlage. Übernimm daraus zusätzlich:
– (Element aus einer anderen Richtung, das besser war)
– (weiteres Element)

Verwirf die beiden anderen Richtungen. Schreibe die gewählte Sprache als
verbindliches Blatt fest: alle Tokenwerte für beide Themen, unter den Tokennamen
aus 71_Designsystem.md §1. Genau diese Namen, keine anderen — der spätere Code
benutzt sie unverändert.

Gib das Blatt zusätzlich als CSS aus, in der Struktur aus 71_Designsystem.md §1.7:
:root mit der vollständigen hellen Fassung, dann die dunklen Überschreibungen unter
prefers-color-scheme und unter [data-theme="dunkel"], dann die vier Dichtetokens
unter [data-dichte="kompakt"]. Keine Farbe darf ihre einzige Definition in einem
Medien- oder Themenblock haben.
```

---

## 4. Welle 1 — Token-Blatt und Komponenten

*Nach Welle 0. Erzeugt die Bibliothek, aus der die Bildschirme zusammengesetzt werden.*

```
Baue die Komponentenbibliothek nach 71_Designsystem.md §2, in der in Welle 0
festgelegten Designsprache. Vier Artboards:

ARTBOARD "Atome" — alle 17 Atome aus §2.1, jedes in allen dort genannten Varianten
und Zuständen. Die Zustandsmatrix vollständig, nicht exemplarisch: Ruhe, Überfahren,
aktiv, Fokus, gesperrt, ladend. Der Fokusring ist auf jeder Fläche zu zeigen, auch
auf der Akzentfläche — dort ist er am schwersten sichtbar.

ARTBOARD "Moleküle" — alle Moleküle aus §2.2. Für die fünf tragenden Felder gilt
§3 desselben Dokuments; entwirf sie in den dort genannten Zuständen:
– Datumsfeld: leer, tippend mit gültiger Deutung, tippend ohne Deutung ("31.02.1900"),
  gedeutet und bestätigt, unscharf mit Originaltext, Zeitraum, gesperrt, mit Beleg,
  mit konkurrierender Angabe. Die Interpretationszeile ("Verstanden als: etwa 1890 ·
  Genauigkeit Jahr") ist immer sichtbar und anklickbar.
– Ortsfeld: mit offener Vorschlagsliste, in der die Hierarchie und der zeitliche
  Geltungsbereich schon im Vorschlag stehen (Marienwerder bis 1945 / Kwidzyn ab 1945).
– Personenwähler: mit Trefferliste, je Treffer Name, Lebensdaten, Geburtsort und
  Konfidenz; letzte Zeilen "als Platzhalter anlegen" und "als neue Person anlegen".
– Konfidenzwähler: vier Punkte als ordinale Skala, kein Auswahlfeld.
– Vorschlagskarte: Vorschlag, bestätigt, verworfen. Der Unterschied muss auf einen
  Blick tragen.

ARTBOARD "Organismen" — die Organismen aus §2.3, die keine ganze Ansicht sind:
Belegabzeichen mit Popover, Widerspruchsblock, Hinweisstreifen in vier Stufen,
Tabellenzeile in drei Zuständen, Datenebenen-Wähler mit Legende, Befehlspalette.

ARTBOARD "Raster und Abstände" — das 4-px-Raster, die Abstandsskala, die vier Radien,
die vier Schattenstufen, und der Vergleich komfortabel/kompakt an einer Tabelle mit
acht Zeilen.

Alles in beiden Themen. Echte Daten aus dem Briefing §7, keine Blindtexte.

Nicht: ganze Bildschirme. Nicht: neue Komponenten erfinden, die nicht in §2 stehen —
wenn eine fehlt, benenne sie und frag.
```

---

## 5. Welle 2 — Gerüst, Liste, Profil

*Nach Welle 1. Die ersten echten Bildschirme.*

```
Baue die Bildschirme S-01, S-04, S-05 und S-07 aus 72_Screens_und_Flows.md, plus
das Fenstergerüst aus §1 desselben Dokuments. Fenster 1440 × 900.

ARTBOARD "Gerüst" — das Shell aus §1: Kopfzeile (Suche, Zentrumsperson,
Ansichtsumschalter, Zeitregler), linke Navigation, Arbeitsbereich, rechtes
Detailpanel, Fußzeile (Speicherstatus, Personenzahl, Prüfhinweise). Zeige es
einmal mit beiden Seitenleisten offen und einmal mit beiden eingeklappt — eingeklappt
bleibt eine Symbolspalte, nicht nichts. Der Arbeitsbereich hat keinen Rahmen und
keinen Schatten; er ist die Bühne.

ARTBOARD "S-01 Startbildschirm" — zwei Zustände: erster Start ohne Projektliste,
und mit drei zuletzt geöffneten Projekten, davon eines mit verschwundenem Ordner
(ausgegraut, "nicht gefunden", entfernbar).

ARTBOARD "S-04 leeres Projekt" — der Leerzustand mit drei gleichrangigen Wegen:
Importdatei einlesen, Interview beginnen, Person anlegen. Dazu ein Satz, warum der
Import der schnellste Weg ist. Dieser Bildschirm ist der erste Eindruck und
entscheidet, ob der Nutzer die Erfassungsstrecke findet.

ARTBOARD "S-05 Liste" — die Datentabelle in beiden Dichten. Mindestens 14 Zeilen mit
den Beispieldaten aus Briefing §7, darunter zwingend:
– eine Platzhalterzeile: gestrichelt, ohne Namen
– eine Zeile mit "Щербаков · Ščerbakov"
– eine Zeile mit "etwa 1890 – 1961" als Lebensdaten
– eine Zeile mit Widerspruchszeichen
Konfidenzspalte mit Konfidenzanzeiger UND getrenntem Widerspruchszeichen.
Filterleiste links. Dazu zwei weitere Zustände: leer ohne Inhalt, und leer weil
der Filter nichts trifft (mit "Filter zurücksetzen").

ARTBOARD "S-07 Profil" — die Vollseitenüberlagerung, der Baum bleibt darunter
sichtbar. Zwei Fassungen desselben Bildschirms nebeneinander:
(a) datenreich: Karl Friedrich Gutnoff, vollständig, mit allen acht Abschnitten
(b) datenarm: August Wruck — nur Name, etwa 1890, ein Beruf, Konfidenz 2, zwei
    widersprüchliche Todesdaten
Fassung (b) muss eine kurze, ruhige Seite sein und kein Formular voller leerer
Felder. Leere Abschnitte erscheinen nicht.
Jedes Feld trägt Konfidenzanzeiger und Belegabzeichen — erreichbar, aber nicht im Weg.

Alles in hell und dunkel.

Nicht: die Baumansicht. Nicht: Bearbeitungsmodus. Nicht: Import oder Interview.
```

---

## 6. Welle 3 — Die Import-Strecke

*Nach Welle 2. Der Bildschirm, den man in Phase 1 am häufigsten liest.*

```
Baue die Import-Strecke: S-10, S-11, S-12, S-13 aus 72_Screens_und_Flows.md.
Template ist der Assistent mit drei Schritten.

ARTBOARD "S-10 Datei wählen" — Ablagefeld, Erklärung des Vertrags, Liste der
letzten Importe mit Prüfsumme.

ARTBOARD "S-11 Trockenlauf" — die acht Blöcke in genau der Reihenfolge aus
72_Screens_und_Flows.md S-11. Verwende die Zahlen und Texte aus dem vollständigen
Beispielbericht in 73_Design_Briefing.md Anhang A.2 — wörtlich, nicht paraphrasiert.
Wichtig:
– Die Art der Rücknahme steht GANZ OBEN, nicht unten. Der Nutzer braucht sie für
  seine Entscheidung: einzelner Rückgängig-Schritt oder Schnappschuss.
– "Wird ergänzt" listet jede einzelne Änderung, nicht eine Anzahl.
– Der Satz "Keine bestehenden bevorzugten Werte werden ersetzt" steht als Satz da.
– Dubletten mit Punktwert UND Begründung.
– "Nicht verarbeitetes Material" ist ein eigener Block und immer sichtbar, auch leer.
– Der Gesundheitsblock nennt jedes Mal die Exportsperre.
Der Bericht darf lang sein, muss aber übersichtlich bleiben: klare Blockgrenzen,
Zähler an jedem Block, Sprungmarken. Zeige ihn zweimal: einmal fehlerfrei,
einmal mit drei Fehlern und sieben Hinweisen.

ARTBOARD "S-12 Fehlerliste" — Meldungen im Format aus 73_Design_Briefing.md
Anhang A.3, mit allen fünf Bestandteilen: Schweregrad und Code, JSON-Pfad,
betroffene Kennung, Datei und Zeile, "Was tun" mit allen Auswegen. Übernimm die
drei Beispielmeldungen wörtlich.
Gruppiert nach Fehlercode, weil 30 Meldungen desselben Codes ein Muster und eine
Korrektur sind, nicht 30 Probleme. Zeige eine Liste mit 40 Meldungen in der
Verteilung aus A.3 — sie darf nicht resignieren lassen.

ARTBOARD "S-13 Ergebnis" — derselbe Bericht als Vollzug, plus "Rückgängig" bzw.
"Schnappschuss wiederherstellen" und "Zur Liste". Trockenlauf und Ergebnis sehen
absichtlich gleich aus.

Beide Themen.

Nicht: den Interview-Modus. Nicht: das Zusammenführungs-Modal.
```

---

## 7. Welle 4 — Interview-Modus und Zustände

*Nach Welle 3. Der wichtigste Bildschirm des Produkts.*

```
Baue S-14 (Interview-Modus) und S-19 (Zustandsbibliothek) aus
72_Screens_und_Flows.md. Das vollständige Rohmaterial für S-14 steht in
73_Design_Briefing.md Anhang A.1: der getippte Text für die linke Spalte, acht
Vorschlagskarten mit Originalwortlaut, Konfidenz und Zeitmarke, zwei unverarbeitete
Notizen und die Konfliktkarte. Übernimm die Texte wörtlich — sie sind so gewählt,
dass sie die schwierigen Fälle enthalten.

ARTBOARD "S-14 Interview" — zwei Spalten unter einem Sitzungskopf.
Sitzungskopf: Informant (Erna Wruck), Datum 12.09.2026, Form Audio, Audiospur mit
Zeitmarke, und der segmentierte Umschalter "Selbsterlebtes / Vom Hörensagen" — er
setzt die Vorgabe-Konfidenz für alles Folgende.
Links: das freie Textfeld mit dem Text aus A.1, Schreibmarke am Ende mitten im Satz.
Rechts: mindestens fünf der acht Vorschlagskarten aus A.1 — darunter zwingend die
Diagnose "was mit dem Herzen" (Konfidenz 1) und der aus dem Beruf erschlossene
Risikofaktor (Konfidenz 3). Jede Karte trägt den Originalwortlaut sichtbar mit, in
der abgesetzten Schrift, plus ihre Zeitmarke in der technischen Schrift.

Die entscheidende Anforderung: Ein Vorschlag darf NIE wie ein Datensatz aussehen.
Zeige nebeneinander eine Vorschlagskarte, eine bestätigte und eine verworfene. Wenn
sich Vorschlag und bestätigt nur in einer Nuance unterscheiden, ist die Regel
"nichts wird ohne Bestätigung geschrieben" praktisch gebrochen.

Zeige zusätzlich diese Zustände: die Konfliktkarte aus A.1 (Erna sagt 1923, Fritz
sagt 1925, keiner bevorzugt — beide bleiben stehen, es ist eine offene Entscheidung
und kein Fehler), die beiden unverarbeiteten Notizen aus A.1 mit ihrem Grund, und
den Umschalter auf "Vom Hörensagen" mit sichtbar niedrigerer Vorgabe-Konfidenz
(2 statt 3) und Genauigkeit "etwa" statt "exakt". Der Umschalter muss etwas ändern,
das man sieht.
Kompakte Dichte ist hier die Vorgabe.

ARTBOARD "S-19 Zustandsbibliothek" — alle Zustände einmal nebeneinander:
fünf Leerzustände, drei Ladezustände (Zeile, Block, Seite), vier Fehlerzustände
(Feld, Bereich, Seite, Prozessfehler mit Vorgangs-ID), "zu viele Daten",
"nicht gefunden". Zustände sind Teil des Designs, nicht Improvisation — dieses
Artboard ist der Beweis.

Beide Themen.

Nicht: das Bearbeitungsformular. Nicht: die Baumansicht.
```

---

## 8. Welle 5 — Formulare und Erfassung

*Nach Welle 4. Hier kommen alle Eingabefeldtypen zusammen.*

```
Baue S-20, S-21, S-22 und S-23 aus 72_Screens_und_Flows.md.

ARTBOARD "S-20 Person bearbeiten" — die Seitenschublade im Bearbeitungsmodus, mit
ALLEN Eingabefeldtypen aus 71_Designsystem.md §2.2 und §3 in einem Formular:
Textfeld, Langtext, Zahl, Datumsfeld, Zeitraumfeld, Ortsfeld, Personenwähler,
Auswahlfeld, Mehrfachauswahl mit Chips, Umschalter, Kontrollkästchen, Optionsfeld,
Konfidenzwähler, Medienwähler, URL-Feld, Kalenderwahl.
Jedes Feld in der Hülle "Formularfeld": Beschriftung, Feld, Hilfetext,
Konfidenzwähler, Belegabzeichen.
Gruppiert nach Abschnitten. In komfortabler und in kompakter Dichte.

Die gestalterische Aufgabe dabei: Es gibt KEINEN Speichern-Knopf. Die App schreibt
jede Änderung sofort, die Fußzeile zeigt den Status. Das Formular muss durch seine
Gestaltung vermitteln, dass es trotzdem gespeichert ist. Zeige die drei
Fußzeilenzustände: gespeichert, schreibt, Fehler. Der Fehlerzustand ist der
wichtigste — eine Auto-Speicherung, die stillschweigend scheitert, ist schlimmer
als ein Speichern-Knopf.

ARTBOARD "S-21 Feld-Definitionssystem" — Liste der Felddefinitionen mit Gruppe,
Typ, Mehrfachwert, Zeitraumfähigkeit, "sensibel". Anlegen-Dialog mit Typwahl und
Vorschau, wie das Feld später im Formular aussieht. Systemfelder sichtbar von
eigenen unterschieden: umbenennbar, nicht löschbar. Zeige, wo ein Feld erscheint —
Suche, Filter, Listenspalte, Bericht.

ARTBOARD "S-22 Gesundheitsdaten" — Diagnose und Risikofaktor erfassen, mit den
Daten von Walter Wruck aus dem Briefing §7. Zwei Dinge müssen sichtbar sein:
1. ein fester, NICHT ausblendbarer Hinweis, dass diese Daten nie exportiert werden
2. ein Hinweis am Bezeichnungsfeld, dass der Wortlaut der Quelle gilt — "was mit
   dem Herzen" bleibt "was mit dem Herzen" und wird nicht zu "Herzinfarkt"
Die Oberfläche darf nicht zu einer Präzisierung verleiten, die es nicht gibt.

ARTBOARD "S-23 Quellen" — der dreistufige Baum Quelle → Zitat → Aussage, dazu
Archive, Negativbefunde, und die Interviewsitzungen als eigene Gruppierung.
Bei mündlichen Quellen ist die Unmittelbarkeit ("selbst erlebt" / "vom Hörensagen")
prominent — sie ist genealogisch der wichtigste Unterschied.

Beide Themen.
```

---

## 9. Welle 6 — Das Zielbild

*Nach Welle 5. Der Härtetest. Ein Zustand je Bildschirm, keine Randfälle.*

```
Baue das Zielbild der späteren Phasen: S-24 bis S-32 aus 72_Screens_und_Flows.md.
Diese Bildschirme werden nicht bald gebaut. Ihr Zweck ist der Härtetest des
Designsystems: Sie stellen die Fragen, die ein Tokensystem entweder beantwortet
oder nicht. Deshalb je EIN Zustand, keine Zustandsmatrix, aber in echter Dichte.

ARTBOARD "S-24 Ahnentafel" — mindestens 40 Personenkarten über vier Generationen,
Kanten in vier Formen (biologisch durchgezogen, adoptiv gestrichelt, Ehe doppelt,
Scheidung doppelt-durchkreuzt), Ein- und Ausklapppunkte, Zentrumsperson
hervorgehoben, ein Platzhalter (gestrichelt, namenlos), Datenebenen-Legende,
Verwandtschaftsgrad an jeder Karte. 40 Karten, weil die Palette erst unter Last
zeigt, ob sie trägt.

ARTBOARD "S-25 Sanduhr mit Implex" — dieselbe Ansicht mit Ahnenimplex: ein Vorfahre
über zwei Pfade erreichbar, als Duplikatknoten mit sichtbarer Referenzmarkierung.
Der Duplikatknoten muss erkennbar ein Verweis und keine zweite Person sein, sonst
zählt der Nutzer falsch.

ARTBOARD "S-26 Personenkarte, vier Dichtestufen" — Punkt, kompakt, standard,
ausführlich, nebeneinander. Und zu jeder Stufe zweimal dieselbe Stufe: einmal mit
vollständiger, einmal mit lückenhafter Person. GLEICHE HÖHE. Fehlende Werte lassen
Platz, sie stauchen die Karte nicht — sonst zerfällt das Layout des ganzen Baums.

ARTBOARD "S-27 Datenebenen" — der Wähler mit Legende, viermal derselbe
Baumausschnitt, eingefärbt nach Belegqualität, Generation, Strang, Geschlecht.
Es kann immer nur EINE Ebene aktiv sein; der Entwurf muss das klarmachen.

ARTBOARD "S-28 Karte" — Orte als Punkte, Migrationslinien über Generationen,
Zeitregler in Zeitpunkt- und Zeitraummodus. Der Prüfstein: derselbe Punkt heißt
1900 Marienwerder und 1950 Kwidzyn. Zeige beide Zustände.

ARTBOARD "S-29 Zeitleiste" — Personenbänder, Ereignismarken. Die schwierige
Anforderung: Bei "um 1750" ist "lebte diese Person 1752?" nicht mit ja/nein
beantwortbar. Drei Zustände sind zu unterscheiden — sicher lebend, möglicherweise
lebend (visuell schwächer), sicher nicht lebend. Das ist die visuelle Sprache für
Unsicherheit in ihrer schwierigsten Form.

ARTBOARD "S-30 Zusammenführung" — drei Spalten A / Ergebnis / B, pro Feld eine
Zeile. Identische Werte zusammengeklappt und grau ("12 Felder identisch",
ausklappbar). Ergänzungen automatisch übernommen, grün, einzeln abwählbar.
Konflikte hervorgehoben mit A / B / eigener Wert — und "beide behalten" als
GLEICHRANGIGE Option, weil das Datenmodell Widersprüche kann. Belege werden immer
addiert, nie ersetzt. Im Fuß: "Rückgängig jederzeit möglich".

ARTBOARD "S-31 Lesemodus-Export" — Vorschau der eigenständigen HTML-Datei für
Verwandte: reduzierte Oberfläche, keine Bearbeitung, lebende Personen gefiltert,
keine Gesundheitsdaten. Eigene, ruhigere Gestaltung — sie läuft in einem fremden
Browser und muss ohne Erklärung verständlich sein.

ARTBOARD "S-32 Medizinische Ansicht" — eine eigene Ansicht, keine Datenebene:
reduzierte Darstellung (Name, Jahre, Symbole — kein Bild, keine Orte),
Genogramm-Symbolsprache (Form für Geschlecht, Füllung für Betroffenheit),
EINE Kategorie zur Zeit, Erinnerungsdiagnosen schraffiert statt gefüllt, und der
feste, nicht ausblendbare Kopfhinweis "Übersicht familiärer Häufungen. Keine
medizinische Aussage."
Die Schraffur ist keine Feinheit: Sie ist die einzige Absicherung dagegen, dass
diese Ansicht mehr Gewissheit suggeriert als vorhanden ist.

Beide Themen. Wo eine Tokenrolle fehlt, benenne sie statt eine Farbe zu erfinden.
```

---

## 10. Iterieren — welches Werkzeug wofür

Nach jeder Welle. Die drei Wege sind nicht gleichwertig, und sie zu verwechseln kostet Zeit.

| Werkzeug | Wofür | Beispiel |
|---|---|---|
| **Chat** | breite, strukturelle Änderungen | „Die Konfidenzanzeige ist zu präsent. Nimm sie um zwei Stufen zurück, überall." · „Zeige drei Varianten der Vorschlagskarte." |
| **Inline-Kommentar** | punktuelle Änderung an einem Element | „Dieser Rahmen zu 1 px." · „Hier die technische Schrift." |
| **Regler und Direktbearbeitung** | Feintuning, Text, Umfärben | Abstände nachziehen, Beispieltexte korrigieren |

Drei Regeln, die die Iterationen kurz halten:

1. **Nicht über Adjektive reden, sondern über Funktion.** „Moderner" und „cleaner" führen zu Zufall. „Der Nutzer verwechselt Vorschlag und Datensatz — vergrößere den Unterschied" führt zu einer Lösung.
2. **Bei Unsicherheit Varianten verlangen, nicht Verbesserung.** „Zeige drei Möglichkeiten, wie das Widerspruchszeichen aussehen kann" ist produktiver als dreimal „mach es besser".
3. **Letzte Handgriffe selbst machen.** Verschieben, umfärben, Text korrigieren geht direkt auf dem Artboard schneller als über einen Prompt.

**Häufige Störungen und ihre Umgehung** `[unverified]` — Stand der Fremddokumentation
August 2026, nicht selbst geprüft: Inline-Kommentare bleiben gelegentlich nicht sichtbar
(dann in den Chat einfügen); Chatfehler erfordern einen neuen Tab im selben Projekt;
gleichzeitiges Bearbeiten durch mehrere Personen ist unzuverlässig.

---

## 11. Prüfprompt — vor dem Handoff

*Nach Welle 6, bevor an Claude Code übergeben wird. Der Prompt, der die eigene Arbeit prüft.*

```
Prüfe alle Artboards dieses Projekts gegen die Abnahmeprüfliste in
73_Design_Briefing.md §9. Gehe die 15 Punkte einzeln durch und antworte je Punkt mit
erfüllt / nicht erfüllt / teilweise, mit Verweis auf das Artboard.

Prüfe zusätzlich:
1. Verwendet irgendein Artboard eine Schrift, Farbe oder Form aus der Sperrliste
   in 73_Design_Briefing.md §6?
2. Gibt es eine Farbe, die nicht über eine Tokenrolle aus 71_Designsystem.md §1
   läuft?
3. Existiert jede Tokenrolle aus §1 in BEIDEN Themen? Nenne die fehlenden.
4. Erreicht jede Kombination aus Textfarbe und Fläche 4,5:1, jeder Fokusring 3:1,
   jede Datenfarbe 3:1? Nenne die Verstöße mit ihrem gemessenen Wert.
5. Ist die Konfidenzpalette in Graustufen als Reihenfolge lesbar?
6. Gibt es einen Bildschirm, der nur in einem Thema existiert?
7. Habe ich irgendwo Blindtext statt der echten Beispieldaten verwendet?

Sei streng. Ein "teilweise" mit Begründung ist nützlicher als ein "erfüllt",
das beim Bauen auffällt.
```

---

## 12. Handoff an Claude Code

*Wenn der Entwurf steht. Zuerst in Claude Design das Handoff-Bündel erzeugen, dann diesen
Prompt in Claude Code im Repository `wurzelwerk` verwenden.*

```
Kontext: Wurzelwerk ist eine lokale Desktop-Anwendung für Ahnenforschung
(Electron + TypeScript + React + SQLite, offline, kein Konto). Die Konzeption und
die Architekturplanung sind abgeschlossen. Es gibt einen fertigen Designentwurf aus
Claude Design; das Handoff-Bündel liegt bei.

Deine Aufgabe: Übertrage NUR die Gestaltungsgrundlage in den Code. Keine Ansichten,
keine Bildschirme, keine Fachlogik.

Lies zuerst:
– CLAUDE.md im Projektwurzelverzeichnis (Architekturgrenzen, TypeScript-Regeln,
  Befehle, Testpflicht)
– docs/designsystem.md (der Token-Vertrag; Namen sind verbindlich)
– das Handoff-Bündel aus Claude Design

Dann, in dieser Reihenfolge:
1. src/renderer/gestaltung/tokens.css — alle Tokenrollen aus docs/designsystem.md §1,
   in der Struktur aus §1.7: :root mit der vollständigen hellen Fassung, dunkle
   Überschreibungen unter prefers-color-scheme UND unter [data-theme="dunkel"],
   helle explizit unter [data-theme="hell"], die vier Dichtetokens unter
   [data-dichte="kompakt"]. Keine Farbe darf ihre einzige Definition in einem
   Medien- oder Themenblock haben.
2. src/renderer/gestaltung/basis.css — Zurücksetzung, Grundstile, Fokusring.
3. Die Schriftdateien nach src/renderer/gestaltung/schriften/, die Lizenztexte nach
   docs/lizenzen/. Keine Schrift wird zur Laufzeit nachgeladen — die App ist offline.
4. Zwei Tests:
   – test/gestaltung/tokens-vollstaendig.test.ts: jede in docs/designsystem.md §1
     genannte Rolle existiert in beiden Themen. Eine fehlende Rolle in der dunklen
     Fassung ist der Fehler, der erst beim Umschalten auffällt.
   – test/gestaltung/keine-literale.test.ts: keine Hex-, rgb()- oder hsl()-Werte
     außerhalb von tokens.css.

Verbindliche Regeln:
– Tokennamen aus docs/designsystem.md §1 unverändert übernehmen. Wenn der Entwurf
  einen anderen Namen benutzt, gilt das Dokument — sag mir die Abweichung.
– Kein Tailwind, keine UI-Bibliothek, kein CSS-in-JS. Nur CSS-Eigenschaften und
  einfache Klassen. Grund: Der Token-Vertrag ist die Abstraktion, eine zweite
  darüber macht ihn wirkungslos.
– Keine neuen Abhängigkeiten ohne Rückfrage.
– strict: true, kein any, kein as ohne Begründung in derselben Zeile.
– Fachbegriffe deutsch, Technik englisch (siehe CLAUDE.md).
– prefers-reduced-motion schaltet alle Übergänge ab. Eine Zeile, von Anfang an.

Qualität und Sicherheit, wie in jedem Auftrag in diesem Repository:
– Alle externen Eingaben validieren. Schriftdateien und Bilder aus dem Bündel vor
  der Übernahme auf Typ und Größe prüfen; nichts unbesehen ins Repository kopieren.
– Keine Zugangsdaten, keine Schlüssel, keine Netzwerkaufrufe im Renderer.
– Fehler mit Ursache und Ausweg melden, ohne interne Pfade oder Details.
– Für die Kernlogik dieses Auftrags — die Tokenvollständigkeit und die
  Literalfreiheit — die beiden oben genannten Tests, und sie müssen vorher rot
  gewesen sein.

Vorgehen: Zeig mir zuerst einen Plan, was du in welcher Datei anlegst und welche
Tokenrollen du im Bündel NICHT gefunden hast. Erst nach meiner Zustimmung umsetzen.
Danach ein Commit pro Schritt, deutsche Betreffzeile im Imperativ, jeder Commit mit
grünem "pnpm pruefe". Erkläre die Entscheidungen auf Deutsch, so dass ich sie
nachvollziehen und verteidigen kann.

Nicht: Komponenten bauen. Nicht: Bildschirme bauen. Nicht: den Stack ändern.
```

*Danach, für die erste Komponentenwelle — erst wenn AP-1.6 aus `57_Phase0_Arbeitspakete.md` an
der Reihe ist.*

```
Setze die Atome und Moleküle aus docs/designsystem.md §2.1 und §2.2 um, in
src/renderer/bausteine/. Grundlage sind die Artboards "Atome" und "Moleküle" aus
dem Handoff-Bündel.

Reihenfolge: erst die 17 Atome, dann die Moleküle, die nur Atome brauchen, dann
die fünf tragenden Eingabefelder aus §3 (Datumsfeld, Ortsfeld, Personenwähler,
Konfidenzwähler, Vorschlagskarte).

Für jedes Atom und jedes Molekül:
– alle im Dokument genannten Varianten und Zustände
– nur Tokens, keine Farbliterale, keine festen Pixelwerte außer aus der
  Abstandsskala
– Tastaturbedienung vollständig; Fokusring nie entfernt
– Trefferfläche mindestens 32 × 32 px in BEIDEN Dichten
– ein Einheitentest je Komponente: rendert, reagiert auf Tastatur, zeigt den
  gesperrten Zustand, hat kein Farbliteral

Das Datumsfeld ist die wichtigste Komponente der App und braucht besondere
Aufmerksamkeit (docs/designsystem.md §3.1): Die Interpretationszeile
("Verstanden als: etwa 1890 · Genauigkeit Jahr") ist immer sichtbar und
korrigierbar. Die Deutung selbst kommt aus src/core/datum/parser.ts (AP-1.1) —
die Komponente parst nicht selbst. Zustände: leer, tippend mit Deutung, tippend
ohne Deutung, gedeutet, unscharf mit Originaltext, Zeitraum, gesperrt, mit Beleg,
mit konkurrierender Angabe.

Architekturgrenzen aus CLAUDE.md gelten: Der Renderer sieht keine Datenbank. Eine
Komponente holt keine Daten, sie bekommt sie übergeben.

Qualität und Sicherheit: Eingaben validieren (das Datumsfeld nimmt beliebigen Text
an — der Parser muss jeden Unsinn ohne Ausnahme verkraften und "nicht deutbar"
zurückgeben); keine Zugangsdaten; Fehlermeldungen ohne interne Details; Tests für
die Kernlogik jeder Komponente.

Vorgehen: Plan zuerst, meine Zustimmung, dann Komponente für Komponente mit je
einem Commit und grünem "pnpm pruefe". Keine neuen Abhängigkeiten ohne Rückfrage.
```

---

## 13. Was nach dem Handoff noch offen ist

| Punkt | Wann |
|---|---|
| Schriftlizenzen prüfen und die Lizenztexte ins Repository legen | vor dem ersten Build |
| Gewählte Schriften und Symbolsatz als E-Zeile in `00_INDEX.md` festhalten | direkt nach Welle 0 |
| Kartenstil für MapLibre in der Palette | Phase 3 |
| Eigene Tokenmenge für den Druckpfad | Phase 4 |
| Anwendungssymbol für macOS und Windows | Phase 5 |
| Windows-Testrunde mit Bildschirmfotos aus der CI | Ende Phase 2 (E23) |

Die Windows-Testrunde gehört hierher, weil Schriftmetriken und DPI-Skalierung die
Fehlerklasse sind, die die CI nicht fängt (ADR-012) — und ein Designsystem, das nur auf einem
Mac geprüft wurde, ist nur halb geprüft.

---

## 14. Nachzug (06.09.2026) — fehlende Bildschirme aus dem Scope

Nach dem Abgleich des Prototyp-Funktionsumfangs mit dem Scope fehlen Bildschirme, die im Scope stehen, aber in Claude Design noch nicht entworfen sind. Voraussetzung wie in §1: die drei Kontextdateien sind am Projekt angehaengt — dabei die **aktualisierte** Fassung von `72_Screens_und_Flows.md` (enthaelt die S-10/S-11/S-14-Erweiterung „Bestandsaufloesung" und S-35). Reihenfolge: Welle 7 (Kern Phase 0/1), dann Welle 8 (Import-Aufloesung), dann Welle 9 (Zielbild-Rest).

**Zwei Korrekturen am bestehenden Entwurf, die ueberall gelten:**
- Der **Lebensstatus ist dreistufig**: lebend / vermutlich verstorben / verstorben — nicht binaer.
- Ein **Vorschlag oder eine Verbindung sieht nie wie ein fertiger Datensatz aus** — das gilt jetzt auch fuer den neuen „verbindet mit"-Zustand (Welle 8).

### Welle 7 — Fehlende Kern-Bildschirme (Phase 0/1)

*Nach dem bestehenden Entwurf. Gleiche Sprache, gleiche Tokens, beide Themen, echte Beispieldaten aus dem Briefing §7.*

```
Baue die im Scope stehenden, aber noch nicht entworfenen Kern-Bildschirme aus
72_Screens_und_Flows.md: S-02, S-03, S-06, S-08, S-09, S-15, S-16, S-17, S-18.
Gleiche Designsprache und Tokens wie bisher, beide Themen, echte Beispieldaten.

ARTBOARD "S-02 Projekt anlegen" — schmaler Dialog: Projektname, Speicherort
(Systemdialog), Vorschau des Pfades …/MeinStammbaum.ahnen. Zustaende: leer, gueltig,
Name existiert schon, Zielordner nicht schreibbar.

ARTBOARD "S-03 Sync-Ordner-Warnung" — Dialog, ausgeloest bei einem Pfad unter
Dropbox/iCloud/OneDrive. Konkreter Grund (SQLite kann in Sync-Ordnern beschaedigt
werden), zwei Wege: anderen Ort waehlen (Vorgabe) oder trotzdem oeffnen. Der
gefaehrliche Weg ist nicht voreingestellt, aber auch nicht versteckt.

ARTBOARD "S-06 Befehlspalette" — Ueberlagerung oben zentriert (Cmd/Ctrl+K). Ein
Feld, darunter gruppierte Treffer: Personen (mit Lebensdaten und Konfidenz),
Aktionen (Person anlegen, Importieren, Interview beginnen, Rueckgaengig), Orte,
Quellen, Ansichten. Tastenkuerzel rechts an jeder Aktion. Zustaende: leer mit den
haeufigsten Aktionen, tippend mit Treffern, kein Treffer (mit „… als neue Person
anlegen"), Suche ueber Schriftsysteme (Scerbakov findet Щербаков).

ARTBOARD "S-08 Belegdetail" — als Popover bei einem Beleg, als Seitenschublade bei
mehreren. Dreistufig: Quelle -> Zitat -> Transkript in der abgesetzten Schrift. Bei
muendlichen Quellen zusaetzlich Informant (verlinkt), Gespraechsdatum,
Unmittelbarkeit als Abzeichen (selbst erlebt / vom Hoerensagen), Audio-Zeitmarke.

ARTBOARD "S-09 Widerspruchsansicht" — alle konkurrierenden Aussagen zum gleichen
Praedikat nebeneinander, je Wert/Konfidenz/Beleg/Originaltext. Pruefstein: Augusts
zwei Todesdaten — Grabstein 1961 (Konfidenz 3, bevorzugt, mit Begruendung) gegen
Ernas „58 oder 59" (Konfidenz 2). Beide bleiben stehen, keine ist geloescht.
Aktionen: andere bevorzugen (verlangt Begruendung), beide behalten, eine als falsch
markieren.

ARTBOARD "S-15 Pruefhinweise" — Liste der Plausibilitaetsfunde (F-07): je Regel,
betroffene Personen, Sprung dorthin, abhakbar („geprueft, ist korrekt so").
Zustaende: leer (der erfreuliche Fall — entwerfen!), wenige, viele, nur abgehakte.

ARTBOARD "S-16 Aenderungsverlauf" — Transaktionen neu->alt, je Zeitpunkt,
Beschreibung, Art (nutzer/import/wartung), Anzahl Aenderungen; aufklappbar mit
alt/neu. Zurueckgenommene markiert, nicht geloescht.

ARTBOARD "S-17 Wartung" — Schnappschuesse (Liste, Wiederherstellen), „Datenbestand
pruefen", „Abgeleitete Daten neu aufbauen", Journalgroesse/Aufraeumen. Schmucklos,
aber jede Aktion sagt in einem Satz, was sie tut und was sie riskiert.

ARTBOARD "S-18 Einstellungen" — Erscheinungsbild (hell/dunkel/System, Dichte),
Sprache (Umschalter DE/RU/UK/EN), Konfidenz-Vorgaben je Quellenart,
Schnappschuss-Haeufigkeit, Import-Schwellwert, Tastenkuerzel-Uebersicht. Enthaelt
die schon entworfene „Stationsarten verwalten" als eigenen Abschnitt.

Beide Themen. Wo eine Tokenrolle fehlt, benenne sie statt eine Farbe zu erfinden.
```

### Welle 8 — Import-Aufloesung und Interview-Verbindung (D-14/D-15)

*Erweitert die schon entworfene Import-Strecke und den Interview-Modus. Grundlage bleibt der bestehende Entwurf dieser Bildschirme.*

```
Erweitere die Import-Strecke und den Interview-Modus um die Bestandsaufloesung aus
72_Screens_und_Flows.md (S-10/S-11/S-14-Erweiterung vom 06.09.2026).

ARTBOARD "S-10 + Bestandsauszug" — ergaenze zur Dateiwahl die Aktion
„Bestandsauszug fuer den Skill erzeugen" mit einem Satz Erklaerung: sie exportiert
die Personenliste (Name, Lebensjahre, Eltern/Partner), damit der Skill vorhandene
Personen wiedererkennt statt sie zu duplizieren.

ARTBOARD "S-11 Trockenlauf, erweitert" — drei Ergaenzungen am bestehenden Bericht:
1. Umschalter „nach Entitaet / nach Person" in der Berichtskopfzeile. Zeige die
   Personensicht: eine Personenkarte (Erna Wruck) mit gemischt „neu · ergaenzt ·
   im Konflikt".
2. Eine Konfliktzeile mit direkter Wahl „bevorzugen: A / B / beide behalten"
   (Begruendungspflicht); „beide behalten" ist die gleichrangige Vorgabe.
3. Bestandsaufloesung statt blosser Dublettenanzeige: ein Kandidat
   (tmp:august-wruck ~ August Wruck db:018f…, Punktwert 0,72, Begruendung inkl.
   relationalem Grund „soll Vater von Erna sein; Erna hat schon einen Vater") mit
   drei Knoepfen verbinden / getrennt anlegen / spaeter. Dazu eine
   bestaetigungspflichtige Zeile fuer eine vom Skill gesetzte db:-Verknuepfung
   („neues Material haengt an: Erna Wruck db:…", abhakbar).

ARTBOARD "S-14 Interview, Verbinden-Zustand" — eine erkannte Struktur-Karte, deren
Person schon im Baum steht, traegt den Zustand „verbindet mit: Erna Wruck (db:…)" —
bestaetigungspflichtig, mit denselben drei Wegen. Zeige sie neben einer normalen
Vorschlagskarte, damit der Unterschied traegt.

Beide Themen. Grundsatz: nichts wird ohne Bestaetigung geschrieben ODER verbunden
(W-05); ein Vorschlag/eine Verbindung sieht nie wie ein fertiger Datensatz aus.
```

### Welle 9 — Fehlendes Zielbild (Netzwerk, Statistik, Orte)

*Ein Zustand je Bildschirm, echte Dichte, wie die uebrigen Zielbilder.*

```
Baue die drei Zielbild-Ansichten, die noch fehlen: S-33, S-34, S-35 aus
72_Screens_und_Flows.md.

ARTBOARD "S-33 Netzwerk" — Paten- und Zeugengraph (FAN-Prinzip): Personen als
Knoten, Paten-/Trauzeugen-/Informant-Beziehungen als Kanten, Cluster erkennbar.
Faellt aus dem Rollenmodell der Ereignisse. Zeige einen Ausschnitt mit einem
sichtbaren Cluster — eine Patenschaft, die mehrere Familien verbindet.

ARTBOARD "S-34 Statistiken" — Lebenserwartung, Kinderzahl, Heiratsalter,
Namensverteilung, geografische Streuung, Ahnenschwund. Die Diagramme folgen
derselben Datenpalette wie der Baum, nicht einer eigenen. Platzhalterpersonen und
„aus Statistik ausgeschlossene" Personen zaehlen nicht mit — mach das sichtbar.

ARTBOARD "S-35 Orts-Verwaltung" — alle Orte als Liste, Ortsdubletten erkennbar,
umkehrbares Zusammenfuehren zweier Orte. Je Ort: zeitabhaengige Namen mit
Geltungszeitraum, Zugehoerigkeiten (politisch/kirchlich getrennt), Koordinate mit
Herkunft, externe IDs (GOV/GeoNames/Wikidata). Pruefstein: „Marienwerder" (bis 1945)
und „Kwidzyn" (ab 1945) sind EIN Ort mit zwei zeitlich gueltigen Namen — die Ansicht
zeigt einen Ort, nicht zwei.

Beide Themen. Wo eine Tokenrolle fehlt, benenne sie statt eine Farbe zu erfinden.
```
