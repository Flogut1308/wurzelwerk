# Wurzelwerk — Datenmodell, Entwurf v0.2

Status: **Entwurf zur Diskussion.** Noch nicht implementierungsreif; offene Punkte sind markiert.
Grundlage: `20_Domaenenwissen.md`. Vorbilder: Gramps (Trennung Quelle/Zitat, Orts-Hierarchie),
GEDCOM X (Beziehungen statt Familien, Persona/Konklusion), GEDCOM-L `_LOC` (Ortsobjekt).

## 0. Fünf tragende Entscheidungen

1. **Beziehungen sind Kanten, nicht Familien.** Kein `FAM`-Container als Primärkonstrukt. Familien-Ansichten werden berechnet.
2. **Aussagen statt Felder.** Jeder Fakt ist ein Datensatz mit Herkunft, Konfidenz und Widerspruchsfähigkeit.
3. **Ereignisse mit Rollen** statt fester Personenfelder.
4. **Ort, Datum und Name sind strukturierte Objekte**, niemals Freitext-Spalten.
5. **UUIDs überall, ab Tag 1.** Keine natürlichen Schlüssel (gleichnamige Personen im gleichen Dorf sind der Normalfall).

## 1. Entitätsübersicht

```
Person ──1:n── Name
   │
   ├──1:n── Aussage ──n:1── Zitat ──n:1── Quelle ──n:1── Archiv
   │            │
   │            └── Konfidenz, bevorzugt?, Begründung
   │
   ├──n:m── Beteiligung ──n:1── Ereignis ──n:1── Ort
   │            └── Rolle (Kind, Pate, Zeuge, …)
   │
   ├──n:m── Elternschaft (Elternteil → Kind, Typ)
   ├──n:m── Partnerschaft (n Beteiligte, Typ, Zeitraum)
   ├──n:m── Assoziation (Nachbar, Dienstherr, …)
   └──n:m── Medium (Foto, Scan, Dokument)

Ort ──1:n── Ortsname (mit Zeitraum)
   └──n:m── Ortszugehörigkeit (übergeordnet, Zeitraum, Art: politisch|kirchlich)

Persona ──n:1── Person   (Beleg-Ebene → Konklusions-Ebene, umkehrbar)
```

## 2. Schema-Entwurf (SQLite)

Nur die tragenden Tabellen; Felder wie `erstellt_am`, `geaendert_am` überall implizit.

### 2.1 Person
```sql
person(
  id            TEXT PRIMARY KEY,      -- UUID v7
  geschlecht    TEXT,                  -- 'M','F','U','X'
  lebend_status TEXT,                  -- 'lebend','verstorben','vermutet_verstorben'
  privat        INTEGER DEFAULT 0,     -- vom Export ausschließen
  notiz         TEXT,
  gesperrt_bis  INTEGER                -- optional: Jahr, ab dem Daten freigegeben (PStG)
)
```
Bewusst **keine** Spalten `vorname`, `geburtsdatum`, `geburtsort`. Diese entstehen als
materialisierte Ansicht aus den bevorzugten Aussagen (Performance, Suche, Sortierung) und sind
jederzeit neu berechenbar.

### 2.2 Name
```sql
name(
  id, person_id,
  typ            TEXT,   -- geburtsname|ehename|vulgo|latinisiert|transliteriert|
                         -- ordensname|beruf|aka|sonstiges
  schrift        TEXT,   -- 'latn','cyrl' — welche Schrift dieser Eintrag verwendet
  umschrift_von  TEXT,   -- name.id des Originals, wenn dies eine Umschrift ist
  umschrift_norm TEXT,   -- angewandte Norm: 'iso9','din1460','manuell'
  vornamen       TEXT,   -- vollständige Kette
  rufname_index  INTEGER,-- welcher Vorname der Rufname ist (0-basiert), NULL wenn unbekannt
  rufname_text   TEXT,   -- Fallback, wenn Rufname nicht in der Kette steht
  nachname       TEXT,
  praefix        TEXT,   -- von, van, zu, de
  titel_vor      TEXT,   -- Dr., Freiherr
  zusatz_nach    TEXT,   -- der Ältere, junior, recte, vulgo
  original_text  TEXT,   -- exakt wie in der Quelle
  sprache        TEXT,
  ist_bevorzugt  INTEGER,
  gueltig_von    INTEGER, gueltig_bis INTEGER  -- Sortierschlüssel, NULL = immer
)
name_phonetik(name_id, verfahren, code)   -- n:m, 'koelner'|'dm_soundex'|'soundex'
```
**Umschrift-Regel (E20):** Eine automatisch erzeugte Umschrift ist immer ein **zusätzlicher**
Namenseintrag mit `typ = transliteriert` und Verweis auf das Original. Sie ist nie das
bevorzugte Anzeigename und überschreibt nichts. Sie wird als "automatisch erzeugt"
gekennzeichnet, damit man eine korrigierte manuelle Umschrift davon unterscheiden kann.
Dasselbe Muster gilt für `ortsname`. Suche und Phonetik laufen über alle Varianten.

### 2.3 Datumswert (eingebettet, kein eigener Record)
Als Spaltengruppe überall, wo ein Datum steht:
```
{feld}_kalender     TEXT   -- 'gregorian','julian','hebrew','french_r'
{feld}_modifikator  TEXT   -- 'exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet'
{feld}_praezision   TEXT   -- 'tag','monat','jahr','jahrzehnt'
{feld}_wert1        TEXT   -- ISO-artig, Teilangaben erlaubt: '1750', '1750-03', '1750-03-14'
{feld}_wert2        TEXT   -- zweiter Wert bei 'zwischen'/'von_bis'
{feld}_originaltext TEXT   -- 'Dom. III post Trinitatis 1750', '1731/32'
{feld}_sort_von     INTEGER-- Julianische Tageszahl, untere Grenze
{feld}_sort_bis     INTEGER-- Julianische Tageszahl, obere Grenze
```
**Entschieden (D1):** eingebettete Spaltengruppe. Datumswerte werden nie zwischen Entitäten
geteilt, also bringt Normalisierung nur Joins.

**Zusatzfelder wegen E9 (Doppeldatierung Kongresspolen, §13.1 im Domänendokument):**
```
{feld}_zweitkalender      TEXT   -- z.B. 'julian', wenn wert1 gregorianisch ist
{feld}_zweitwert          TEXT   -- das parallel im Register vermerkte Datum
{feld}_doppeljahr         TEXT   -- '1731/32' bei Old/New Style
```
Regel: `wert1` ist immer das **Originaldatum in seinem Originalkalender**. Umrechnungen werden
berechnet, nie gespeichert. `zweitwert` existiert nur, wenn die Quelle selbst zwei Daten nennt.

### 2.4 Ort
```sql
ort(
  id, typ,             -- dorf|stadt|gemeinde|kirchspiel|amt|kreis|provinz|staat|hof|friedhof|kirche
  koordinaten_lat, koordinaten_lon,   -- optional
  existiert_von, existiert_bis,       -- Sortierschlüssel
  nachfolger_ort_id,                  -- bei Auflösung/Umbenennung
  notiz
)
ortsname(id, ort_id, name, sprache, gueltig_von, gueltig_bis, ist_bevorzugt, original_text)
ortszugehoerigkeit(id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis)
                                      -- art: 'politisch' | 'kirchlich'
ort_externe_id(ort_id, system, wert)  -- 'gov','geonames','wikidata'
```

### 2.5 Ereignis und Beteiligung
```sql
ereignis(
  id, typ,          -- geburt|taufe|konfirmation|trauung|kirchl_trauung|verlobung|scheidung|
                    -- tod|beerdigung|auswanderung|einwanderung|umzug|beruf|militaerdienst|
                    -- volkszaehlung|testament|sonstiges
  ort_id, datum_*,  -- Datumsspaltengruppe
  beschreibung, notiz
)
beteiligung(
  id, ereignis_id, person_id,
  rolle,            -- hauptperson|kind|vater|mutter|braeutigam|braut|pate|patenvertreter|
                    -- trauzeuge|verstorbener|ehepartner|informant|pfarrer|hebamme|dienstherr
  reihenfolge INTEGER
)
```

### 2.6 Beziehungen
```sql
elternschaft(
  id, elternteil_id, kind_id,
  typ,              -- biologisch|adoptiv|stief|pflege|zieh|anerkannt|leihmutter|unbekannt
  konfidenz, notiz
)
partnerschaft(
  id, typ,          -- ehe_zivil|ehe_kirchlich|verlobung|lebensgemeinschaft|
                    -- eingetr_lebenspartnerschaft|unbekannt
  beginn_*, ende_*, -- Datumsspaltengruppen
  ende_grund,       -- scheidung|annullierung|tod|trennung|unbekannt
  reihenfolge, notiz
)
partnerschaft_person(partnerschaft_id, person_id, rolle)
assoziation(id, person_a_id, person_b_id, art, notiz)  -- nachbar, dienstherr, geschaeftspartner, zwilling
```
Ein Kind hat beliebig viele `elternschaft`-Zeilen. Ein Familienblatt ist eine Abfrage:
"alle Kinder, deren Elternkanten auf diese beiden Personen zeigen".

### 2.7 Aussage, Zitat, Quelle
```sql
aussage(
  id,
  subjekt_typ,      -- person|ereignis|elternschaft|partnerschaft|ort|name
  subjekt_id,
  praedikat,        -- 'geburtsdatum','beruf','konfession','todesursache','alter_bei_tod', …
  wert_text, wert_zahl, wert_ref_id,   -- je nach Typ; wert_ref_id z.B. auf ort
  datum_*,          -- falls die Aussage selbst datiert ist (Beruf 1780–1795)
  konfidenz,        -- 1..5
  ist_bevorzugt,    -- der angezeigte Wert bei Widerspruch
  begruendung       -- warum dieser Wert bevorzugt wird
)
aussage_zitat(aussage_id, zitat_id)

zitat(
  id, quelle_id,
  seite, eintragsnummer, band, jahr,
  zugriffsdatum_*, digitalisat_url,
  transkript, uebersetzung,
  konfidenz,        -- 1..5, Qualität dieses konkreten Belegs
  medium_id         -- Scan
)
quelle(
  id, typ,          -- kirchenbuch|standesamt|volkszaehlung|zeitung|grabstein|familienbesitz|
                    -- literatur|website|muendlich|sonstiges
  titel, autor, verlag, jahr,
  art,              -- original|derivat|verfasst
  informationsart,  -- primaer|sekundaer|unbestimmt
  archiv_id, signatur, notiz
)
archiv(id, name, ort_id, kontakt, url, notiz)

negativbefund(
  id, quelle_id, gesuchte_person_id, gesuchtes_praedikat,
  zeitraum_von, zeitraum_bis, beschreibung, datum_der_pruefung
)
```

### 2.8 Persona-Ebene (Phase 3)
```sql
persona(
  id, zitat_id,                 -- genau ein Beleg, unveränderlich
  rohdaten_json,                -- Namen, Datum, Ort exakt wie im Beleg
  person_id,                    -- NULL = noch nicht zugeordnet
  zuordnung_konfidenz, zuordnung_begruendung, zuordnung_datum
)
```
**Entschieden (D2):** Tabelle wird in Phase 0 angelegt und bleibt bis Phase 4 leer. Keine
Migration des Kerns später.

### 2.9 Medien
```sql
medium(
  id, dateiname, relativer_pfad, hash, mime_typ, groesse,
  titel, beschreibung, datum_*, ort_id
)
medium_zuordnung(medium_id, subjekt_typ, subjekt_id, ist_titelbild)
medium_region(id, medium_id, person_id, x, y, w, h)   -- Gesichtsmarkierung, Phase 5
```

### 2.10 Änderungsjournal und Zusammenführungen
```sql
transaktion(id, zeitpunkt, bearbeiter, beschreibung, art)  -- art: 'nutzer'|'import'|'merge'|'migration'
aenderung(
  id, transaktion_id, reihenfolge,
  tabelle, datensatz_id, feld,
  wert_alt_json, wert_neu_json,
  operation             -- insert|update|delete
)
merge_protokoll(
  id, transaktion_id, ziel_person_id, quell_person_id,
  feldentscheidungen_json, begruendung, rueckgaengig_moeglich
)
id_alias(alte_id, neue_id, typ)   -- damit externe Verweise nach Merge gültig bleiben
```
Undo = alle `aenderung`-Zeilen der letzten `transaktion` in umgekehrter Reihenfolge invers
anwenden. Gibt gleichzeitig Audit-Trail, Redo und die Basis für umkehrbares Zusammenführen.
Bei Massenoperationen (Import) Journal abschalten, stattdessen Snapshot vorher.

### 2.11 Forschung
```sql
aufgabe(id, person_id, ort_id, quelle_id, titel, beschreibung, prioritaet, status, faellig_am)
```

### 2.12 Gesundheit und Risikofaktoren (E10)

```sql
diagnose(
  id, person_id,
  kategorie,        -- herz_kreislauf|krebs|stoffwechsel|neuro_psych|atemwege|nieren|
                    -- autoimmun|angeboren_genetisch|infektion|unfall|sonstiges
  organ,            -- bei Krebs: lunge, darm, brust, … ; sonst NULL
  bezeichnung,      -- freier Text wie in der Quelle: 'Herzinfarkt', 'Wassersucht'
  icd10,            -- optional, Phase 6
  erstdiagnose_*,   -- Datumsspaltengruppe
  alter_bei_diagnose INTEGER,   -- Alternative, wenn nur 'mit etwa 60' bekannt
  status,           -- bestehend|geheilt|todesursache|unbekannt
  konfidenz,        -- 1..5 — bei Erinnerungsdaten meist niedrig
  notiz
)
risikofaktor(
  id, person_id,
  art,              -- rauchen|alkohol|beruf_exposition|umwelt|uebergewicht|
                    -- bewegungsmangel|ernaehrung|sonstiges
  detail,           -- 'Bergbau, Steinkohle' / 'Asbest' / 'Pestizide'
  intensitaet,      -- gering|mittel|hoch|unbekannt
  beginn_*, ende_*, -- Datumsspaltengruppen
  quelle_beruf_id,  -- optional: aus welcher Berufsangabe abgeleitet
  konfidenz, notiz
)
```
Belege laufen wie bei allem anderen über `aussage`/`aussage_zitat` — Diagnose und Risikofaktor
sind belegpflichtige Aussagen, nicht bloße Felder.

**Harte Regel (M-08):** Beide Tabellen sind aus **jedem** Export standardmäßig
ausgeschlossen — auch aus dem GEDCOM-Export, auch aus dem Lesemodus für Verwandte. Ein
Einschluss ist nur pro Export explizit und mit Bestätigungsdialog möglich, und für lebende
Personen gar nicht. Begründung: Gesundheitsdaten sind DSGVO-Sonderkategorie (Art. 9); die
Haushaltsausnahme deckt die eigene Sammlung, nicht die Weitergabe.

### 2.13 Benutzerdefinierte Felder (E11)

Statt einer generischen Attributtabelle mit Freitextschlüsseln ein echtes
**Feld-Definitionssystem** — sonst entsteht binnen eines Jahres ein Wildwuchs aus
"Beruf", "beruf", "Berufstätigkeit".

```sql
feld_definition(
  id, schluessel,      -- technisch, unveränderlich, z.B. 'hofname'
  bezeichnung,         -- Anzeigename, änderbar: 'Hofname'
  beschreibung,        -- Hilfetext im Formular
  gilt_fuer,           -- person|ereignis|ort|quelle|partnerschaft
  datentyp,            -- text|langtext|zahl|datum|auswahl|mehrfachauswahl|
                       -- ja_nein|ort_ref|person_ref|url|medium_ref
  ist_mehrfach,        -- darf mehrere Werte haben
  hat_zeitraum,        -- Wert kann von–bis tragen (Beruf, Wohnort, Mitgliedschaft)
  gruppe,              -- Formularabschnitt: 'Grunddaten','Beruf & Besitz','Militär',…
  reihenfolge,
  ist_system,          -- mitgelieferte Felder: umbenennbar, nicht löschbar
  ist_sensibel         -- vom Export ausschließen wie Gesundheitsdaten
)
feld_auswahloption(id, feld_definition_id, wert, bezeichnung, reihenfolge)
feld_wert(
  id, feld_definition_id, subjekt_typ, subjekt_id,
  wert_text, wert_zahl, wert_ref_id, wert_datum_*,
  gueltig_von, gueltig_bis, reihenfolge
)
```
Mit `ist_system = 1` mitgeliefert: Beruf, Konfession, Wohnort, Titel, Militärdienst, Auswanderung,
Hofname, Spitzname, Ausbildung, Vermögen/Besitz, Mitgliedschaften.
Wichtig: **Suche, Filter, Listenspalten, Kartenfelder und Berichte müssen benutzerdefinierte
Felder von Anfang an mit einbeziehen.** Ein Feldsystem, dessen Felder man nicht filtern kann,
ist nur ein Notizzettel.

### 2.14 Platzhalterpersonen (D4)

Entschieden: **Platzhalter werden angelegt.** Ergänzung an `person`:
```
ist_platzhalter INTEGER DEFAULT 0     -- 'Vater unbekannt', 'N.N. Mutter'
platzhalter_grund TEXT                -- warum: unbekannt|unehelich|nicht_identifiziert|forschungslücke
```
Regeln, damit Platzhalter nicht den Bestand verschmutzen:
- aus allen **Statistiken** ausgeschlossen (M-Zählungen, Lebenserwartung, Kinderzahl)
- aus jedem **Export** ausgeschlossen, außer der Nutzer wählt es explizit
- im Baum visuell klar abgesetzt (gestrichelte Umrandung, kein Name, kein Bild)
- niemals Ziel einer Zusammenführung, sondern **Ersetzung** (entschieden, E22): wird der echte Mensch gefunden, verschwindet der Platzhalter, alle Verweise wandern auf die echte Person, und der Vorgang steht als eigene Transaktionsart `platzhalter_aufgeloest` im Änderungsjournal. Damit ist er rückholbar, belastet aber den Bestand nicht.
- Plausibilitätsprüfungen ignorieren sie

### 2.15 Quellenart "mündlich" (E6)

Ergänzung an `quelle` für den in Phase 1 häufigsten Fall:
```
informant_person_id  TEXT     -- der Erzähler, selbst Person im Baum
gespraechsdatum_*             -- Datumsspaltengruppe
form                 TEXT     -- gespraech|telefonat|brief|email|audio|video
unmittelbarkeit      TEXT     -- selbst_erlebt|vom_hoerensagen|unbekannt
audio_medium_id      TEXT
```
`interview_sitzung(id, informant_person_id, datum_*, ort_id, audio_medium_id, notizen, status)`
bündelt ein Gespräch, damit alle daraus entstandenen Aussagen gemeinsam nachvollziehbar sind —
und damit man später sagen kann: "alles, was aus dem Gespräch mit Tante Erna vom 12.09.2026
stammt, ist mit dieser Konfidenz behaftet".

Bei `unmittelbarkeit = vom_hoerensagen` schlägt die Anwendung automatisch eine niedrigere
Konfidenz und Datumspräzision "etwa" vor.

### 2.16 Konfidenzskala (E21)

Vier Stufen, gespeichert als Zahl 1–4, angezeigt mit festen Bezeichnungen:

| Wert | Bezeichnung | Bedeutung |
|---|---|---|
| 4 | **gesichert** | Primärquelle, eindeutig, keine Gegenanzeige |
| 3 | **wahrscheinlich** | gute Quelle oder mehrere schwache, die übereinstimmen |
| 2 | **unsicher** | einzelne schwache Quelle, z. B. Erinnerung aus zweiter Hand |
| 1 | **Vermutung** | Schlussfolgerung ohne direkten Beleg, ausdrücklich als solche markiert |

**"widersprüchlich" ist bewusst keine Stufe**, sondern ein **abgeleiteter Zustand**: er entsteht
automatisch, sobald zu einem `praedikat` mehr als eine Aussage mit unterschiedlichem Wert
existiert und keine als bevorzugt markiert ist. Begründung: Widersprüchlichkeit ist eine
Eigenschaft der *Menge* von Aussagen, nicht der einzelnen Aussage — sonst müsste man denselben
Beleg umbewerten, nur weil ein zweiter dazukommt.

In der Oberfläche erscheinen beide zusammen: der Konfidenz-Indikator zeigt die Stufe der
bevorzugten Aussage, ein zusätzliches Zeichen markiert "es gibt konkurrierende Angaben".

Vorgabewerte: Quellenart `mündlich` + `selbst_erlebt` → 3 · `mündlich` + `vom_hoerensagen` → 2 ·
eigene Schlussfolgerung ohne Beleg → 1.

## 3. Projektordner-Format

```
MeinStammbaum.ahnen/          ← Ordner (Endung entschieden, E14) (auf macOS optional als Bundle)
  baum.sqlite                 ← WAL-Modus, alle Entitäten
  medien/<uuid>/original.jpg  ← Originale, unangetastet
  medien/<uuid>/thumb_512.webp
  snapshots/2026-08-23T1200.sqlite   ← per VACUUM INTO, konsistent im laufenden Betrieb
  export/baum.ged             ← GEDCOM 7, deterministisch sortiert, versionierbar
  manifest.json               ← Schemaversion, App-Version, Projektname
```
SQLite-Einstellungen: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `FTS5` als
externe Content-Tabelle über Namen, Orte, Notizen, Transkripte.

**Warnung:** SQLite-Dateien in Dropbox/iCloud/OneDrive können korrumpieren, WAL funktioniert
auf Netzlaufwerken nicht zuverlässig. Projektordner bewusst lokal halten; Synchronisation nur
über den Export. Beim Öffnen eines Projekts in einem Sync-Ordner: Warnung anzeigen.

## 4. Berechnete Ableitungen (nie gespeichert)

- Kekulé-, Henry-, d'Aboville-Nummern (abhängig von gewählter Wurzelperson)
- Verwandtschaftsgrad und -bezeichnung (abhängig von gewählter Zentrumsperson und Zählsystem)
- Generationsebene (aus Elternkanten + Datumsschätzung)
- Lebend/verstorben-Vermutung
- Alter, Heiratsalter, Kinderzahl, Statistiken
- Ahnenimplex-Erkennung (mehrere Pfade zum selben Vorfahren)

## 5. Bekannte Grenzen dieses Entwurfs

- **Abgrenzung Ereignis vs. Aussage — entschieden (D3):** Alles, was einen Ort *und* ein Datum *und* Beteiligte hat, ist ein **Ereignis**. Reine Eigenschaften (Konfession, Todesursache, Krankheit, Spitzname, Vermögen) sind **Aussagen** bzw. `feld_wert`. Beruf ist eine Aussage mit Zeitraum — außer es gibt eine Urkunde mit Ort und Datum (Meisterbrief, Anstellung), dann ein Ereignis. Diagnosen und Risikofaktoren sind eigene Tabellen (§2.12), weil sie mehr Struktur als eine Aussage brauchen.
- **Konfidenzskala** ist zweimal vorhanden (Zitat und Aussage). Beabsichtigt: Qualität des Belegs vs. Sicherheit der Schlussfolgerung. Beide nutzen die Skala aus §2.16. In der Oberfläche wird nur die Aussage-Konfidenz prominent gezeigt; die Zitat-Konfidenz erscheint im Belegdetail.
- **GEDCOM-7-Rückabbildung** dieses Modells ist verlustbehaftet in Richtung GEDCOM (Personas, mehrere Elternkanten, Aussagen mit Begründung haben keine Entsprechung). Export muss dokumentieren, was wegfällt.
- Zeitabhängige Ortszugehörigkeit erfordert bei jeder Ortsanzeige eine Datumsangabe im Kontext. Ohne Datum: bevorzugter Name.

---

# Nachtrag Architekturplanung, 23.08.2026 — Schemaänderungen v0.3

Aus der Architekturplanung (`55_Architektur.md`) folgen Änderungen am Schema. Sie sind als
ADR-017 bis ADR-020 begründet und gehen in Schema v1 (Migrationen 0001–0003) ein.

## N.1 Konfidenzskala: vier Stufen, verbindlich

§2.16 und E21 legen **vier** Stufen fest. Die Kommentare `-- 1..5` in §2.7 (`aussage.konfidenz`,
`zitat.konfidenz`) und §2.12 (`diagnose.konfidenz`, `risikofaktor.konfidenz`) sind Reste aus dem
ersten Durchgang und gelten **nicht**. Ebenso ist die Angabe „5 Stufen" in `40_Anforderungen.md`
B-03 überholt.

Im Schema als `CHECK (konfidenz BETWEEN 1 AND 4)`. Das ist keine Kosmetik: Eine spätere
Änderung wäre eine Datenmigration über alle belegtragenden Tabellen.

## N.2 `aenderung`: ganze Zeilen statt Feld-Diffs (ADR-017)

```sql
aenderung(
  id             TEXT PRIMARY KEY,
  transaktion_id TEXT NOT NULL REFERENCES transaktion(id),   -- NOT NULL ist Absicht
  reihenfolge    INTEGER NOT NULL,
  tabelle        TEXT NOT NULL,
  datensatz_id   TEXT NOT NULL,
  feld           TEXT,          -- bleibt für Sonderfälle, im Regelfall NULL = ganze Zeile
  wert_alt_json  TEXT,          -- vollständige Zeile vor der Änderung, NULL bei insert
  wert_neu_json  TEXT,          -- vollständige Zeile nach der Änderung, NULL bei delete
  operation      TEXT NOT NULL CHECK (operation IN ('insert','update','delete'))
) STRICT
```

Feld-Diffs gehen nicht verloren, sie werden für die Anzeige aus alt/neu berechnet. Der Nutzer
sieht dasselbe. Die Umkehrung wird dadurch strukturell korrekt (Begründung: ADR-017).

`transaktion_id NOT NULL` mit Fremdschlüssel bedeutet: **ein Schreibvorgang auf eine
journalisierte Tabelle ohne armierte Transaktion ist nicht möglich**, nicht bloß verboten.

## N.3 `transaktion`: fünf neue Spalten (ADR-018, ADR-019)

```sql
transaktion(
  id, zeitpunkt, bearbeiter, beschreibung,
  art,                    -- 'nutzer'|'import'|'merge'|'migration'|'wartung'|'platzhalter_aufgeloest'
  lfd                     INTEGER NOT NULL,   -- monoton, Reihenfolge unabhängig von der Zeitauflösung
  status                  TEXT NOT NULL DEFAULT 'angewendet'
                          CHECK (status IN ('angewendet','zurueckgenommen','verworfen')),
  rueckgaengig_moeglich   INTEGER NOT NULL DEFAULT 1,
  snapshot_pfad           TEXT,               -- bei art='import' oberhalb des Schwellwerts
  koaleszenz_schluessel   TEXT                -- z. B. 'person:<id>:notiz'
) STRICT
```

Undo-Ziel und Redo-Ziel sind Abfragen über `status`, nicht ein Stapel im Arbeitsspeicher — damit
funktioniert Undo über den Programmneustart hinweg (F-03) ohne Serialisierung.

## N.4 Neue Tabellen

| Tabelle | Zweck | Journalisiert? |
|---|---|---|
| `journal_kontext` | eine Zeile; trägt die laufende Transaktions-ID für die Trigger und den Schalter `aktiv` | nein |
| `schema_migration` | Version, Datei, **Prüfsumme**, Zeitpunkt, App-Version (ADR-020) | nein |
| `person_flach` | materialisierte Ansicht der bevorzugten Werte: Anzeigename, Sortiernamen, Geburts-/Todesjahr, `konfidenz_min`, `hat_widerspruch` | nein |
| `suche_fts` | FTS5 über `original`, `umschrift`, `normalform`, `notiz`, `transkript` (ADR-014) | nein |
| `import_lauf` | Datei, Prüfsumme, Vertragsversion, Zeitpunkt, Transaktions-ID | ja |
| `import_herkunft` | verdichtete Zuordnung Datensatz ↔ Importlauf, geschrieben bevor das Journal aufgeräumt wird | ja |
| `ansicht_zustand` | gespeicherte Ansichten, Zentrumsperson, Filter (ab Phase 2 gefüllt) | ja |

**Harte Regel für abgeleitete Tabellen** (`person_flach`, `suche_fts`): Sie tragen keine
Wahrheit, sind jederzeit vollständig neu berechenbar, werden **nie** journalisiert, und kein
Befehl schreibt direkt in sie — nur Trigger. Ohne diese Regel kann Undo nicht korrekt sein
(ADR-018). Ein Invariantentest vergleicht den inkrementellen Zustand mit dem vollständigen
Neuaufbau.

`hat_widerspruch` ist die Umsetzung des abgeleiteten Zustands aus §2.16: Er entsteht hier, in
der Datenbank, und nicht in der Oberfläche, wo er pro Ansicht neu erfunden würde.

## N.5 Weitere Zusicherungen im Schema

- Jede Tabelle ist `STRICT` (SQLite-Typprüfung; sonst landet `"unbekannt"` in einer `INTEGER`-Spalte).
- Jeder Primärschlüssel ist `TEXT` (UUID v7). **Kein `INTEGER PRIMARY KEY` in einer journalisierten Tabelle** — eine wiedereingefügte Zeile könnte sonst eine andere `rowid` bekommen und Verweise ins Leere zeigen lassen (ADR-018).
- Alle Aufzählungen aus diesem Dokument werden `CHECK (spalte IN (…))`, nicht Kommentar. Ein Test vergleicht jede Zod-Aufzählung mit dem `CHECK` in der Tabelle.
- `PRAGMA foreign_keys = ON` gilt pro Verbindung und wird an genau einer Stelle gesetzt.

## N.6 Persona-Phase (Klarstellung)

§2.8 überschreibt die Tabelle mit „(Phase 3)", D2 in `80_Offene_Fragen.md` sagt „bleibt bis
Phase 4 leer", B-05 nennt Phase 3. Verbindlich: **Tabelle ab Phase 0 angelegt (D2), Befüllung
Phase 3 (B-05).** Die „Phase 4" in D2 war ein Tippfehler.
