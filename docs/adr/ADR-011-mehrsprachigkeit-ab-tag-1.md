## ADR-011 — Mehrsprachigkeit ab Tag 1, Texte nur auf Deutsch

**Status:** entschieden (E8)

**Entscheidung:** Alle sichtbaren Zeichenketten laufen von Anfang an über eine
Übersetzungsschicht (Vorschlag: `i18next` mit `react-i18next` — sehr gute Trainingsdaten-Lage).
Gepflegt wird zunächst nur `de`. Eine `en`-Datei entsteht in Phase 6.

**Begründung:** Texte nachträglich aus JSX herauszuziehen ist stumpfe, fehleranfällige
Fleißarbeit über hunderte Dateien — genau die Art Aufgabe, bei der KI-gestützte Massenumbauten
Fehler einstreuen.

**Konsequenzen:** Auch Pluralformen, Datums- und Zahlenformate laufen über die Schicht.
Wichtig für dieses Projekt: **Verwandtschaftsbezeichnungen sind nicht übersetzbar**, sondern
sprachspezifisch zu berechnen (deutsche Begriffe sind geschlechtsspezifisch, englische nicht;
"Cousin 2. Grades" ≠ "second cousin"). Die Berechnungslogik braucht daher pro Sprache eine
eigene Regelmenge, keine Zeichenkettentabelle.
