---
description: Eine Kette von Oberflächenpaketen am Stück durchlaufen (mit Bildbeleg statt Blick je Paket)
argument-hint: [abschnitt: 1, 2, 3a, 3b oder 4 — oder start-ap, z.B. 1.30]
model: opus
---

Du bist **Kettenführer**, nicht Umsetzer. Kein Produktivcode in diesem Lauf.

**Der Ablauf je Paket ist identisch mit `.claude/commands/nachzug.md`, Abschnitt „Je Paket —
dieselben neun Schritte".** Lies ihn einmal und wende ihn unverändert an. `.claude/commands/kette.md`
ergänzt ihn für Phase 1. Diese Datei sagt nur, was bei **Oberflächenpaketen** zusätzlich gilt.

## Warum es diese Datei gibt

Bei kopflosen Paketen entscheidet ein Gate. Bei Oberfläche entscheidet ein Blick — und der Nutzer
will nicht nach jedem Paket hinsehen. Der Ersatz ist **nicht**, dass niemand hinsieht, sondern:
jedes Paket hinterlässt einen Bildbeleg, und ein Bildvergleichs-Gate verhindert, dass ein späteres
Paket ein fertiges Bild still verändert. Der Nutzer sieht gestapelt hin, an den Checkpoints.

## Abschnitte

**Kette 1** (`/kette-ui 1`): AP-1.11 → AP-1.25 → AP-1.8 → AP-1.9 → AP-1.10
  AP-1.11 zuerst: die Atome und die Zustandsbibliothek setzen das Aussehen von allem Folgenden.
  AP-1.25 direkt danach: friert die Referenzbilder ein, solange es wenig einzufrieren gibt.
  **Danach ANHALTEN — Checkpoint 1.** Der Nutzer sieht sich die Zustandsbibliothek an.

**Kette 2** (`/kette-ui 2`): AP-1.28 → AP-1.26 → AP-1.27 → AP-1.12 → AP-1.13 → AP-1.14 → AP-1.15 → AP-1.16 → AP-1.17
  AP-1.28 zuerst: die Bausteinkorrekturen aus Checkpoint 1 — sie tragen alles Folgende.
  Dann AP-1.26: der Eingang der App (die Startansicht ist der einzige ungestaltete Bildschirm,
  und ihre Pfadtextfelder verstoßen gegen die Regel „Pfade wählt man nie durch Tippen"),
  AP-1.27 direkt danach: der Eingang der Testdaten.
  **Danach ANHALTEN — Checkpoint 2.** Der Nutzer arbeitet einen Abend mit echten Daten.

**Kette 3a — Editor** (`/kette-ui 3a`): AP-1.29 → ⏸ → AP-1.30 → AP-1.32
  Erst nach ausdrücklicher Freigabe von Checkpoint 2 starten.
  AP-1.29 zuerst: die fehlenden Schreibwege und die zwei fehlenden Referenzbilder — ohne sie
  kann sich „Person bearbeiten" während des Umbaus still verändern.
  **⏸ = Kette hält nach AP-1.29 an.** AP-1.33 (Migration 0006) und AP-1.34 (Migration 0007)
  laufen **einzeln über `/ap`**, nicht in der Kette — „Eine Migration entsteht" bleibt
  Abbruchgrund (`kette.md`). Danach weiter mit `/kette-ui 1.30`.
  **Danach ANHALTEN — Checkpoint 3.** Der Nutzer pflegt einen Abend lang Personen im neuen Editor.

**Kette 3b — Medien** (`/kette-ui 3b`): ⏸ → AP-1.31b → AP-1.31c → AP-1.31d → AP-1.19
  Erst nach ausdrücklicher Freigabe von Checkpoint 3 starten.
  **⏸ = AP-1.31a (Migration 0008) läuft vorher einzeln über `/ap`.** Die Kette beginnt erst,
  wenn 1.31a auf `main` ist.
  AP-1.19 am Ende: füllt den Gesundheitsreiter aus AP-1.30, kein eigener Bildschirm mehr.
  **Danach ANHALTEN — Checkpoint 4.**

**Kette 4 — Komfort** (`/kette-ui 4`): AP-1.18 → AP-1.23 → AP-1.24 → AP-1.21 → AP-1.22
  Erst nach ausdrücklicher Freigabe von Checkpoint 4 starten.
  AP-1.22 zuletzt: sie kann nur aufrufen, was es gibt.

AP-1.20 ist **ersetzt** (durch AP-1.31a–d, 22.09.2026) und läuft nicht mehr.

AP-1.4b läuft außerhalb der Kette (eigene Sitzung, 18.09.2026).

## Zusätzlich je Paket — drei Abnahmebedingungen über den AP-Text hinaus

1. **Zustandsbibliothek ergänzt.** Jeder neue Baustein steht mit allen Varianten und Zuständen in
   `src/renderer/ansichten/zustandsbibliothek/`. `test/gestaltung/bibliothek-vollstaendig.test.ts`
   erzwingt es; ein Baustein ohne Eintrag gilt als nicht fertig.
2. **Bilder erzeugt.** `pnpm bilder` läuft, die Artefakte hängen am PR. Bei einem neuen Bildschirm
   kommen dessen Bilder in hell/dunkel × beide Dichten dazu.
3. **Bildvergleich grün.** Verändert das Paket einen bestehenden Bildschirm, wird das Referenzbild
   **bewusst** erneuert (`pnpm bilder:erneuern`) und im PR begründet: welche Bilder und warum.
   „Sieht jetzt anders aus" ist keine Begründung. Referenzbilder liegen in `test/golden/` und
   lösen das Prüfpfad-Gate aus (ADR-025) — das ist beabsichtigt, nicht lästig.

## Zusätzliche Abbruchgründe

- **Ein Bild ändert sich, ohne dass das Paket es erklären kann.** Nicht erneuern, anhalten.
- **Ein Paket erfindet eine visuelle Lösung**, statt `71` §2/§3 zu folgen — also einen Baustein,
  der weder im Dokument noch im Design-Export vorkommt, ohne §14-Vermerk. Anhalten.
- **Ein Paket braucht ein Symbol, das es nicht gibt.** Nicht improvisieren, nicht Unicode, nicht
  Emoji (`71` §4.3) — vermerken und anhalten, wenn es tragend ist.
- **Ein Paket will ein Referenzbild löschen** statt es zu erneuern.
- Sonst gilt die vollständige Abbruchliste aus `nachzug.md` und `kette.md`.

## Modellrouting (ab Kette 3, Entscheidung 23.09.2026)

**Alles, was plant, baut, prüft oder führt, läuft auf Opus.** Die frühere Tabelle „pro Paket"
(Kette 1/2, mit Sonnet für einfache Pakete) ist abgelöst; sie steht in der git-Historie.

| Rolle | Modell | Wie es greift |
|---|---|---|
| Kettenführer (diese Sitzung) | **opus** | `model:` im Kopf dieser Datei |
| `planer` | **opus** | Agent-Definition |
| `umsetzer` | **opus** | Agent-Definition — **gilt auch für `nachzug.md` Schritt 5**, dort steht noch „umsetzer (sonnet)": hier wird er als `umsetzer (opus)` gelesen |
| `hueter` | **opus** | Agent-Definition, bei Prüfpfad-Paketen adversarial |
| `mechaniker` | haiku | bleibt: Rot-Beleg ausführen, Gate-Ausgaben lesen, Doku kopieren — kein Urteil |

`opus` ist der Alias für das jeweils aktuelle Opus-Modell — **Stand 23.09.2026 Opus 5.5**
(`claude-opus-5-5`). Der Alias wird bewusst nicht durch die feste ID ersetzt:
`enforceAvailableModels` in `.claude/settings.json` lässt nur die drei Aliasse zu.
**Beim Agent-Aufruf kein `model`-Override übergeben** — die Definition gilt. Meldet ein Agent
ein anderes Modell als Opus (außer `mechaniker`), ist das ein Abbruchgrund.

## Am Checkpoint

**Zuerst Doku-Sync (Regel seit 23.09.2026):** der `mechaniker` kopiert
`../Wissen/57_Phase0_Arbeitspakete.md` **byte-gleich** nach `docs/arbeitspakete.md` — als eigener
PR `chore/doku-sync-kette-<n>`, CI grün ×3, `hueter` kurz, mergen. Was ein Paket am Datenmodell
ändert (`docs/datenmodell.md`, `docs/schema/`), gehört **nicht** hierher, sondern in den PR des
Pakets selbst. So ist die Repo-Kopie nie älter als eine Kette.

Kein `/abnahme`. Stattdessen: Laufplan nachziehen, `pnpm bilder` ein letztes Mal laufen lassen,
und dem Nutzer in fünf Zeilen sagen — welche Pakete gemergt sind, wo die Bilder liegen, was an
§14-Abweichungen aufgelaufen ist (`docs/80`), und was du an der Gestaltung **selbst** für die
schwächste Entscheidung hältst. Die letzte Frage ist keine Höflichkeit: du hast die Bilder
gesehen, er noch nicht.
