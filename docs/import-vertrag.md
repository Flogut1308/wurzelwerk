# Wurzelwerk — Import-Vertrag `wurzelwerk-import/v1`

**Stand:** 23.08.2026 · **Vertragsversion:** `wurzelwerk-import/v1` · **Umsetzung:** Phase 1
**Grundlage:** ADR-010 (Erfassungsstrecke), D-10, D-11, E6, E21 · **Datenziel:** `50_Datenmodell.md`

> Dies ist die Hauptstrecke, auf der Daten in Wurzelwerk kommen (ADR-010). Nicht ein
> Nebenfeature, sondern eine Programmschnittstelle mit Version, Prüfung und Testkorpus.

**Normative Dateien** liegen neben diesem Dokument in `56_Beispiele/`:

| Datei | Rolle |
|---|---|
| `wurzelwerk-import-v1.schema.json` | **Das Schema selbst.** JSON Schema Draft 2020-12. Bei Abweichung gilt diese Datei, nicht die Tabellen unten. |
| `beispiel-1-einfach.json` | einfacher Fall: ein Familienstammbuch |
| `beispiel-2-widersprueche.json` | Widersprüche, unscharfe Daten, historische Ortsnamen, Platzhalter |
| `beispiel-3-interview.json` | Interview mit Audio-Zeitmarken, Gesundheitsdaten, unverarbeitete Notizen |

Alle drei Beispiele sind gegen das Schema geprüft und gültig (Ajv 2020-12, 23.08.2026).
Sie wandern nach `fixtures/import/` im Repository und sind ab AP-1.3 Teil der Testsuite.

---

## 1. Warum dieser Vertrag so aussieht

Die Datenquelle sind Erinnerungen und Papier (E6). Das heißt drei Dinge, und alle drei prägen
das Schema:

1. **Fast nichts ist sicher.** Also ist `konfidenz` überall Pflichtfeld und hat **keinen Vorgabewert**. Wer eine Person einträgt, muss sich entscheiden, wie sicher sie ist. Ein Vorgabewert würde diese Entscheidung stillschweigend treffen — und zwar immer zu optimistisch.
2. **Das Material wird von einem Sprachmodell aufbereitet (D-11).** Sprachmodelle glätten, vervollständigen und ergänzen Plausibles. Das Schema muss Erfindungen **strukturell erschweren**, nicht durch Ermahnung im Prompt. Dafür gibt es §7.
3. **Der Originalwortlaut ist wertvoller als die Interpretation.** Bei einem Kirchenbucheintrag ist die Interpretation meist eindeutig; bei „so um 1890 rum" ist der Wortlaut der eigentliche Beleg. Darum ist `original_text` an vielen Stellen Pflicht, sobald etwas gedeutet wurde.

---

## 2. Aufbau einer Importdatei

```
{
  "vertrag":              "wurzelwerk-import/v1",     ← Pflicht, sonst Abbruch
  "erzeugt":              { am, werkzeug, … },        ← Pflicht
  "pruefsumme_quelltext": "sha256-…",                 ← empfohlen
  "zusammenfassung":      { personen: 3, … },         ← Pflicht, wird gegengeprüft
  "quellen":              [ … ],                      ← Pflicht, mindestens eine
  "interviews":           [ … ],
  "personen":             [ … ],
  "orte":                 [ … ],
  "ereignisse":           [ … ],
  "elternschaften":       [ … ],
  "partnerschaften":      [ … ],
  "aussagen":             [ … ],
  "diagnosen":            [ … ],
  "risikofaktoren":       [ … ],
  "medien":               [ … ],
  "notizen_unverarbeitet":[ … ]                       ← siehe §7
}
```

`additionalProperties: false` gilt überall. Ein Tippfehler in einem Feldnamen ist damit ein
Fehler und nicht ein stillschweigend ignoriertes Feld. Das ist bei maschinell erzeugten Dateien
der Unterschied zwischen „Beruf fehlt" und „Beruf wurde als `berufe` geschrieben und ist weg".

### 2.1 Kennungen

```
^(tmp|db):[A-Za-z0-9_.\-]{1,64}$
```

- **`tmp:…`** gilt nur innerhalb *dieser* Datei. Sprechende Namen sind erwünscht (`tmp:opa-karl`), weil sie in Fehlermeldungen und im Trockenlauf-Bericht auftauchen. Beim Import wird daraus eine UUID v7.
- **`db:<uuid>`** verweist auf einen **vorhandenen** Datensatz. So hängt man neues Material an eine bereits erfasste Person.

**Die Schutzregel für `db:`** — sie ist der Grund, warum ein Import nichts kaputtmachen kann:
Ein Objekt mit `db:`-Kennung darf **ergänzen**, aber keinen bestehenden bevorzugten Wert
ersetzen. Nur mit `"ueberschreiben": true` ist das erlaubt, und dann zeigt der Trockenlauf jede
betroffene Stelle einzeln mit alt und neu. Ohne das Flag wird ein konkurrierender Wert als
**zweite Aussage** angelegt — der Widerspruch bleibt sichtbar, statt dass eine Seite gewinnt
(genau das Verhalten, das `10_Vision_Scope.md` §4 Leitprinzip 1 fordert).

### 2.2 Die Konfidenzskala (E21)

| Wert | Bezeichnung | Wann |
|---|---|---|
| 4 | gesichert | Urkunde, Grabstein, Stammbuch — eindeutig, keine Gegenanzeige |
| 3 | wahrscheinlich | gute mündliche Quelle über Selbsterlebtes, oder mehrere schwache, die übereinstimmen |
| 2 | unsicher | Erinnerung aus zweiter Hand, einzelne schwache Quelle |
| 1 | Vermutung | Schluss ohne Beleg, ausdrücklich als solcher markiert |

**Vier Stufen, nicht fünf.** `40_Anforderungen.md` B-03 sagt „5 Stufen"; das ist ein Rest aus
dem ersten Durchgang. E21 und `50_Datenmodell.md` §2.16 legen vier fest, und das Schema
erzwingt `1..4`. Siehe `55_Architektur.md` §12.1 W1.

Vorgabe-Empfehlungen für den erzeugenden Skill: mündlich + selbst erlebt → 3 · mündlich + vom
Hörensagen → 2 · eigener Schluss ohne Beleg → 1. **„Widersprüchlich" ist keine Stufe**, sondern
ein Zustand, den Wurzelwerk selbst ableitet, sobald zwei Aussagen zum gleichen Prädikat
unterschiedliche Werte haben.

### 2.3 Belege sind Pflicht

Jede Person, jedes Ereignis, jede Kante, jede Aussage, jede Diagnose und jeder Risikofaktor
braucht `belege` mit **mindestens einem** Eintrag, und jeder Eintrag zeigt auf eine Quelle aus
`quellen`. Es gibt keinen Weg, etwas belegfrei zu importieren.

Das ist streng und absichtlich so: `10_Vision_Scope.md` §4 sagt „Jede Aussage hat eine
Herkunft". Wenn der Importweg eine Ausnahme erlaubt, wird die Ausnahme der Normalfall, weil sie
bequemer ist. Für den Fall „ich weiß es einfach, ohne Quelle" ist die richtige Antwort eine
Quelle vom Typ `muendlich` mit dem Nutzer selbst als Informant und Konfidenz 1 oder 2 — das ist
ehrlicher als kein Beleg und im Nachhinein prüfbar.

### 2.4 Datumswerte

```json
{
  "kalender": "gregorian",
  "modifikator": "etwa",
  "praezision": "jahr",
  "wert1": "1890",
  "original_text": "so um 1890 rum, sagt Erna"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `kalender` | nein (Vorgabe `gregorian`) | `gregorian` · `julian` · `hebrew` · `french_r`. `wert1` ist **immer** das Originaldatum in seinem Originalkalender; umgerechnet wird nie gespeichert (`50_Datenmodell.md` §2.3). |
| `modifikator` | **ja** | `exakt` · `etwa` · `vor` · `nach` · `zwischen` · `von_bis` · `geschaetzt` · `berechnet` |
| `praezision` | **ja** | `tag` · `monat` · `jahr` · `jahrzehnt` |
| `wert1` | ja, außer bei `zwischen`/`von_bis` (dort zusammen mit `wert2`) | `1750` · `1750-03` · `1750-03-14` |
| `wert2` | nur bei `zwischen`/`von_bis` | |
| `original_text` | **ja, wenn `modifikator ≠ exakt`** | siehe unten |
| `zweitkalender` + `zweitwert` | nur wenn die Quelle selbst zwei Daten nennt | Doppeldatierung Kongresspolen |
| `doppeljahr` | optional | `1731/32` bei Old/New Style |

**Die wichtigste Regel im ganzen Vertrag:** Wer sich unscharf ausdrückt, muss zitieren.
`modifikator: "etwa"` ohne `original_text` ist ein Schemafehler. Begründung: Unschärfe ohne
Wortlaut ist nicht überprüfbar — man kann später nicht mehr feststellen, ob „etwa 1890"
aus „um 1890 rum" oder aus „muss so um die Jahrhundertwende gewesen sein" entstand. Die erste
Angabe ist brauchbar, die zweite fast nicht, und der Unterschied verschwindet ohne diese Regel.

---

## 3. Felder im Einzelnen

Normativ ist `56_Beispiele/wurzelwerk-import-v1.schema.json`. Die Tabellen hier erklären, was
die Felder bedeuten und wann man sie füllt.

### 3.1 `erzeugt` und `zusammenfassung`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `erzeugt.am` | ja | Datum der Erzeugung (`YYYY-MM-DD`) |
| `erzeugt.werkzeug` | ja | z. B. `claude-skill:wurzelwerk-import-vertrag` oder `handarbeit` |
| `erzeugt.werkzeug_version` | nein | |
| `erzeugt.bearbeiter` | nein | |
| `pruefsumme_quelltext` | nein, empfohlen | `sha256-<64 hex>` des Ausgangsmaterials. Beantwortet später: aus welchem Transkript stammt das? |
| `zusammenfassung.*` | `personen` und `notizen_unverarbeitet` Pflicht, übrige empfohlen | Vom Erzeuger **deklarierte** Anzahlen |

**Warum `zusammenfassung` Pflicht ist.** Der häufigste Ausfall bei maschinell erzeugten
JSON-Dateien ist nicht ein Syntaxfehler, sondern eine **abgeschnittene** Datei — das Modell hat
sein Ausgabelimit erreicht, und die letzten zwölf Personen fehlen. Syntaktisch kann die Datei
trotzdem gültig sein, wenn ein Werkzeug sie repariert. Eine deklarierte Anzahl, die nicht zur
tatsächlichen passt, macht das sofort sichtbar (IMP-105). Das ist eine Prüfung, die vier Zeilen
kostet und eine ganze Fehlerklasse ausschließt.

### 3.2 `quellen[]`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `id` | ja | |
| `typ` | ja | `kirchenbuch` · `standesamt` · `volkszaehlung` · `zeitung` · `grabstein` · `familienbesitz` · `literatur` · `website` · `muendlich` · `sonstiges` |
| `titel` | ja | So, dass man die Quelle wiederfindet. „Gespräch mit Erna Wruck, 12.09.2026" ist gut, „Erzählung" nicht. |
| `art` | nein | `original` · `derivat` · `verfasst` |
| `informationsart` | nein | `primaer` · `sekundaer` · `unbestimmt` |
| `autor`, `verlag`, `jahr`, `archiv`, `signatur` | nein | |
| `informant_person` | **ja bei `typ: muendlich`** | Kennung der erzählenden Person. Sie ist selbst Person im Baum (`50_Datenmodell.md` §2.15). |
| `gespraechsdatum` | empfohlen bei `muendlich` | Datumswert |
| `form` | nein | `gespraech` · `telefonat` · `brief` · `email` · `audio` · `video` |
| `unmittelbarkeit` | **ja bei `typ: muendlich`** | `selbst_erlebt` · `vom_hoerensagen` · `unbekannt` |
| `audio_medium` | nein | Kennung eines Mediums, für Zeitmarken (A-16) |
| `notiz` | nein | |

`unmittelbarkeit` als Pflichtfeld bei mündlichen Quellen ist genealogisch der wichtigste
Unterschied überhaupt: „Ich war dabei" und „meine Mutter hat erzählt" sind zwei
Quellenqualitäten, und wer sie nicht trennt, hat später keine Möglichkeit mehr, sie zu trennen.

### 3.3 `personen[]`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `id` | ja | |
| `konfidenz` | ja | Wie sicher ist, dass **diese Person existierte** — nicht, wie gut ihre Daten sind |
| `belege` | ja, min. 1 | |
| `namen` | **ja, außer bei Platzhaltern** | min. 1 Eintrag |
| `geschlecht` | nein (Vorgabe `U`) | `M` · `F` · `U` · `X` |
| `lebend_status` | nein | `lebend` · `verstorben` · `vermutet_verstorben` |
| `privat` | nein | vom Export ausschließen |
| `ist_platzhalter` | nein | „Vater unbekannt" (A-17) |
| `platzhalter_grund` | **ja bei Platzhaltern** | `unbekannt` · `unehelich` · `nicht_identifiziert` · `forschungsluecke` |
| `unsicherheit` | Pflicht bei `konfidenz ≤ 2` (IMP-206) | Klartext: was ist unklar |
| `ueberschreiben` | nur bei `db:` | siehe §2.1 |
| `notiz` | nein | |

`unsicherheit` bei niedriger Konfidenz ist die zweite Anti-Erfindungs-Schranke: Wer eine Person
mit Konfidenz 2 anlegt, muss aufschreiben, *warum* sie unsicher ist. Ein Modell, das eine
Person geraten hat, kann diesen Satz nicht plausibel füllen, ohne das Raten zuzugeben.

**`namen[]`:** `typ` (`geburtsname` · `ehename` · `vulgo` · `latinisiert` · `transliteriert` ·
`ordensname` · `beruf` · `aka` · `sonstiges`, Vorgabe `geburtsname`), `schrift` (`latn`/`cyrl`),
`vornamen`, `rufname_index` (0-basiert in der Vornamenkette), `rufname_text`, `nachname`,
`nachname_unbekannt`, `praefix`, `titel_vor`, `zusatz_nach`, `original_text`, `sprache`,
`ist_bevorzugt`, `gueltig_von`/`gueltig_bis`, sowie `umschrift_von` (Index des Originals im
gleichen Array) + `umschrift_norm` (`iso9`/`din1460`/`manuell`).

Zwei Regeln dazu:

- **`nachname` ist Pflicht, außer `nachname_unbekannt: true`.** Ein leerer Nachname ist mehrdeutig — hat die Quelle keinen genannt, oder hat der Erzeuger ihn übersehen? Das explizite Flag entscheidet.
- **Eine Umschrift ist ein zusätzlicher Namenseintrag, niemals ein Ersatz** (E20, ADR-014). Sie hat `typ: transliteriert`, `umschrift_von` auf das Original und ist nie `ist_bevorzugt`. Wer ein kyrillisches Original durch die Umschrift ersetzt, verstößt gegen ADR-014 und der Trockenlauf meldet es (IMP-305).

### 3.4 `orte[]`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `id`, `typ`, `namen` | ja | `typ`: `dorf` · `stadt` · `gemeinde` · `kirchspiel` · `amt` · `kreis` · `provinz` · `staat` · `hof` · `friedhof` · `kirche` · `unbekannt` |
| `namen[].name` | ja | |
| `namen[].gueltig_von` / `gueltig_bis` | empfohlen | Der Punkt der ganzen Ortsentität (A-04): Marienwerder bis 1945, Kwidzyn ab 1945 |
| `koordinaten` | nein | `lat`, `lon`, `herkunft`. **Ohne `herkunft` meldet der Trockenlauf IMP-303** — eine Koordinate ohne Angabe, woher sie kommt, ist bei einem Sprachmodell mit hoher Wahrscheinlichkeit geraten. |
| `existiert_von` / `existiert_bis` | nein | für untergegangene Orte |
| `zugehoerigkeiten[]` | empfohlen | `uebergeordnet`, `art` (`politisch`/`kirchlich`), Zeitraum |
| `externe_ids[]` | nein | `gov` · `geonames` · `wikidata` |

### 3.5 `ereignisse[]`, `elternschaften[]`, `partnerschaften[]`

`ereignisse[]`: `id`, `typ` (17 Werte aus `50_Datenmodell.md` §2.5), `ort`, `datum`,
`beteiligungen[]` (min. 1, je `person` + `rolle` aus 15 Rollen + `reihenfolge`), `beschreibung`,
`notiz`, `konfidenz`, `belege`.

`elternschaften[]`: `elternteil`, `kind`, `typ` (`biologisch` · `adoptiv` · `stief` · `pflege` ·
`zieh` · `anerkannt` · `leihmutter` · `unbekannt`), `konfidenz`, `belege`, `notiz`. Ein Kind hat
beliebig viele Elternkanten (A-06).

`partnerschaften[]`: `id`, `typ` (`ehe_zivil` · `ehe_kirchlich` · `verlobung` ·
`lebensgemeinschaft` · `eingetr_lebenspartnerschaft` · `unbekannt`), `beteiligte[]` (min. 2),
`beginn`, `ende`, `ende_grund` (`scheidung` · `annullierung` · `tod` · `trennung` ·
`unbekannt` — Scheidung ist nicht Annullierung, A-07), `reihenfolge`, `konfidenz`, `belege`.

### 3.6 `aussagen[]`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `subjekt_typ`, `subjekt` | ja | worüber die Aussage geht |
| `praedikat` | ja | freie Zeichenkette, aber unbekannte werden gemeldet (IMP-304). Bekannt sind u. a. `beruf`, `konfession`, `wohnort`, `todesdatum`, `todesursache`, `alter_bei_tod`, `hofname`, `ausbildung`, `militaerdienst`, `auswanderung`, `vermoegen`, `mitgliedschaft` |
| genau eines von `wert_text` / `wert_zahl` / `wert_ref` | ja | `wert_ref` zeigt auf einen Ort oder eine Person |
| `datum`, `gueltig_von`, `gueltig_bis` | nein | Beruf 1780–1795 (A-08) |
| `ist_bevorzugt` | nein | der angezeigte Wert bei Widerspruch |
| `begruendung` | **ja, wenn `ist_bevorzugt` und es konkurrierende Aussagen gibt** (IMP-207) | warum diese Angabe gewinnt |
| `unsicherheit`, `konfidenz`, `belege` | `konfidenz` und `belege` ja | |

`begruendung` als Pflicht bei Konflikten ist B-04 wörtlich genommen. Sie ist außerdem das, was
man in fünf Jahren lesen will: „Der Grabstein ist die stärkere Quelle" ist eine
nachvollziehbare Entscheidung, eine stille Bevorzugung ist keine.

### 3.7 `diagnosen[]` und `risikofaktoren[]`

`diagnosen[]`: `person`, `kategorie` (11 Werte, `50_Datenmodell.md` §2.12), `organ`
(**Pflicht bei `kategorie: krebs`** — „Krebs" ohne Organ ist genealogisch fast nutzlos),
`bezeichnung`, `erstdiagnose` oder `alter_bei_diagnose`, `status` (`bestehend` · `geheilt` ·
`todesursache` · `unbekannt`), `konfidenz`, `belege`, `notiz`. **Kein ICD-10** (E24).

`risikofaktoren[]`: `person`, `art` (8 Werte), `detail` (**Pflicht bei
`art: beruf_exposition`** — „berufliche Exposition" ohne Angabe welcher ist keine Information),
`intensitaet` (`gering` · `mittel` · `hoch` · `unbekannt`), `beginn`, `ende`, `konfidenz`,
`belege`, `notiz`.

**Die harte Regel für `bezeichnung`:** Der Wortlaut der Quelle wird **nicht** in medizinische
Terminologie übersetzt. „was mit dem Herzen" bleibt „was mit dem Herzen". Wer daraus
„Myokardinfarkt" macht, erfindet eine Diagnose — und das ist die Fehlerklasse, vor der
`40_Anforderungen.md` im Block M ausdrücklich warnt. Der Trockenlauf meldet Diagnosen mit
`konfidenz ≥ 3` ohne dokumentarische Quelle als IMP-306.

Und die Erinnerung an M-08: Diese beiden Tabellen sind aus **jedem** Export ausgeschlossen. Der
Import trägt sie ein, der Export gibt sie nie heraus.

### 3.8 `medien[]` und `interviews[]`

`medien[]`: `id`, `relativer_pfad` (relativ zur Importdatei; fehlende Datei → IMP-208), `titel`,
`beschreibung`, `datum`, `ort`, `zuordnungen[]`. Mediendateien werden beim Import in den
Projektordner kopiert, nicht verschoben — das Original bleibt, wo es war.

`interviews[]`: `id`, `informant_person`, `datum`, `ort`, `audio_medium`, `notizen`, `status`.
Bündelt ein Gespräch, damit man später sagen kann „alles aus dem Gespräch mit Tante Erna vom
12.09.2026" (`50_Datenmodell.md` §2.15). Das ist die Datenseite von A-15; die Oberfläche des
Interview-Modus setzt darauf auf und ist **keine zweite Erfassungsstrecke**.

---

## 4. Die Prüfregeln

Fünf Stufen. Die Stufen 1 und 2 sind **Fehler** und verhindern den Import. Stufe 3 und 4 sind
**Hinweise** und verhindern nichts — sie werden im Trockenlauf gezeigt, und der Nutzer
entscheidet.

### Stufe 1 — Schema (Fehler, IMP-1xx)

| Code | Bedeutung |
|---|---|
| IMP-101 | Datei ist kein gültiges JSON (mit Zeile und Spalte) |
| IMP-102 | `vertrag` fehlt oder ist unbekannt |
| IMP-103 | Pflichtfeld fehlt |
| IMP-104 | Wert außerhalb der erlaubten Werte / falscher Typ / unbekanntes Feld |
| IMP-105 | `zusammenfassung` passt nicht zur tatsächlichen Anzahl |
| IMP-106 | Datumsregel verletzt (`modifikator ≠ exakt` ohne `original_text`; `zwischen` ohne `wert2`) |
| IMP-107 | Kennung entspricht nicht dem Muster |

Umgesetzt mit einem Zod-Schema in `src/shared/schemata/import-v1.ts`. Die JSON-Schema-Datei ist
die **veröffentlichte** Fassung des Vertrags (für den Skill, für Fremdwerkzeuge, als
Dokumentation), Zod ist die **ausgeführte**. Zwei Fassungen sind ein Risiko, darum gibt es einen
Test, der beide über den ganzen Fixture-Korpus laufen lässt und verlangt, dass sie zu jeder
Datei dasselbe Urteil abgeben (AP-1.3). Der Grund für zwei Fassungen: JSON Schema ist
werkzeugunabhängig lesbar, Zod liefert TypeScript-Typen und bessere Fehlermeldungen. Beides
gebraucht, keins ersetzt das andere.

### Stufe 2 — Referenzen und Struktur (Fehler, IMP-2xx)

| Code | Bedeutung |
|---|---|
| IMP-201 | Referenzierte `tmp:`-Kennung ist in der Datei nicht definiert |
| IMP-202 | `db:`-Kennung existiert im Projekt nicht |
| IMP-203 | Doppelte Kennung |
| IMP-204 | Zyklus in `elternschaften` (jemand wäre sein eigener Vorfahre) |
| IMP-205 | `ueberschreiben: true` bei einer `tmp:`-Kennung (sinnlos) oder Überschreiben ohne `db:` |
| IMP-206 | `konfidenz ≤ 2` ohne `unsicherheit` |
| IMP-207 | `ist_bevorzugt` bei konkurrierenden Aussagen ohne `begruendung` |
| IMP-208 | Mediendatei unter `relativer_pfad` nicht gefunden |
| IMP-209 | `beteiligte`/`beteiligungen` verweist zweimal auf dieselbe Person |

**Umsetzungsdetail, das leicht falsch gemacht wird:** Die Referenzprüfung läuft über das
**Schema**, nicht über einen regulären Ausdruck auf dem Dateitext. Es gibt Felder, in denen
`tmp:` als Freitext stehen darf (`notiz`, `herkunft`, `transkript`) — eine Textsuche findet
dort Scheintreffer. Die Prüfung geht also die typisierte Struktur ab und sammelt nur Werte, die
laut Schema eine `Kennung` sind. (Beim Erstellen der Beispieldateien hat genau dieser Fehler
einmal zugeschlagen; er ist der Grund, warum er hier steht.)

### Stufe 3 — Plausibilität (Hinweis, IMP-3xx)

Führt die Regeln aus F-07 auf die Importdatei aus, **bevor** geschrieben wird. Bei
Erinnerungsdaten ist das der wirksamste Qualitätsfilter, den es gibt.

| Code | Prüfung |
|---|---|
| IMP-301 | Tod vor Geburt · Bestattung vor Tod · Ehe vor Geburt |
| IMP-302 | Elternteil bei Geburt des Kindes jünger als 12 oder älter als 55 (Mutter) / 80 (Vater) |
| IMP-303 | Koordinate ohne `herkunft` |
| IMP-304 | unbekanntes `praedikat` |
| IMP-305 | kyrillischer Name ohne Originaleintrag, oder Umschrift als `ist_bevorzugt` (ADR-014) |
| IMP-306 | Diagnose mit `konfidenz ≥ 3` aus einer rein mündlichen Quelle |
| IMP-307 | Lebensdauer über 110 Jahre |
| IMP-308 | Ereignisdatum außerhalb der Existenz des Ortes |
| IMP-309 | Person ohne jede Beziehung und ohne Ereignis (erlaubt nach A-12, aber meist ein Versehen) |
| IMP-310 | `notizen_unverarbeitet` ist leer, obwohl das Ausgangsmaterial umfangreich war (siehe §7.3) |

Im Beispiel `beispiel-2-widersprueche.json` ist eine Elternkante absichtlich falsch gesetzt
(Erna nennt August ihren *Groß*vater) — sie löst IMP-302 aus, weil der Altersabstand
unplausibel ist. Der Fall ist so gebaut, weil das die typische Verwechslung beim Auswerten von
Gesprächen ist: Verwandtschaftsbezeichnungen im Erzählfluss sind relativ zum Erzähler, nicht
zur Person.

### Stufe 4 — Kollisionen mit dem Bestand (Hinweis, IMP-4xx)

| Code | Prüfung |
|---|---|
| IMP-401 | Namensgleichheit + überlappende Lebensdaten → möglicher Dublettenkandidat, mit Punktwert |
| IMP-402 | `db:`-Person bekommt einen bevorzugten Wert, der einem bestehenden widerspricht |
| IMP-403 | Ort mit gleichem bevorzugten Namen und Koordinaten im Umkreis von 5 km existiert schon |
| IMP-404 | Quelle mit identischem Titel existiert schon |

Kollisionen führen **nie** zu einer automatischen Zusammenführung (W-05). Sie erscheinen im
Trockenlauf als Vorschlag, und der Import legt im Zweifel getrennt an — Trennen ist billig
umkehrbar, Zusammenführen nicht.

**Nachtrag (06.09.2026, D-15):** Der Import bleibt bei „im Zweifel getrennt anlegen", bietet im Trockenlauf aber je Bestandstreffer aktiv drei Wege an — **verbinden / getrennt / später** —, bewertet über Name, Datum und **relationalen Kontext**. „Verbinden" ist eine bestätigte, umkehrbare Nutzerwahl, kein automatisches Zusammenführen; W-05 bleibt gewahrt. Auch vom Skill selbst gesetzte `db:`-Verknüpfungen (aus dem Bestandsauszug D-14) werden bestätigungspflichtig angezeigt, nicht blind ausgeführt. Siehe `72_Screens_und_Flows.md` S-11-Erweiterung.

### Stufe 5 — Ausführungsfehler (IMP-5xx)

IMP-501 Datenbankfehler beim Schreiben · IMP-502 Mediendatei nicht kopierbar · IMP-503
Schnappschuss vor dem Import fehlgeschlagen (bricht ab: ohne Netz kein Sprung).

---

## 5. Wie eine Fehlermeldung aussieht

Format, verbindlich für alle IMP-Codes:

```
FEHLER   IMP-206   personen[3].unsicherheit
         Bei Konfidenz 2 ("unsicher") muss stehen, was unklar ist.
         Betroffen: tmp:august-wruck
         Datei: interview-tante-erna.json, Zeile 84
         Was tun: Feld "unsicherheit" ergaenzen — ein Satz genuegt.
                  Oder, wenn die Angabe doch gesichert ist: konfidenz auf 4 setzen.

HINWEIS  IMP-302   elternschaften[1]
         Elternteil waere bei der Geburt des Kindes 6 Jahre alt gewesen.
         Betroffen: tmp:august (geb. etwa 1890) -> tmp:erna (geb. 1896)
         Datei: interview-tante-erna.json, Zeile 191
         Haeufige Ursache: In Gespraechen sind Verwandtschaftsangaben relativ
                  zum Erzaehler. "Mein Grossvater" ist nicht der Vater des Erzaehlers.
         Was tun: Pruefen, ob hier eine Generation fehlt.
```

Fünf Bestandteile, jeder mit einem Zweck:

1. **Schweregrad und Code** — `FEHLER` verhindert den Import, `HINWEIS` nicht. Der Code ist nachschlagbar und in einer Suchmaschine oder im Chat zitierbar.
2. **JSON-Pfad** — `personen[3].unsicherheit`. Nicht „bei einer Person", nicht „im Personenblock".
3. **Betroffene Kennung** — `tmp:august-wruck`. Deshalb sind sprechende `tmp:`-Namen erwünscht: `personen[3]` sagt nichts, `tmp:august-wruck` sagt alles.
4. **Datei und Zeile** — erfordert einen JSON-Parser, der Positionen mitführt. Umgesetzt mit einem Positionsindex über den Rohtext, der JSON-Pfade auf Zeilennummern abbildet. Kostet einen halben Tag und macht die Differenz zwischen einer benutzbaren und einer nutzlosen Prüfung.
5. **„Was tun"** — verpflichtend, und mit **allen** Auswegen, nicht nur dem ersten. Eine Prüfung, die einen Fehler nennt, ohne den Ausweg zu nennen, erzeugt bei einer Datei mit 40 Meldungen nur Resignation.

Alle Texte laufen über i18next (ADR-011): Schlüssel `import.fehler.IMP_206.titel`,
`.beschreibung`, `.was_tun`.

---

## 6. Der Trockenlauf

### 6.1 Was ihn glaubwürdig macht

> **Der Trockenlauf ist der echte Import in einer Transaktion, die zurückgerollt wird.**

Kein zweiter Codeweg, der „vorhersagt", was der Import tun würde. Genau ein Weg:

```
BEGIN IMMEDIATE
  journal_kontext armieren mit einer Wegwerf-Transaktions-ID
  Import ausführen (derselbe Code wie beim echten Import)
  aenderung-Zeilen auslesen  ← das ist der Bericht
ROLLBACK
```

Der Bericht ist damit buchstäblich das Änderungsjournal, das der echte Import schreiben würde.
Das ist der einzige Entwurf, bei dem „was du siehst, ist was passiert" keine Behauptung, sondern
eine Eigenschaft ist. Eine getrennte Vorhersagefunktion würde beim ersten Umbau des Importcodes
auseinanderlaufen, und niemand würde es merken — bis ein Import etwas anderes tut als angezeigt.

Der Nebeneffekt ist wertvoll: Der Trockenlauf testet gleichzeitig das Journal (`55_Architektur.md` §4).

### 6.2 Was er anzeigt

```
Trockenlauf: interview-tante-erna.json
Vertrag wurzelwerk-import/v1 · erzeugt 12.09.2026 von claude-skill:wurzelwerk-import-vertrag
Pruefsumme des Quelltexts: sha256-a1b2c3… (nicht im Projekt bekannt — erster Import)

  ZUSAMMENFASSUNG
    3 Fehler      → Import nicht moeglich
    7 Hinweise
    Ruecknahme:   als einzelner Undo-Schritt (24 geaenderte Zeilen, Schwelle 500)

  WIRD ANGELEGT                                             12
    Personen         3    tmp:august-wruck, tmp:vater-august, tmp:erna
    Orte             3    Marienwerder/Kwidzyn, Westpreussen, Polen
    Ereignisse       1    Geburt (etwa 1890)
    Elternschaften   2
    Aussagen         3

  WIRD ERGAENZT                                              2
    Erna Wruck (db:018f2c44…)
      + Aussage  beruf = "Naeherin"    Konfidenz 3   NEU, kein Konflikt
      + Beleg    zu bestehendem Geburtsdatum         NEU
      Keine bestehenden bevorzugten Werte werden ersetzt.

  MOEGLICHE DUBLETTEN                                        1
    tmp:august-wruck  ~  August Wruck (db:018f…)  Punktwert 0,72
      Name gleich · Geburtsjahr 1890 vs. etwa 1890 · Ort gleich
      → Wird getrennt angelegt. Zusammenfuehren spaeter im Merge-Werkzeug (Phase 4).

  FEHLER                                                     3
    IMP-206  personen[1].unsicherheit  …
    IMP-201  aussagen[2].belege[0].quelle → tmp:q-lotte nicht definiert
    IMP-106  ereignisse[0].datum  modifikator "etwa" ohne original_text

  HINWEISE                                                   7
    IMP-302  elternschaften[1]  Elternteil waere 6 Jahre alt gewesen
    IMP-303  orte[0].koordinaten  ohne Herkunftsangabe
    …

  NICHT VERARBEITETES MATERIAL                               2   ← immer sichtbar
    „Und dann war da noch der Bruder, der nach Kanada gegangen ist…"
      Grund: Zwei moegliche Vornamen, keine weiteren Angaben.
    „…seit dem Unglueck in der Werkstatt war er nicht mehr derselbe."
      Grund: Unklar, wer gemeint ist.

  GESUNDHEITSDATEN                                            0
    (Diagnosen und Risikofaktoren werden nie exportiert — M-08)
```

Sieben Gestaltungsentscheidungen darin, die nicht beliebig sind:

1. **Die Art der Rücknahme steht oben.** Der Nutzer erfährt **vor** dem Import, ob er einen Undo-Schritt bekommt oder einen Schnappschuss zurückspielen muss (`55_Architektur.md` §6.3). Das ist die Information, die er für die Entscheidung braucht.
2. **„Wird ergänzt" zeigt jede einzelne Änderung**, nicht eine Anzahl. Bei bestehenden Personen ist die Frage nicht „wie viele", sondern „was genau".
3. **„Keine bestehenden bevorzugten Werte werden ersetzt"** steht als Satz da. Bei `ueberschreiben: true` steht dort stattdessen die Liste der Ersetzungen mit alt und neu, farblich abgesetzt.
4. **Dubletten mit Punktwert und Begründung**, nicht nur mit Punktwert. Ein Wert ohne Begründung ist nicht überprüfbar.
5. **Unverarbeitetes Material ist ein eigener Block, immer sichtbar**, auch wenn er leer ist. Ein leerer Block bei einem langen Gespräch ist ein Warnsignal (§7.3).
6. **Der Gesundheitsblock nennt die Exportsperre**, jedes Mal. M-08 ist eine harte Regel, und harte Regeln muss man wiederholen, sonst werden sie vergessen.
7. **Die Prüfsumme wird gegen frühere Importe geprüft.** Kommt dieselbe Prüfsumme zweimal, steht dort „ACHTUNG: Dieses Material wurde am 12.09.2026 schon importiert" — der einfachste Weg, den doppelten Import desselben Gesprächs zu verhindern.

### 6.3 Ablauf in der Oberfläche

```
Datei wählen  →  Trockenlauf (läuft automatisch)  →  Bericht lesen
                                                       │
                          ┌────────────────────────────┼───────────────────┐
                     Fehler > 0                   Fehler = 0          Abbrechen
                          │                            │
              „Importieren" ist gesperrt      „Importieren"
              Bericht als Textdatei              │
              exportierbar → zurück             ├─ Schnappschuss (bei > 500 Zeilen)
              zum Skill                         ├─ Import in einer Transaktion
                                                └─ Bericht des tatsächlichen Ergebnisses
                                                   (muss dem Trockenlauf entsprechen — Test)
```

Der Bericht ist als Textdatei exportierbar. Das ist der Rückweg zum Skill: Man gibt den Bericht
in den Chat, und der Skill korrigiert seine Datei. Damit ist die Prüfung nicht nur eine
Kontrolle, sondern ein Arbeitsablauf.

Der Test, der die ganze Konstruktion zusammenhält (AP-1.4): *Für jede Fixture-Datei ist der
Trockenlauf-Bericht gleich dem Bericht des echten Imports.* Ist er es nicht, ist der Trockenlauf
eine Lüge, und dann ist er schlimmer als keiner.

---

## 7. Die Regeln gegen Erfindungen

Das ist der Abschnitt, wegen dem dieser Vertrag existiert. Ein Sprachmodell, das aus einem
Gesprächstranskript strukturierte Daten macht, hat eine systematische Neigung: Es füllt Lücken
mit dem Plausiblen. Aus „mein Großvater hieß August, der war Schmied" wird eine Person mit
Geburtsjahr, Ort und Beruf, weil ein vollständiger Datensatz besser aussieht als ein
lückenhafter. Und man merkt es nicht, weil das Ergebnis genau so aussieht wie ein echter Fund.

Deshalb ist die Absicherung **strukturell**, nicht ermahnend.

### 7.1 Die sechs strukturellen Schranken

| # | Schranke | Wirkung |
|---|---|---|
| 1 | **`konfidenz` ist Pflicht ohne Vorgabewert** | Erfundenes kann nicht als „gesichert" durchrutschen, weil eine Vorgabe es so eingestuft hätte. Jede Einstufung ist eine bewusste Behauptung. |
| 2 | **`belege` mit min. 1 Eintrag ist Pflicht** | Eine erfundene Angabe braucht eine erfundene Quelle. Das ist eine sichtbare Lüge und keine Auslassung mehr. |
| 3 | **`original_text` Pflicht bei jeder Unschärfe** | Der Wortlaut muss vorliegen. Bei „etwa 1890" ohne Zitat gibt es nichts zu zitieren, wenn nichts gesagt wurde. |
| 4 | **`unsicherheit` Pflicht bei Konfidenz ≤ 2** | Erzwingt einen Satz darüber, *was* unklar ist. Geratenes lässt sich hier nicht plausibel beschreiben, ohne das Raten zuzugeben. |
| 5 | **`notizen_unverarbeitet` mit Pflichtfeld `warum`** | Das Ventil. Weglassen wird sichtbar und begründungspflichtig — und damit weniger attraktiv als Erfinden. |
| 6 | **`zusammenfassung` wird gegengeprüft** | Abgeschnittene Dateien und stille Verluste fallen auf. |

Schranke 5 ist die wirksamste, und sie ist die unauffälligste. Der Grund: Die Alternative zum
Erfinden ist normalerweise das Weglassen, und Weglassen ist unsichtbar. Wenn Weglassen aber
einen Eintrag mit Begründung kostet, ist es nicht mehr der bequemere Weg — und der Erzeuger
schreibt hin, was er nicht wusste, statt es zu füllen.

### 7.2 Die Regeln, die im Skill stehen müssen (D-11)

Der Skill `wurzelwerk-import-vertrag` bekommt diese Regeln als harte Vorgaben. Sie sind
absichtlich als Verbote formuliert:

1. **Was nicht in der Vorlage steht, wird nicht ergänzt.** Kein Geburtsjahr aus dem Alter erschließen, kein Ort aus dem Nachnamen, kein Beruf aus dem Umfeld, keine Koordinate aus Ortskenntnis.
2. **Kein Datum ohne Grundlage.** Steht im Material kein Datum, gibt es kein Datumsfeld. „Etwa 1890" ist nur erlaubt, wenn im Material eine Zeitangabe steht, die zitiert werden kann.
3. **Verwandtschaftsbezeichnungen im Erzählfluss sind relativ zum Erzähler.** „Mein Großvater" ist nicht der Vater des Erzählers. Wenn die Zwischengeneration nicht genannt ist, wird ein Platzhalter angelegt oder die Kante weggelassen — nicht geraten.
4. **Krankheitsangaben werden nicht in Fachbegriffe übersetzt.** Der Wortlaut ist der Wert.
5. **Koordinaten nur mit `herkunft`.** Ohne belegbare Herkunft kein Koordinatenfeld.
6. **Umschriften sind zusätzlich, nie ersetzend** (ADR-014).
7. **Jeder Rest geht nach `notizen_unverarbeitet`, im Originalwortlaut**, mit einem Satz, was gefehlt hat. Nicht zusammenfassen, nicht glätten.
8. **Bei Zweifeln zwischen zwei Deutungen: beide als konkurrierende Aussagen** mit ehrlicher Konfidenz, oder gar keine. Nicht die wahrscheinlichere allein.
9. **`zusammenfassung` zuletzt schreiben, durch Zählen** — nicht schätzen.
10. **Nach dem Erzeugen selbst gegen das Schema prüfen** und den Trockenlauf-Bericht abwarten, bevor die Datei als fertig gilt.

Regel 3 ist die, die im Alltag am häufigsten zuschlägt, weil sie nicht wie ein Fehler aussieht.

### 7.3 Warum ein leerer Notizblock verdächtig ist

IMP-310: Ist `notizen_unverarbeitet` leer, obwohl `pruefsumme_quelltext` ein umfangreiches
Ausgangsmaterial nahelegt (oder der Nutzer im Dialog angibt, dass es ein längeres Gespräch war),
zeigt der Trockenlauf den Hinweis:

> Es wurde kein unverarbeitetes Material gemeldet. Bei einem längeren Gespräch ist das
> unwahrscheinlich — vermutlich wurde Unklares gedeutet statt zurückgestellt. Bitte
> stichprobenartig gegen das Transkript prüfen.

Das ist keine technische Prüfung, sondern eine Verhaltensbeobachtung: Ein Modell, das alles
zuordnen konnte, hat wahrscheinlich geraten. Ein ehrlicher Auswertungslauf über 58 Minuten
Gespräch produziert Reste. Der Hinweis stellt die richtige Frage an der richtigen Stelle, und
das ist mehr, als eine Schemaregel hier leisten kann.

### 7.4 Was der Vertrag nicht kann

Ehrlich benannt: Keine dieser Schranken verhindert eine **erfundene Quelle mit erfundenem
Transkript**. Wenn der Skill schreibt „Erna sagte: geboren 1890 in Marienwerder", obwohl sie
das nie gesagt hat, ist das nicht maschinell erkennbar. Die Gegenmaßnahmen sind menschlich und
organisatorisch:

- **Audio aufbewahren** (A-16) und `zeitmarke_sekunden` im Beleg pflegen. Ein Transkript mit Zeitmarke ist nachhörbar. Ein Transkript ohne ist es nicht.
- **`pruefsumme_quelltext`** — man kann später gegen das Ausgangsmaterial prüfen.
- **Stichproben.** Nach jedem Import drei Belege zufällig gegen das Original prüfen. Das ist die einzige Kontrolle, die wirklich greift, und sie gehört in die Arbeitsroutine, nicht in die Software.

Das steht hier, weil eine Sicherheitszusage, die man nicht halten kann, schlimmer ist als eine
fehlende.

---

## 8. Versionierung des Vertrags

- Die Zeichenkette `wurzelwerk-import/v1` ist der Vertrag. Ein unbekannter Wert führt zu IMP-102 und Abbruch — Wurzelwerk versucht nicht zu erraten, was gemeint war.
- **Rückwärtskompatible Änderungen** (neues optionales Feld, neuer Enum-Wert) bleiben `v1`. Der Skill darf sie nutzen, ältere Wurzelwerk-Fassungen melden sie als IMP-104 (unbekanntes Feld) — dann ist die Software zu alt, und das ist die richtige Aussage.
- **Brechende Änderungen** (Pflichtfeld hinzu, Feld umbenannt, Enum-Wert entfernt) ergeben `v2`. `v1` wird weiter gelesen, über einen Umwandler `v1 → v2` vor der Prüfung. Damit bleiben alte Importdateien im Fixture-Korpus für immer benutzbar — sie sind der Regressionstest.
- Jede Vertragsversion hat einen eigenen Ordner unter `fixtures/import/v1/`, `v2/` mit gültigen **und** absichtlich fehlerhaften Dateien. Für jeden IMP-Code existiert mindestens eine Datei, die genau ihn auslöst. Der Test: jede Fehlerdatei löst genau den erwarteten Code aus, nicht mehr und nicht weniger.

---

## Anhang A — Das vollständige Schema

Normativ ist `56_Beispiele/wurzelwerk-import-v1.schema.json`. Der Abdruck hier dient dem Lesen;
bei Abweichung gilt die Datei.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://wurzelwerk.local/schema/wurzelwerk-import/v1",
  "title": "wurzelwerk-import/v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["vertrag", "erzeugt", "quellen", "zusammenfassung"],
  "properties": {
    "vertrag": { "const": "wurzelwerk-import/v1" },
    "erzeugt": {
      "type": "object",
      "additionalProperties": false,
      "required": ["am", "werkzeug"],
      "properties": {
        "am": { "type": "string", "format": "date" },
        "werkzeug": { "type": "string", "minLength": 1 },
        "werkzeug_version": { "type": "string" },
        "bearbeiter": { "type": "string" }
      }
    },
    "pruefsumme_quelltext": {
      "type": "string",
      "pattern": "^sha256-[0-9a-f]{64}$",
      "description": "SHA-256 des Ausgangsmaterials (Transkript, Notizdatei). Erlaubt spaeter die Frage: aus welchem Gespraech stammt das?"
    },
    "zusammenfassung": {
      "type": "object",
      "description": "Vom Erzeuger deklarierte Anzahlen. Der Pruefer vergleicht sie mit den tatsaechlichen. Abweichung = IMP-105 (abgeschnittene oder manipulierte Datei).",
      "additionalProperties": false,
      "required": ["personen", "notizen_unverarbeitet"],
      "properties": {
        "personen": { "type": "integer", "minimum": 0 },
        "orte": { "type": "integer", "minimum": 0 },
        "ereignisse": { "type": "integer", "minimum": 0 },
        "elternschaften": { "type": "integer", "minimum": 0 },
        "partnerschaften": { "type": "integer", "minimum": 0 },
        "aussagen": { "type": "integer", "minimum": 0 },
        "diagnosen": { "type": "integer", "minimum": 0 },
        "risikofaktoren": { "type": "integer", "minimum": 0 },
        "medien": { "type": "integer", "minimum": 0 },
        "notizen_unverarbeitet": { "type": "integer", "minimum": 0 }
      }
    },
    "quellen": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/Quelle" } },
    "interviews": { "type": "array", "items": { "$ref": "#/$defs/Interview" } },
    "personen": { "type": "array", "items": { "$ref": "#/$defs/Person" } },
    "orte": { "type": "array", "items": { "$ref": "#/$defs/Ort" } },
    "ereignisse": { "type": "array", "items": { "$ref": "#/$defs/Ereignis" } },
    "elternschaften": { "type": "array", "items": { "$ref": "#/$defs/Elternschaft" } },
    "partnerschaften": { "type": "array", "items": { "$ref": "#/$defs/Partnerschaft" } },
    "aussagen": { "type": "array", "items": { "$ref": "#/$defs/Aussage" } },
    "diagnosen": { "type": "array", "items": { "$ref": "#/$defs/Diagnose" } },
    "risikofaktoren": { "type": "array", "items": { "$ref": "#/$defs/Risikofaktor" } },
    "medien": { "type": "array", "items": { "$ref": "#/$defs/Medium" } },
    "notizen_unverarbeitet": {
      "type": "array",
      "description": "Alles, was nicht zugeordnet werden konnte, im Originalwortlaut. Pflichtventil gegen Erfindungen: was hier steht, wurde nicht erfunden und nicht verschwiegen.",
      "items": { "$ref": "#/$defs/UnverarbeiteteNotiz" }
    }
  },

  "$defs": {

    "Kennung": {
      "type": "string",
      "pattern": "^(tmp|db):[A-Za-z0-9_.\\-]{1,64}$",
      "description": "tmp:… gilt nur innerhalb dieser Datei. db:<uuid> verweist auf einen vorhandenen Datensatz."
    },

    "Konfidenz": {
      "type": "integer",
      "minimum": 1,
      "maximum": 4,
      "description": "4 gesichert · 3 wahrscheinlich · 2 unsicher · 1 Vermutung (E21). Kein Vorgabewert: der Erzeuger muss entscheiden."
    },

    "Datumswert": {
      "type": "object",
      "additionalProperties": false,
      "required": ["modifikator", "praezision"],
      "properties": {
        "kalender": { "enum": ["gregorian", "julian", "hebrew", "french_r"], "default": "gregorian" },
        "modifikator": { "enum": ["exakt", "etwa", "vor", "nach", "zwischen", "von_bis", "geschaetzt", "berechnet"] },
        "praezision": { "enum": ["tag", "monat", "jahr", "jahrzehnt"] },
        "wert1": { "type": "string", "pattern": "^\\d{3,4}(-\\d{2}(-\\d{2})?)?$" },
        "wert2": { "type": "string", "pattern": "^\\d{3,4}(-\\d{2}(-\\d{2})?)?$" },
        "original_text": { "type": "string", "minLength": 1 },
        "zweitkalender": { "enum": ["gregorian", "julian", "hebrew", "french_r"] },
        "zweitwert": { "type": "string", "pattern": "^\\d{3,4}(-\\d{2}(-\\d{2})?)?$" },
        "doppeljahr": { "type": "string", "pattern": "^\\d{4}/\\d{2,4}$" }
      },
      "allOf": [
        {
          "if": { "properties": { "modifikator": { "enum": ["etwa", "vor", "nach", "zwischen", "von_bis", "geschaetzt", "berechnet"] } }, "required": ["modifikator"] },
          "then": { "required": ["original_text"] }
        },
        {
          "if": { "properties": { "modifikator": { "enum": ["zwischen", "von_bis"] } }, "required": ["modifikator"] },
          "then": { "required": ["wert1", "wert2"] },
          "else": { "required": ["wert1"] }
        },
        {
          "if": { "required": ["zweitwert"] },
          "then": { "required": ["zweitkalender"] }
        }
      ]
    },

    "Beleg": {
      "type": "object",
      "additionalProperties": false,
      "required": ["quelle", "konfidenz"],
      "properties": {
        "quelle": { "$ref": "#/$defs/Kennung" },
        "seite": { "type": "string" },
        "eintragsnummer": { "type": "string" },
        "band": { "type": "string" },
        "jahr": { "type": "integer" },
        "zeitmarke_sekunden": { "type": "number", "minimum": 0, "description": "Stelle in einer Audiodatei (A-16)" },
        "transkript": { "type": "string", "description": "Originalwortlaut der belegenden Stelle. Bei muendlichen Quellen dringend erwuenscht." },
        "uebersetzung": { "type": "string" },
        "digitalisat_url": { "type": "string" },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" }
      }
    },

    "Belege": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/Beleg" } },

    "Quelle": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "typ", "titel"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "typ": { "enum": ["kirchenbuch", "standesamt", "volkszaehlung", "zeitung", "grabstein", "familienbesitz", "literatur", "website", "muendlich", "sonstiges"] },
        "titel": { "type": "string", "minLength": 1 },
        "autor": { "type": "string" },
        "verlag": { "type": "string" },
        "jahr": { "type": "integer" },
        "art": { "enum": ["original", "derivat", "verfasst"] },
        "informationsart": { "enum": ["primaer", "sekundaer", "unbestimmt"] },
        "archiv": { "type": "string" },
        "signatur": { "type": "string" },
        "informant_person": { "$ref": "#/$defs/Kennung" },
        "gespraechsdatum": { "$ref": "#/$defs/Datumswert" },
        "form": { "enum": ["gespraech", "telefonat", "brief", "email", "audio", "video"] },
        "unmittelbarkeit": { "enum": ["selbst_erlebt", "vom_hoerensagen", "unbekannt"] },
        "audio_medium": { "$ref": "#/$defs/Kennung" },
        "notiz": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "typ": { "const": "muendlich" } }, "required": ["typ"] },
          "then": { "required": ["informant_person", "unmittelbarkeit"] }
        }
      ]
    },

    "Interview": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "informant_person", "datum"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "informant_person": { "$ref": "#/$defs/Kennung" },
        "datum": { "$ref": "#/$defs/Datumswert" },
        "ort": { "$ref": "#/$defs/Kennung" },
        "audio_medium": { "$ref": "#/$defs/Kennung" },
        "notizen": { "type": "string" },
        "status": { "enum": ["offen", "ausgewertet", "abgeschlossen"] }
      }
    },

    "Name": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "typ": { "enum": ["geburtsname", "ehename", "vulgo", "latinisiert", "transliteriert", "ordensname", "beruf", "aka", "sonstiges"], "default": "geburtsname" },
        "schrift": { "enum": ["latn", "cyrl"], "default": "latn" },
        "umschrift_von": { "type": "integer", "minimum": 0, "description": "Index des Originalnamens in demselben namen-Array" },
        "umschrift_norm": { "enum": ["iso9", "din1460", "manuell"] },
        "vornamen": { "type": "string" },
        "rufname_index": { "type": "integer", "minimum": 0 },
        "rufname_text": { "type": "string" },
        "nachname": { "type": "string" },
        "nachname_unbekannt": { "type": "boolean", "default": false },
        "praefix": { "type": "string" },
        "titel_vor": { "type": "string" },
        "zusatz_nach": { "type": "string" },
        "original_text": { "type": "string" },
        "sprache": { "type": "string" },
        "ist_bevorzugt": { "type": "boolean", "default": false },
        "gueltig_von": { "type": "integer" },
        "gueltig_bis": { "type": "integer" }
      },
      "allOf": [
        {
          "if": { "not": { "properties": { "nachname_unbekannt": { "const": true } }, "required": ["nachname_unbekannt"] } },
          "then": { "required": ["nachname"] }
        },
        {
          "if": { "required": ["umschrift_von"] },
          "then": { "required": ["umschrift_norm"] }
        }
      ]
    },

    "Person": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "konfidenz", "belege"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "ueberschreiben": { "type": "boolean", "default": false, "description": "Nur bei db:-Kennung erlaubt. Ohne dieses Flag darf ein Import bestehende bevorzugte Werte nicht ersetzen, nur ergaenzen." },
        "geschlecht": { "enum": ["M", "F", "U", "X"], "default": "U" },
        "lebend_status": { "enum": ["lebend", "verstorben", "vermutet_verstorben"] },
        "privat": { "type": "boolean", "default": false },
        "ist_platzhalter": { "type": "boolean", "default": false },
        "platzhalter_grund": { "enum": ["unbekannt", "unehelich", "nicht_identifiziert", "forschungsluecke"] },
        "namen": { "type": "array", "items": { "$ref": "#/$defs/Name" } },
        "notiz": { "type": "string" },
        "unsicherheit": { "type": "string", "description": "Klartext: was an dieser Person unklar ist. Bei konfidenz <= 2 Pflicht (IMP-206)." },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" }
      },
      "allOf": [
        {
          "if": { "properties": { "ist_platzhalter": { "const": true } }, "required": ["ist_platzhalter"] },
          "then": { "required": ["platzhalter_grund"] },
          "else": { "properties": { "namen": { "minItems": 1 } }, "required": ["namen"] }
        }
      ]
    },

    "Ortsname": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "sprache": { "type": "string" },
        "schrift": { "enum": ["latn", "cyrl"] },
        "gueltig_von": { "type": "integer" },
        "gueltig_bis": { "type": "integer" },
        "ist_bevorzugt": { "type": "boolean", "default": false },
        "original_text": { "type": "string" }
      }
    },

    "Ort": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "typ", "namen"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "typ": { "enum": ["dorf", "stadt", "gemeinde", "kirchspiel", "amt", "kreis", "provinz", "staat", "hof", "friedhof", "kirche", "unbekannt"] },
        "namen": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/Ortsname" } },
        "koordinaten": {
          "type": "object",
          "additionalProperties": false,
          "required": ["lat", "lon"],
          "properties": {
            "lat": { "type": "number", "minimum": -90, "maximum": 90 },
            "lon": { "type": "number", "minimum": -180, "maximum": 180 },
            "herkunft": { "type": "string", "description": "Woher die Koordinate stammt. Ohne Angabe wird sie beim Trockenlauf als IMP-303 gemeldet." }
          }
        },
        "existiert_von": { "type": "integer" },
        "existiert_bis": { "type": "integer" },
        "zugehoerigkeiten": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["uebergeordnet", "art"],
            "properties": {
              "uebergeordnet": { "$ref": "#/$defs/Kennung" },
              "art": { "enum": ["politisch", "kirchlich"] },
              "gueltig_von": { "type": "integer" },
              "gueltig_bis": { "type": "integer" }
            }
          }
        },
        "externe_ids": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["system", "wert"],
            "properties": {
              "system": { "enum": ["gov", "geonames", "wikidata"] },
              "wert": { "type": "string" }
            }
          }
        },
        "notiz": { "type": "string" }
      }
    },

    "Beteiligung": {
      "type": "object",
      "additionalProperties": false,
      "required": ["person", "rolle"],
      "properties": {
        "person": { "$ref": "#/$defs/Kennung" },
        "rolle": { "enum": ["hauptperson", "kind", "vater", "mutter", "braeutigam", "braut", "pate", "patenvertreter", "trauzeuge", "verstorbener", "ehepartner", "informant", "pfarrer", "hebamme", "dienstherr"] },
        "reihenfolge": { "type": "integer", "minimum": 0 }
      }
    },

    "Ereignis": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "typ", "beteiligungen", "konfidenz", "belege"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "typ": { "enum": ["geburt", "taufe", "konfirmation", "trauung", "kirchl_trauung", "verlobung", "scheidung", "tod", "beerdigung", "auswanderung", "einwanderung", "umzug", "beruf", "militaerdienst", "volkszaehlung", "testament", "sonstiges"] },
        "ort": { "$ref": "#/$defs/Kennung" },
        "datum": { "$ref": "#/$defs/Datumswert" },
        "beteiligungen": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/Beteiligung" } },
        "beschreibung": { "type": "string" },
        "notiz": { "type": "string" },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" }
      }
    },

    "Elternschaft": {
      "type": "object",
      "additionalProperties": false,
      "required": ["elternteil", "kind", "typ", "konfidenz", "belege"],
      "properties": {
        "elternteil": { "$ref": "#/$defs/Kennung" },
        "kind": { "$ref": "#/$defs/Kennung" },
        "typ": { "enum": ["biologisch", "adoptiv", "stief", "pflege", "zieh", "anerkannt", "leihmutter", "unbekannt"] },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" },
        "notiz": { "type": "string" }
      }
    },

    "Partnerschaft": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "typ", "beteiligte", "konfidenz", "belege"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "typ": { "enum": ["ehe_zivil", "ehe_kirchlich", "verlobung", "lebensgemeinschaft", "eingetr_lebenspartnerschaft", "unbekannt"] },
        "beteiligte": {
          "type": "array",
          "minItems": 2,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["person"],
            "properties": {
              "person": { "$ref": "#/$defs/Kennung" },
              "rolle": { "enum": ["ehepartner", "braeutigam", "braut", "partner"] }
            }
          }
        },
        "beginn": { "$ref": "#/$defs/Datumswert" },
        "ende": { "$ref": "#/$defs/Datumswert" },
        "ende_grund": { "enum": ["scheidung", "annullierung", "tod", "trennung", "unbekannt"] },
        "reihenfolge": { "type": "integer", "minimum": 0 },
        "notiz": { "type": "string" },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" }
      }
    },

    "Aussage": {
      "type": "object",
      "additionalProperties": false,
      "required": ["subjekt_typ", "subjekt", "praedikat", "konfidenz", "belege"],
      "properties": {
        "subjekt_typ": { "enum": ["person", "ereignis", "elternschaft", "partnerschaft", "ort", "name"] },
        "subjekt": { "$ref": "#/$defs/Kennung" },
        "praedikat": { "type": "string", "minLength": 1, "description": "z. B. beruf, konfession, todesursache, wohnort, alter_bei_tod. Freie Zeichenkette, aber der Trockenlauf meldet unbekannte Praedikate als IMP-304." },
        "wert_text": { "type": "string" },
        "wert_zahl": { "type": "number" },
        "wert_ref": { "$ref": "#/$defs/Kennung" },
        "datum": { "$ref": "#/$defs/Datumswert" },
        "gueltig_von": { "type": "integer" },
        "gueltig_bis": { "type": "integer" },
        "ist_bevorzugt": { "type": "boolean", "default": false },
        "begruendung": { "type": "string", "description": "Warum dieser Wert bevorzugt wird. Bei ist_bevorzugt=true und konkurrierenden Aussagen Pflicht (IMP-207)." },
        "unsicherheit": { "type": "string" },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" }
      },
      "anyOf": [
        { "required": ["wert_text"] },
        { "required": ["wert_zahl"] },
        { "required": ["wert_ref"] }
      ]
    },

    "Diagnose": {
      "type": "object",
      "additionalProperties": false,
      "required": ["person", "kategorie", "bezeichnung", "status", "konfidenz", "belege"],
      "properties": {
        "person": { "$ref": "#/$defs/Kennung" },
        "kategorie": { "enum": ["herz_kreislauf", "krebs", "stoffwechsel", "neuro_psych", "atemwege", "nieren", "autoimmun", "angeboren_genetisch", "infektion", "unfall", "sonstiges"] },
        "organ": { "type": "string" },
        "bezeichnung": { "type": "string", "minLength": 1, "description": "Wortlaut wie in der Quelle, nicht medizinisch uebersetzt. 'was mit dem Herzen' bleibt 'was mit dem Herzen'." },
        "erstdiagnose": { "$ref": "#/$defs/Datumswert" },
        "alter_bei_diagnose": { "type": "integer", "minimum": 0, "maximum": 120 },
        "status": { "enum": ["bestehend", "geheilt", "todesursache", "unbekannt"] },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" },
        "notiz": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "kategorie": { "const": "krebs" } }, "required": ["kategorie"] },
          "then": { "required": ["organ"] }
        }
      ]
    },

    "Risikofaktor": {
      "type": "object",
      "additionalProperties": false,
      "required": ["person", "art", "intensitaet", "konfidenz", "belege"],
      "properties": {
        "person": { "$ref": "#/$defs/Kennung" },
        "art": { "enum": ["rauchen", "alkohol", "beruf_exposition", "umwelt", "uebergewicht", "bewegungsmangel", "ernaehrung", "sonstiges"] },
        "detail": { "type": "string" },
        "intensitaet": { "enum": ["gering", "mittel", "hoch", "unbekannt"] },
        "beginn": { "$ref": "#/$defs/Datumswert" },
        "ende": { "$ref": "#/$defs/Datumswert" },
        "konfidenz": { "$ref": "#/$defs/Konfidenz" },
        "belege": { "$ref": "#/$defs/Belege" },
        "notiz": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "art": { "const": "beruf_exposition" } }, "required": ["art"] },
          "then": { "required": ["detail"] }
        }
      ]
    },

    "Medium": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "relativer_pfad"],
      "properties": {
        "id": { "$ref": "#/$defs/Kennung" },
        "relativer_pfad": { "type": "string", "minLength": 1, "description": "Relativ zur Importdatei. Fehlt die Datei, ist das IMP-208." },
        "titel": { "type": "string" },
        "beschreibung": { "type": "string" },
        "datum": { "$ref": "#/$defs/Datumswert" },
        "ort": { "$ref": "#/$defs/Kennung" },
        "zuordnungen": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["subjekt_typ", "subjekt"],
            "properties": {
              "subjekt_typ": { "enum": ["person", "ereignis", "ort", "quelle"] },
              "subjekt": { "$ref": "#/$defs/Kennung" },
              "ist_titelbild": { "type": "boolean", "default": false }
            }
          }
        }
      }
    },

    "UnverarbeiteteNotiz": {
      "type": "object",
      "additionalProperties": false,
      "required": ["text", "warum"],
      "properties": {
        "text": { "type": "string", "minLength": 1, "description": "Originalwortlaut. Nicht zusammengefasst, nicht geglaettet." },
        "warum": { "type": "string", "minLength": 1, "description": "Was gefehlt hat, um das zuzuordnen. Pflicht: erzwingt eine bewusste Entscheidung statt stillen Weglassens." },
        "betrifft_vermutlich": { "type": "array", "items": { "$ref": "#/$defs/Kennung" } },
        "herkunft": { "type": "string", "description": "Stelle im Ausgangsmaterial, z. B. Zeitmarke oder Seitenzahl." }
      }
    }
  }
}
```

---

## Anhang B — Die drei Beispieldateien

Die Dateien liegen vollständig in `56_Beispiele/`. Was sie jeweils zeigen:

**`beispiel-1-einfach.json`** — Familienstammbuch, 3 Personen, Geburt, Trauung, Kind, ein Beruf. Alles Konfidenz 3–4, exakte Daten, keine Widersprüche. Der Fall, der zeigt, wie der Vertrag aussieht, wenn nichts kompliziert ist.

**`beispiel-2-widersprueche.json`** — zwei konkurrierende Todesdaten (Grabstein 1961 gegen Erinnerung „58 oder 59"), mit `ist_bevorzugt` und `begruendung` auf der stärkeren Quelle und der schwächeren daneben stehengelassen. Dazu: unscharfes Geburtsdatum („so um 1890 rum"), ein Ort mit zwei zeitlich gültigen Namen (Marienwerder bis 1945 / Kwidzyn ab 1945) samt Notiz, dass Ernas Angabe „Ostpreußen" sachlich falsch war, ein Platzhaltervater, eine absichtlich falsch gesetzte Elternkante, die IMP-302 auslöst, und zwei unverarbeitete Notizen mit Begründung.

**`beispiel-3-interview.json`** — Interviewsitzung mit `pruefsumme_quelltext`, Audiodatei als Medium und `zeitmarke_sekunden` in jedem Beleg. Der Informant ist über eine `db:`-Kennung eine bereits vorhandene Person. Enthält zwei Diagnosen — eine mit Laienbezeichnung „Staublunge" (Konfidenz 2), eine bewusst als „was mit dem Herzen" (Konfidenz 1) statt als „Herzinfarkt" — und zwei Risikofaktoren, davon einer aus der Berufsangabe erschlossen und als solcher gekennzeichnet. Zwei unverarbeitete Notizen, darunter „irgendwer auf der Seite von meiner Mutter hatte Krebs", die bewusst nicht zugeordnet wurde.
