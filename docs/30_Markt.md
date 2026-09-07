# Wurzelwerk — Markt, Wettbewerb und Differenzierung

Stand der Recherche: 23.08.2026. Preise/Versionen mit Quelle; nicht gegengeprüfte Angaben sind markiert.

## 1. Lokale Desktop-Programme

| Programm | Plattform | Preis | Stärken | Schwächen |
|---|---|---|---|---|
| **Gramps 6.0.x** (6.0.0 03/2025, 6.0.6 11/2025) | Win/Mac/Linux, GPL | kostenlos | präzisestes Datenmodell (ereigniszentriert, Quellen/Zitate getrennt, Orts-Hierarchie), volle GEDCOM-7-Unterstützung, riesiges Addon-Ökosystem, Karten, Fächer/Sanduhr | GTK-UI wirkt auf Win/Mac fremd, harte Einstiegskurve, Doku fragmentiert, Stabilitätsberichte |
| **Ahnenblatt 4.50** (11.08.2026) | nur Windows | €39 (Aktion) / regulär €59 | einfachster Einstieg, deutschsprachig, Plausibilitätsprüfungen, Poster-/Mehrseitendruck, Familienbuch | kein Mac, schlankeres Quellenmodell `[unverified]`, keine Kollaboration |
| **MacFamilyTree 11.2.3** | nur macOS | US$69,99 | **bestes UI des Feldes**, Interactive Family Tree, 3D-"Virtual Tree", FamilySearch-Anbindung, 15 Sprachen | Mac-only, geringere Auswertungstiefe `[unverified]` |
| **Heredis 2026** | Win/Mac + Mobil | US$39,99 (Win) / 69,99 (Mac) | Dashboard/Forschungsfortschritt, viele Diagrammtypen, gute Mobilkopplung | jährliche Kaufversionen → Upgrade-Tretmühle, Win/Mac unterschiedlich reif `[unverified]` |
| **RootsMagic 11** | Win/Mac | US$39,95 | 100+ Berichte, Duplikatsuche, DNA-Verwaltung, Ancestry-TreeShare, GEDCOM 7 ab v9 | massive Nutzerkritik seit v8-Rewrite; 2,2/5 bei 20 Bewertungen (SmartCustomer) |
| **Family Tree Maker 2024** | Win/Mac | Preis auf offizieller Seite nicht ausgewiesen; US$89,95 `[unverified]` | 1-Klick-Ancestry-Sync, 5000 Undo-Schritte, Kartografie | Ancestry-Abhängigkeit, GEDCOM 7 nur "geplant" (06/2025) |
| **Legacy Family Tree 10** | Windows | **kostenlos seit 06/2024** | 100+ Charts, SourceWriter (Quellenvorlagen), FAN-Club-Report | Windows-only, geringe Entwicklungsgeschwindigkeit `[unverified]` |
| **Family Historian 7** | Windows | US$64,95 | GEDCOM 7 + GEDZIP, mächtige Query-Engine, frei gestaltbare Diagramme, Plugin-Store | Windows-only, konservative Optik |
| **GenoPro 2020** | Windows | US$49 | Nische **Genogramme** (Medizin/Therapie): Diagnosen, Symptome, Problem Spotter | seit 2020 kein Hauptrelease |
| **Ages! 2.3.1** | Windows | €39,95 | Sanduhr/Fächer, Plausibilitätsprüfung, Duplikat-Merge, Karten, Plug-ins | Ein-Mann-Projekt, langsame Releases |

**Web/Cloud zum Vergleich:** Ancestry (Abo, weltgrößter Quellenbestand + DNA, Datenhoheit
beim Anbieter), MyHeritage Family Tree Builder (kostenloser Desktop-Client, Kernkomfort nur
mit Premium-Abo, kein GEDCOM 7), Geni (ein Welt-Baum, Merge-Konflikte als Dauerthema),
WikiTree (kostenlos, Wiki-Prinzip, strenge Quellenkultur), webtrees 2.2.x (Open Source,
self-hosted, PHP/MySQL).

## 2. Tabellenstakes — was jeder Nutzer erwartet

- GEDCOM-Import/Export (5.5.1 **und** 7.0), verlustarm, mit Import-Bericht
- Personen-, Familien-, Ereignis-, Orts-, Quellen-/Zitat- und Medienobjekte mit freien Verknüpfungen
- Unscharfe Suche, Namensvarianten, Filter, Duplikatserkennung mit Zusammenführung
- Standarddiagramme: Ahnentafel, Nachkommen, Sanduhr, Fächer, Familienblatt
- **Druck/PDF, mehrseitig als Poster** — von Genealogen erwartet, in der Ursprungsidee nicht vorgesehen
- Berichte: Ahnenliste, Nachkommenliste, Familienbuch, Statistiken, Aufgabenliste
- Unscharfe Datumsangaben, Ortshierarchien, Quellenbeleg pro Fakt
- **Plausibilitätsprüfung** (Mutter mit 8 Jahren, Tod vor Geburt), Änderungsverlauf, Undo, Backup
- Datenschutz: Lebende beim Export ausblenden
- Unicode, lokale Datei, die man kopieren kann

## 3. Was bestehende Programme notorisch schlecht machen

Das ist die Landkarte der Differenzierungschancen — jeder Punkt ist belegt:

1. **UI-Altlasten.** DNA Painter beschreibt neue Web-Tools ausdrücklich im Kontrast zum "old school computer program look and feel" der etablierten Programme. Gramps-Reviews auf SourceForge: Oberfläche folgt X-Window-Konventionen statt Plattformstandards.
2. **Einstiegshürde bei Grundoperationen.** Aus r/Genealogy: *"gramps is incredibly difficult. I have been at it for an hour and I cannot even marry my own wife in it"* — man kann vom Personenprofil aus keinen Partner anlegen.
3. **Regressionen bei Rewrites.** RootsMagic 8 galt als "kludgy and counterintuitive", mit Einfrieren, Abstürzen und **weggefallenen Tastaturkürzeln** für die Schnelleingabe. Nutzer reagieren auf verlorene Tastaturbedienung härter als auf fehlende Features.
4. **Merge- und Sync-Chaos.** GEDCOM-Uploads erzeugen Dubletten-Fluten; in FamilySearch- und Geni-Communities dominieren Threads wie "Need to merge everyone after every GEDCOM update". Zweiwege-Sync hat kein verlässliches Konfliktmodell.
5. **Datenverlust beim Formatwechsel.** Ohne GEDCOM 7 gehen Medien, Zitate, Unicode-Details und Änderungsverfolgung verloren. MyHeritage und Findmypast hatten 06/2025 keine GEDCOM-7-Unterstützung angekündigt.
6. **Stabilität/Performance.** Gramps-Nutzer berichtet Abstürze "at almost every session" bei nur 8.500 Personen. Große Bestände (>50k) sind generell ein Schwachpunkt.
7. **Dokumentation** paralleler Hauptversionen — laut Review "needs a radical brush-up".

## 4. Visualisierungen: gesättigt vs. offen

**Gut abgedeckt** (kein Differenzierungspotenzial, aber Pflicht): Fächerdiagramm, Sanduhr,
Ahnen-/Nachkommentafel, Statistik-Charts, Kartenpunkte pro Ereignis.

**Selten oder schlecht umgesetzt — hier liegt der Hebel:**

| Idee | Stand am Markt |
|---|---|
| **Zeitleisten-Regler, der Baum + Karte + Ortsnamen synchron auf ein Jahr setzt** | in Desktop-Software praktisch nicht vorhanden; TreeAlive animiert nur Migration im Web |
| **Migrationskarte mit Linien über Generationen** statt Punktwolke | Web-Nische (Ancestor Map Builder) |
| **Verwandtschaftsgrad-Rechner mit erklärtem Pfad** und korrekter deutscher Terminologie | überall textuell, nie visuell |
| **Blutlinien-Hervorhebung + Ahnenimplex sichtbar machen** | kaum umgesetzt |
| **Belegqualität als visuelle Ebene** ("wo ist mein Baum dünn?") | nirgends gefunden |
| **Forschungslücken-Heatmap** | nur als Fremdanalyse (Gedminer-artig) |
| **Paten-/Zeugen-/Nachbarschaftsnetzwerk (FAN-Prinzip)** | Legacy hat nur einen Textbericht |

Gramps führt für neue Visualisierungen ein eigenes offenes Konzeptpapier (GEPS 030) — ein
Indiz, dass die Lücke bekannt und unbesetzt ist.

## 5. Positionierung

**Der Satz, der das Produkt verkauft:**
> Die Datenmodell-Strenge von Gramps mit dem Gestaltungsanspruch von MacFamilyTree —
> plattformübergreifend, deutschsprachig, ohne Cloud.

Konkrete Differenzierungsachsen, absteigend nach Wirkung:

1. **Umkehrbares Zusammenführen als erstklassiger Workflow** — Feld-für-Feld-Vergleich, Vorschau, Merge-Historie, jederzeit rückgängig. Löst den am besten dokumentierten Schmerzpunkt der Branche.
2. **Erfassungs-Ergonomie** — Tastatur zuerst, Befehlspalette, "Partner anlegen" aus jedem Kontext, Schnelleingabe mit natürlichsprachlicher Datums- und Ortserkennung.
3. **Visuelle Analyse statt bloßer Darstellung** — Zeitregler über Baum+Karte, Belegqualitäts-Ebene, Lückenanalyse, Verwandtschaftspfad.
4. **Datenbesitz + GEDCOM 7 native + verlustfreies Eigenformat mit Klartext-Export** — DSGVO- und Datenhoheits-Argument im DACH-Raum.
5. **Deutscher Markt konkret** — Ahnenblatt bedient ihn simpel und Windows-only. Ein modernes, plattformübergreifendes, deutschsprachiges Programm mit **Ortsnamen-Historie** (deutsche Ostgebiete, Kreisreformen, GOV-Anbindung) hat keinen ernsten Gegner.
6. **Lokale KI-Unterstützung ohne Cloud** — Transkriptionshilfe, Namensnormalisierung, Dublettenvorschläge; Datenhoheit bleibt erhalten.

**Ehrliche Gegenrechnung:** Der Quellenzugang von Ancestry/MyHeritage ist nicht
replizierbar. Die Software muss als *Werkzeug für die eigene Forschung* positioniert werden,
nicht als Rechercheportal.

## Quellen
- Gramps: https://gramps-project.org/blog/2025/03/gramps-6-0-0-released/ · Reviews https://sourceforge.net/projects/gramps/reviews/ · GEPS 030 https://gramps-project.org/wiki/index.php/GEPS_030:_New_Visualization_Techniques
- Ahnenblatt https://www.ahnenblatt.de/ · Shop https://www.ahnenblatt.com/shop/
- MacFamilyTree https://www.syniumsoftware.com/macfamilytree · Heredis https://home.heredis.com/en/
- RootsMagic https://www.rootsmagic.com/rootsmagic · Bewertungen https://www.smartcustomer.com/reviews/rootsmagic.com
- Family Tree Maker https://www.mackiev.com/ftm/ · Legacy https://legacyfamilytree.com/
- Family Historian https://www.family-historian.co.uk/gedcom-7 · GenoPro https://www.genopro.com/ · Ages! https://www.daubnet.com/en/ages
- GEDCOM-7-Kompatibilität (06/2025): https://sites.google.com/view/generagenealogicalservices/blog/gedcom-7-0-compatibility-breakdown
- DNA Painter zu neuen Tree-Tools: https://blog.dnapainter.com/blog/an-explosion-of-new-tree-tools/
- "The GEDCOM data problem": https://community.familysearch.org/en/discussion/85380/the-gedcom-data-problem
