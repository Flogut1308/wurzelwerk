# Wurzelwerk — Designsystem

**Stand:** 24.08.2026 · **Status:** Spezifikation für den Entwurf, noch keine festgelegten Werte
**Grundlage:** `70_UX_Konzept.md` (§4, §5, §9, §10, §11), `55_Architektur.md` §7, ADR-013, E15, U1–U3
**Zweck:** Der verbindliche Rahmen, in dem Claude Design die Gestaltung erarbeitet — und der
Vertrag, an dem Claude Code sie später umsetzt.

---

## 0. Was hier festgelegt ist und was nicht

Dieses Dokument legt **Namen, Struktur und Bedeutung** fest, nicht Werte. Das ist die
entscheidende Trennung:

| Festgelegt (unveränderlich, ohne neue Entscheidung) | Offen (erarbeitet Claude Design) |
|---|---|
| Welche Tokens es gibt und wie sie heißen | Ihre konkreten Werte |
| Welche Komponenten es gibt, mit welchen Varianten und Zuständen | Wie sie aussehen |
| Welche Eingabefeldtypen es gibt und wie sie sich verhalten | Ihre Proportionen und Details |
| Semantik der Farbrollen | Farbwerte, Abstufungen, Datenpalette |
| Typografische Rollen | Schriftfamilien, Schriftgrade, Zeilenhöhen |
| Barrierefreiheitsschwellen | Wie sie erreicht werden |

**Warum diese Trennung wichtig ist:** Wenn die Tokennamen stehen, bevor die Werte fallen, kann
Claude Design die Gestaltung mehrfach überarbeiten, ohne dass eine Zeile Code angepasst werden
muss. Der Code kennt `--wz-farbe-flaeche-basis`; ob das ein Papierweiß oder ein Beige ist, ist
eine Designentscheidung und keine Codeänderung. Umgekehrt: Wenn Claude Design eigene Namen
erfindet, ist jede Designiteration eine Umbenennungsaktion im Code — und Umbenennungsaktionen
sind laut ADR-021 die Fehlerklasse, die KI-gestützte Entwicklung am zuverlässigsten kaputtmacht.

**Eine Ausnahme ist gesetzt:** der Akzentton ist **gedecktes Petrol / Blaugrün**, Anker etwa
`#35726E`. Begründung: Er muss auf warmem Papierweiß *und* auf Anthrazit funktionieren und darf
nicht mit den Datenfarben kollidieren — die brauchen Rot, Orange, Gelb und Grün für die
Konfidenzstufen. Claude Design bestimmt die Abstufungen und darf den Ton um bis zu 15° im
Farbwinkel verschieben, wenn die Palette dadurch besser zusammenhält; die Farbfamilie bleibt.

---

## 1. Der Token-Vertrag

Namensschema, ausnahmslos: `--wz-<gruppe>-<rolle>[-<variante>]`. Deutsch, weil die
Bezeichnersprache aus ADR-021 auch für Designtokens gilt — ein `--wz-color-surface-primary`
neben einem `personAnlegen()` ist der Anfang von zwei Sprachwelten in einem Projekt.

### 1.1 Farbe — semantische Rollen

Jede Rolle existiert in **beiden** Themen. Der Code benutzt **nie** einen Farbwert direkt und
**nie** eine Palettenstufe (`--wz-grau-300`), sondern immer eine Rolle. Das ist die Regel, an der
sich entscheidet, ob ein Themenwechsel funktioniert.

**Flächen**

| Token | Bedeutung |
|---|---|
| `--wz-flaeche-grund` | Fensterhintergrund, die tiefste Ebene |
| `--wz-flaeche-basis` | Inhaltsfläche, auf der gelesen wird |
| `--wz-flaeche-erhoben` | Panel, Karte, Seitenleiste |
| `--wz-flaeche-ueberlagert` | Modal, Popover, Befehlspalette, Profilüberlagerung |
| `--wz-flaeche-vertieft` | Eingabefeldinneres, Codeblock, Transkriptfläche |
| `--wz-flaeche-hover` | Überfahren, sehr zurückhaltend |
| `--wz-flaeche-aktiv` | gedrückt |
| `--wz-flaeche-auswahl` | ausgewählte Zeile oder Karte (Akzent, stark abgeschwächt) |
| `--wz-flaeche-gesperrt` | deaktivierter Bereich |

**Text**

| Token | Bedeutung |
|---|---|
| `--wz-text-primaer` | Werte, Namen, Inhalte |
| `--wz-text-sekundaer` | Beschriftungen, Metadaten |
| `--wz-text-tertiaer` | Hilfetexte, Zähler, Platzhaltertexte |
| `--wz-text-invers` | Text auf Akzentflächen |
| `--wz-text-gesperrt` | deaktiviert |
| `--wz-text-akzent` | Verweis, angeklickter Zustand |
| `--wz-text-original` | **Originalzitate und Transkripte** — eigene Rolle, weil sie eine eigene Schrift trägt (§2.2) |

**Rahmen und Linien**

| Token | Bedeutung |
|---|---|
| `--wz-rahmen-fein` | Trennlinien, 1 px, die Hauptgliederung nach §10 Prinzip 3 |
| `--wz-rahmen-standard` | Eingabefeldrahmen im Ruhezustand |
| `--wz-rahmen-stark` | Umrandung eines hervorgehobenen Elements |
| `--wz-rahmen-fokus` | **Fokusring.** Immer sichtbar, nie `outline: none`. 2 px plus 2 px Versatz |
| `--wz-rahmen-akzent` | Auswahl, Zentrumsperson |
| `--wz-rahmen-gestrichelt` | **Platzhalterpersonen** (A-17). Muster ist Teil des Tokens |

**Akzent**

`--wz-akzent-basis` · `--wz-akzent-hover` · `--wz-akzent-aktiv` · `--wz-akzent-schwach`
(Flächen) · `--wz-akzent-auf-akzent` (Text darauf)

**Statusrollen** — je in `-basis`, `-flaeche`, `-rahmen`, `-text`:

`--wz-status-info` · `--wz-status-erfolg` · `--wz-status-warnung` · `--wz-status-fehler` ·
`--wz-status-neutral`

**Wichtig:** Statusfarben sind **nicht** dieselben wie Konfidenzfarben. Eine
Konfidenzstufe 1 („Vermutung") ist kein Fehler, und eine gelbe Warnung darf nicht wie
„wahrscheinlich" aussehen. Zwei getrennte Paletten, das ist eine Anforderung an den Entwurf.

### 1.2 Farbe — Datenebenen

`70_UX_Konzept.md` §5 lässt **immer nur eine** Datenebene gleichzeitig aktiv sein, mit Legende.
Jede Ebene ist eine eigene Palette:

| Palette | Art | Stufen | Anforderung |
|---|---|---|---|
| `--wz-daten-konfidenz-1…4` | ordinal, aufsteigend | 4 | Muss als Reihenfolge lesbar sein. Stufe 1 „Vermutung" schwächer, Stufe 4 „gesichert" satter. **Nicht** Rot→Grün als einziger Unterschied: auch Helligkeit muss monoton verlaufen |
| `--wz-daten-generation-1…12` | kategorial, zyklisch | 12, dann Wiederholung | Nachbargenerationen müssen klar unterscheidbar sein; die Palette wiederholt sich ab 13 |
| `--wz-daten-strang-1…8` | kategorial | 8 | Mütterliche und väterliche Linie sollen als Gegensatzpaar erkennbar sein |
| `--wz-daten-geschlecht-m/f/u/x` | kategorial | 4 | Sehr zurückhaltend. Keine Rosa-Hellblau-Konvention |
| `--wz-daten-diagnose-<kategorie>` | kategorial | 11 | Kategorien aus `50_Datenmodell.md` §2.12. Nur in der medizinischen Ansicht |
| `--wz-daten-beziehung-<typ>` | kategorial | 8 | Kantenfarben; die Kantenform trägt die Hauptinformation (§5), Farbe ist sekundär |

**Prüfregeln für alle Datenpaletten**, maschinell nachprüfbar:

1. Jede Farbe erreicht gegen `--wz-flaeche-basis` **und** `--wz-flaeche-erhoben` mindestens **3:1** — sie ist eine Fläche, nicht Text.
2. Text darauf erreicht **4,5:1** (WCAG AA, G-09).
3. Benachbarte Stufen unterscheiden sich in ihrer wahrgenommenen Helligkeit um mindestens 8 Punkte, damit sie auch in Grauumsetzung und im Schwarzweißdruck (E-01, E-02) unterscheidbar bleiben.
4. Unter Deuteranopie und Protanopie bleiben benachbarte Stufen unterscheidbar. **Bedeutung wird nie allein über den Farbton getragen** — es gibt immer eine zweite Kodierung: Form, Muster, Symbol oder Beschriftung.
5. Beide Themen haben eigene Werte, nicht dieselben Farben auf dunklem Grund.

Regel 3 und 4 sind der Grund, warum die Konfidenzpalette nicht einfach eine
Ampel sein kann. Sie muss auf einem gedruckten Poster genauso funktionieren wie am Bildschirm.

### 1.3 Typografie

**Rollen** (feste Namen, offene Werte):

| Token | Verwendung |
|---|---|
| `--wz-schrift-titel-gross` | Profilkopf, Name der Person |
| `--wz-schrift-titel` | Abschnittsüberschrift, Dialogtitel |
| `--wz-schrift-titel-klein` | Gruppenüberschrift im Formular |
| `--wz-schrift-koerper` | Standardtext, Feldwerte |
| `--wz-schrift-koerper-klein` | Tabellenzellen in kompakter Dichte |
| `--wz-schrift-beschriftung` | Feldbeschriftung, Spaltenkopf |
| `--wz-schrift-hilfe` | Hilfetext, Zähler, Zeitangaben |
| `--wz-schrift-original` | **Originalzitate, Transkripte, Originalschreibweisen** |
| `--wz-schrift-technisch` | IDs, Fehlercodes, JSON-Pfade, Prüfsummen |
| `--wz-schrift-zahl-tabelle` | Jahreszahlen und Zahlen in Tabellen — **Ziffern gleicher Breite**, sonst tanzen Spalten |

Jede Rolle bündelt Familie, Grad, Zeilenhöhe, Schriftstärke und Laufweite. Der Code setzt
niemals `font-size` direkt.

**Drei Schriftfamilien, drei Aufgaben:**

| Familie | Aufgabe | Warum getrennt |
|---|---|---|
| `--wz-familie-ui` | Oberfläche | humanistische Sans, gut lesbar in kleinen Graden |
| `--wz-familie-original` | Originalzitate, Transkripte | **Der Nutzer muss auf einen Blick sehen, was Quelle und was Interpretation ist.** Das ist keine Zierde, sondern die typografische Umsetzung von Leitprinzip 1 aus `10_Vision_Scope.md` §4 |
| `--wz-familie-technisch` | IDs, Codes, Pfade | `tmp:august-wruck` und `IMP-302` müssen zeichengenau lesbar und kopierbar sein |

**Anforderungen an die Schriftwahl** — Claude Design entscheidet, aber innerhalb dieser Grenzen:

1. **Lizenz erlaubt das Mitliefern in einer Desktop-Anwendung.** SIL Open Font License oder vergleichbar. Die App ist offline (G-02) und darf keine Schriften nachladen.
2. **Kyrillisch vollständig**, polnische Diakritika vollständig (`ą ć ę ł ń ó ś ź ż`). Nicht verhandelbar: ADR-014 verlangt, dass Original und Umschrift nebeneinander stehen. Eine Schrift ohne Kyrillisch macht die Hälfte des Forschungsraums unlesbar.
3. **Ziffern gleicher Breite** verfügbar (`tabular-nums`), für Jahreszahlen in Tabellen.
4. **Echte Kursive**, keine mechanisch geneigte — Originalzitate werden kursiv gesetzt.
5. Mindestens die Stärken 400, 500 und 600. Variable Schrift bevorzugt (eine Datei statt sechs).

**Ausdrücklich nicht** (§4 nennt die vollständige Sperrliste): Inter, Roboto und die weiteren
üblichen Verdächtigen. Das ist eine gesetzte Anforderung, keine Empfehlung.

### 1.4 Abstände, Radien, Schatten

**Abstände** auf einem 4-px-Raster: `--wz-abstand-0` bis `--wz-abstand-24`
(0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96). Nur diese Werte, keine Zwischenwerte.

**Radien:** `--wz-radius-klein` (Abzeichen, Chip) · `--wz-radius-standard` (Eingabefeld,
Schaltfläche) · `--wz-radius-gross` (Karte, Panel) · `--wz-radius-modal` · `--wz-radius-voll`
(Kreis). Richtwert aus §11: 6–10 px, „weich und klein".

**Schatten:** `--wz-schatten-keiner` · `--wz-schatten-panel` · `--wz-schatten-popover` ·
`--wz-schatten-modal`. Nach §10 Prinzip 3 dienen Schatten **nur** der Ebenentrennung bei
Überlagerungen, nie der Gliederung von Inhalt. Vier Stufen sind genug; wer eine fünfte braucht,
hat ein Layoutproblem.

### 1.5 Bewegung

`--wz-dauer-sofort` (0 ms) · `--wz-dauer-kurz` (120 ms) · `--wz-dauer-mittel` (160 ms) ·
`--wz-dauer-lang` (200 ms) · `--wz-kurve-standard` · `--wz-kurve-hinein` · `--wz-kurve-hinaus`

Regel aus §10 Prinzip 5: **Bewegung erklärt Zusammenhang, sonst gibt es keine.** Erlaubt sind
genau fünf Fälle: Ein- und Ausklappen im Baum, Zoom, Zeitregler, Überlagerung öffnen und
schließen, Seitenschublade. Alles andere ist statisch. Kein Pulsieren, kein Hüpfen, kein
Ladebalken, der sich bewegt, ohne Fortschritt zu kennen.

`@media (prefers-reduced-motion: reduce)` setzt alle Dauern auf `--wz-dauer-sofort`. Das ist
eine Zeile und muss von Anfang an drin sein.

### 1.6 Dichte

Zwei Stufen (§9), als Datenattribut am Wurzelelement, nicht als zweite Komponentenmenge:

| Token | komfortabel | kompakt |
|---|---|---|
| `--wz-zeilenhoehe-tabelle` | großzügig | eng |
| `--wz-abstand-feld` | großzügig | eng |
| `--wz-innenabstand-zelle` | großzügig | eng |
| `--wz-schrift-koerper` | Standardgrad | eine Stufe kleiner |

Nur diese vier Tokens ändern sich. **Alles andere bleibt gleich** — insbesondere Schriftfamilien,
Farben, Radien und Trefferflächen. Die kompakte Stufe ist für Tabellen und den Interview-Modus
gedacht, nicht als „App kleiner machen".

Minimale Trefferfläche in **beiden** Stufen: 32 × 32 px. Die kompakte Stufe verkleinert die
Anzeige, nicht die Klickziele.

### 1.7 Die CSS-Grundstruktur

Diese Struktur ist verbindlich, weil an ihr der Themenwechsel hängt:

```css
:root {
  /* Rollentokens — vollständige helle Fassung */
  --wz-flaeche-grund: …;
  --wz-text-primaer: …;
  /* … */
}

:root:not([data-theme="hell"]) {
  @media (prefers-color-scheme: dark) {
    /* nur die Rollen, die sich ändern */
  }
}

:root[data-theme="dunkel"] { /* dieselben Überschreibungen, explizit gewählt */ }
:root[data-theme="hell"]   { /* helle Rollen, explizit gewählt */ }

:root[data-dichte="kompakt"] { /* die vier Dichtetokens aus §1.6 */ }
```

Drei Regeln dazu, jede aus einem konkreten Fehler geboren:

1. **Keine Farbe hat ihre einzige Definition in einem Medien- oder Themenblock.** Sonst fehlt sie in der jeweils anderen Fassung, und niemand merkt es, bis jemand umschaltet.
2. **Kein `!important`, keine Farbliterale außerhalb von `:root`.** Ein Lint-Test prüft das: keine Hex-, `rgb()`- oder `hsl()`-Werte in Komponentendateien.
3. **Die Themenwahl hat drei Zustände** — hell, dunkel, Systemvorgabe. Die Systemvorgabe ist die Standardeinstellung und stempelt kein `data-theme`.

---

## 2. Atomic Design — das Komponenteninventar

Fünf Ebenen nach Brad Frost. Die Zuordnung ist kein Selbstzweck: Sie sagt, **wo eine Änderung
hingehört**. Wenn eine Änderung an einem Atom nötig ist, um ein Organismus-Problem zu lösen, ist
meistens das Organismus falsch gebaut.

### 2.1 Atome

Kleinste Einheiten. Kein eigener Zustand außer visuellem, keine Fachlogik, kein Datenzugriff.

| Atom | Varianten | Zustände |
|---|---|---|
| `Text` | die 10 Rollen aus §1.3 | — |
| `Symbol` | Größen 16/20/24 | — |
| `Schaltflaeche` | primär · sekundär · unauffällig · gefährlich | ruhe · hover · aktiv · fokus · gesperrt · ladend |
| `SchaltflaecheSymbol` | dieselben vier | dieselben sechs |
| `Eingabekoerper` | — (der Rahmen, den alle Feldtypen benutzen) | ruhe · hover · fokus · gefüllt · ungültig · gesperrt · nur-lesen |
| `Abzeichen` | neutral · info · erfolg · warnung · fehler | — |
| `KonfidenzPunkt` | Stufe 1–4 | — |
| `WiderspruchZeichen` | — | — |
| `Trennlinie` | waagerecht · senkrecht | — |
| `Fokusring` | — | — |
| `Ladeschimmer` | Zeile · Block · Kreis | — |
| `TastenKappe` | — | — (zeigt `⌘K` bzw. `Ctrl+K`, plattformabhängig) |
| `Zaehler` | — | — |
| `Umschalter` | — | ein · aus · unbestimmt · gesperrt |
| `Kontrollkaestchen` | — | dieselben vier |
| `Optionsfeld` | — | dieselben vier |
| `Fortschritt` | bestimmt · unbestimmt | — |

**`KonfidenzPunkt` und `WiderspruchZeichen` sind zwei getrennte Atome**, und das ist die
wichtigste Entwurfsentscheidung dieses Abschnitts. `50_Datenmodell.md` §2.16 legt fest:
Konfidenz ist eine Eigenschaft der **einzelnen Aussage**, „widersprüchlich" ist ein abgeleiteter
Zustand der **Menge** von Aussagen. Zwei Begriffe, zwei Zeichen. Wer daraus eine fünfte
Konfidenzstufe macht, hat das Datenmodell missverstanden — und die Oberfläche würde es
zementieren.

### 2.2 Moleküle

Zusammensetzungen aus Atomen. Kennen ihre eigene Gültigkeit, aber keine Datenquelle.

| Molekül | Enthält | Besonderheit |
|---|---|---|
| `Formularfeld` | Beschriftung + Feld + Hilfetext + Fehlermeldung + Konfidenzwähler + Belegabzeichen | Die Hülle, die **jedes** Datenfeld trägt. Der Belegapparat ist hier immer erreichbar und nie im Weg (§1) |
| `Textfeld` | Eingabekörper | einzeilig |
| `Langtextfeld` | Eingabekörper | wächst mit, Höhenbegrenzung |
| `Zahlfeld` | Eingabekörper | Ziffern gleicher Breite |
| `Datumsfeld` | Eingabekörper + Interpretationszeile + Kalenderwahl | **Die wichtigste Komponente der App.** Siehe §3.1 |
| `Zeitraumfeld` | zwei Datumsfelder | von–bis, mit offener Seite |
| `Ortsfeld` | Eingabekörper + Vorschlagsliste + Hierarchiepfad | Siehe §3.2 |
| `Personenwaehler` | Eingabekörper + Trefferliste + „neu anlegen" | Siehe §3.3 |
| `Auswahlfeld` | Eingabekörper + Liste | einfach |
| `Mehrfachauswahl` | Eingabekörper + Chips + Liste | |
| `Konfidenzwaehler` | vier `KonfidenzPunkt` als Gruppe | Siehe §3.4 |
| `Suchfeld` | Eingabekörper + Löschknopf + Trefferzähler | |
| `Filterchip` | Abzeichen + Löschknopf | |
| `Belegabzeichen` | Zähler + Konfidenzpunkt | öffnet das Belegpopover |
| `BelegPopover` | Quellenzeile + Zitat + Transkript | Transkript in `--wz-familie-original` |
| `Hinweisstreifen` | Symbol + Text + optionale Aktion | info · warnung · fehler · erfolg |
| `Tabellenzeile` | Zellen + Auswahlzustand | drei Zustände: normal, ausgewählt, Platzhalter (gestrichelt) |
| `Vorschlagskarte` | Inhalt + Bestätigen + Verwerfen | drei Zustände: Vorschlag (grau) · bestätigt · verworfen |
| `Umschaltergruppe` | segmentierter Umschalter | z. B. „Selbsterlebtes / Vom Hörensagen" |
| `Reiter` | Reiterleiste | |
| `Blaetterleiste` | | |
| `LeerzustandBlock` | Symbol + Satz + Aktion | |
| `KopfzeileAbschnitt` | Titel + Zähler + Aktion | |
| `MedienMiniatur` | Bild + Titel + Datum | |
| `AudioZeitmarke` | Abspielknopf + Zeit | verweist auf eine Stelle in einer Audiodatei (A-16) |

### 2.3 Organismen

Fachlich bedeutsame Bereiche. Kennen Daten, aber holen sie nicht selbst — sie bekommen sie
übergeben. (Das ist die Renderer-Seite der Grenze aus ADR-016.)

| Organismus | Zweck | Referenz |
|---|---|---|
| `Kopfzeile` | Suche, Zentrumsperson, Ansichtsmodus, Zeitregler | 70_UX §2 |
| `SeitenleisteLinks` | Navigation, Filter, gespeicherte Ansichten | 70_UX §2 |
| `SeitenleisteRechts` | Detail der Auswahl | 70_UX §2 |
| `Fusszeile` | Speicherstatus, Personenzahl, Prüfhinweise | 55_Arch §7.5 |
| `Befehlspalette` | ⌘K — jede Aktion und jede Person über Tippen | 70_UX §7 |
| `Datentabelle` | Spaltenwahl, Sortierung, virtualisiertes Scrollen | C-16 |
| `Profilkopf` | Name, Lebensdaten, Titelbild, Konfidenz-Gesamtlage | C-04 |
| `EreignisZeitstrahl` | Ereignisse chronologisch, Kontext naher Verwandter | C-15 |
| `Belegliste` | Quelle → Zitat → Aussage, dreistufig | B-01 |
| `Widerspruchsblock` | konkurrierende Aussagen nebeneinander, bevorzugte hervorgehoben, mit Begründung | B-04, E21 |
| `Beziehungsliste` | Eltern, Partner, Kinder, Geschwister — mit Kantentyp und „hinzufügen" an jeder Stelle | A-13, 70_UX §7 |
| `GesundheitsBlock` | Diagnosen und Risikofaktoren + fester Exportsperrhinweis | M-08 |
| `TrockenlaufBericht` | die sieben Blöcke | 56_Import §6.2 |
| `FehlerlisteImport` | IMP-Codes mit Pfad, Zeile, „Was tun" | 56_Import §5 |
| `InterviewZweispalter` | links Freitext, rechts erkannte Struktur | 70_UX §12 |
| `Pruefhinweisliste` | Plausibilitätsfunde, abhakbar | F-07 |
| `Aenderungsverlauf` | Journal, lesbar, mit Rücknahmemöglichkeit | F-02 |
| `Personenkarte` | vier Dichtestufen: Punkt · kompakt · standard · ausführlich | 70_UX §4 |
| `DatenebenenWaehler` | Auswahl **einer** Ebene + Legende | 70_UX §5 |
| `Zeitregler` | Zeitpunkt- und Zeitraummodus, Abspielen | C-13 |
| `Zusammenfuehrungstabelle` | drei Spalten A / Ergebnis / B, feldweise | D-04, 70_UX §8 |
| `Genogramm` | Symbolsprache der medizinischen Ansicht | M-06, 70_UX §13 |
| `Modal` | Titel, Inhalt, Fußaktionen | |
| `Seitenschublade` | von rechts, für Detailformulare | |
| `Vollseitenueberlagerung` | Profil — Kontext bleibt darunter erhalten | 70_UX §2 |

### 2.4 Templates

Layoutgerüste ohne Inhalt. Vier reichen:

| Template | Aufbau | Verwendung |
|---|---|---|
| `T-Shell` | Kopfzeile / linke Leiste / Arbeitsbereich / rechte Leiste / Fußzeile, Leisten einklappbar | jede Hauptansicht |
| `T-Vollseite` | zentrierte Spalte über dem abgedunkelten Shell | Profil |
| `T-Dialog` | Modal, drei Breiten (schmal 480 / mittel 640 / breit 960) | Anlegen, Bestätigen, Zusammenführen |
| `T-Assistent` | Schrittleiste + Inhalt + Fußnavigation | Import: Datei → Trockenlauf → Ausführung |
| `T-Leer` | zentrierter Leerzustand | Startbildschirm, leeres Projekt |

### 2.5 Pages

Die konkreten Bildschirme mit echten Beispieldaten. Vollständig in `72_Screens_und_Flows.md`.

**Regel für alle Entwürfe: echte Daten, keine Blindtexte.** Die Beispieldaten stehen in
`73_Design_Briefing.md` §7 und Anhang A (im Klartext, weil Claude Design kein JSON verarbeitet),
im Rohformat in `56_Beispiele/` — Karl Friedrich Gutnoff, Emma Wruck, August Wruck mit seinen zwei
widersprüchlichen Todesdaten, Marienwerder/Kwidzyn, Walter Wruck mit der Staublunge. Ein Entwurf
mit „Lorem ipsum" oder „John Doe" beweist nichts: Die Frage ist, ob „Щербаков / Ščerbakov" in
eine Zeile passt und ob „zwischen 1750 und 1760, verstanden als etwa 1755" die Zeile sprengt.

---

## 3. Die fünf Eingabefelder, die dieses Produkt tragen

Alles bis hierher ist Handwerk. Diese fünf Felder sind der Punkt, an dem Wurzelwerk
gestalterisch eigenständig werden muss — weil keine der Referenzen aus U2 mit Unsicherheit
umgeht.

### 3.1 `Datumsfeld` — tolerante Eingabe mit sichtbarer Interpretation

Die wichtigste Komponente der ganzen App. Anforderung A-03, Ergonomie aus 70_UX §7.

**Verhalten:** Der Nutzer tippt frei. Unter dem Feld erscheint beim Tippen die Interpretation.

```
┌─────────────────────────────────────────────┐
│ um 1890                                     │   ← freie Eingabe
└─────────────────────────────────────────────┘
  Verstanden als: etwa 1890 · Genauigkeit Jahr        ← Interpretationszeile
  ⌄ Kalender: gregorianisch · Originaltext übernehmen
```

**Zwingende Eigenschaften:**

1. **Die Interpretation ist immer sichtbar**, nicht erst beim Verlassen des Feldes. Der Nutzer muss widersprechen können, bevor er weitertippt.
2. **Sie ist anklickbar und korrigierbar.** Modifikator und Genauigkeit lassen sich einzeln überschreiben, wenn die Deutung falsch war.
3. **Der Originaltext wird immer angeboten** und bei allem außer `exakt` automatisch übernommen — das ist die Schemaregel aus `56_Import_Vertrag.md` §2.4 in Oberflächenform.
4. **Vorgabe im Interview-Modus ist `etwa`, nicht `exakt`** (70_UX §12 Regel 3). Das Feld weiß, in welchem Kontext es steht.
5. **Kalendersystem ist eingeklappt**, aber nie mehr als einen Klick entfernt. Für den Forschungsraum bis 1700 (E9) ist das kein Randfall.
6. **Doppeldatierung** (`1731/32`) wird erkannt und als solche angezeigt, nicht auf ein Jahr gerundet.

Zu entwerfende Zustände: leer · tippend mit gültiger Deutung · tippend ohne Deutung
(`31.02.1900`) · gedeutet und bestätigt · unscharf mit Originaltext · Zeitraum · gesperrt ·
mit Beleg · mit konkurrierender Angabe.

**Der Entwurfsprüfstein:** „zwischen 1750 und 1760" muss ohne Zeilenumbruch und ohne Sprung im
Layout darstellbar sein — sonst hüpft jede Tabelle beim Tippen.

### 3.2 `Ortsfeld` — Hierarchie beim Tippen

Anforderung A-04. Ein Ort ist keine Zeichenkette, sondern ein Objekt mit zeitabhängigen Namen
und zwei getrennten Zugehörigkeitsketten (politisch und kirchlich).

```
┌─────────────────────────────────────────────┐
│ Marienw…                                    │
└─────────────────────────────────────────────┘
  Marienwerder  ·  Kreis Marienwerder · Westpreußen · Preußen    bis 1945
  Kwidzyn       ·  Powiat Kwidzyński · Polen                     ab 1945
  ─────────────────────────────────────────────
  ＋ „Marienw…" als neuen Ort anlegen
```

**Zwingend:** Die Hierarchie steht **im Vorschlag**, nicht erst nach der Auswahl — sonst wählt
man das falsche von drei gleichnamigen Dörfern. Der zeitliche Geltungsbereich steht rechts. Nach
der Auswahl zeigt das Feld den zum Ereignisdatum gültigen Namen, mit dem heutigen als
Nebeninformation. „Neu anlegen" ist immer die letzte Zeile, nie ein separater Knopf.

### 3.3 `Personenwaehler`

Aus A-13 („aus jedem Kontext anlegen"). Sucht über Original, Umschrift und Suchnormalform
gleichzeitig (ADR-014) sowie phonetisch. Zeigt je Treffer Name, Lebensdaten, Geburtsort und
Konfidenz — genug, um zwei gleichnamige Vettern zu unterscheiden, was im Forschungsraum der
Normalfall ist. Letzte Zeile immer: „als neue Person anlegen", zweite letzte: „als Platzhalter
anlegen".

### 3.4 `Konfidenzwaehler`

Vier Stufen (E21), als Gruppe von vier Punkten mit Beschriftung beim Überfahren. **Kein
Auswahlfeld** — die Skala ist ordinal und soll als Skala aussehen. Kein Vorgabewert bei einer
neuen Aussage: Der Kontext setzt ihn (mündlich + selbst erlebt → 3, vom Hörensagen → 2, eigener
Schluss → 1), und der Nutzer sieht, dass er gesetzt wurde und woher.

Direkt daneben, aber getrennt: das `WiderspruchZeichen`, wenn es konkurrierende Angaben gibt.

### 3.5 `Vorschlagskarte` (Interview-Modus)

Der Kern von 70_UX §12. Drei Zustände — Vorschlag (grau, nicht geschrieben), bestätigt (normal,
geschrieben), verworfen (ausgeblendet, wiederherstellbar). Jede Karte trägt den
**Originalwortlaut** aus dem Textfeld sichtbar mit, in `--wz-familie-original`. Bestätigen mit
einer Taste, ohne Maus, ohne Dialog.

Die gestalterische Aufgabe: **Ein Vorschlag darf nie wie ein Datensatz aussehen.** Regel 1 aus
70_UX §12 ist „nichts wird ohne Bestätigung geschrieben" — wenn Vorschlag und bestätigt sich nur
in einer Nuance unterscheiden, ist die Regel technisch erfüllt und praktisch gebrochen.

---

## 4. Die Sperrliste — was ausdrücklich nicht entstehen soll

Diese Liste steht hier, weil der Entwurf von einem Sprachmodell gemacht wird und Sprachmodelle
einen erkennbaren Standardgeschmack haben. Was hier steht, ist keine Geschmacksfrage, sondern
eine Abgrenzung: **Wurzelwerk soll nicht aussehen wie ein 2026er KI-Startup-Dashboard.**

### 4.1 Schriften — gesperrt

Inter · Roboto · Open Sans · Lato · Montserrat · Poppins · Nunito · Nunito Sans · Manrope ·
Space Grotesk · DM Sans · Plus Jakarta Sans · Geist · Figtree · Outfit · Sora · Urbanist ·
Work Sans · Rubik · Karla · Mulish · Raleway · JetBrains Mono · Fira Code · Source Code Pro ·
SF-Pro- und Segoe-Nachbauten.

**Kriterien statt Namen** (§1.3 nennt die harten): humanistisch statt geometrisch, echte
Kursive, Ziffern gleicher Breite, vollständiges Kyrillisch, OFL. Eine Schrift mit etwas
Eigencharakter ist erwünscht — eine Anwendung, die man abends eine Stunde benutzt, darf einen
Klang haben.

### 4.2 Farbe — gesperrt

- Indigo-Violett `#6366F1` und die ganze KI-Produkt-Familie ringsherum
- Violett-nach-Blau- und Blau-nach-Cyan-Verläufe, überhaupt Verläufe als Flächenfarbe
- Tailwinds Standardpaletten Stufe für Stufe übernommen
- Neonakzente auf dunklem Grund
- reines `#FFFFFF` und reines `#000000` als Grundflächen (§11 verlangt getönte Gründe)
- Rosa/Hellblau für Geschlecht
- Farbe als Dekoration. Nach §10 Prinzip 2 bedeutet jede Farbe außer dem Akzent etwas, und was sie bedeutet, steht in einer Legende

### 4.3 Form und Effekt — gesperrt

Glasmorphismus und Weichzeichnung hinter Flächen · Neumorphismus · große Radien über 12 px ·
Schlagschatten zur Gliederung von Inhalt (nur Ebenentrennung, §1.4) · Emoji als
Oberflächensymbole · Illustrationen im flachen Firmenstil · Rahmen um jeden Kasten · mehr als
eine Akzentfarbe · Pulsieren, Hüpfen, Aufmerksamkeitsanimationen · Marketingsprache in der
Oberfläche („Los geht's!", „Großartig!").

### 4.4 Sprache in der Oberfläche

Deutsch, sachlich, in der Sie-Form vermeidend — die App spricht in Substantiven und
Aufforderungen, nicht in Sätzen an den Nutzer. „Person anlegen", nicht „Legen Sie eine Person
an". Fehlermeldungen nennen die Ursache und den Ausweg (`55_Architektur.md` §10.1), nicht ihr
Bedauern. Keine Ausrufezeichen. Kein „Ups".

---

## 5. Barrierefreiheit — die Schwellen

G-09 verlangt WCAG AA. Konkret heißt das:

| Prüfpunkt | Schwelle |
|---|---|
| Text auf Fläche | 4,5:1 · große Grade 3:1 |
| Bedienelementrahmen gegen Umgebung | 3:1 |
| Fokusring gegen beide Nachbarflächen | 3:1 |
| Datenfarben als Fläche | 3:1 (§1.2) |
| Trefferfläche | ≥ 32 × 32 px, in beiden Dichten |
| Tastaturbedienung | **jede** Funktion ohne Maus erreichbar (70_UX §7) |
| Fokusreihenfolge | folgt der Leserichtung, Überlagerungen fangen den Fokus |
| Bedeutung durch Farbe allein | verboten — immer zweite Kodierung |
| Bewegung | `prefers-reduced-motion` respektiert |
| Schriftvergrößerung | Layout hält bis 200 % ohne Verlust von Funktion |

Der letzte Punkt ist der, der bei dichten Tabellen zuerst bricht — und er gehört deshalb in den
Entwurf, nicht in die Nachbesserung.

**Nicht im Anspruch für Phase 0–2:** vollständige Screenreader-Optimierung der Baumansicht. Ein
Graph mit 2.000 Knoten ist für einen Screenreader kein sinnvolles Ziel; die **Listenansicht** ist
der barrierefreie Zugang zu denselben Daten. Das ist eine bewusste Grenze und keine Nachlässigkeit
— sie steht hier, damit sie später nicht als Versehen erscheint.

---

## 6. Assets

| Asset | Anforderung | Wann |
|---|---|---|
| **Symbolsatz** | ein einziger, durchgehend; Strichstärke passend zur Schrift; **kein Emoji**. Nicht die üblichen Verdächtigen aus §4 — ein Satz mit etwas Charakter, aber vollständig genug für ~80 Symbole | Phase 0 |
| **Fachsymbole** | Geburt, Taufe, Trauung, Tod, Beerdigung, Auswanderung, Beruf, Militär, Quelle, Zitat, Archiv, Platzhalter, Implex, Konfidenz, Widerspruch, Interview, Audio | Phase 1 |
| **Genogramm-Symbole** | Quadrat/Kreis/Raute für Geschlecht, Füllung für Betroffenheit, Schraffur für Erinnerungsdiagnose, Randsymbole für Risikofaktoren | Phase 5 |
| **Kantenformen** | durchgezogen biologisch · gestrichelt adoptiv/Stief · doppelt Ehe · doppelt-durchkreuzt Scheidung · punktiert ungesichert (70_UX §5) | Phase 2 |
| **Anwendungssymbol** | macOS (rund, mehrere Größen) und Windows (`.ico`), aus einem Motiv. Wurzelgeflecht, nicht Baum — der Name trägt die fachliche Einsicht, dass Verwandtschaft ein Netz ist | Phase 5 (Auslieferung), Entwurf jetzt |
| **Leerzustandsgrafiken** | sehr zurückhaltend, einfarbig, keine Illustrationen im Firmenstil | Phase 1 |
| **Schriftdateien** | die gewählten Familien als variable Schriften, mit Lizenztext im Repository unter `docs/lizenzen/` | Phase 0 |
| **Kartenstil** | MapLibre-Stildatei passend zur Palette, hell und dunkel (ADR-007) | Phase 3 |
| **Druckfassung** | eigene Tokenmenge für Papier: Weiß als Grund, Datenfarben druckfest, Konfidenz auch in Graustufen unterscheidbar | Phase 4 |

Die Druckfassung ist der Punkt, an dem sich rächt, wenn die Datenpaletten nur am Bildschirm
geprüft wurden. Genealogen drucken (`40_Anforderungen.md` Lückenanalyse Punkt 3) — ein Poster
über dem Sofa ist ein erklärtes Produktziel.

---

## 7. Wie das Designsystem in den Code kommt

| Designartefakt | Zielort im Repository | Arbeitspaket |
|---|---|---|
| Tokenwerte, beide Themen | `src/renderer/gestaltung/tokens.css` | AP-0.2 (Gerüst), Werte mit dem Entwurf |
| Grundstile, Zurücksetzung | `src/renderer/gestaltung/basis.css` | AP-0.2 |
| Atome und Moleküle | `src/renderer/bausteine/` | ab AP-1.6 |
| Organismen | `src/renderer/ansichten/*/` bzw. `bausteine/` bei Wiederverwendung | ab AP-1.6 |
| Symbole | `src/renderer/gestaltung/symbole/` | AP-1.6 |
| Schriften | `src/renderer/gestaltung/schriften/` + Lizenzen | AP-0.3 |

**Zwei Tests, die das Designsystem am Leben halten:**

1. `test/gestaltung/tokens-vollstaendig.test.ts` — jede in §1 genannte Rolle existiert in **beiden** Themen. Eine fehlende Rolle in der dunklen Fassung ist der Fehler, der erst beim Umschalten auffällt.
2. `test/gestaltung/keine-literale.test.ts` — keine Farbliterale außerhalb von `tokens.css`. Das ist die Regel, an der Themenfähigkeit tatsächlich hängt, und sie hält nur, wenn sie geprüft wird.

Beide gehören in AP-0.14 (Grenzen durchsetzen) — es sind Grenzen wie die
Architekturgrenzen, nur für die Gestaltung.

---

## 8. Offene Punkte, die dieses Dokument aufwirft

| # | Punkt | Vorschlag |
|---|---|---|
| V10 | Schriftfamilien — welche drei? | Claude Design entscheidet nach §1.3 und §4.1. Danach als E-Zeile in `00_INDEX.md` festhalten, weil es eine Lizenz- und Auslieferungsentscheidung ist |
| V11 | Symbolsatz | dito |
| V12 | Genaue Tokenwerte | Ergebnis der Designarbeit; Namen sind gesetzt |
| V13 | Kompakte Dichte als Vorgabe im Interview-Modus? | Ja, vorgeschlagen — dort zählt Zeilen pro Bildschirm mehr als Ruhe |
| V14 | Screenreader-Grenze bei der Baumansicht (§5) | wie beschrieben akzeptieren oder widersprechen |
