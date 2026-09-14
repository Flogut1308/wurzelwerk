---
description: Finale Abnahme des Phase-0-Nachzugs — prüft die Software, nicht die Gates
argument-hint: [basis-commit, Standard = Merge-Commit vor AP-0.16]
model: opus
---

Abnahme nach AP-0.16 bis AP-0.25. **Kein Code, keine Fixes** — nur prüfen und berichten. Findest
du etwas, wird daraus ein neues Paket in `../Wissen/57_Phase0_Arbeitspakete.md`, kein schneller
Griff ins Repo.

Der Sinn: die Gates sagen, dass die Prüfungen laufen. Die Abnahme sagt, ob die **Software** das
tut, was zugesagt war. Das sind zwei verschiedene Aussagen — der ganze Nachzug existiert, weil sie
auseinandergelaufen sind.

`$0` ist der Basis-Commit für den Gesamtdiff; ohne Angabe der Merge-Commit vor AP-0.16.

## 1. Die Zusage aus `57`, jetzt maschinell

> „Phase 0 ist fertig, wenn `pnpm pruefe` grün ist, alle Invarianten aus `CLAUDE.md` §5 laufen,
> die CI unter Windows und macOS grün baut, und ein leeres Projekt angelegt, geschlossen und
> wieder geöffnet werden kann."

Der letzte Halbsatz ist der Punkt. Prüfe ihn **an der gebauten App**, nicht unter `pnpm dev`:
`pnpm build`, dann Paket starten, Projekt anlegen, schließen, App beenden, neu starten, Projekt
öffnen. Erwartung: funktioniert, und das Protokoll enthält **kein** `projekt_sperre_verwaist`.

## 2. Jeder Befund hat einen Test, der rot war

Geh die Tabelle durch. Für jede Zeile: gibt es den Test, und stand im PR-Rumpf oder Laufplan die
rote Ausgabe? Ein Fix ohne belegtes Rot zählt nicht als abgenommen (`CLAUDE.md` §5).

| Paket | Befund | Erwarteter Nachweis |
|---|---|---|
| 0.16 | Langsames Gate konnte nicht rot werden | CI-Lauf, in dem `ablauf-00-start.spec.ts` **ausgeführt** ist; dazu der absichtlich rote Lauf |
| 0.17 | Gepackte App findet Migrations-SQL nicht | `ablauf-00-projekt.spec.ts` gegen das Paket; Prüfsummen byte-identisch |
| 0.18 | Beenden schließt das Projekt nie | `ablauf-00-beenden.spec.ts`; `sigkill.test.ts` **unverändert** grün |
| 0.19 | TOCTOU auf der Sperre, Verbindungsleck | Zweites `sperrdateiSetzen` wirft; gescheitertes Öffnen lässt nichts offen |
| 0.20 | `ereignis:`-Kanal untypisiert, `projektGeschlossen` fehlt | `@ts-expect-error`-Test; `projektSchliessen()` sendet genau ein Ereignis |
| 0.21 | Fold verwirft Gruppenrest; `changes` ungeprüft; `redo`-Wächter | `[insert,delete]+[insert]` → eine `insert`-Zeile; PR-B-Invariante mit bestandener Mutationsprobe |
| 0.22 | Unveränderter Wert erzeugt Undo-Schritt | Zweimal derselbe Wert → eine Transaktion |
| 0.23 | Projektname ungeprüft im Pfad | `../../evil` erzeugt nichts außerhalb; Umlaute/Apostrophe/Kyrillisch weiter erlaubt |
| 0.24 | Triggerdrift erreicht bestehende Dateien nicht | Entfernter Trigger kommt beim Öffnen zurück; PR-B-Zählung `== 4` scharf |
| 0.25 | Restliste, Gate-Asymmetrien | Je Regel eine Fixture, jede einmal rot gesehen |

## 3. Der geschützte Prüfpfad wurde nie mit Produktivcode vermischt

`PRUEFPFAD_BASE_SHA=<basis> PRUEFPFAD_HEAD_SHA=HEAD pnpm exec tsx skripte/pruefpfad-pruefen.ts`
über den **Gesamtbereich**. Zusätzlich: `git log --oneline <basis>..HEAD -- test/invarianten/`
— jeder Treffer muss in einem PR liegen, der sonst nichts enthält.

## 4. Gegenprobe: sind die Invarianten noch scharf?

Der gefährlichste Ausgang eines Fix-Laufs ist eine Invariante, die stillschweigend weicher wurde.
`git diff <basis>..HEAD -- test/invarianten/ test/schema/ test/golden/` — jede Änderung muss
**additiv** sein. Eine gelockerte Assertion, ein erhöhter Timeout, ein entferntes Feld aus einem
Abzug: Abbruch, auch wenn alles grün ist. `undo-bitgleich.test.ts` und `abgeleitet-gleich.test.ts`
sollten nach diesem Nachzug unverändert sein.

## 5. Adversariales Gesamt-Review

`hueter` (opus) über den Gesamtdiff `<basis>..HEAD`, mit diesem Auftrag: **nicht** prüfen, ob die
Pakete umgesetzt sind — das haben die Einzelreviews. Sondern: Was ist über die Paketgrenzen hinweg
entstanden, das keiner der zehn Einzelreviews sehen konnte? Doppelte Zuständigkeiten, ein Kanal,
den zwei Stellen senden, eine Prüfung, die zweimal an verschiedenen Orten steht, eine Abgrenzung
aus einem AP, die ein späteres Paket wieder aufgeweicht hat.

## 6. Restliste

`../Wissen/58_Laufplan.md` nach „Offen aus AP-0.5–" durchsuchen. Nach AP-0.25 muss diese Zeile
verschwunden sein. Steht sie noch da, ist entweder ein Punkt übrig oder jemand hat sie
weitergeschleppt, statt sie abzuräumen.

## 7. Bericht

Eine Seite, in dieser Form:

- **Abgenommen / nicht abgenommen** — ein Wort, zuerst.
- Punkt 1 bis 6 je zwei Zeilen: geprüft, Ergebnis.
- Was auffiel und kein Paket ist: eine Liste, jeweils mit Schweregrad.
- Was daraus ein neues Paket werden sollte: Vorschlag mit Nummer, in `57` eingetragen.
- Der Satz, der zählt: **Kann ein Nutzer die gebaute App installieren, ein Projekt anlegen, etwas erfassen, die App beenden und am nächsten Tag weiterarbeiten?** Mit Beleg, nicht mit Einschätzung.
