## ADR-010 — Erfassungsstrecke: Import-Vertrag als Kernschnittstelle

**Status:** entschieden (E6)

**Kontext:** Der Bestand entsteht aus Erinnerungen, Gesprächen und privaten Papieren (F4/F6).
Es gibt keinen Altbestand zu importieren. Manuelle Formulareingabe ist für diese Quelle die
langsamste denkbare Strecke.

**Entscheidung:** Ein versioniertes, dokumentiertes **JSON-Schema** (`wurzelwerk-import/v1`) ist eine
erstklassige Programmschnittstelle, nicht ein Nebenfeature. Es wird in Phase 1 gebaut und ist
der Weg, auf dem der Großteil der Daten in die Anwendung kommt.

Bestandteile:
1. **Schema** mit allen Entitäten, stabilen temporären IDs innerhalb einer Datei (`"tmp:opa-karl"`), und Pflichtangabe von Quelle und Konfidenz pro Aussage.
2. **Validierung** mit lesbaren Fehlermeldungen, die auf Zeile und Feld zeigen.
3. **Trockenlauf** — die Datei wird geprüft und als Vorschau gezeigt (was ist neu, was ergänzt eine bestehende Person, was kollidiert), *bevor* etwas geschrieben wird.
4. **Herkunftsvermerk** — jeder Datensatz weiß, aus welcher Importdatei und welchem Gespräch er stammt; ein Import ist als Ganzes rückgängig machbar.
5. **Claude-Skill** (D-11), der aus Gesprächsnotizen, Transkripten und abfotografierten Papieren Importdateien nach diesem Schema erzeugt — mit ehrlicher Konfidenz und ohne Erfindungen.

**Konsequenz für die Reihenfolge:** Das Schema muss stehen, *bevor* viel manuell erfasst wird —
sonst existieren zwei Wahrheiten. Praktisch heißt das: Schema und Trockenlauf sind das erste
sichtbare Feature nach dem Fundament.

**Wichtige Absicherung:** Der Skill darf **nichts erfinden**. Regel im Skill: Was nicht in der
Vorlage steht, wird nicht ergänzt; Unsicheres bekommt niedrige Konfidenz und eine Notiz mit dem
Originalwortlaut. Das ist bei KI-erzeugtem Importmaterial die Hauptfehlerquelle.
