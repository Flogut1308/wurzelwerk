## ADR-012 — Repository und Windows ohne Windows-Rechner

**Status:** entschieden (E13, T1, T2)

**Entscheidung:**
- **Privates GitHub-Repository** ab dem ersten Commit. Begründung: Versionsgeschichte als
  Sicherheitsnetz bei KI-gestützter Entwicklung, CI für die Testzusicherungen aus ADR-009, und
  spätere Auto-Updates brauchen GitHub Releases ohnehin.
- **Windows-Build in GitHub Actions**, obwohl kein Windows-Rechner vorhanden ist (T2). Jeder
  Push baut zusätzlich unter `windows-latest` und lässt dort die Testsuite laufen.

**Das ehrlich benannte Risiko:** CI fängt Bau- und Logikfehler, aber **keine visuellen und
Bedienfehler** unter Windows — Schriftmetriken, Fenstersteuerung, Dateidialoge, Tastenkürzel
(Cmd vs. Ctrl), Pfadtrennzeichen, Umlaute in Pfaden, hohe DPI-Skalierung. Diese Fehler sammeln
sich unbemerkt an und tauchen alle gleichzeitig auf, wenn irgendwann ein Windows-Rechner
verfügbar ist.

**Gegenmaßnahmen:**
1. Von Anfang an keine plattformspezifischen Pfad- oder Tastenannahmen (`path.join`, zentrale Tastenkürzel-Tabelle mit `Cmd`/`Ctrl`-Abstraktion).
2. In der CI **Screenshots** der Hauptansichten unter Windows erzeugen und als Artefakt speichern — dann siehst du Layoutfehler ohne Windows-Rechner.
3. Ehrliche Erwartung: Die App ist bis zu einem echten Windows-Test **macOS-Software, die unter Windows baut**.

**Aktualisierung (E23):** Ein Windows-Rechner ist perspektivisch verfügbar. Damit bleibt Windows
ein gleichrangiges Zielsystem und wird nicht als Nebenziel geführt. Konkrete Regel: **spätestens
am Ende von Phase 2** (erste vollständige Baumdarstellung) findet eine Windows-Testrunde statt.
Alles, was danach an Windows-Fehlern auftaucht, ist billig zu beheben; alles, was bis Phase 4
ungetestet bleibt, ist es nicht.

---

**Nachtrag (07.09.2026, E49):** Repo und Wissen liegen jetzt **beide unter `~/Claude/Projects/Ahnenforschung/`** — Dokumente in `Wissen/`, Code-Repo in `wurzelwerk/`. Das ersetzt die Ortsangabe „eigener Ordner *neben* dem Konzeptordner" (E34). Die Trennung bleibt: `wurzelwerk/` ist ein eigenständiges Git-Repo, `Wissen/` liegt außerhalb davon und wird nicht mitgetrackt; `node_modules/` gehört über `.gitignore` heraus und nicht in ein Backup/Sync des `Ahnenforschung`-Ordners.
