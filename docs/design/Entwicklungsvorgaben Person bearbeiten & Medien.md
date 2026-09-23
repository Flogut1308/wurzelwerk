# Wurzelwerk: Entwicklungsvorgaben für Person bearbeiten, Namen, Orte und Medien

Stand: 22.09.2026 · Zielgruppe: Claude Code (Entwicklungsplanung)
Designquelle: `Wurzelwerk Person bearbeiten.dc.html`, Artboards **1a–1d, 2a–2c, 3a–3c**
Ergänzt: `Funktionsumfang.md` (Stand 06.09.2026). Wo sich beide widersprechen, gilt dieses Dokument.

Dieses Dokument beschreibt, **was** die neuen Screens können, **wie** sie sich verhalten und **welche Daten, Endpunkte und Logik** dafür nötig sind. Ziel ist eine 1:1-Umsetzung der Designs.

> **Hinweis zum Transport:** Wurzelwerk ist offline und lokal. Die Endpunkte unten sind als REST-Ressourcen formuliert (`/api/v1/...`). Falls der bestehende Stack stattdessen IPC/Commands (z. B. Tauri/Electron) oder einen direkten Repository-Layer nutzt, bitte **1:1 auf dieselben Operationen abbilden**, Namen und Payloads beibehalten. Vorhandene Konventionen des Repos haben Vorrang vor der Syntax hier.

---

## 0. Arbeitsauftrag an Claude Code

1. Bestehenden Code gegen §2 (Datenmodell) abgleichen: Was existiert, was fehlt, was muss migriert werden (v. a. Namen als Freitext → Namensformen; Ortsnamen als Text → Ortsverweis; Profilbild-Feld → Porträt-Markierung).
2. Entwicklungsplan in Phasen gemäß §9 erstellen, je Phase: Migrationen, Endpunkte, UI-Komponenten, Tests.
3. Offene Entscheidungen (§10) als Konfigurationspunkte vorsehen, nicht hart verdrahten.
4. Pixelgenauigkeit: Tokens aus `tokens.css` / Designsprache verwenden. Maße, Abstände und Texte aus der DC-Datei übernehmen (Texte sind final formuliert).

---

## 1. Querschnittsregeln (gelten für alle Screens)

| Regel | Umsetzung |
|---|---|
| **Kein Speichern-Knopf** | Jede Feldänderung wird nach Blur bzw. 400 ms Debounce als `PATCH` geschrieben. Kopf zeigt „Gespeichert · gerade eben“ / „Speichert …“ / „Nicht gespeichert – erneut versuchen“. |
| **Rückgängig** | Jede Schreiboperation erzeugt einen `change_log`-Eintrag mit Vorher/Nachher. `⌘Z` / `⌘⇧Z` global. Reiterwechsel speichert, hält nichts zurück. |
| **Verlauf** | Rechte Spalte (1a) zeigt die letzten 3 Einträge der Person: Uhrzeit/relativ, Klartext-Beschreibung, Benutzer. |
| **Sicherheit neben dem Wert** | Jede Angabe (Faktenfeld, Station, Beziehung, Namensform, Ortsname) trägt `confidence` (4 Stufen) + optional Belege. Kein separater Bereich. |
| **Unscharfes Datum** | Überall derselbe Datumstyp (§2.1). Genauigkeit: `genau / um / vor / nach / nur Jahr`. |
| **Pflicht nur der Name** | Mindestens ein Namensbestandteil. Alle anderen Felder dürfen leer sein. Keine Validierung blockiert das Speichern. |
| **Widerspruch am Feld** | Plausibilitätsprüfungen laufen sofort (client + server) und erscheinen am Feld (z. B. „Sterbejahr liegt vor dem Geburtsjahr 1901.“), gespeichert wird trotzdem. |
| **Abgeleitete Werte** | Sichtbar, gesperrt, beschriftet („aus Beziehung abgeleitet“). Nie editierbar. |
| **Verknüpfen statt kopieren** | Medien, Orte und Personen werden referenziert, nie dupliziert. Löschen einer Verknüpfung löscht nie das Ziel. |

---

## 2. Datenmodell

IDs als UUID; zusätzlich menschenlesbare Kennung, wo angezeigt (Person: `P-0142`). Alle Tabellen mit `created_at`, `updated_at`, `created_by`. Soft-Delete (`deleted_at`) für Person, Medium, Ort (Papierkorb).

### 2.1 Gemeinsame Typen

**FuzzyDate**
```
value_start: date (teilweise: YYYY | YYYY-MM | YYYY-MM-DD)
value_end:   date?          // für Spannen
precision:   day | month | year
qualifier:   exact | about | before | after     // UI: genau / um / vor / nach
calendar:    gregorian | julian                 // Default gregorian
display:     string (berechnet, lokalisiert: „um 1935“, „14.03.1901“)
sort_key:    date (berechnet, für Sortierung/Filter)
```

**Confidence**: `documented` (urkundlich) · `probable` (wahrscheinlich) · `hearsay` (vom Hörensagen) · `assumed` (vermutet). UI-Labels aus i18n. Default beim Anlegen aus Gespräch: `hearsay`.

**Citation** (Beleg an einer Angabe) – polymorph:
```
id, media_id, target_type (person_fact | name_form | station | relationship | place_name),
target_id, target_field?, page_ref?, text_anchor? (Offset/Range in Transkription), note?
```
Daraus entsteht in 2c „Belegte Angaben 3“ mit „zur Stelle springen“ (via `text_anchor`).

### 2.2 Person
```
id, display_id (P-0142), sex: male | female | diverse | unknown,
living_status: living | deceased | unknown,
birth_date: FuzzyDate?, birth_place_id?, birth_confidence,
death_date: FuzzyDate?, death_place_id?, death_confidence,
short_description: string?        // „Schmied in Marienwerder“, erscheint in Karten & Suche
generation: int (berechnet), lineage: paternal | maternal | both (berechnet)
is_placeholder: bool, placeholder_role?: string   // „Mutter von Karl Gutnoff“
portrait_media_id? (berechnet aus media_link.is_portrait)
exclude_from_stats: bool
```
Todesfelder werden nur angezeigt, wenn `living_status = deceased` (Hinweistext: „erscheint, weil der Lebensstatus ‚verstorben‘ ist“).

### 2.3 Namen (2a)
**name_form** – eine Namensform = ein Datensatz
```
id, person_id, language (BCP-47: de, ru, os, en …), script (Latn, Cyrl …),
order: given_first | family_first     // aus Sprache vorbelegt, überschreibbar
role: birth_name | married_name | official | religious | nickname | other
role_note?: string                    // „amtlich ab 1946“
is_primary: bool                      // genau eine pro Person (DB-Constraint)
transliteration: string?              // berechnet oder manuell
transliteration_source: auto | manual
transliteration_scheme: iso9 | duden | scientific | …   (siehe §10)
confidence, sort_order
```
**name_part** – Bestandteile, ziehbar sortierbar
```
id, name_form_id, type: given | prefix | surname | suffix | title | patronymic,
value, is_call_name: bool (nur bei given, max. 1 je Form), sort_order,
gendered_variant?: string            // „Гутнова“, Vorschlag für Töchter/Ehefrauen
```
Leere Bestandteile werden beim Speichern verworfen (nicht persistiert).

Berechnete Felder je Form: `display` (nach `order`, ohne leere Teile, Titel optional ausblendbar), `sort_name` („Gutnoff, Karl Friedrich Wilhelm“ — Präfix zählt nicht mit).

**Sprachkonfiguration** `language_profile` (Stammdaten, erweiterbar):
```
language, default_script, default_order, has_patronymic, has_gendered_surname,
field_labels (z. B. os: Мыггаг / Ном), default_transliteration_scheme
```
Steuert, welche Bestandteile das Modal anbietet (Vatersname nur bei Sprachen, die ihn führen).

### 2.4 Orte (2b)
```
place: id, lat, lon, type (Stadt, Kreis, Landkreis …), parent_place_id?, merged_into_id?
place_name: id, place_id, name, language, valid_from: FuzzyDate?, valid_to: FuzzyDate?,
            is_current: bool, source_kind: citation | official | transliteration, confidence
place_jurisdiction: id, place_id, label („Westpreußen, Deutsches Reich“),
            valid_from?, valid_to?, sort_order
```
Verweiszähler („42 Verweise“) = Summe aller Fremdschlüssel auf `place.id` (Personenfakten, Stationen, Beziehungen, Medien).

### 2.5 Beziehungen (1b)
```
relationship: id, type: parent_child | partnership,
  person_a_id, person_b_id, parent_role?: father | mother | parent,
  partnership_kind?: marriage | partnership, start: FuzzyDate?, end: FuzzyDate?,
  status?: ongoing | divorced | separated | widowed, place_id?, confidence
child_of_partnership: child_person_id, partnership_id   // Kind hängt an Partnerschaft
```
- **Geschwister werden nicht gespeichert**, sondern abgeleitet (gleicher Elternteil). Halb-/Vollgeschwister unterscheidbar.
- Kind ohne Partnerschafts-Zuordnung → Hinweis „… gehört aber zu keiner Partnerschaft. Zuordnen“.

### 2.6 Lebensstationen (1b)
Wie im Funktionsumfang §7 (`station`, `station_type`). Ergänzung für 1b: Zeitspur ist reine Anzeige, berechnet aus `start/end` relativ zum Lebenszeitraum der Person.

### 2.7 Medien (2c, 3a–3c)
**provenance** (Herkunft, 3b „Herkunft anlegen“)
```
id, label, kind: private | archive | interview | other, color (Token-Name),
original_location?: string, rights: family | archive | public_domain,
archive_signature?: string
```
**media**
```
id, provenance_id (Pflicht, genau eine), title (Default: Dateiname),
kind: photo | document | audio | video | object,
date: FuzzyDate?, place_id?, rights_override?,
file_hash (SHA-256), file_path_original, mime, size, width?, height?, duration_s?,
previews: {thumb, medium, page_n…} (generiert),
language?, script? (z. B. Deutsch · Kurrent), has_back_side: bool
```
**media_text** – `media_id, kind: transcription | translation, language, body (Fulltext-indiziert)`
**media_link** (Verknüpfung) – `media_id, target_type: person | place | station | fact, target_id, is_portrait: bool, portrait_crop {x,y,w,h}?, show_for_living_guest: bool`
- `is_portrait` max. 1 je Person (Constraint). Nur für `kind = photo`.
**media_region** (Personen im Bild markieren) – `media_id, rect {x,y,w,h} (relativ 0–1), person_id? (null = „unbekannt“)`. Anlegen einer Region mit Person erzeugt automatisch einen `media_link`.
**tag** – `id, label, normalized_label (unique, lowercase, ohne Diakritika)`; **media_tag** – `media_id, tag_id`.
**saved_view** (gesicherte Ansicht) – `id, name, filter: FilterSpec (JSON), sort, view_mode, is_system: bool, sort_order`.
System-Ansichten (nicht löschbar): „Ohne Zuordnung“, „Ohne Datierung“, „Zu transkribieren“, „Zuletzt hinzugefügt“, „Papierkorb“.

**FilterSpec** (JSON, serverseitig in SQL übersetzt)
```json
{ "all": [
  {"field":"kind","op":"in","value":["document"]},
  {"field":"date","op":"between","value":["1900","1945"]},
  {"field":"person","op":"linked","value":"<uuid>"},
  {"field":"tag","op":"has","value":"<uuid>"},
  {"field":"transcription","op":"empty"},
  {"field":"provenance","op":"any"}
]}
```
Felder: `kind, date, provenance, person, place, tag, transcription, links (none), date (missing), text (fulltext)`.

### 2.8 Import-Sitzung (3c)
```
import_batch: id, provenance_id, default_kind, date_source: filename | file_date | manual,
  status: running | reviewing | done, counts {accepted, duplicates, unreadable}
import_item: id, batch_id, file_name, file_hash, state: pending | accepted | duplicate | unreadable | deferred,
  duplicate_of_media_id?, suggestions {title, date, place_id, persons[{person_id, confidence}]}, media_id?
```

### 2.9 Verlauf
`change_log: id, entity_type, entity_id, person_id? (für Personen-Verlauf), op, before, after, summary (i18n-Schlüssel + Parameter), user, at, undo_group`

---

## 3. Screens und Verhalten

### 3.1 Person bearbeiten, Reiter „Person“ (1a)
**Layout:** App-Leiste (Breadcrumb Wurzelwerk / Personen / Name, „Im Stammbaum zeigen“, ⋯) · fester Personenkopf · Reiterleiste · zweispaltig: Formularspalte + rechte Spalte (Zustand) · Fußleiste.

**Personenkopf:** Porträt oder Initialen (Feld in Generationsfarbe, nie Platzhaltergesicht), Anzeigename (§5.1), Lebensspanne, Status-Chip, „Generation 3 · väterlich“, Kennung, Kurzbeschreibung, Speicherstatus, Schließen.

**Reiter (genau 8, feste Reihenfolge):** Person · Namen · Leben · Beziehungen · Belege & Medien · Gesundheit (Schloss, „sensibel“) · Notizen · Verwaltung.
- Zähler je Reiter (Anzahl, nie Prozent). Gelber Punkt = offener Punkt in diesem Reiter.
- Beim Öffnen immer „Person“; Reiterwahl wird nicht gemerkt. Tasten `1…8`.

**Gruppen im Reiter „Person“:**
1. *Hauptname* – Vorname(n), Nachname, Geburtsname, Rufname, Kurzbeschreibung. Schreibt in die `name_form` mit `is_primary`. Link „2 weitere Namensformen · Reiter ‚Namen‘“.
2. *Eckdaten* – Geschlecht (Segment 4), Lebensstatus (Segment 3).
3. *Geburt* – Datum (schmal), Genauigkeit (Segment), Ort (Ortsfeld §3.6, zeigt Kontext „Kreis …, heute Kwidzyn“ + „ändern“), Sicherheit, Beleg (Chip mit Typ + Titel, „Beleg verknüpfen“).
4. *Tod* – nur bei „verstorben“; gleiche Felder. Fehlender Ort → Hinweis „Sterbeort fehlt. Die Zeitleiste zeigt die Person ohne Endpunkt an.“

**Rechte Spalte:**
- *Vollständigkeit*: „68 % der Kernangaben belegt“ = Anteil Kernfakten (Name, Geschlecht, Geburtsdatum, Geburtsort, ggf. Todesdatum/-ort, Eltern) mit ≥1 Citation.
- *Offene Punkte*: Liste mit Sprungziel (Reiter + Feld-Fokus). Regeln in §5.5.
- *Zuletzt geändert*: 3 Einträge, „Ganzen Verlauf öffnen“ → Reiter Verwaltung.

**Fußleiste:** „Änderungen werden sofort gespeichert · ⌘Z macht rückgängig“ · Person löschen (Bestätigung, Soft-Delete) · Nächste Person (nächste in aktueller Listen-Sortierung) · Fertig (schließt).

### 3.2 Reiter „Beziehungen“ und „Leben“ (1b)
**Beziehungen:**
- Gruppe *Eltern*: Zeilen Vater/Mutter. Leere Rolle sichtbar mit „Person suchen“ / „Neu anlegen“ (→ 1c, vorbelegt).
- Gruppe *Partnerschaften*: je Partnerschaft Karte (Partner, Lebensdaten, „Ehe · 1925 – 1958 · verwitwet“), darin „Kinder aus dieser Verbindung · n“ mit Zeilen (Name, Daten, Platzhalter-Chip, „Öffnen“) + „+ Kind hinzufügen“.
- Hinweiszeile für Kinder ohne Partnerschaft mit Aktion „Zuordnen“.
- Gruppe *Geschwister*: abgeleitet, gesperrt, Hinweis „weitere Geschwister erscheinen, sobald die Mutter zugeordnet ist“, wenn ein Elternteil fehlt.
- „Bearbeiten“ öffnet das bestehende Beziehungs-Modal (S-20). Löschen: Bestätigungsdialog mit dem Satz, dass nur die Verbindung getrennt wird.

**Leben:** Liste der Stationen, sortiert nach Jahr, Kopf mit Zähler + „+ Station“. Je Zeile: Art-Chip (Farbe der Stationsart), Bezeichnung, Ort (bei Migration „A → B“), Zeitraum, darunter Zeitspur über die Lebensachse (Anfang/Ende der Achse = Geburt/Tod oder Min/Max der Stationen). Lücken und Überschneidungen werden durch die Spur sichtbar, keine eigene Warnung.

**Feldzustände (Komponente):** Leer · Fokus · Unsicher markiert (Wert + Chip „geschätzt“) · Widerspruch (Rand + Meldung) · Gesperrt („aus Beziehung abgeleitet“).

### 3.3 Person anlegen mit Dublettenprüfung (1c)
- Modal über abgedunkeltem Hintergrund, Titel „Person anlegen“ + Kontext („als Mutter von …“).
- Felder: Vorname(n), Nachname (bei Kontext Beziehung vorbelegt: Nachname der Bezugsperson, Hinweis „aus der Beziehung vorbelegt“), Geschlecht (m/w/d/unbek.), Geburt (FuzzyDate), Tod.
- **Dublettenprüfung live** (Debounce 300 ms, ab 2 Zeichen in einem Namensfeld): zeigt bis zu 3 Treffer mit Name, Lebensdaten, Ort, Kinderzahl und „Das ist sie/er“. Klick verknüpft die bestehende Person in der Kontext-Beziehung statt anzulegen.
- Checkbox „Nach dem Anlegen gleich weiter erfassen“ → öffnet 1a.
- Buttons: Abbrechen · Anlegen & weitere (Dialog bleibt, behält Nachname + Beziehungsart) · Anlegen.
- **Platzhalterperson:** Anlage nur mit Rolle, `is_placeholder = true`, zählt nicht als belegte Person; Aktion „Später benennen“.
- **Einstiege:** aus dem Baum (Andockstelle, vorbelegt), aus der Suche (letzte Trefferzeile „‹Suchtext› anlegen“ übernimmt Text, Parser trennt Vor-/Nachname), aus Interview (Felder aus Aussage, Sicherheit `hearsay`).
- Tastatur: `⌘⏎` Anlegen & schließen · `⌘⇧⏎` Anlegen & nächste · `Esc` Abbrechen (Nachfrage, wenn Eingaben vorhanden).

### 3.4 Schmales Fenster < 1100 px (1d)
- Rechte Spalte → Schaltfläche „Zustand“ im Kopf, öffnet als Overlay.
- Reiter → horizontal scrollbare Chip-Reihe mit Zählern und „›“.
- Formular zweispaltig → einspaltig.
- Unten Leiste „3 offene Punkte · antippen zum Öffnen“.

### 3.5 Reiter „Namen“ (2a)
- Kopf: „Namensformen · n · nach Sprache“, „+ Namensform“.
- **Vorschau-Umschalter** (DE/RU/Ирон/EN): zeigt, wie die Person in dieser Oberflächensprache heißt, inkl. Regel „Rückfall: Sprache → Umschrift → Hauptname“.
- Je Form eine Karte: Sprache, Schrift, Reihenfolge, Hauptname-Chip, Bestandteile (Vornamen als Chips, Rufname markiert; Präfix, Nachname, Suffix, Titel, Vatersname je nach Sprachprofil), Rolle + Rollennotiz, „Sortiert unter“, Beleg-Chip, Sicherheit.
- Kyrillische Formen: Umschrift-Zeile mit Kennzeichnung „automatisch · ISO 9“ und „überschreiben“; Genusform mit Hinweis „wird für Töchter und Ehefrauen vorgeschlagen“.
- **Modal „Namensform bearbeiten“:** Sprache, Schrift, Reihenfolge (aus Sprache vorbelegt), Bestandteile ziehbar sortierbar, leere Vornamen mit Hinweis „leer — wird beim Speichern verworfen“, Buttons „+ Vorname / + Präfix / + Suffix / + Titel“, Lateinische Umschrift (automatisch, „selbst eintragen“; eigene Eingabe hat Vorrang), Checkbox „Hauptname der Person“, Live-Vorschau des Anzeigenamens, Abbrechen/Übernehmen. (Das Modal ist die einzige Stelle mit explizitem Übernehmen, da es eine zusammengesetzte Einheit bearbeitet.)
- **Suche** findet alle Formen und Umschriften und zeigt im Treffer die gefundene Form.

### 3.6 Orte (2b)
- **Ortsdatensatz:** Kopf (aktueller Name, Hierarchie, Koordinaten, Verweiszähler, Bearbeiten), Tabelle Namensformen (Name · Sprache · gültig · Quelle), „+ Weitere Namensform“, Zugehörigkeit im Zeitverlauf (Zeitleiste der `place_jurisdiction`).
- **Ortsfeld im Formular:** Autocomplete über alle `place_name` aller Sprachen. Treffer zeigt Anzeigenamen, Kontext („Westpreußen · heute Kwidzyn, Polen“) und „gefunden über ‚Kwidzyn‘ (pl)“. Letzte Zeile: „+ Ort ‚‹Suchtext›‘ neu anlegen“.
- **Anzeige** nach §5.3; App-Einstellung „Name zur Zeit des Ereignisses | heutiger Name“.
- Orte zusammenführen: alle Namensformen bleiben, umkehrbar (S-35).

### 3.7 Reiter „Belege & Medien“ (2c)
- Kopf mit Zähler, „Aus Sammlung verknüpfen“ (öffnet Medienbestand als Auswahl-Modal, 3a mit Mehrfachauswahl), „+ Hochladen“.
- Raster aus Kacheln: Vorschau oder Typ-Etikett (PDF/AUDIO), Titel, Meta (Datierung · Rechte / „4 Personen markiert“ / „belegt: Geburt, Vater“ / „48 min“ / „Datum fehlt“). Porträt-Chip auf dem Porträt. Letzte Kachel: Dropzone.
- **Dokument öffnen:** Seitenvorschau links; rechts Titel, Quelle, Signatur; Reiter Transkription · Übersetzung · Belegte Angaben (n). „Zur Stelle springen“ markiert `text_anchor` in der Transkription. Fuß: Sprache/Schrift, Rechte.
- **Porträt festlegen:** Bild mit verschiebbarem Rahmen (Bildmitte), Vorschau in Karte und Baum/Liste/Zeile, Schalter „Als Porträt verwenden“, „Auch für lebende Personen im Gastzugang zeigen“. Original bleibt unbeschnitten; gespeichert wird nur `portrait_crop`.
- **Personen im Bild markieren:** Rechtecke aufziehen, je Rechteck Personensuche; „unbekannt“ möglich mit Aktion „Person zuordnen“. Bild erscheint danach bei allen markierten Personen.

### 3.8 Medienbestand (3a)
- **Seitenleiste:** Bestand (Alle Medien, Zuletzt hinzugefügt, Ohne Zuordnung, Ohne Datierung, Papierkorb – je mit Zähler) · Herkunft (Liste mit Farbpunkt + Zähler, „+“ öffnet „Herkunft anlegen“) · Gesicherte Ansichten (benutzerdefiniert, Zähler optional).
- **Kopf:** Breadcrumb, „Ansicht sichern“ (speichert aktuelle Filter + Sortierung + Modus als `saved_view`, fragt Namen), „+ Hochladen“ (startet Import 3c).
- **Suche** über Titel, Transkriptionen, Schlagwörter (Volltext).
- **Ansichtsmodi:** Raster · Liste · Zeitleiste · Karte. Sortierung (Standard: Aufnahmedatum).
- **Filterleiste:** Chips (Art, Zeitraum, Person, …) mit ✕, „+ Filter“, Ergebniszähler „38 von 1 284“.
- **Auswahl:** Checkbox je Kachel, Shift-Bereichsauswahl. Stapelleiste „n ausgewählt“: Person zuordnen · Datieren · Schlagwort · Herkunft ändern.
- Kachel: Vorschau, Titel, Datierung · Personenanzahl / Ort / „keine Person zugeordnet“; „Rückseite“-Etikett bei `has_back_side`.

### 3.9 Herkunft anlegen (3b)
Modal: Bezeichnung, Art, Farbe (Token-Swatches), Standort des Originals, Rechte (Segment; gilt für alle Medien darin, einzeln überschreibbar), Zähler „n Medien zugeordnet“ (beim Bearbeiten), Abbrechen/Speichern.
Rechte-Vererbung: `effective_rights = media.rights_override ?? provenance.rights`.

### 3.10 Stapel-Import (3c)
1. **Start:** Dateien/Ordner wählen → Herkunft für alle (Pflicht), Art, „Datierung aus: Dateiname | Datei-Datum | selbst setzen“.
2. **Verarbeitung (Hintergrund):** Hash, Dubletten-Abgleich (gleicher Hash = Dublette, unabhängig vom Namen), Lesbarkeit, Vorschauen, OCR/Texterkennung falls verfügbar, Vorschläge (Titel aus Dateiname, Datum, Ort, erkannte Personen mit Konfidenz).
3. **Status-Kopf:** „Import · 96 Dateien“, Chips „84 übernommen / 9 Dubletten / 3 nicht lesbar“, aktive Herkunft.
4. **Stapelansicht:** Vorschau, „‹ zurück · 37 / 96 · Übernehmen & weiter ›“. Formular: Titel (Vorschlag), Datierung, Ort, Personen (bestätigte als Chip ✕, vorgeschlagene mit „?“ + ✓), „+ Person“, Schlagwörter. Checkbox „Eingaben für die nächste Datei beibehalten“.
5. **Dublette:** Vergleich neu/im Bestand, Text mit Titel und Verknüpfungsanzahl des Bestands-Mediums, „Überspringen“ / „Trotzdem anlegen“.
6. Bereits bei Verarbeitung wird jedes lesbare Item mit Herkunft und Datierungsvorschlag als Medium angelegt. Nur ⏎ drücken = trotzdem vollständiger Import.
7. **Tastatur:** `⏎` übernehmen & weiter · `→ ←` blättern · `P` Personensuche · `D` Datierung wie vorherige · `X` später (landet in „Ohne Zuordnung“).
8. **Aufräumen später:** Einstieg „Stapel durchgehen“ für die drei System-Ansichten – dieselbe Stapelansicht, Quelle ist die Ansicht statt des Imports.

---

## 4. Endpunkte

Konventionen: JSON, `PATCH` mit Teilobjekten, Antwort enthält die aktualisierte Ressource + `change_id` (für Undo). Listen mit `?cursor=&limit=`. Fehler als `{code, message_key, field?}`.

### 4.1 Personen
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/persons/:id?include=header,counts,open_items,recent_changes` | Editor-Kopf, Reiterzähler, offene Punkte, Verlauf (1a) |
| PATCH | `/persons/:id` | Eckdaten, Geburt, Tod, Kurzbeschreibung, Lebensstatus |
| POST | `/persons` | Anlegen (1c); Body optional `context: {relationship_type, role, anchor_person_id}` → legt Beziehung mit an |
| POST | `/persons/placeholder` | Platzhalter mit Rolle + Kontext |
| DELETE | `/persons/:id` | Soft-Delete |
| POST | `/persons/duplicate-check` | Body: Namen, Geschlecht, Geburt, Tod, Ort → Treffer mit `score` + Begründung (1c) |
| GET | `/persons/:id/next?list_context=…` | „Nächste Person“ |
| GET | `/persons/:id/completeness` | Prozent + Aufschlüsselung (rechte Spalte) |
| GET | `/persons/:id/history?cursor` | Ganzer Verlauf (Reiter Verwaltung) |
| GET | `/search/persons?q=&lang=` | Suche über alle Namensformen + Umschriften, Treffer mit `matched_form` |

### 4.2 Namensformen
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/persons/:id/name-forms` | Alle Formen inkl. Teile, berechneter `display`, `sort_name` |
| POST | `/persons/:id/name-forms` | Neue Form (inkl. `parts[]`) |
| PUT | `/name-forms/:id` | Modal „Übernehmen“: Form + Teile atomar ersetzen, leere Teile verwerfen |
| PATCH | `/name-forms/:id` | Einzelfeld (z. B. `is_primary`, Rolle) |
| DELETE | `/name-forms/:id` | Nicht erlaubt für letzte Form / Hauptname ohne Ersatz |
| POST | `/name-forms/:id/primary` | Als Hauptname setzen (setzt andere auf false, Transaktion) |
| POST | `/transliterate` | Body `{text | parts[], from_script, to_script, language, scheme}` → Vorschlag (Live im Modal) |
| GET | `/persons/:id/display-name?lang=` | Aufgelöster Anzeigename + `source` (form/transliteration/primary) für Tooltip |
| GET | `/language-profiles` | Sprachprofile für Modal und Reihenfolge |

### 4.3 Beziehungen & Stationen
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/persons/:id/relationships` | Gruppiert: `parents[]` (inkl. leerer Rollen), `partnerships[]` mit `children[]`, `unassigned_children[]`, `siblings[]` (abgeleitet, `kind: full|half`) |
| POST / PATCH / DELETE | `/relationships[/:id]` | Wie S-20-Modal; DELETE trennt nur Verbindung |
| POST | `/partnerships/:id/children` | Kind an Partnerschaft hängen (bestehend oder neu) |
| PUT | `/persons/:childId/partnership` | Kind einer Partnerschaft zuordnen („Zuordnen“) |
| GET | `/persons/:id/stations` | Inkl. berechneter `timeline_span` für Zeitspur |
| POST / PATCH / DELETE | `/stations[/:id]` | Wie bestehend |

### 4.4 Orte
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/places/search?q=&lang=&at_date=` | Autocomplete über alle Namensformen; Treffer `{place, display, context, matched_name, matched_language}` |
| GET | `/places/:id` | Datensatz inkl. Namensformen, Zugehörigkeiten, `reference_count` |
| POST / PATCH | `/places[/:id]` | Anlegen (auch aus Suchtext) / bearbeiten |
| POST / PATCH / DELETE | `/places/:id/names[/:nameId]` | Namensformen |
| POST / PATCH / DELETE | `/places/:id/jurisdictions[/:jId]` | Zugehörigkeit im Zeitverlauf |
| GET | `/places/:id/display?at_date=&lang=&mode=event|today` | Aufgelöste Anzeige „Marienwerder (heute Kwidzyn)“ |
| POST | `/places/merge` · `/places/merge/:id/undo` | Zusammenführen, umkehrbar |
| GET / PATCH | `/settings/place-display` | `event | today` (global) |

### 4.5 Medien
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/media?filter=<FilterSpec>&q=&sort=&view=&cursor=` | Bestand (3a); Antwort inkl. `total`, `matched` |
| GET | `/media/facets?filter=` | Zähler für Seitenleiste & Filter-Vorschläge |
| GET | `/media/:id` | Detail inkl. Links, Regionen, Texte, Citations, effektive Rechte |
| PATCH | `/media/:id` | Titel, Art, Datierung, Ort, Herkunft, Rechte-Override |
| DELETE | `/media/:id` · POST `/media/:id/restore` | Papierkorb |
| GET | `/media/:id/file` · `/media/:id/preview/:size` | Original / Vorschau (lokal ausliefern) |
| POST | `/media/bulk` | Body `{ids[] | filter, action: link_person|set_date|add_tag|remove_tag|set_provenance, payload}` (Stapelleiste) |
| PUT | `/media/:id/texts/:kind` | Transkription/Übersetzung (Autosave) |
| POST / DELETE | `/media/:id/links[/:linkId]` | Verknüpfung zu Person/Ort/Station/Angabe |
| PUT | `/persons/:id/portrait` | `{media_id, crop, show_for_living_guest}`; `DELETE` entfernt Markierung |
| POST / PATCH / DELETE | `/media/:id/regions[/:rid]` | Personenmarkierung; mit `person_id` → Link automatisch |
| GET | `/persons/:id/media` | Reiter „Belege & Medien“ (2c), inkl. Meta-Zeile je Kachel |
| POST / DELETE | `/citations[/:id]` | Beleg an Angabe, inkl. `text_anchor` |
| GET | `/media/:id/citations` | „Belegte Angaben“ |

### 4.6 Herkunft, Schlagwörter, Ansichten
| Methode | Pfad | Zweck |
|---|---|---|
| GET / POST / PATCH / DELETE | `/provenances[/:id]` | inkl. `media_count`; Löschen nur wenn leer |
| GET | `/tags/suggest?q=` | Vorschläge über `normalized_label`, ähnliche Schreibweisen zuerst |
| POST | `/tags` | Anlegen (idempotent über `normalized_label`) |
| GET / POST / PATCH / DELETE | `/saved-views[/:id]` | Gesicherte Ansichten; System-Ansichten nur lesbar |
| GET | `/saved-views/:id/count` | Zähler für Seitenleiste |

### 4.7 Import
| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/imports` | `{provenance_id, default_kind, date_source, files[]}` → Batch, startet Verarbeitung |
| GET | `/imports/:id` | Status + Zähler (Polling oder Event-Stream `/imports/:id/events`) |
| GET | `/imports/:id/items?state=&cursor=` | Stapelliste |
| GET | `/imports/:id/items/:itemId` | Item inkl. Vorschlägen, Dublettenvergleich |
| POST | `/imports/:id/items/:itemId/accept` | Übernahme mit Formularwerten; Antwort liefert nächstes Item |
| POST | `/imports/:id/items/:itemId/defer` | `X` |
| POST | `/imports/:id/items/:itemId/resolve-duplicate` | `{action: skip | create}` |
| GET | `/review-queue?view=<system_view>` | „Stapel durchgehen“ für Aufräum-Ansichten (gleiche Item-Form) |

---

## 5. Logik, die zentral implementiert werden muss

### 5.1 Anzeigename-Auflösung
```
resolveDisplayName(person, uiLang):
  1. name_form mit language = uiLang (bei mehreren: is_primary vor role=official vor sort_order)
  2. sonst: Umschrift einer Form in die Schrift von uiLang
  3. sonst: Hauptname
  Rückgabe {text, source, form_id}; source erscheint als Tooltip.
```
Reihenfolge der Teile aus `name_form.order`. Gilt in Listen, Karten, Baum, Export. Einmal implementieren (Server + Client-Helfer mit identischer Logik oder nur serverseitig berechnet ausliefern).

### 5.2 Umschrift
- Regelbasiert, offline, je `(from_script, to_script, scheme)`. Mindestens ISO 9 (Cyrl→Latn). Ossetisch mit Sonderzeichen (z. B. „уы“) über sprachspezifische Regeltabelle.
- Wird nur erzeugt, wenn `transliteration_source = auto`. Manuelle Eingabe setzt `manual` und wird nie überschrieben. „Zurücksetzen“ stellt `auto` wieder her.
- Schema-Wahl siehe §10.

### 5.3 Ortsanzeige
```
displayPlace(place, eventDate, uiLang, mode):
  primary   = mode == event ? name gültig zu eventDate : aktueller Name
  secondary = der jeweils andere, falls abweichend
  Sprache: bevorzugt uiLang, sonst Umschrift, sonst Originalname
  Format: "primary (heute secondary)" bzw. "primary (bis 1945 secondary)"
```
Die zweite Form verschwindet nie.

### 5.4 Dublettenprüfung Person
Score aus: Namensähnlichkeit über alle Formen + Umschriften (phonetisch, z. B. Daitch-Mokotoff/Kölner Phonetik; „Gutnoff“ ≈ „Gutnow“), Geschlecht, Geburtsjahr ±5, Ort, bestehende Beziehung zur Bezugsperson. Schwelle konfigurierbar, max. 3 Treffer, mit Begründungsfeldern für die UI.

### 5.5 Offene Punkte (Regelwerk, erweiterbar)
Beispiele aus 1a: Sterbeort fehlt (verstorben + kein `death_place_id`), Mutter/Vater nicht zugeordnet, kein Porträt hinterlegt, Kind ohne Partnerschaft, Widerspruch vorhanden. Je Regel: `id, tab, field, message_key`. Speist rechte Spalte, gelben Reiterpunkt und schmale Fußleiste.

### 5.6 Plausibilitätsprüfungen (Widerspruch am Feld)
Tod vor Geburt, Elternteil jünger als 12 bei Geburt des Kindes, Partnerschaftsbeginn nach Tod, Station außerhalb der Lebenszeit, zwei widersprechende Angaben mit Citations. Ergebnis als `warnings[]` in jeder Personen-Antwort.

### 5.7 Volltextsuche
Index über: Namensformen + Umschriften, Ortsnamen aller Sprachen, Medientitel, Transkriptionen, Übersetzungen, Schlagwörter. Diakritika- und Groß/klein-insensitiv; kyrillisch/lateinisch gleichermaßen (z. B. SQLite FTS5 mit Unicode-Tokenizer, falls SQLite im Einsatz).

### 5.8 Datei-Handling
Original unverändert in den Projektordner (Content-adressiert über Hash, damit keine Kopien entstehen). Vorschauen asynchron. Große Dateien nicht in den Speicher laden. PDFs: Seitenvorschauen je Seite.

---

## 6. Tastatur (gesamt)

| Kontext | Taste | Aktion |
|---|---|---|
| Global | `⌘Z` / `⌘⇧Z` | Rückgängig / Wiederholen |
| Global | `⌘K` | Suche |
| Editor | `1 … 8` | Reiter wählen (nicht in Textfeldern) |
| Anlegen | `⌘⏎` / `⌘⇧⏎` / `Esc` | Anlegen & schließen / & nächste / Abbrechen mit Nachfrage |
| Stapel | `⏎` `→` `←` `P` `D` `X` | siehe §3.10 |

---

## 7. Rechte und Datenschutz

- Reiter „Gesundheit“ getrennt rechtebar (bestehendes geschütztes Modul); Zähler durch Schloss ersetzt.
- `show_for_living_guest` am Porträt steuert Sichtbarkeit im Gastzugang für lebende Personen (Default: aus).
- Medien-Rechte (`effective_rights`) werden in Export/Lesemodus ausgewertet.

---

## 8. Akzeptanzkriterien (Auszug, je Screen testbar)

- **1a:** Feldänderung erscheint nach ≤1 s als „Gespeichert“; `⌘Z` stellt vorherigen Wert her; Tod-Gruppe verschwindet bei „lebend“ (Werte bleiben gespeichert); Reiterzähler stimmen mit Daten überein.
- **1b:** Kinder erscheinen unter der richtigen Partnerschaft; Geschwister sind nicht editierbar; Löschen einer Beziehung lässt beide Personen bestehen.
- **1c:** Tippen von „Auguste Gutn“ zeigt die zwei bekannten Treffer; „Das ist sie“ legt keine neue Person an; „Anlegen & weitere“ behält Nachname und Beziehungsart.
- **1d:** Bei 1099 px Fensterbreite greift das schmale Layout vollständig.
- **2a:** Genau ein Hauptname (DB-Constraint); leere Vornamen werden nicht gespeichert; Suche nach „Гуытнаты“ findet Karl Gutnoff und zeigt die Form; Oberfläche Ossetisch zeigt „Гуытнаты Карл“.
- **2b:** Suche „Kwidz“ findet Marienwerder mit „gefunden über ‚Kwidzyn‘ (pl)“; Umschalten der Einstellung ändert die Anzeige in der ganzen App.
- **2c:** Porträt-Wechsel verändert keine Datei; markierte Person sieht das Gruppenfoto in ihrem Reiter; „zur Stelle springen“ markiert die richtige Textstelle.
- **3a:** Ein Medium erscheint gleichzeitig in Herkunft, Personenreiter und passender Ansicht ohne Duplikat; Stapelaktion auf 100 Medien ist ein Undo-Schritt.
- **3c:** 96 Dateien nur mit `⏎` durchgehen → 96 Medien (abzgl. Dubletten/unlesbar) mit Herkunft; gleiche Datei unter anderem Namen wird als Dublette erkannt.

---

## 9. Vorgeschlagene Phasen

1. **Fundament:** FuzzyDate, Confidence, Citation, change_log + Undo, Autosave-Mechanik, Sprachprofile.
2. **Namen:** name_form/name_part, Migration bestehender Namen, Anzeigename-Auflösung, Umschrift, Suche über Formen. Screen 2a + Hauptname-Gruppe in 1a.
3. **Orte:** place/place_name/jurisdiction, Migration Ortstexte → Datensätze, Ortsfeld, Anzeige-Einstellung. Screen 2b.
4. **Editor-Hülle:** 1a vollständig (Kopf, 8 Reiter, rechte Spalte, offene Punkte, Vollständigkeit), 1b, 1d-Responsive.
5. **Anlegen:** 1c inkl. Dublettenprüfung, Platzhalter, drei Einstiege.
6. **Medien-Kern:** provenance, media, Links, Tags, Dateiablage, Vorschauen, Reiter 2c (inkl. Porträt, Regionen, Dokumentansicht, Citations mit Textanker).
7. **Medienbestand:** 3a mit FilterSpec, Facetten, gesicherten Ansichten, Stapelaktionen, vier Ansichtsmodi (Zeitleiste/Karte ggf. nachgelagert).
8. **Stapel-Import:** 3c inkl. Hintergrundverarbeitung, Dubletten, Vorschläge, Aufräum-Stapel.

---

## 10. Offene Entscheidungen (als Konfiguration vorsehen)

1. **Umschrift-Schema:** pro Sprache konfigurierbar (ISO 9 / Duden / wissenschaftlich) oder feste Regel je Sprachpaar? → Umsetzung vorbereiten über `language_profile.default_transliteration_scheme` + optionale Projekt-Einstellung; Default ISO 9.
2. **Ordnerebene:** Reichen gesicherte Ansichten, oder kommt eine einstufige Ordnerebene neben der Herkunft? → Datenmodell so halten, dass ein optionales `media.folder_id` (einstufig, ohne Verschachtelung) später ohne Migration bestehender Daten ergänzt werden kann. Bis zur Entscheidung nicht bauen.
3. **Texterkennung im Import** (Personenvorschläge „aus dem Text erkannt“): Umfang und Offline-Engine klären; ohne OCR fallen die Vorschläge auf Dateiname + vorherige Eingaben zurück.
