## ADR-006 — Austauschformate: GEDCOM 7 primär, eigenes JSON verlustfrei

**Status:** entschieden (E1)

**Entscheidung:**
- **Schreiben:** GEDCOM 7 / GEDZIP als Austauschformat (Spezifikation 7.0.18, 17.02.2026), plus eigenes JSON-Vollformat für verlustfreien Transport zwischen Instanzen der eigenen Software.
- **Lesen:** GEDCOM 7, GEDCOM 5.5.1 inkl. GEDCOM-L `_LOC` (das Ortsobjekt, das deutsche Programme wie Ahnenblatt und Gen_Plus nutzen), eigenes JSON.
- **GOV-IDs** über `EXID` mit `TYPE http://gov.genealogy.net/` transportieren (seit 2024 offiziell).

**Begründung:** GEDCOM 5.5.1 ist der De-facto-Austauschnenner, GEDCOM 7 der Standard mit
Zukunft (unterstützt von FamilySearch, Gramps, RootsMagic 9+, webtrees, Family Historian;
Ancestry/FTM und MyHeritage Mitte 2025 noch nicht). Beide Richtungen abzudecken kostet wenig
mehr als eine.

**Konsequenzen:** Der GEDCOM-Export ist zwangsläufig verlustbehaftet (Personas, mehrfache
Elternkanten, Aussagen mit Begründung haben keine Entsprechung). Jeder Export erzeugt einen
Bericht darüber, was nicht abgebildet werden konnte.
