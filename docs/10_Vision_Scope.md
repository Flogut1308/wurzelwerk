# Wurzelwerk — Vision, Zielbild und Abgrenzung

## 1. Kernversprechen

> Ein Werkzeug für die eigene, gut belegte Familienforschung — bei dem jede Aussage
> nachvollziehbar auf eine Quelle zurückgeht, und bei dem man den Zusammenhang
> zwischen hunderten Menschen tatsächlich *sehen* kann.

Zwei Hälften, die es bisher nur getrennt gibt:

- **Präzision**: Gramps, Family Historian, Legacy — fachlich exakt, aber sperrig, hässlich, hohe Einstiegshürde.
- **Gestaltung**: MacFamilyTree, Web-Tools — schön, aber fachlich flach (schwaches Quellenmodell, keine Ortshistorie).

Die Lücke dazwischen ist der Zielraum. [Quelle: `30_Markt.md`]

## 2. Was die Software *nicht* ist

Bewusste Abgrenzung, damit der Scope nicht explodiert:

- **Kein Rechercheportal.** Ancestry/MyHeritage besitzen die Quellenbestände; das ist nicht replizierbar. Die Software verwaltet *deine* Forschung, sie liefert keine fremden Datensätze.
- **Keine Kollaborationsplattform.** Kein Mehrbenutzerbetrieb, kein Server, keine Echtzeit-Zusammenarbeit. Austausch findet über Export/Import statt.
- **Kein DNA-Analysewerkzeug.** Segmentabgleich, Chromosome Browser, Match-Verwaltung sind ein eigenes, großes Produkt. `[offen]` — ob DNA-Kits als reine Notiz-Entität mitlaufen sollen (F8).
- **Keine Cloud-Synchronisation.** Auch nicht optional. Datenhoheit ist ein Produktmerkmal.

## 3. Zielnutzer

**Primär (Florian selbst):** trägt den Bestand derzeit aus **Erinnerungen, Gesprächen mit
Verwandten und privaten Büchern/Papieren** zusammen — noch nicht aus Kirchenbüchern. Will
Belegbarkeit, den visuellen Gesamtzusammenhang, und später Archivquellen ergänzen.

**Sekundär (Verwandtschaft, bestätigt E7):** bekommen einen Ausschnitt zum Ansehen — als
gedruckte Tafel oder als eigenständige HTML-Datei, die ohne Installation im Browser läuft.
Sie erfassen nichts. Rückfluss von Daten geschieht über den Import einer von ihnen
zurückgeschickten Datei, nicht über gemeinsames Arbeiten.

**Konsequenz aus E7:** Der Lesemodus-Export (E-06) rutscht von "Could" auf "Should" und wird
in Phase 4 gebaut. Ein Mehrbenutzerbetrieb bleibt ausgeschlossen.

**Nicht Zielgruppe:** Forschungsgruppen, Vereine, Ortsfamilienbuch-Projekte.

## 4. Die drei Leitprinzipien

1. **Jede Aussage hat eine Herkunft.** Das Datenmodell trennt *Beleg* (was in der Quelle steht) von *Schlussfolgerung* (wer diese Person ist). Widersprüche dürfen koexistieren.
2. **Nichts geht verloren, nichts ist endgültig.** Auto-Speicherung, vollständige Änderungshistorie, Undo über Sitzungsgrenzen, umkehrbares Zusammenführen von Personen.
3. **Struktur macht Menge beherrschbar.** Nicht "alles auf einmal zeigen", sondern jede Ansicht antwortet auf genau eine Frage.

## 5. Roadmap in Phasen

Jede Phase endet mit einer benutzbaren Anwendung. Die Reihenfolge folgt Entscheidung **P1 = A**
(zuerst benutzbare Erfassung) und **E6** (Erinnerungen und Papier sind die Datenquelle, nicht
GEDCOM-Dateien).

### Warum Erfassung vor Darstellung kommt

Deine Daten liegen auf Papier und in den Köpfen von Verwandten (E6). Es gibt keinen Altbestand
zu importieren. Damit ist die erste nützliche Fassung der Software nicht die schöne
Baumdarstellung, sondern ein schneller Weg, unstrukturiertes Familienwissen strukturiert und
belegt festzuhalten. Eine schöne Darstellung von nichts nützt nichts.

*Zeitdruck durch das Alter der Gesprächspartner besteht laut N4 nicht* — die Reihenfolge folgt
also der Logik der Datenlage, nicht einer Frist. Unabhängig davon bleibt der Rat sinnvoll,
Gespräche als Audio mitzuschneiden: Die Aufnahme kostet nichts und liefert später den
Originalwortlaut als Beleg.

### Phase 0 — Fundament (kein sichtbares Feature)
Projektsetup, privates Repository, CI mit Windows-Build, Datenschema v1 (inkl. Persona- und
Feld-Definitionstabellen), Migrationsmechanik, Änderungsjournal, Undo/Redo,
Projektordner-Format `.ahnen`, Auto-Speicherung, Übersetzungsschicht, Testkorpus.
*Warum zuerst:* Schema, IDs, Journal und i18n sind die vier Dinge, die man nachträglich nicht
reparieren kann.

### Phase 1 — Erfassen und Belegen  ← **hier entsteht der eigentliche Wert**
- Personen, mehrfache typisierte Namen, strukturierte Datumsangaben, Orte als Entität
- Ereignisse mit Rollenbeteiligung, typisierte Eltern- und Partnerschaftskanten
- **Benutzerdefinierte Profilfelder** (E11) — Feld-Definitionssystem, nicht hartverdrahtete Felder
- Quellen, Zitate, Konfidenz — inkl. Quellenart **"Zeitzeugenaussage"** mit Informant und Gesprächsdatum
- **Interview-Modus** (neu, A-15): ein Gespräch als Sitzung erfassen; unstrukturierten Text/Notizen einwerfen; die App erzeugt Personen- und Ereignisvorschläge, du bestätigst
- **KI-Import-Vertrag** (D-10, aus Phase 3 vorgezogen): JSON-Schema + Prüfung + Trockenlauf. Das ist bei deiner Datenlage die Haupt-Erfassungsstrecke, nicht ein Randfeature.
- Gesundheitsmodul: Diagnosen und Risikofaktoren (E10)
- Profilseite, Listenansicht, Suche (phonetisch), einfache Plausibilitätsprüfungen
*Ergebnis:* Du kannst sofort anfangen, echtes Familienwissen zu sichern — noch ohne Grafik.

### Phase 2 — Sehen
Baumdarstellung (Ahnentafel, Nachkommen, Sanduhr), Ein-/Ausklappen, Personenkarte mit
konfigurierbaren Feldern, Filtern/Isolieren, Blutlinien-Hervorhebung, Zentrumsperson mit
Verwandtschaftsgrad, Datenebenen-Einfärbung.
*Ergebnis:* Der visuelle Kern.

### Phase 3 — Zeit und Raum  *(P2, Priorität 1 und 2)*
Zeitleistenansicht, Kartenansicht, und der **synchrone Zeitregler** über Baum + Karte + Ortsnamen.
Migrationslinien (relevant wegen Auswanderung nach Kanada).
*Ergebnis:* Das Schaufenster-Feature.

### Phase 4 — Teilen und Ausgeben
PDF- und Posterdruck, Textberichte (Ahnenliste, Nachkommenliste, Familienbuch),
Nummerierungssysteme, **Lesemodus-Export als HTML-Datei für Verwandte** (E7),
Teilexport, GEDCOM 7 Import/Export, Zusammenführungs-Werkzeug mit Feld-für-Feld-Vergleich,
Dublettenerkennung, Datenschutzfilter für lebende Personen.
*Ergebnis:* Deine Arbeit wird vorzeigbar und tauschbar.

### Phase 5 — Analysieren  *(P2, Priorität 3)*
Paten-/Zeugen-Netzwerkansicht, Belegqualitäts-Ebene, Forschungslücken-Übersicht,
**medizinische Stammbaumansicht** (Erbmuster, Risikofaktoren), Statistiken,
vollständige Plausibilitätsprüfungen, Forschungsprotokoll und Aufgaben.

### Phase 6 — Reifen
Ortsnamen-Abgleich mit GOV, historische Kartenlayer, lokale KI (Transkription von Scans,
Namensnormalisierung, Dublettenvorschläge), Kirchenbuch-Erfassungsmodus (wird relevant, sobald
du in Archive gehst), Hypothesen-Modus, Signierung und Auslieferung, englische Übersetzung.

### Ehrlicher Hinweis zur Reihenfolge
Phase 1 sollte **klein** bleiben und sofort mit echten Familiendaten benutzt werden. Der Grund:
du hast noch keine Erfahrung damit, wie sich dein tatsächliches Material anfühlt. Jede Woche,
die du mit echten Daten in der eigenen App arbeitest, korrigiert das Konzept billiger als jede
weitere Planungsrunde. Der Reflex, Phase 1 "erst noch vollständig" zu machen, ist das
Hauptrisiko dieses Projekts.

## 6. Definition of Done je Phase
Eine Phase ist fertig, wenn: alle zugehörigen Anforderungen aus `40_Anforderungen.md` erfüllt sind,
der Testkorpus grün durchläuft, ein Beispielprojekt mit 2.000 Personen die Performance-Budgets hält,
und die Dokumente in diesem Ordner den Ist-Stand beschreiben.
