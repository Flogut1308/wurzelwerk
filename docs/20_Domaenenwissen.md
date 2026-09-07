# Wurzelwerk — Genealogisches Domänenwissen

Zweck: Bevor am Datenmodell oder an Eingabefeldern etwas entschieden wird, muss dieses
Dokument gelesen sein. Es enthält die fachlichen Wahrheiten, an denen naive
Software-Entwürfe reproduzierbar scheitern.

---

## 1. Die fünf teuersten Denkfehler

| # | Falsche Annahme | Wirklichkeit |
|---|---|---|
| 1 | Ein Stammbaum ist ein Baum | Er ist ein **gerichteter azyklischer Graph**. Bei Verwandtenheirat (Ahnenimplex/Ahnenschwund) erscheint dieselbe Person mehrfach in der Ahnentafel. Jede Baumannahme im Code ist damit falsch. |
| 2 | Eine Person hat ein Geburtsdatum | Sie hat *Aussagen über* ein Geburtsdatum, aus verschiedenen Quellen, die sich widersprechen dürfen. |
| 3 | Ein Datum ist ein Datum | "um 1750", "vor 1800", "zwischen 1740 und 1748", "im Alter von 63 Jahren", julianisch vs. gregorianisch, Doppeljahr "1731/32", Revolutionskalender. |
| 4 | Ein Ort ist ein Text | Breslau/Schlesien/Deutschland und Wrocław/Dolnośląskie/Polen sind dasselbe Objekt zu verschiedenen Zeiten. |
| 5 | Eine Person hat einen Namen | Rufname ≠ erster Vorname; Geburtsname ≠ Ehename; Kirchenbücher latinisieren; Patronyme wechseln pro Generation. |

---

## 2. Namen

- **Name ist ein Objekt, nicht ein Feld.** Person hat 1:n Namen, jeder mit Typ (`Geburtsname`, `Ehename`, `genannt/vulgo`, `Ordensname`, `Berufsname`, `latinisiert`, `Sonstiges`) und optionalem Gültigkeitszeitraum. GEDCOM 7 kennt `NAME` mit `TYPE` (BIRTH, MARRIED, AKA, IMMIGRANT, PROFESSIONAL, OTHER) und Teilen `NPFX, GIVN, NICK, SPFX, SURN, NSFX` plus Transliterationen (`TRAN`).
- **Rufname** muss separat auszeichenbar sein. Historisch 2–5 Taufnamen, der Rufname war nicht zwangsläufig der erste ("Johann Christian Friedrich", gerufen "Friedrich"). Umsetzung: Markierung der Position innerhalb der Vornamenkette. `[unverified]` GEDCOM 7 hat kein dediziertes Rufname-Tag; `NICK` ist die pragmatische Näherung.
- **Originalschreibweise pro Beleg** getrennt von normalisierter Form. Latinisierung ist die Regel: `Joannes`, `Catharina`, `Henricus`; Familiennamen `Faber` (Schmidt), `Molitor` (Müller), `Praetorius` (Richter).
- **Patronyme und Hofnamen**: In Ostfriesland, Skandinavien, slawischem Raum wechselt der "Nachname" pro Generation (Jansen = Sohn des Jan). Hofnamen wechseln mit dem *Hof*, nicht mit der Abstammung. Eine Regel "Kind erbt Nachnamen des Vaters" ist dort falsch — Vorbelegung ja, Zwang nein.
- **Namenszusätze** strukturiert: `von/van/zu/de` als Präfix, Titel separat, Zusätze wie "der Ältere", "junior", "recte", "vulgo".
- **Phonetische Suche von Anfang an als Indexspalten.** Für Deutsch: **Kölner Phonetik** (Soundex ist auf Englisch getrimmt). Für aschkenasisch-jüdische Namen: **Daitch-Mokotoff Soundex** (liefert bewusst mehrere Codes pro Name). Dazu Trigramm/Levenshtein für OCR- und Lesefehler. Ein Name braucht n:m Phonetikcodes, nicht eine Spalte.

## 3. Datumsangaben

Struktur pro Datum: `{ Kalender, Präzision, Modifikator, Wert1, Wert2, Originaltext, Sortierschlüssel_von, Sortierschlüssel_bis }`

GEDCOM-7-Grammatik als Referenz:
- exakt `14 MAR 1750`; unvollständig `MAR 1750`, `1750`
- Bereich `BET 1750 AND 1755`, `BEF 1800`, `AFT 1700`
- Periode `FROM 1740 TO 1748`, `TO 1800`
- unscharf `ABT` (etwa), `CAL` (berechnet, z. B. aus Sterbealter), `EST` (geschätzt)
- Kalender `GREGORIAN`, `JULIAN`, `HEBREW`, `FRENCH_R`, Epoche `BCE`
- `PHRASE` für Unabbildbares ("am Palmsonntag", "Dom. III post Trinitatis")

**Sortier-/Filterschlüssel getrennt speichern** (z. B. Julianische Tageszahl von/bis), sonst
ist "alle geboren vor 1800" bei `ABT`/`BET`-Werten nicht abfragbar.

**Kalenderumstellung ist regional, nicht global:**
| Region | Umstellung | Differenz |
|---|---|---|
| Katholische Länder (Spanien, Portugal, Polen, Teile Italiens) | 4. → 15. Okt 1582 | 10 Tage |
| Protestantische Reichsstände | 18. Feb → 1. März **1700** | 11 Tage |
| England/Kolonien | 2. → 14. Sep **1752** | 11 Tage |
| Schweden | 17. Feb → 1. März 1753 | |
| Russland | Feb 1918 | 13 Tage |
| Griechenland | 1923 | |

Eine globale Umstellungskonstante produziert systematisch falsche Werte. **Immer das
Originaldatum im Originalkalender speichern**, Umrechnung nur als abgeleiteter Wert.

**Doppeljahre (Old/New Style):** Vor der Umstellung begann das Jahr vielerorts nicht am
1. Januar (England: 25. März). Belege lauten "11 February 1731/32". Modell braucht Platz für
zwei Jahresangaben bzw. `OS/NS`-Vermerk. `[unverified]` formale Abbildung in GEDCOM 7 —
praktisch über `JULIAN` + `PHRASE`.

**Weitere Formen:** Quartalsangaben (britische GRO-Indizes "Q2 1861"), Altersangaben
("63 Jahre 4 Monate" → berechneter Bereich, als `CAL` markiert), Kirchenfeste.

## 4. Orte

- Ortsobjekt mit **Typ** (Dorf, Gemeinde, Kirchspiel, Amt, Kreis, Provinz, Staat), **zeitlich datierten Namen** und **zeitlich datierten Zugehörigkeiten** (n:m, "ist Teil von, von–bis"). Getrennte politische und kirchliche Hierarchie.
- Vorbild und mögliche Datenquelle: **GOV — Geschichtliches Ortsverzeichnis** (CompGen), stabile GOV-ID, genau dieses Modell, seit 2024 in GEDCOM 7 per `EXID`/`TYPE http://gov.genealogy.net/` referenzierbar. In der 5.5.1-Welt über das GEDCOM-L-`_LOC`-Record, das deutsche Programme (Ahnenblatt, Gen_Plus, GES-2000) breit unterstützen.
- **Vier verschiedene Angaben nicht vermischen:** Ereignisort · damalige Verwaltungs-/Kirchenzugehörigkeit (bestimmt, welches Register zuständig war) · heutiger Ort · heutiges Archiv mit Signatur.
- **Untergegangene Orte**: Wüstungen, Braunkohledörfer, aufgegebene Orte in Ostpreußen/Schlesien/Pommern. Felder `existiert bis`, `Nachfolgeobjekt`, Koordinaten optional.
- Originalschreibweise aus der Quelle immer mitspeichern, plus externe IDs (GOV, GeoNames, Wikidata) als n:m-Tabelle.

## 5. Beziehungen

**Kein `FAM`-Container als Primärkonstrukt.** GEDCOM verbindet Personen nie direkt, sondern
über ein Familienrecord (`HUSB`/`WIFE`/`CHIL`). Das bricht bei: nichtehelichen Verbindungen,
Kindern mit nur einem bekannten Elternteil, Kindern derselben Mutter von wechselnden Vätern,
mehreren gleichzeitigen Verbindungen, Adoption *zusätzlich* zur biologischen Elternschaft.

Stattdessen zwei unabhängige Kantentypen:
- `Elternschaft(Elternteil → Kind, Typ, Konfidenz)` — Typen: biologisch, adoptiv, Stief, Pflege, Zieh, anerkannt, Leihmutterschaft, unbekannt. **Ein Kind muss beliebig viele Elternkanten haben können** (leibliche Mutter + Adoptiveltern + Stiefvater gleichzeitig).
- `Partnerschaft(n Beteiligte, Typ, Beginn, Ende, Endgrund)` — Typen: Ehe (zivil/kirchlich getrennt), Verlobung, Lebensgemeinschaft, eingetragene Lebenspartnerschaft. Endgründe: Scheidung, **Annullierung** (rückwirkende Nichtigkeit — fachlich etwas anderes als Scheidung), Tod. Mehrfachehen brauchen Reihenfolge *und* Überlappungsmöglichkeit (Bigamie kommt in Quellen vor).

Ein "Familien"-View lässt sich aus diesen Kanten berechnen; der Rückweg ist verlustbehaftet.

**Geschlecht:** `M, F, U, X`. GEDCOM 7 stellt klar, dass aus `HUSB`/`WIFE` **kein** Geschlecht
abgeleitet werden darf.

**Sonderfälle, die naive Constraints sprengen:** Totgeburten (Geburt = Sterbedatum, evtl.
namenlos), Findelkinder (kein Elternteil, geschätztes Datum, Name vom Findeort),
Mehrlinge (identisches Datum, Reihenfolge-Attribut), unbekannter Vater (Platzhalterperson
vs. fehlende Kante — bewusst entscheiden), Ahnenimplex.
→ `NOT NULL` auf Geburtsdatum, `UNIQUE(vater, mutter, geburtsdatum)`, "genau zwei Eltern"
und "Darstellung als Baum" sind alle vier falsch.

**Nichtverwandtschaftliche Assoziationen** (GEDCOM 7 `ASSO` mit `ROLE`): **Paten**,
Patenvertreter, Trauzeugen, Dienstherr, Hebamme, Pfarrer, Informant. Paten sind genealogisch
hochrelevant (meist Verwandte) und der häufigste vergessene Beziehungstyp.

## 6. Ereignisse mit Rollen

Statt fester Slots am Personendatensatz: `Ereignis(Typ, Datum, Ort)` +
`Beteiligung(Person, Rolle)`. Rollen: Kind, Vater, Mutter, Pate 1–n, Patenvertreter,
Bräutigam, Braut, Trauzeuge, Verstorbener, Ehepartner des Verstorbenen, Informant, Pfarrer.

Begründung: Ohne Rollenmodell lassen sich Kirchenbucheinträge nicht sauber erfassen.
Der WGfF-Verkartungsstandard sieht bis zu 4 Paten + 4 Patenvertreter pro Taufeintrag und
bis zu 4 Zeugen pro Trauung vor. Als Nebenprodukt fällt das Paten-/Zeugen-Netzwerk an —
ein starkes Analysefeature, das kaum ein Programm hat.

## 7. Verwandtschaftsgrade

**Berechnen, nie speichern.** Berechnung über den *nächsten gemeinsamen Vorfahren*
(Generationenabstand beider Personen dorthin), nicht über den kürzesten Pfad allein — bei
Implex gibt es mehrere gemeinsame Vorfahren und mehrere Pfade, die Bezeichnung ist dann
mehrdeutig und muss als Menge dargestellt werden.

**Drei inkompatible Zählungen — immer mit System beschriften:**
| System | Geschwister | Cousins | Verwendung |
|---|---|---|---|
| Rechtlich/"römisch" (§1589 BGB, Zahl der vermittelnden Geburten) | 2. Grad | 4. Grad | Erbrecht, Ehehindernisse |
| Kanonisch (Kirchenrecht, Generationen zur Wurzel) | 1. Grad | 2. Grad | **Ehedispense in Kirchenbüchern** |
| Genealogisch-umgangssprachlich | — | "Cousin 1. Grades" = gemeinsame Großeltern | Alltag, Anzeige |

"2. Grades" bedeutet in drei Systemen drei verschiedene Dinge. Speichern als
`{System, Grad, Entfernung}`, nie als Label-String.
`[unverified]` Details der kanonischen Zählung bei ungleichen Generationenabständen (es gilt
der größere Abstand).

**Weitere Terminologie:** gerade Linie vs. Seitenlinie; Voll-/Halbgeschwister
(Verwandtschaftskoeffizient 0,5 / 0,25); "Ur"-Präfixe (jedes "Ur" = eine Generation);
Großonkel/Großnichte; **Schwägerschaft** (§1590 BGB — Verwandte des Ehegatten sind *nicht*
verwandt, sondern verschwägert; abgeleitete Beziehungsart); Stiefverwandte sind nur
verschwägert; Adoptivverwandte sind rechtlich gleichgestellt, wobei die vorherige
Verwandtschaft rechtlich erlischt, **genealogisch aber erhalten bleiben muss**; historische
Begriffe (Oheim = Mutterbruder, Muhme, Vetter, Base).
Deutsche Bezeichnungen sind fast durchgängig geschlechtsspezifisch — bei `SEX = U/X` gibt es
**keinen** korrekten deutschen Term, Fallback nötig.

## 8. Belege, Quellen, Konfidenz

**Dreistufiges Modell (Vorbild Gramps/GEDCOM X):**
`Quelle` (das Buch/Register, einmal beschrieben) → `Zitat` (Seite, Eintragsnummer,
Zugriffsdatum, Scan, Transkript, Konfidenz) → `Aussage` (der konkrete Fakt).

GEDCOM 5.5.1/7 bietet nur `SOUR` + `PAGE` (Freitext) + `QUAY 0–3`
(0 unzuverlässig, 1 fragwürdig, 2 sekundär, 3 primär) — zu grob. Gramps nutzt fünf
Konfidenzstufen. FHISO "Citation Elements" schlägt typisierte Zitationsfelder statt Fließtext
vor, was Formatierung nach Zitierstilen ermöglicht.

**Evidence-and-Conclusion / Persona-Modell** (theoretische Referenz: GENTECH Genealogical
Data Model 1.1 der NGS; praktische: GEDCOM X):
- `Persona` = die Person, wie sie in *einem* Beleg erscheint. Unveränderlich, an genau ein Zitat gebunden.
- `Person` = Hypothese, dass mehrere Personas dieselbe Person sind, mit Begründungstext, Konfidenz, Bearbeiter, Datum.
- Zusammenführung ist damit **umkehrbar** und die Begründung ("warum ist der Johann von 1712 derselbe wie der von 1745?") ist speicherbar.

Warum das wichtig ist: In GEDCOM-artigen Modellen überschreibt Zusammenführen die
Belegebene. Die Begründung existiert nur im Kopf des Forschers, und der Merge ist
irreversibel — der dokumentierte Hauptschmerzpunkt bestehender Programme.

**Genealogical Proof Standard (BCG)** als Qualitätsrahmen: (1) hinreichend erschöpfende
Recherche, (2) vollständige korrekte Quellenangaben, (3) Analyse und Korrelation,
(4) Auflösung von Widersprüchen, (5) schlüssig begründete schriftliche Schlussfolgerung.
Klassifikationsachsen: Quelle (original/derivativ/verfasst) · Information (primär/sekundär/
unbestimmt) · Evidenz (direkt/indirekt/negativ).
→ **Negativbefunde müssen speicherbar sein** ("in Kirchenbuch X, Jahre 1740–1760, kein
Eintrag gefunden"). GEDCOM 7 kennt negative Aussagen.

## 9. Nummerierungssysteme (berechnen, nicht speichern)

- **Kekulé von Stradonitz** (Ahnentafel): Proband = 1, Vater = 2n, Mutter = 2n+1; Männer gerade, Frauen ungerade (außer 1); Generation = ⌊log₂ n⌋+1. **Grenze:** bei Ahnenimplex trägt eine Person mehrere Nummern → die Nummer ist ein Positionsattribut einer Sicht, kein Personenschlüssel.
- **Deszendenz:** Henry (1 → 11, 12, 111; ab 10 Kindern X/A/B), **d'Aboville** (1.1.1, punktgetrennt), de Villiers/Pama (a1, b2.c3), Meurgey de Tupigny, Register/NGSQ.

## 10. Darstellungsformen (alle sind Views auf denselben Graphen)

Grundmatrix: **Aszendenz vs. Deszendenz** × **Tafel vs. Liste**
- Ahnentafel / Ahnenliste (Vorfahren)
- Nachkommentafel / Nachkommenliste (Deszendenten)
- **Stammliste/Stammtafel** = nur Mannesstamm (Namensträger) — nicht dasselbe wie Nachkommentafel
- Sanduhr = kombinierte Ahnen- und Nachkommentafel
- Fächer-/Kreis-/Sonnendiagramm
- Familiengruppenbogen / Familienblatt
- Ortsfamilienbuch-Druckliste

## 11. Deutsche Erfassungsstandards als Feld-Checkliste

Aus den GenWiki-Vorlagen und dem **WGfF-Verkartungsstandard (VK-Tabelle)** — was deutsche
Forscher als Standardumfang erwarten:

- Datum durchgehend in **Tag/Monat/Jahr getrennt** erfassbar (Unsicherheit pro Teil)
- Quelle immer als **Buch-Signatur + Seite + Eintragsnummer**
- Taufe: Geburtsdatum *und* Taufdatum getrennt; Wohnort und Taufort getrennt; Vater, Mutter, bis 4 Paten, bis 4 Patenvertreter, Anmerkung
- Trauung: Trauungsdatum, Dimissoriale-Datum, je Partner Wohnort *und* Herkunfts-/Geburtsort, jeweils dessen Eltern, bis 4 Zeugen
- Sterbefall: Sterbedatum + Ort, Begräbnisdatum + Ort, **Alter dreiteilig (Jahre/Monate/Tage)**, **Todesursache**, Ehepartner, Eltern
- Person allgemein: Beruf **mit Zeitraum** (mehrere), Wohnorte **mit Zeitraum**, Konfession, akademische Titel, Krankheiten
- Ortsfamilienbuch-Logik: **Personen ohne bekannte Verknüpfung müssen erstklassig existieren dürfen** (nicht jeder Erfasste hängt am Baum)

## 12. Datenschutz und Recht (Deutschland)

- **Lebend/verstorben als berechnetes, abfragbares Attribut.** DSGVO gilt nicht für Verstorbene, wohl für Lebende. Ohne Sterbedatum gilt im Zweifel "lebend"; Heuristik Geburt < heute − ~100 Jahre → wahrscheinlich verstorben, als Vermutung kennzeichnen. Das Flag muss in *jedem* Export-, Druck- und Veröffentlichungspfad greifen.
- **Haushaltsausnahme** (Art. 2 Abs. 2 lit. c DSGVO) deckt private/familiäre Nutzung — endet aber bei Veröffentlichung oder Weitergabe an Dritte/Vereine/Portale. → Export-Filter mit "Lebende entfernen/anonymisieren", `privat`-Flag pro Person *und* pro Aussage, Einwilligungsvermerk mit Datum.
- **Fortführungsfristen § 5 Abs. 5 PStG** (am Gesetzestext geprüft, 23.08.2026): Geburtenregister **110 Jahre**, Ehe-/Lebenspartnerschaftsregister **80 Jahre**, Sterberegister **30 Jahre** (Sonderstandesamt Bad Arolsen: 80 Jahre). Davor Einsicht nur für die Person selbst, Ehegatten, Vorfahren, Abkömmlinge. `[unverified]` Landesabweichungen bei der anschließenden archivrechtlichen Nutzung.
  → Nutzbar als Assistent: "Dieser Eintrag ist noch gesperrt bis 2031" statt aussichtsloser Archivanfragen.

---

## 13. Konsequenzen aus dem konkreten Forschungsraum (E9)

Forschungsraum: **Deutschland, Polen, Russland, Baltikum, Kanada**; Tiefe bis etwa **1700**.
Daraus folgen Prioritäten, die bei rein deutscher Forschung anders lägen.

### 13.1 Kalender wird zum Pflichtfeature, nicht zum Randfall
Für Deutschland allein wäre der Julianische Kalender nach 1700 fast irrelevant. Für deinen Raum
ist er es nicht:

| Region | Umstellung auf Gregorianisch |
|---|---|
| Protestantische Reichsstände | 18. Feb → 1. März 1700 |
| Polen (allgemein) | 1583 |
| **Kongresspolen (unter russischer Herrschaft)** | **beide Daten wurden offiziell geschrieben** — Doppeldatierung in den Registern |
| Russisches Reich | 14.02.1918 |
| Lettland | 18.11.1918 |
| Estland | nach dem Ersten Weltkrieg |

→ Zwei Konsequenzen fürs Datenmodell: das Kalendersystem **pro Datum** (nicht global) ist
zwingend, und die Doppeldatierung braucht eine Darstellung, die beide Werte zeigt, ohne zu
suggerieren, es seien zwei Ereignisse.

### 13.2 Ortsnamen-Historie ist bei diesem Raum das härteste Problem
Ein Ort in deinem Bestand kann im Lauf von 200 Jahren deutschen, polnischen und russischen
Namen getragen haben und in vier verschiedenen Staaten gelegen haben, ohne sich zu bewegen.
Das ist genau der Fall, für den GOV gebaut wurde (§4). Priorität der Ortsentität steigt damit
von "wichtig" auf "unverzichtbar".

### 13.3 Transliteration und Schrift
Russische und teils polnische Register sind kyrillisch bzw. mit diakritischen Zeichen geführt.
GEDCOM 7 sieht dafür `TRAN`-Substrukturen mit `LANG`/`SCRIPT` vor. Anforderung: pro Name und pro
Ortsname mehrere Schreibweisen in verschiedenen Schriften, mit Angabe, welche die
Originalschreibung ist. Suche muss über alle Varianten laufen.
`[unverified]` Ob eine automatische Transliteration (кириллица → Latein nach DIN 1460 / ISO 9)
sinnvoll mitgeliefert werden soll — hängt davon ab, wie viel kyrillisches Material tatsächlich auftritt.

### 13.4 Auswanderung nach Kanada
Migration ist bei dir kein Nebenaspekt, sondern strukturell: Ein Zweig verlässt den Kontinent.
Das macht die **Migrationslinien-Karte** (C-14) zu einem der wertvollsten Analysefeatures und
verlangt Ereignistypen `Auswanderung`, `Einwanderung`, `Einbürgerung`, `Schiffsreise` mit
Herkunfts- **und** Zielort am selben Ereignis.

### 13.5 Hypothese zum Wanderungsmuster `[inferred]`
Die Kette Deutschland → Polen/Russland → Baltikum → Kanada entspricht dem klassischen Muster
der **Russlanddeutschen** (Wolhynien, Wolga, Schwarzmeergebiet) bzw. der **Mennoniten**, die im
19. Jahrhundert nach Russland und ab den 1870er Jahren nach Kanada (Manitoba, Saskatchewan)
auswanderten. Falls das zutrifft, gibt es dafür sehr gut erschlossene Spezialquellen
(Wolhynien-Forum, GHGRB, Mennonite Heritage Archives). **Bitte bestätige oder verwirf das** —
es würde die Quellenstrategie und ein paar Datenmodell-Details beeinflussen (Kolonie- und
Dorfnamen, Gemeindezugehörigkeit als eigene Hierarchie).

### 13.6 Was durch E9 an Priorität verliert
- Französischer Revolutionskalender: nur relevant bei linksrheinischen Vorfahren 1793–1805. Struktur vorsehen, Umsetzung nach hinten.
- Jüdischer Kalender: nach aktueller Kenntnis nicht relevant. Struktur vorsehen, nicht umsetzen.
- Latinisierung: bei Tiefe bis 1700 relevant, aber weniger dramatisch als bei Forschung ins 16. Jahrhundert.

---

## 14. Mündliche Überlieferung als Quellenart (E6)

Weil dein Bestand derzeit aus Erinnerungen entsteht, ist "mündlich" nicht eine Randkategorie,
sondern **die häufigste Quelle in Phase 1**. Sie braucht dieselbe Sorgfalt wie ein Kirchenbuch:

**Eigene Quellenart `mündlich/Zeitzeugenaussage` mit Pflichtfeldern:**
- Informant (Verweis auf eine Person im Baum — der Erzähler ist selbst Teil der Familie)
- Datum des Gesprächs
- Form: Gespräch, Telefonat, Brief, E-Mail, Audioaufnahme
- Verweis auf die Audiodatei/Notiz als Medium
- Grad der Unmittelbarkeit: **Selbsterlebtes** vs. **Vom-Hörensagen** (Informant erzählt, was ihm erzählt wurde)

**Warum die letzte Unterscheidung wichtig ist:** In der Klassifikation des Genealogical Proof
Standard (§8) ist Selbsterlebtes primäre Information, Weitererzähltes sekundäre. Erinnerungen
über drei Generationen hinweg sind notorisch verschoben — typische Muster: Jahreszahlen
verrutschen um 2–10 Jahre, Kinderzahlen werden zu klein erinnert (früh verstorbene Kinder
fehlen), Ortsangaben werden auf den bekannteren Nachbarort verschoben, und zwei gleichnamige
Verwandte verschmelzen zu einer Person.

**Konsequenz:** Die Konfidenzangabe ist bei mündlichen Quellen kein Feinschliff, sondern der
Hauptzweck des Belegmodells. Und der Fall "zwei Verwandte erinnern sich unterschiedlich" ist
der **Normalfall**, nicht die Ausnahme — er rechtfertigt B-04 (Widersprüche koexistieren) allein.

**Praktische Feldregel:** Bei jeder aus Erinnerung erfassten Angabe ist der Standardwert für
Datumspräzision *nicht* "exakt". Die Eingabemaske sollte bei Quellenart "mündlich"
automatisch "etwa" vorschlagen.

---

## Quellen

- GEDCOM 7 Spezifikation (7.0.18, 17.02.2026): https://gedcom.io/specifications/FamilySearchGEDCOMv7.html · https://gedcom.io/
- GEDCOM-L Addendum (deutsche Erweiterungen, `_LOC`): https://genealogy.net/GEDCOM/GEDCOM551%20GEDCOM-L%20Addendum-R1.pdf
- GEDCOM X konzeptuelles Modell: https://github.com/FamilySearch/gedcomx/blob/master/specifications/conceptual-model-specification.md
- Gramps Datenmodell / DTD: https://github.com/gramps-project/gramps/blob/master/data/grampsxml.dtd
- GENTECH Genealogical Data Model 1.1: https://xml.coverpages.org/GENTECH-DataModelV11.pdf
- Genealogical Proof Standard: https://www.familysearch.org/en/wiki/Genealogical_Proof_Standard
- GOV Geschichtliches Ortsverzeichnis: https://gov.genealogy.net/ · https://www.compgen.de/2024/11/geschichtliches-ortsverzeichnis-gov-im-gedcom-standard/
- WGfF VK-Tabelle: https://wiki.genealogy.net/VK-Tabelle/WGfF
- GenWiki Erfassungsvorlagen: https://wiki.genealogy.net/Vorlagen_zur_Erfassung_genealogischer_Daten
- Genealogische Darstellungsformen (Büdding): https://sites.google.com/site/buedding/6-service/6-1-genealogie---ein-einstieg/6-1-5-genealogische-darstellungsformen
- Verwandtschaftsbeziehung: https://de.wikipedia.org/wiki/Verwandtschaftsbeziehung · Stammbaum: https://de.wikipedia.org/wiki/Stammbaum
- Gregorianischer Kalender (Einführungsdaten): https://de.wikipedia.org/wiki/Gregorianischer_Kalender
- DSGVO und Ahnenforschung (CompGen): https://www.compgen.de/2018/04/auswirkungen-der-dsgvo-auf-private-ahnenforscher/
- § 5 PStG (Fortführungsfristen): https://dejure.org/gesetze/PStG/5.html
- Nummerierungssysteme: https://www.gramps-project.org/wiki/index.php/Genealogical_Numbering_Systems
- Daitch-Mokotoff Soundex: https://en.wikipedia.org/wiki/Daitch%E2%80%93Mokotoff_Soundex
- Latinisierte Familiennamen: https://www.rambow.de/latinisierte-familiennamen.html
- Kalenderumstellung je Land (GHGRB): https://www.ghgrb.ch/genealogie/k/
- Kalenderfragen Wolhynien-Forum: https://forum.wolhynien.de/index.php?mode=thread&id=17478
