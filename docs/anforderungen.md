# Wurzelwerk — Anforderungen

Legende Priorität: **M** = Must (ohne das ist es kein Produkt) · **S** = Should (deutlicher Wertverlust ohne) · **C** = Could (schön, verschiebbar) · **W** = Won't (bewusst draußen)
Spalte "Ph" = Roadmap-Phase aus `10_Vision_Scope.md`.
Herkunft: **[Idee]** = aus Florians ursprünglicher Beschreibung · **[Lücke]** = fehlte in der Idee, aus Recherche ergänzt · **[Chance]** = Differenzierungsmöglichkeit, die in der Idee angelegt aber nicht ausformuliert war.

---

## A. Datenerfassung

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| A-01 | Person mit frei konfigurierbaren Feldern, Profilseite mit vollem Umfang | M | 1 | [Idee] |
| A-02 | Mehrere typisierte Namen pro Person (Geburtsname, Ehename, vulgo, latinisiert), Rufname markierbar, Originalschreibweise pro Beleg | M | 1 | [Lücke] |
| A-03 | Strukturierte Datumsangaben: Präzision, Modifikator (etwa/vor/nach/zwischen/von-bis), Teilangaben, Originaltext, Kalendersystem | M | 1 | [Lücke] |
| A-04 | Ort als eigene Entität mit zeitabhängigen Namen und zeitabhängiger Hierarchie (politisch + kirchlich getrennt) | M | 1 | [Lücke] |
| A-05 | Ereignisse mit Rollenbeteiligung (Paten, Trauzeugen, Informant, Pfarrer) statt fester Personenfelder | M | 1 | [Lücke] |
| A-06 | Typisierte Elternschaftskanten (biologisch/adoptiv/Stief/Pflege/anerkannt), beliebig viele pro Kind | M | 1 | [Lücke] |
| A-07 | Typisierte Partnerschaften mit Beginn, Ende und Endgrund (Scheidung ≠ Annullierung), Mehrfach- und Überlappungsfähigkeit | M | 1 | [Idee] erweitert |
| A-08 | Beruf(e) und Wohnort(e) je mit Zeitraum, mehrfach | M | 1 | [Idee] erweitert |
| A-09 | Freie benutzerdefinierte Felder/Attribute pro Person und Ereignis — **Feld-Definitionssystem**, siehe A-18 | M | 1 | [Idee] E11 |
| A-10 | Medien: Fotos, Dokumente, Scans mit Datum, Ort, Beschreibung, Zuordnung zu Person/Ereignis/Quelle | M | 1 | [Idee] |
| A-11 | Personenmarkierung in Fotos (Bildregion → Person) | C | 5 | [Chance] |
| A-12 | Personen ohne jede Verknüpfung müssen existieren dürfen (Ortsfamienbuch-Logik) | M | 1 | [Lücke] |
| A-13 | Schnelleingabe: aus jedem Kontext Partner/Kind/Eltern anlegen, Tastaturbedienung durchgängig, Befehlspalette | M | 1 | [Chance] |
| A-14 | Erfassungsmaske orientiert am Kirchenbucheintrag (alle Beteiligten in einem Formular) | S | 6 | [Chance] · **zurückgestellt (F6: noch keine Kirchenbucharbeit)** |
| A-15 | **Interview-Modus**: ein Gespräch als Sitzung erfassen; unstrukturierte Notizen einwerfen; App erzeugt Personen-/Ereignisvorschläge zur Bestätigung | M | 1 | [Lücke] E6 |
| A-16 | Vorhandene Audiodateien als Medium einbinden, mit Zeitmarken auf einzelne Aussagen verweisbar. **Keine Aufnahmefunktion in der App** | S | 1 | E19 |
| A-19 | Automatische Umschrift kyrillischer Namen und Ortsnamen (ISO 9 / DIN 1460), plus Normalisierung polnischer Diakritika für die Suche; Originalschreibweise bleibt führend | S | 1 | E20 |
| A-17 | Platzhalterpersonen ("Vater unbekannt") als eigener Personentyp, aus Statistiken und Export ausgeschlossen | M | 1 | D4 |
| A-18 | **Feld-Definitionssystem**: eigene Felder anlegen mit Name, Typ (Text/Zahl/Datum/Auswahl/Ort/Person/Ja-Nein/URL), Gruppe, Reihenfolge, Mehrfachwert, Zeitraumfähigkeit; gilt für Person, Ereignis, Ort, Quelle | M | 1 | E11 |
| A-20 | Freie Schlagworte/Tags pro Person und Ereignis, filter- und suchbar (ergänzt A-18) | S | 1 | [Lücke] · Wettbewerb: Legacy Hashtags |
| A-21 | Datums-/Kalenderrechner als Werkzeug (Alter↔Jahr, Datumsdifferenz, julianisch/gregorianisch), über die Befehlspalette erreichbar | C | 2 | [Lücke] |
| A-22 | Erzähl-/Geschichten-Baustein: strukturierter Fließtext an einer Person, im Familienbuch druckbar (ergänzt die Notiz) | C | 4 | [Lücke] · Wettbewerb: Legacy Stories |
| A-23 | **Lebensstationen** als typisierte, wiederholbare Einträge (Beruf, Wohnort, Ausbildung, Militärdienst, Ereignis, Auswanderung/Umsiedlung, Religion/Konfession, Mitgliedschaft, Auszeichnung/Titel) mit **konfigurierbarem Stationsarten-Katalog**: je Art Farbe, Zeitform (Zeitraum/Einzeldatum), Ortsbindung inkl. zweitem Ort (von→nach), „laufend erlaubt", „in Zeitleiste anzeigen", aktiv/aus, Standard/eigen, sortierbar, deaktivieren statt löschen | M | 1 | [Claude Design] · verallgemeinert A-08 · Modell-Abgleich V18 |
| A-24 | „Aus Statistik ausschließen"-Flag pro Person (allgemein, über den Platzhalterfall A-17 hinaus) | C | 4 | [Claude Design] |

## B. Quellen und Belege

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| B-01 | Dreistufig: Quelle → Zitat (Seite, Eintragsnummer, Zugriffsdatum, Scan, Transkript) → Aussage | M | 1 | [Lücke] |
| B-02 | Jede einzelne Aussage (Datum, Ort, Name, Beziehung) belegbar mit n Zitaten | M | 1 | [Lücke] |
| B-03 | Konfidenzstufe pro Zitat und pro Aussage (**4 Stufen**, E21 — die frühere Angabe „5 Stufen" war ein Rest aus dem 1. Durchgang) | M | 1 | [Lücke] · E21 |
| B-04 | Widersprüchliche Werte gleichzeitig speicherbar, einer als "bevorzugt" markiert, mit Begründungstext | M | 1 | [Lücke] |
| B-05 | Persona-Ebene: Beleg-Person getrennt von Konklusions-Person; Zuordnung mit Begründung und umkehrbar | S | 3 | [Lücke] |
| B-06 | Negativbefunde speicherbar ("Kirchenbuch X, 1740–1760 durchgesehen, kein Eintrag") | S | 1 | [Lücke] |
| B-07 | Archiv/Repository als Entität mit Signatur, Digitalisat-URL, Bestellstatus | S | 1 | [Lücke] |
| B-08 | Forschungsprotokoll: offene Fragen, To-dos, "als nächstes prüfen", pro Person und global | S | 4 | [Lücke] |
| B-09 | Zitierstil-Vorlagen (typisierte Zitationsfelder statt Fließtext, formatierte Ausgabe) | C→S | 4/6 | [Lücke] · auf Should hochstufen, sobald Archivarbeit beginnt (Phase 6) |
| B-10 | Sperrfristen-Assistent (PStG 110/80/30 Jahre) — Hinweis, ab wann ein Register einsehbar ist | C | 5 | [Chance] |

## C. Darstellung und Navigation

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| C-01 | Baumansicht mit sauberem, kreuzungsarmem Layout; Ehepartner auf gleicher Ebene | M | 2 | [Idee] |
| C-02 | Ein-/Ausklappen an Knotenpunkten in beide Richtungen (Vorfahren/Nachkommen) | M | 2 | [Idee] |
| C-03 | Personenkarte im Baum mit global konfigurierbaren angezeigten Feldern | M | 2 | [Idee] |
| C-04 | Profilseite mit adaptivem Umfang je Informationslage | M | 1 | [Idee] |
| C-05 | Zentrumsperson wählbar, Verwandtschaftsgrad aller anderen dazu berechnet und angezeigt | M | 2 | [Idee] |
| C-06 | Verwandtschaftsgrad mit System-Angabe (rechtlich/kanonisch/umgangssprachlich) und visualisiertem Pfad | S | 2 | [Chance] |
| C-07 | Blutlinien einzelner Personen hervorheben; Ahnenimplex sichtbar machen (Mehrfachvorkommen markiert) | M | 2 | [Idee] erweitert |
| C-08 | Farbliche Markierung von Verwandtschaftsgrad und Beziehungsart (Ehe/Scheidung/nichtehelich/Adoption) je nach Auswahl | M | 2 | [Idee] |
| C-09 | Anordnungsregeln: nach Generationen, nach Strang, chronologisch | M | 2 | [Idee] |
| C-10 | Filtern/Isolieren: nur Strang XY, Person + direkte Vorfahren, n Generationen | M | 2 | [Idee] |
| C-11 | Diagrammtypen: Ahnentafel, Nachkommentafel, Sanduhr, Fächer/Kreis, Stammliste (Mannesstamm), Familienblatt; Diagramm-Layout frei gestaltbar | S | 2/4 | [Lücke] teilweise · freie Gestaltbarkeit: Wettbewerb Family Historian |
| C-12 | Kartenansicht: wer lebte wann wo — Zeitpunkt oder Zeitraum | M | 3 | [Idee] · E17 |
| C-13 | Zeitleisten-Regler, der Baum **und** Karte **und** Ortsnamen synchron auf ein Datum setzt | M | 3 | [Idee] geschärft · E17 |
| C-14 | Migrationslinien über Generationen auf der Karte | **M** | 3 | [Chance] · E9: Auswanderung nach Kanada ist strukturell |
| C-15 | Personen-Biografieansicht: alle Ereignisse chronologisch, inkl. Ereignisse naher Verwandter als Kontext | S | 2 | [Chance] |
| C-16 | Listen-/Tabellenansicht aller Personen mit Sortierung und Spaltenwahl, Massenbearbeitung und Suchen&Ersetzen (Schreibweisen über den Bestand vereinheitlichen) | M | 1 | [Idee] erweitert |
| C-17 | Volltext- und Feldsuche, phonetisch (Kölner Phonetik), unscharf, mit Filtern | M | 1 | [Lücke] |
| C-18 | Belegqualitäts-Ebene: Baum färbt sich nach Quellenlage/Konfidenz | S | 4 | [Chance] |
| C-19 | Forschungslücken-Übersicht: wo endet der Baum, wo fehlen Kerndaten | S | 4 | [Chance] |
| C-20 | Paten-/Zeugen-Netzwerkansicht (FAN-Prinzip) | S | 5 | [Chance] · E17 |
| C-21 | Statistiken: Lebenserwartung, Kinderzahl, Heiratsalter, Namensverteilung, geografische Streuung | S | 4 | [Lücke] |
| C-22 | Ahnenschwund/Implex-Statistik (theoretische vs. tatsächliche Ahnenzahl) | C | 4 | [Chance] |
| C-23 | Orts-Verwaltungsansicht: alle Orte auflisten, Ortsdubletten erkennen und **umkehrbar** zusammenführen (Merge-Semantik wie D-05) | S | 2/3 | [Lücke] · Parallele zu D-06 für Orte |
| C-24 | Lesezeichen/Favoriten für Personen (Schnellzugriff, ergänzt gespeicherte Ansichten) | C | 2 | [Lücke] |
| C-25 | Split-Screen: zwei Ansichten oder zwei Bestände nebeneinander (Vergleich vor dem Zusammenführen) | C | 2 | [Lücke] · Wettbewerb: Legacy |
| C-26 | Anzeigeregel mehrsprachige Namen: Kartenüberschrift/Titel folgt der aktiven Oberflächensprache, Fallback ist der Hauptname | S | 1 | [Claude Design] · zu A-02 |

## D. Import, Export, Zusammenführen

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| D-01 | Eigenes verlustfreies Vollformat für Export/Import (gesamter Bestand) | M | 3 | [Idee] |
| D-02 | Teilexport: einzelne Personen, Stränge, Generationsebenen, aktuelle Ansicht | M | 3 | [Idee] |
| D-03 | Import völlig separater Stränge, Verknüpfung erst danach herstellbar | M | 3 | [Idee] |
| D-04 | Zusammenführungs-Modal: Feld-für-Feld-Vergleich, Kollisionen markiert, Auswahl pro Feld, Ergänzungen automatisch | M | 3 | [Idee] |
| D-05 | Zusammenführung protokolliert und **umkehrbar** (Merge-Historie, alte IDs bleiben als Alias gültig) | M | 3 | [Lücke] |
| D-06 | Dublettenerkennung mit Bewertung (Name + Datum + Ort), nur Vorschlag, niemals automatisch | M | 3 | [Lücke] |
| D-07 | GEDCOM 7 / GEDZIP Export und Import | M | 4 | E1 · Import unkritisch, da kein Altbestand (F4) |
| D-08 | GEDCOM 5.5.1 Import inkl. GEDCOM-L `_LOC` (deutsche Programme) | C | 4 | E1 · nur falls Verwandte Altbestände liefern |
| D-09 | Import-Bericht: was wurde übernommen, was verworfen, was nicht abbildbar | M | 3 | [Lücke] |
| D-10 | Import-Vertrag für KI-Vorbereitung: dokumentiertes JSON-Schema + Validierung + Trockenlauf mit Vorschau | M | **1** | [Idee] · E6: das ist die Haupt-Erfassungsstrecke |
| D-11 | Zugehöriger Claude-Skill, der aus Notizen, Gesprächsmitschriften und Dokumenten Importmaterial gemäß Schema erzeugt | M | **1** | [Idee] · E6 |
| D-12 | Export-Filter Datenschutz: Lebende entfernen/anonymisieren; `privat`-Flag pro Person und Aussage | M | 3 | [Lücke] |
| D-13 | Export nach CSV/Excel für eigene Auswertungen | C | 4 | [Lücke] |
| D-14 | Bestandsauszug (Roster) für den KI-Skill: kompakte, lesende Personenliste (uuid, bevorzugter Name, Lebensjahre, direkte Eltern/Partner), damit der Skill `db:`-Referenzen auf vorhandene Personen setzen kann | M | 1 | [Chance] · Voraussetzung für die Bestandsauflösung |
| D-15 | Auflösungsschritt im Trockenlauf: jede `tmp:`-Person gegen den Bestand bewerten (Name phonetisch + Datum + **relationaler Kontext**), pro Kandidat drei Wege — verbinden / getrennt anlegen / später; KI-gesetzte `db:`-Verknüpfungen bestätigungspflichtig anzeigen, nie blind ausführen | M | 1 (Grundzug) / 4 (voll) | [Idee] · E6 · wahrt W-05 |

## M. Gesundheit und Risikofaktoren (E10)

Zweck laut F9: Herz- und Krebserkrankungen sowie andere Muster über Generationen erkennbar
machen — inklusive erworbener Risiken wie Rauchen oder Bergbauarbeit.

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| M-01 | Diagnose als strukturierter Eintrag: Bezeichnung, Kategorie, Alter oder Datum bei Erstdiagnose, Status (bestehend/geheilt/verstorben daran), Konfidenz, Beleg | M | 1 | F9 |
| M-02 | Kontrollierter Katalog von Krankheitskategorien (Herz-Kreislauf, Krebs mit Organ, Stoffwechsel, neurologisch/psychisch, Atemwege, Nieren, Autoimmun, angeboren/genetisch, Infektion, Unfall), erweiterbar | M | 1 | F9 |
| M-03 | Todesursache als eigene Aussage, mit Verweis auf die zugehörige Diagnose | M | 1 | [Lücke] |
| M-04 | Risikofaktor als eigener Eintragstyp mit **Zeitraum** und Intensität: Rauchen, Alkohol, berufliche Exposition (Bergbau, Asbest, Chemie, Landwirtschaft/Pestizide, Hüttenwesen), Umweltbelastung, Ernährung, Übergewicht, Bewegungsmangel | M | 1 | F9 |
| M-05 | Beruf automatisch als möglicher Risikofaktor vorschlagen (Bergmann → Staubexposition), Vorschlag bestätigungspflichtig | C | 5 | [Chance] |
| M-06 | **Medizinische Stammbaumansicht**: Baum eingefärbt nach Krankheitskategorie, Mehrfachbetroffene markiert, Risikofaktoren als Symbol | S | 5 | F9 |
| M-07 | Vererbungsmuster-Hinweis: Häufung entlang einer Linie erkennen und benennen (nur Beschreibung, **keine** medizinische Bewertung oder Risikoprognose) | C | 5 | [Chance] |
| M-08 | Gesundheitsdaten als eigene Sichtbarkeitsstufe: standardmäßig aus jedem Export ausgeschlossen, unabhängig vom `privat`-Flag | M | 1 | DSGVO Art. 9 |
| ~~M-09~~ | ~~ICD-10-Codierung~~ — **gestrichen (E24)**: Codes an Erinnerungsdiagnosen erzeugen Scheingenauigkeit. Eigener Kategorienkatalog genügt. | — | — | E24 |

**Fachliche Warnung, die ins Produkt gehört:** Diagnosen aus Erinnerung („Opa hatte was mit dem
Herzen") sind medizinisch praktisch wertlos, wenn sie nicht als unsicher gekennzeichnet sind.
Die Ansicht M-06 darf nie so aussehen, als wäre sie eine Familienanamnese in medizinischer
Qualität. Vorschlag für den Produkttext: „Übersicht familiärer Häufungen — keine medizinische
Aussage." Und: **Gesundheitsdaten lebender Personen sind DSGVO-Sonderkategorie (Art. 9)**; die
Haushaltsausnahme deckt die eigene Sammlung, aber jede Weitergabe an Verwandte (E7) braucht
deren Einverständnis. Deshalb M-08 als harte Regel, nicht als Einstellung.

## E. Ausgabe und Druck

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| E-01 | PDF-Export jeder Diagrammansicht, vektoriell | M | 4 | [Lücke] |
| E-02 | Mehrseitiger Posterdruck mit Klebemarken | S | 4 | [Lücke] |
| E-03 | Textberichte: Ahnenliste, Nachkommenliste, Familienbuch, Personendossier | S | 4 | [Lücke] |
| E-04 | Nummerierungssysteme berechnet: Kekulé, Henry, d'Aboville | S | 4 | [Lücke] |
| E-05 | Bildexport (PNG/SVG) für Web und Weitergabe | S | 4 | [Lücke] |
| E-06 | Lesemodus-Export für Verwandte (interaktive HTML-Datei ohne Installation, Lebende gefiltert) | **S** | 4 | [Chance] · E7 |
| E-07 | Namensindex (und Orts-/Quellenindex) im Familienbuch und Personendossier | S | 4 | [Lücke] |
| E-08 | Serienausgaben: Adressetiketten, Namensschilder, Fragebögen, Blankoformulare, Geburtstags-/Ereigniskalender | C | 4 | [Lücke] · nachrangig laut Vision §3 (keine Vereins-/Treffen-Zielgruppe) |

## F. Datenintegrität und Vertrauen

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| F-01 | Auto-Speicherung, jede Bearbeitung als Transaktion, immer konsistenter Zustand auf der Platte | M | 0 | [Idee] |
| F-02 | Vollständiges Änderungsjournal (wer/wann/was/alter Wert/neuer Wert) | M | 0 | [Lücke] |
| F-03 | Undo/Redo über beliebig viele Schritte, auch über Programmneustart hinweg | M | 0 | [Lücke] |
| F-04 | Automatische Sicherungspunkte (Snapshots) mit Wiederherstellung | M | 0 | [Lücke] |
| F-05 | Stabile UUIDs für alle Entitäten ab Version 1 | M | 0 | [Lücke] |
| F-06 | Schema-Migration mit Test je Version, alte Projekte immer öffenbar | M | 0 | [Lücke] |
| F-07 | Plausibilitätsprüfungen: Tod vor Geburt, Mutter unter 12/über 55, Kind vor Eheschließung, Alter über 110, Zyklus im Graphen | M | **1** (Grundsatz) / 5 (vollständig) | [Lücke] · bei Erinnerungsdaten sofort nötig |
| F-08 | Integritätsprüfung des Datenbestands auf Knopfdruck | S | 4 | [Lücke] |
| F-09 | Hypothesen-Modus: Verknüpfung testweise setzen, Auswirkung sehen, verwerfen ohne Spuren | C | 5 | [Chance] |
| F-10 | Verstorben-Vorschlag: Person mit lange zurückliegender Geburt und ohne Sterbedatum als „vermutlich verstorben" vorschlagen (bestätigungspflichtig) | S | 5 | [Lücke] · Wettbewerb: FTB |

## G. Technik und Betrieb

| ID | Anforderung | Pri | Ph | Herkunft |
|---|---|---|---|---|
| G-01 | Installierbar auf Windows und macOS | M | 0 | [Idee] |
| G-02 | Vollständig offline funktionsfähig, kein Login, kein Konto | M | 0 | [Idee] |
| G-03 | Daten in einem vom Nutzer gewählten Projektordner | M | 0 | [Idee] |
| G-04 | Mehrere Projekte parallel verwaltbar, zuletzt geöffnete Liste | S | 1 | [Lücke] |
| G-05 | Code-Signierung + Notarisierung, damit die App ohne Warndialoge startet | M | 5 | [Lücke] |
| G-06 | Auto-Update ohne eigene Serverinfrastruktur (GitHub Releases) | S | 5 | [Lücke] |
| G-07 | Performance-Budget: 2.000 Personen flüssig; Architektur bis 20.000 tragfähig | M | 2 | E2 |
| G-08 | Mehrsprachige Oberfläche mit Übersetzungsschicht ab Tag 1; **Sprachen DE, RU, UK, EN ab Phase 1** (Claude Design), Umschalter in Kopfzeile + Einstellungen; Übersetzungsinhalte je Sprache nachziehbar | M | 0/1 | E8 · erweitert (E46) |
| G-09 | Tastaturbedienbarkeit und Kontrastwerte nach WCAG AA | S | 2 | [Lücke] |

## H. Bewusst nicht (Won't)

| ID | Nicht enthalten | Begründung |
|---|---|---|
| W-01 | Cloud-Synchronisation, Mehrbenutzerbetrieb, Kollaboration in Echtzeit | Widerspricht Prinzip Datenhoheit; Austausch über Export/Import |
| W-02 | Eigene Quellendatenbank / Rechercheportal | Nicht replizierbar |
| W-03 | DNA-Segmentanalyse, Chromosome Browser, DNA-Kits jeder Art | Entschieden (F8): bleibt vollständig draußen |
| W-04 | Mobile App | Später denkbar, kein Phase-1-bis-5-Thema |
| W-05 | Automatisches Zusammenführen ohne Nutzerbestätigung | Der dokumentierte Hauptfehler bestehender Software |
| W-06 | Online-Veröffentlichung des Baums | Datenschutzrisiko, kein Nutzerbedarf formuliert |
| W-07 | Foto-KI (Kolorierung, Aufhellung, Restaurierung, Animation) | **Erstmal** ausgeschlossen (06.09.2026, E41): Cloud-/GPU-Thema, widerspricht der Offline-Linie (G-02). Später als „Could" denkbar, nicht zugesagt. |

---

## Lückenanalyse: Was in der Ursprungsidee fehlte

Zusammengefasst, nach Schwere:

**1. Beleg- und Quellenebene (jetzt behoben, E3).** Die Idee beschrieb Felder *an* der Person.
Genealogie braucht Aussagen *über* die Person mit Herkunft. Das ist die einzige Entscheidung,
die nachträglich einen kompletten Datenumbau bedeutet hätte.

**2. Ort und Datum als Struktur, nicht als Text.** In der Idee "Geburtsdatum, Geburtsort" —
faktisch die zwei Felder, an denen Genealogiesoftware am häufigsten scheitert.

**3. Ausgabe und Druck fehlte vollständig.** Genealogen drucken. Poster, Familienbuch,
Ahnenliste als PDF sind Tabellenstakes, in der Idee kam kein Wort dazu vor.

**4. Datenintegrität (Undo, Journal, Snapshots, Migration).** Die Idee nannte
Auto-Speicherung, aber nicht das, was Auto-Speicherung erst sicher macht.

**5. Suche.** Bei 2.000 Personen ist Navigation über den Baum allein unbenutzbar.
Phonetische Suche ist bei historischen Schreibweisen kein Komfort, sondern Voraussetzung.

**6. Plausibilitätsprüfung.** Der günstigste Weg, Erfassungsfehler zu finden.

**7. Datenschutz beim Export.** Sobald ein Teilexport an einen Verwandten geht, endet die
DSGVO-Haushaltsausnahme.

**8. Rollen bei Ereignissen.** Paten und Trauzeugen waren nicht vorgesehen — sie sind
genealogisch hochwertig und ermöglichen als Nebenprodukt das Netzwerk-Feature.

**9. Ahnenimplex.** Die Idee sprach von "Stammbaum" und "Blutslinien". Bei Verwandtenheirat
ist der Baum kein Baum. Das ist eine Layout- *und* eine Anzeigefrage.

**10. Verteilung.** Ohne Signierung und Notarisierung startet die App auf beiden Systemen mit
Sicherheitswarnungen.

## Chancenanalyse: Was in der Idee angelegt, aber unausgeschöpft war

1. **Zeitleiste + Karte + Baum als *ein* synchroner Regler.** Die Idee nannte alle drei
   getrennt. Zusammengeschaltet ist das ein Feature, das laut Recherche kein
   Desktop-Programm hat.
2. **Verwandtschaftsgrad-Anzeige zur Zentrumsperson** — in der Idee enthalten, am Markt
   überall nur textuell. Als erklärter, visualisierter Pfad mit korrekter deutscher
   Terminologie ist das ein Alleinstellungsmerkmal.
3. **Der KI-Import-Vertrag.** Die Idee sagt "Vorlage/Skill". Als sauber versioniertes
   JSON-Schema mit Validierung und Trockenlauf-Vorschau wird daraus die
   Haupt-Erfassungsstrecke — vermutlich das größte Zeitersparnis-Feature überhaupt.
4. **Belegqualität als visuelle Ebene.** Folgt gratis aus E3 und ist am Markt unbesetzt.
5. **Paten-Netzwerk** — fällt aus dem Rollenmodell heraus, ohne Zusatzaufwand am Datenmodell.
6. **Ortsnamen-Historie mit GOV** — der deutschsprachige Markt hat hier ein echtes Problem
   (Ostgebiete, Kreisreformen) und keine gute Lösung.

---

## Nachtrag zum 2. Durchgang (23.08.2026)

**Was sich durch Florians Antworten geändert hat:**

1. **Erfassung aus unstrukturiertem Material ist das Kernfeature**, nicht GEDCOM-Import (E6/F4). D-10 und D-11 wandern von Phase 3 nach Phase 1, A-15 (Interview-Modus) und A-16 (Audio) kommen neu hinzu. GEDCOM-Import verliert Priorität — es gibt keinen Altbestand.
2. **Gesundheitsmodul** ist ein eigener Anforderungsblock geworden (M-01 bis M-09) statt eines Attributfelds.
3. **Benutzerdefinierte Felder** sind von "Should" auf "Must" gestiegen und als Feld-Definitionssystem (A-18) ausformuliert.
4. **Karte und Zeitleiste** rücken von Phase 4 nach Phase 3 vor, Migrationslinien werden Must (Auswanderung nach Kanada, E9). Das Netzwerk bleibt in Phase 5.
5. **Lesemodus-Export** steigt auf Should (Weitergabe an Verwandtschaft, E7).
6. **Plausibilitätsprüfungen** ziehen in Grundzügen nach Phase 1 vor — bei Erinnerungsdaten ist das der wirksamste Qualitätsfilter.
7. **Kirchenbuch-Erfassungsmodus** wird nach Phase 6 zurückgestellt (F6).
8. **DNA** ist endgültig ausgeschlossen (F8).

---

## Nachtrag 3. Durchgang (23.08.2026) — alle Fragen beantwortet

- **A-19 neu:** automatische Umschrift (E20). Wichtig für die Umsetzung: die Umschrift ist ein *zusätzlicher* Namenseintrag mit Typ `transliteriert`, niemals ein Ersatz. Original bleibt führend, Suche läuft über beide.
- **A-16 präzisiert:** nur Einbinden, kein Aufnehmen (E19). Spart Mikrofonrechte, Formatvielfalt und Kodierung.
- **M-09 gestrichen** (E24).
- **Windows bleibt gleichrangiges Ziel** (E23) — die Roadmap führt es nicht mehr als Nebenziel.
- Damit ist der Anforderungskatalog für die Phasen 0 bis 3 **entscheidungsfrei**. Offen sind nur noch inhaltliche Details, die sich beim Bauen klären.


---

## Nachtrag 4. Durchgang (06.09.2026) — Funktionsabgleich mit Wettbewerbern

Grundlage: Abgleich der geplanten Funktionen gegen MyHeritage (Family Tree Builder), Legacy Family Tree 10 und die MyHeritage-Hilfe. Ergebnis: der Katalog deckte die Tabellenstakes bereits ab; die großen fehlenden Wettbewerbsfunktionen (DNA, Matching, Cloud, Online-Baum, Mobile) sind bewusst ausgeschlossen (§H). Nachgezogen wurden kleinere Lücken und die KI-Bestandsauflösung.

**Neu / geändert:**
- **KI-Bestandsauflösung (Kernaufwertung):** D-14 (Bestandsauszug für den Skill) und D-15 (Auflösungsschritt im Trockenlauf: `tmp:` gegen Bestand über Name + Datum + relationalen Kontext, drei Wege verbinden/getrennt/später, KI-gesetzte `db:`-Verknüpfungen bestätigungspflichtig). Das ist die technische Antwort auf „der Vater von A ist B → automatisch verbinden", ohne W-05 zu brechen. Zieht eine Erweiterung von S-11 (`72_Screens`) nach sich: personenweise Sicht + Inline-Variantenwahl.
- **Erfassung/Werkzeuge:** A-20 Tags · A-21 Datums-/Kalenderrechner · A-22 Erzähl-Baustein · C-16 um Massenbearbeitung + Suchen&Ersetzen erweitert.
- **Ansichten:** C-23 Orts-Verwaltung inkl. Ortsdubletten-Zusammenführung (die relevanteste Lücke, weil Ort bei uns erstklassige Entität ist) · C-24 Lesezeichen · C-25 Split-Screen · C-11 um freie Diagramm-Gestaltbarkeit ergänzt.
- **Ausgabe:** E-07 Namensindex im Familienbuch · E-08 Serienausgaben (nachrangig).
- **Integrität:** F-10 Verstorben-Vorschlag.
- **Bewusst raus:** W-07 Foto-KI (erstmal, E41).
- **Vorgemerkt:** B-09 (Zitiervorlagen) zur Hochstufung C→S, sobald Archivarbeit beginnt.

**Neue offene Punkte in `80_Offene_Fragen.md` §7:** V17 (Kartengrundlage). Koordinatenquellen (GOV/GeoNames/Wikidata) sind bereits im Ortsmodell (`50_Datenmodell` §Orte) und in T4 abgedeckt.

**[inferred]-Hinweis:** Priorität und Phase der neuen Could/Should-Punkte sind mein Vorschlag, nicht von Florian einzeln bestätigt — bei Bedarf anpassen.

---

## Nachtrag 5. Durchgang (06.09.2026) — Abgleich mit dem Claude-Design-Prototyp

Grundlage: der von Claude Design erstellte Funktionsumfangs-Bericht des Prototyps. Was dort entworfen wurde und im Scope noch fehlte, ist hier nachgezogen.

**Neu / geändert:**
- **A-23 Lebensstationen + Stationsarten-Katalog** — Claude Design führt „Lebensstationen" als eigenes typisiertes Konstrukt mit benutzerkonfigurierbarem Arten-Katalog ein (Farbe, Zeitform, Ortsbindung, „von→nach", „in Zeitleiste", aktiv/aus, sortierbar, deaktivieren statt löschen). Verallgemeinert A-08 und die Ereignisrollen. **Modell-Abgleich offen → V18.**
- **A-24** „Aus Statistik ausschließen"-Flag pro Person.
- **C-26** Anzeigeregel mehrsprachige Namen (Titel folgt Oberflächensprache, Fallback Hauptname).
- **G-08 erweitert** — Oberfläche mehrsprachig ab Phase 1 in **DE, RU, UK, EN** (statt nur DE jetzt / EN Phase 6).

**Aufgelöste offene Punkte:**
- **V10/V11 (Schriften/Symbolik)** — Claude Design hat gewählt: **Source Sans 3** (Oberfläche), **Source Serif 4** (Originalzitate/Transliteration), **IBM Plex Mono** (technisch); alle SIL OFL, offline, kyrillisch + Diakritika, Sperrliste-konform (IBM Plex Mono ist erlaubt; JetBrains Mono war gesperrt). → E45.

**Korrektur am Entwurf (für die Design-Nachzieh-Wellen):** Der Lebensstatus ist **dreistufig** (lebend / vermutlich verstorben / verstorben, siehe F-10 und Datenmodell), nicht binär wie im Prototyp.

**Was im Prototyp noch fehlt** (Scope-Bildschirme, nicht entworfen) → eigener Design-Prompt in `74_Prompts_Claude_Design.md §14`: S-02, S-03, S-06, S-08, S-09, S-15, S-16, S-17, S-18 (Kern Phase 0/1); Import-Auflösung (S-10/S-11/S-14-Erweiterung, D-14/D-15); S-33 Netzwerk, S-34 Statistiken, S-35 Orts-Verwaltung (Zielbild).

**[inferred]-Hinweis:** Priorität/Phase der neuen Punkte sind mein Vorschlag.
