---
name: wurzelwerk-import-vertrag
description: Baut aus Gesprächsnotizen, Transkripten oder abfotografierten Papieren eine Importdatei nach dem Vertrag wurzelwerk-import/v1. Wird verwendet, wenn unstrukturiertes genealogisches Material (Interview, Stammbuch-Abschrift, Notizzettel) in eine schema-gültige Importdatei für Wurzelwerk übersetzt werden soll, inklusive Konfidenz, Belegen und Selbstprüfung gegen das Schema.
---

# Skill: wurzelwerk-import-vertrag

## 1. Zweck & Vertragsbindung

Dieser Skill nimmt Gesprächsnotizen, Transkripte und abfotografierte Papiere entgegen und
erzeugt daraus eine Importdatei, die genau einem Vertrag entspricht: `wurzelwerk-import/v1`.

Normativ ist ausschließlich das JSON-Schema, nicht dieser Text:
`docs/import-vertrag/wurzelwerk-import-v1.schema.json`. Bei jeder Abweichung zwischen diesem
Skill-Text und dem Schema gilt das Schema. Erläuternder Hintergrund steht in
`docs/import-vertrag.md` (insbesondere §2.2 Konfidenzskala, §2.3 Belegpflicht, §2.4 Datumswerte
und §7 Regeln gegen Erfindungen).

Der Skill erzeugt **niemals** eine andere Vertragsversion. Ein `vertrag`-Wert außer
`wurzelwerk-import/v1` führt beim Import zu IMP-102 und Abbruch — es wird nicht geraten, was
gemeint war.

## 2. Die zehn Verbote (§7.2 aus `docs/import-vertrag.md`, wörtlich)

Diese Regeln sind das Kernstück des Skills. Sie sind absichtlich als Verbote formuliert und
dürfen nicht abgeschwächt werden — jede Formulierung unten ist wortgleich mit
`docs/import-vertrag.md` §7.2.

- **Was nicht in der Vorlage steht, wird nicht ergänzt.** Kein Geburtsjahr aus dem Alter erschließen, kein Ort aus dem Nachnamen, kein Beruf aus dem Umfeld, keine Koordinate aus Ortskenntnis.
- **Kein Datum ohne Grundlage.** Steht im Material kein Datum, gibt es kein Datumsfeld. „Etwa 1890" ist nur erlaubt, wenn im Material eine Zeitangabe steht, die zitiert werden kann.
- **Verwandtschaftsbezeichnungen im Erzählfluss sind relativ zum Erzähler.** „Mein Großvater" ist nicht der Vater des Erzählers. Wenn die Zwischengeneration nicht genannt ist, wird ein Platzhalter angelegt oder die Kante weggelassen — nicht geraten.
- **Krankheitsangaben werden nicht in Fachbegriffe übersetzt.** Der Wortlaut ist der Wert.
- **Koordinaten nur mit `herkunft`.** Ohne belegbare Herkunft kein Koordinatenfeld.
- **Umschriften sind zusätzlich, nie ersetzend** (ADR-014).
- **Jeder Rest geht nach `notizen_unverarbeitet`, im Originalwortlaut**, mit einem Satz, was gefehlt hat. Nicht zusammenfassen, nicht glätten.
- **Bei Zweifeln zwischen zwei Deutungen: beide als konkurrierende Aussagen** mit ehrlicher Konfidenz, oder gar keine. Nicht die wahrscheinlichere allein.
- **`zusammenfassung` zuletzt schreiben, durch Zählen** — nicht schätzen.
- **Nach dem Erzeugen selbst gegen das Schema prüfen** und den Trockenlauf-Bericht abwarten, bevor die Datei als fertig gilt.

**Regel 3 hervorgehoben, weil sie im Alltag am häufigsten zuschlägt:**
Verwandtschaftsbezeichnungen im Erzählfluss sind relativ zum Erzähler, nicht zur erzählenden
Bezugsperson im Baum. „Mein Großvater" ist nicht automatisch der Vater des Erzählers — wenn die
Zwischengeneration im Material nicht genannt ist, gibt es zwei erlaubte Wege: einen Platzhalter
anlegen (`ist_platzhalter: true`, `platzhalter_grund`) oder die Kante ganz weglassen. Raten ist
in keinem Fall erlaubt. Das Beispiel `beispiel-2-widersprueche.json` baut diesen Fehler
absichtlich ein (Erna nennt August ihren *Großvater*, nicht ihren Vater) und löst IMP-302 aus.

## 3. Konfidenz durch Regel, nicht durch Gefühl (§2.2)

`konfidenz` ist überall Pflichtfeld und hat **keinen Vorgabewert** — eine Vorgabe würde die
Einstufung stillschweigend und immer zu optimistisch treffen. Vier Stufen, nicht fünf
(E21, `docs/import-vertrag.md` §2.2):

| Wert | Bezeichnung | Wann |
|---|---|---|
| 4 | gesichert | Urkunde, Grabstein, Stammbuch — eindeutig, keine Gegenanzeige |
| 3 | wahrscheinlich | gute mündliche Quelle über Selbsterlebtes, oder mehrere schwache, die übereinstimmen |
| 2 | unsicher | Erinnerung aus zweiter Hand, einzelne schwache Quelle |
| 1 | Vermutung | Schluss ohne Beleg, ausdrücklich als solcher markiert |

Vorgabe-Faustregel beim Erzeugen: mündlich + selbst erlebt → 3 · mündlich + vom Hörensagen → 2 ·
eigener Schluss ohne Beleg → 1. „Widersprüchlich" ist keine eigene Stufe, sondern ein Zustand,
den Wurzelwerk selbst ableitet, wenn zwei Aussagen zum gleichen Prädikat unterschiedliche Werte
tragen — der Skill legt in diesem Fall zwei konkurrierende Aussagen an (siehe Verbot 8), nicht
eine gemittelte.

## 4. Belege, original_text und unsicherheit — die drei Pflichtfelder

- **Belege sind Pflicht, überall.** Jede Person, jedes Ereignis, jede Kante, jede Aussage, jede
  Diagnose und jeder Risikofaktor braucht `belege` mit mindestens einem Eintrag, der auf eine
  Quelle aus `quellen[]` zeigt. Für „ich weiß es einfach" gibt es keine Ausnahme — die richtige
  Antwort ist eine Quelle vom Typ `muendlich` mit dem Nutzer selbst als Informant und Konfidenz
  1 oder 2 (§2.3).
- **`original_text` ist Pflicht bei jeder Unschärfe.** Sobald ein Datumswert einen
  `modifikator` ungleich `exakt` trägt (`etwa`, `vor`, `nach`, `zwischen`, `von_bis`,
  `geschaetzt`, `berechnet`), muss der zitierbare Wortlaut aus dem Material dabeistehen. Ohne
  Zitat ist Unschärfe nicht überprüfbar (§2.4) — das ist laut Vertrag die wichtigste Einzelregel
  im ganzen Dokument.
- **`unsicherheit` ist Pflicht bei `konfidenz <= 2`** (IMP-206). Ein Satz, was genau unklar ist.
  Eine geratene Angabe lässt sich hier nicht plausibel beschreiben, ohne das Raten zuzugeben.

## 5. Platzhalter statt erfundener Namen

Fehlt ein Name, wird er **nicht** erfunden. Stattdessen: `ist_platzhalter: true` mit
`platzhalter_grund` (`unbekannt` · `unehelich` · `nicht_identifiziert` · `forschungsluecke`),
und `namen[]` bleibt bei Platzhaltern optional (A-17).

Eine Umschrift (z. B. kyrillisch → lateinisch, ADR-014) ist **immer zusätzlich**, nie ein Ersatz:
eigener `namen[]`-Eintrag mit `typ: transliteriert`, `umschrift_von` auf den Index des
Originaleintrags, nie `ist_bevorzugt`. Ein kyrillisches Original ohne den dazugehörigen
Originaleintrag oder eine bevorzugte Umschrift verstößt gegen ADR-014 und wird im Trockenlauf
als IMP-305 gemeldet.

## 6. `zusammenfassung` durch Zählen (zuletzt)

`zusammenfassung` wird **zuletzt** geschrieben, **durch Zählen** der tatsächlich erzeugten
Einträge — nicht durch Schätzen (Verbot 9). Der Prüfer vergleicht die deklarierten Anzahlen mit
den tatsächlichen; eine Abweichung ist IMP-105 und der häufigste Hinweis auf eine abgeschnittene
Ausgabe (Ausgabelimit erreicht, letzte Personen fehlen). `personen` und `notizen_unverarbeitet`
sind in `zusammenfassung` Pflicht, alle übrigen Zählfelder empfohlen.

## 7. Selbstprüfung gegen das JSON-Schema vor der Ausgabe

Bevor eine erzeugte Datei als fertig gilt, prüft der Skill sie selbst gegen
`docs/import-vertrag/wurzelwerk-import-v1.schema.json` (Verbot 10). Das deckt Stufe-1-Fehler ab
(IMP-101 bis IMP-107: ungültiges JSON, fehlender oder unbekannter `vertrag`-Wert, fehlende
Pflichtfelder, falsche Werte/Typen, `zusammenfassung`-Abweichung, Datumsregel verletzt, Kennung
entspricht nicht dem Muster `^(tmp|db):[A-Za-z0-9_.-]{1,64}$`). Erst nach einer grünen
Selbstprüfung gilt die Datei als abgabebereit — und selbst dann erst nach dem Trockenlauf
(Abschnitt 8).

## 8. Trockenlauf-Rückweg

Der Skill hält eine erzeugte Datei nicht schon nach der Selbstprüfung für fertig. Der
verbindliche Ablauf ist:

1. Datei erzeugen, `zusammenfassung` durch Zählen füllen, gegen das Schema selbst prüfen.
2. Den **Trockenlauf-Bericht** aus Wurzelwerk als Eingabe entgegennehmen (der Bericht ist der
   echte Import in einer zurückgerollten Transaktion, `docs/import-vertrag.md` §6.1 — kein
   zweiter, möglicherweise abweichender Vorhersageweg).
3. Jeden gemeldeten IMP-Befund (Fehler wie Hinweis) einzeln durchgehen und die Datei gezielt an
   der genannten Stelle (JSON-Pfad + betroffene Kennung) korrigieren.
4. Erneut selbst gegen das Schema prüfen, erneut den Trockenlauf abwarten.
5. **Iterativ wiederholen, bis der Trockenlauf-Bericht 0 Fehler zeigt.** Hinweise (Stufe 3/4)
   werden gelesen und wo begründet aufgelöst, verhindern den Import aber nicht — im Zweifel
   bleibt die Entscheidung beim Nutzer, nicht beim Skill (kein automatisches Zusammenführen,
   W-05).

Dieser Rückweg ist der Grund, warum der Skill erst nach dem Trockenlauf-Werkzeug (AP-1.3a,
AP-1.3b, AP-1.4a) entwickelt werden konnte: Ohne einen echten Bericht gibt es nichts, an dem der
Skill seine eigene Ausgabe korrigieren könnte.

## 9. Ehrliche Grenze (§7.4)

Ehrlich benannt, statt stillschweigend übergangen: Keine der obigen Schranken erkennt eine
**erfundene Quelle mit erfundenem Transkript**. Schreibt der Skill „Erna sagte: geboren 1890 in
Marienwerder", obwohl sie das nie gesagt hat, ist das maschinell nicht von einer echten Aussage
zu unterscheiden. Die Gegenmaßnahmen aus `docs/import-vertrag.md` §7.4 sind menschlich und
organisatorisch, nicht technisch:

- **Audio mit Zeitmarke** (A-16): `zeitmarke_sekunden` im Beleg pflegen, wo ein `audio_medium`
  existiert. Ein Transkript mit Zeitmarke ist nachhörbar, eines ohne nicht.
- **`pruefsumme_quelltext`** am Kopf der Importdatei: erlaubt später die Prüfung gegen das
  tatsächliche Ausgangsmaterial.
- **Stichproben**: nach jedem Import werden drei Belege stichprobenartig gegen das Original
  geprüft. Das ist eine Routine außerhalb der Software, keine Funktion des Skills — aber sie
  gehört dazu, weil eine Sicherheitszusage, die man nicht halten kann, schlimmer ist als eine
  fehlende.

## 10. Die drei Muster

Alle drei Beispieldateien sind gegen das Schema geprüft und gültig; sie werden **referenziert**,
nicht kopiert (keine Kopie, die stillschweigend vom Original abweichen könnte):

- `fixtures/import/v1/gueltig/eigenstaendig/beispiel-1-einfach.json` — einfacher Fall, ein
  Familienstammbuch.
- `fixtures/import/v1/gueltig/eigenstaendig/beispiel-2-widersprueche.json` — Widersprüche,
  unscharfe Daten, historische Ortsnamen, Platzhalter (enthält die absichtliche
  Großvater/Vater-Verwechslung aus Abschnitt 2).
- `fixtures/import/v1/gueltig/braucht-bestand/beispiel-3-interview.json` — Interview mit
  Audio-Zeitmarken, Gesundheitsdaten, unverarbeitete Notizen. Liegt bewusst unter
  `braucht-bestand/`, nicht `eigenstaendig/` (AP-1.27, `fixtures/import/v1/LIESMICH.md`): der
  Informant ist über eine `db:`-Kennung eine bereits vorhandene Person, die Fixture ist also erst
  gegen einen Bestand mit dieser Person fehlerfrei importierbar, nicht gegen ein frisches Projekt.

Bei einem neuen Fall zuerst prüfen, welches Muster strukturell am nächsten liegt, und davon
ausgehend erzeugen — nicht bei Null anfangen.

## 11. Nicht-verarbeitet-Ventil

Alles, was nicht eindeutig zugeordnet werden kann, geht nach `notizen_unverarbeitet` — **im
Originalwortlaut**, nicht zusammengefasst oder geglättet, zusammen mit einem Pflichtfeld `warum`
(was genau gefehlt hat: fehlender Name, unklare Person, widersprüchliche Angabe ohne Auflösung).
Das ist die wirksamste der sechs strukturellen Schranken aus §7.1, weil sie Weglassen
begründungspflichtig macht und damit unattraktiver als ehrliches Dokumentieren.

Ein leerer `notizen_unverarbeitet`-Block bei einem erkennbar umfangreichen Ausgangsmaterial ist
verdächtig, nicht unauffällig (IMP-310, §7.3): Ein ehrlicher Auswertungslauf über ein langes
Gespräch produziert Reste. Bleibt der Block leer, ist das ein Hinweis darauf, dass Unklares
gedeutet statt zurückgestellt wurde — vor der Abgabe stichprobenartig gegen das Transkript
gegenprüfen.
