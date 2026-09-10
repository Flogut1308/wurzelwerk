# Wurzelwerk — Arbeitsweise über mehrere Chats und Kontextfenster

Zweck: Damit kein Wissen verloren geht, wenn ein Chat endet oder ein Kontextfenster voll ist.
Das Prinzip: **die Dokumente in diesem Ordner sind die Wahrheit, nicht der Chatverlauf.**

## 1. Regeln für jeden neuen Chat

**Am Anfang:**
1. `00_INDEX.md` lesen — Status, getroffene Entscheidungen, Dokumentenkarte.
2. Nur die Dokumente lesen, die für die aktuelle Aufgabe relevant sind (die Karte in `00_INDEX.md` sagt welche). Nicht alles laden.
3. Bei Implementierungsarbeit zusätzlich `CLAUDE.md` im Code-Repository (siehe §4).

**Am Ende jeder Sitzung — verbindlich:**
1. Neue Erkenntnisse in das *fachlich zuständige* Dokument schreiben, nicht in eine neue Datei.
2. Neue Entscheidungen als ADR in `60_Technik_ADR.md` oder als Zeile in der Entscheidungstabelle von `00_INDEX.md`.
3. Neue offene Punkte in `80_Offene_Fragen.md`, beantwortete dort streichen und die Antwort ins Fachdokument übertragen.
4. Datum und Phase in `00_INDEX.md` aktualisieren.

## 2. Was wohin gehört

| Art der Information | Zielort |
|---|---|
| Fachwissen Genealogie | `20_Domaenenwissen.md` |
| "Wir machen X, weil Y" (technisch) | ADR in `60_Technik_ADR.md` |
| "Wir bauen Feature Z" | Zeile in `40_Anforderungen.md` |
| Schema-Änderung | `50_Datenmodell.md` + Migrationsdatei im Code |
| Gestaltungsentscheidung | `70_UX_Konzept.md` |
| "Florian muss entscheiden" | `80_Offene_Fragen.md` |
| Aktueller Arbeitsstand am Code | `CLAUDE.md` + Git-Historie, **nicht** hierhin |

Regel: **Kein Dokument wird zur Halde.** Wenn ein Dokument über ~800 Zeilen wächst, wird es
aufgeteilt und in `00_INDEX.md` verlinkt.

## 3. Aufgabenzuschnitt für KI-Arbeit

Ein Arbeitspaket ist gut geschnitten, wenn es:
- in ein Kontextfenster passt (Faustregel: berührt < 10 Dateien),
- mit einem grünen Test endet,
- eine Anforderungs-ID aus `40_Anforderungen.md` als Auftrag hat,
- keine offene Frage aus `80_Offene_Fragen.md` blockiert.

Beispiel für einen guten Auftrag:
> "Implementiere A-03 (strukturierte Datumsangaben): Datenmodell nach `50_Datenmodell.md` §2.3,
> Parser für deutsche Eingaben, Serialisierung nach GEDCOM-7-DATE, Invariantentests nach
> ADR-009 Punkt 2. Nicht die UI."

Beispiel für einen schlechten Auftrag:
> "Baue die Personenverwaltung."

## 4. Struktur im Code-Repository

```
/                       Code-Repository (getrennt vom Konzeptordner oder als Unterordner)
  CLAUDE.md             ← Verhaltensregeln für Claude Code in diesem Repo
  docs/adr/             ← Kopie/Symlink der ADRs, damit sie beim Coden im Blick sind
  docs/schema/          ← Migrationsdateien, eine pro Schemaversion, nummeriert
  fixtures/             ← Testbäume (siehe ADR-009)
  src/main/             ← Electron-Hauptprozess: Datenbank, Datei-IO, IPC
  src/renderer/         ← React-Oberfläche
  src/core/             ← plattformunabhängige Logik: Datum, Namen, Verwandtschaft, Layout
  src/core/layout/      ← Layout-Engine, kennt kein Rendering
  test/
```

`CLAUDE.md` muss mindestens enthalten: Architekturgrenzen (Layout kennt kein Rendering,
Renderer kennt keine Datenbank), Testpflicht bei Bugfixes, `strict: true`/kein `any`,
Verweis auf die ADRs, Befehle für Build/Test/Lint.

## 5. Empfohlene Skills für dieses Projekt

Vorschlag für eigene Skills, die die Arbeit über Chats hinweg stabilisieren `[inferred]`:

| Skill | Zweck |
|---|---|
| `wurzelwerk-kontext` | Lädt Index + die für die Aufgabe relevanten Konzeptdokumente, prüft offene Fragen. Am Anfang jedes Chats. |
| `wurzelwerk-arbeitspaket` | Schneidet aus einer Anforderungs-ID ein umsetzbares Paket inkl. Tests und Abnahmekriterien. |
| `wurzelwerk-schema-migration` | Führt eine Schemaänderung sauber durch: Migrationsdatei, Testdatenbank, Rückwärtstest. |
| `wurzelwerk-sitzungsabschluss` | Erzwingt die Regeln aus §1 "Am Ende jeder Sitzung". |
| `wurzelwerk-import-vertrag` | Der Skill aus D-11: erzeugt aus Gesprächsnotizen, Transkripten und abfotografierten Papieren Importmaterial gemäß JSON-Schema. **Wird in Phase 1 gebraucht, nicht später** (ADR-010). Harte Regel im Skill: nichts erfinden, Unsicheres mit niedriger Konfidenz und Originalwortlaut als Notiz. |

`wurzelwerk-kontext` und `wurzelwerk-arbeitspaket` werden mit dem Beginn von Phase 0 angelegt.
`wurzelwerk-import-vertrag` entsteht zusammen mit dem JSON-Schema in Phase 1 und ist von da an das
Werkzeug, mit dem der Bestand tatsächlich wächst.

## 6. Projektgedächtnis (Cowork)

Kurzlebiges gehört nicht in die Dokumente. In das Projektgedächtnis gehören dauerhafte
Präferenzen und Rahmenbedingungen (Arbeitsweise, Werkzeugwahl, wiederkehrende Korrekturen).
Der Konzeptordner bleibt die Quelle für Inhalt und Entscheidungen.

## 7. Sitzungsmodell: ein Task, eine Session, ein PR (agentischer Betrieb)

Ab Phase 0 wird vollständig agentisch in Loops gearbeitet (E48, ADR-025). Damit neue Sessions klein, koordiniert und tokensparsam bleiben:

- **Ein Task = eine Session = ein Branch + PR.** `58_Laufplan.md` ist der Index über den Strang. Jede Session liest **zuerst** den Laufplan und nimmt den obersten Task mit Status „offen", dessen Abhängigkeiten (`57`-Kette) „fertig" sind.
- **Nur lesen, was der Task nennt:** Laufplan + der AP-Abschnitt in `57` + genau die dort genannten Doc-Abschnitte + `CLAUDE.md`. Nicht ganze große Dokumente (`55` ist 82 KB). Leselast an Sub-Agenten geben.
- **Lebenszyklus:** Laufplan+AP lesen → Plan zeigen → (Freigabe) → Branch → bauen, kleine Commits, schnelle Gates lokal grün → PR gegen `main` → CI grün (macOS+Windows, langsame Gates) → **3 Zeilen Ergebnis in `58_Laufplan.md`** (Status, PR, Folgepunkte) → Session beenden.
- **Nichts raten:** offene Entscheidung → anhalten oder Punkt in `80` / ADR in `60` (§1, `CLAUDE.md` §12). Der Chat ist wegwerfbar; die Wahrheit steht in Docs + git.
- **Rollen:** Claude Code baut. Eine Koordinator-Rolle (Cowork oder eine Plan-Session) bereitet den nächsten Prompt vor und reviewt den PR — u. a. den geschützten Prüfpfad (ADR-025).
- **Systemtests:** die vollständige Invarianten- + E2E-Suite läuft bei **jedem** PR gegen den geteilten Fixture-Korpus (AP-0.12). Damit ist der Trunk `main` durchgehend integrationsgetestet; das „alle PRs zusammen"-Testen braucht keine eigene Monolith-Suite. Details in `58_Laufplan.md` §Systemtests.
