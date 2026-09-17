## ADR-026 — Existenzkonfidenz und Belege als Aussage, nicht als Entitätsspalte

**Status:** entschieden (17.09.2026)

**Kontext:** Der Import-Vertrag verlangt `belege` (≥1) und `konfidenz` für jede Person, jedes
Ereignis und jede Kante (`56_Import_Vertrag.md` §2.3). Bei der Planung der Import-Schreiblogik
entstand der Befund, Schema v1 habe dafür „kein direktes Heim", und der Vorschlag,
`konfidenz`-Spalten an `person`/`ereignis`/`partnerschaft` sowie eine generische
`entity_zitat`-Tabelle per Migration zu ergänzen (`80_Offene_Fragen.md` U-1.4a-beleg).

**Der Befund war falsch.** `aussage` (`0002_kern.sql:316`) nimmt genau diese Subjekttypen auf und
trägt `konfidenz`; `aussage_zitat` (:344) ist die Belegverknüpfung nach `zitat` → `quelle`. Die
abgeleitete Schicht liest die Personenkonfidenz **bereits** aus `aussage`
(`0003_abgeleitet.sql:65`, gehalten von `abl_aussage_ai/au/ad`, seit AP-0.7, abgesichert durch
`abgeleitet-gleich`). Entitätsspalten wären toter Ballast oder erzwängen einen Umbau von AP-0.7.

**Entscheidung:**

1. Beleg und Konfidenz einer Entität leben als Aussage mit `praedikat='existenz'` und
   `wert_text='ja'` (Einzelheiten und Begründung des festgenagelten Werts: `50_Datenmodell.md` §2.7).
2. **Keine** `konfidenz`-Spalten an `person`/`ereignis`/`partnerschaft`, **keine**
   `entity_zitat`-Tabelle. `aussage_zitat` bleibt der einzige Belegpfad.
3. `elternschaft.konfidenz` wird nicht mehr geschrieben (nullable, keine Migration nötig).
4. `'existenz'` gehört in die bekannte Prädikatsmenge (`56_Import_Vertrag.md` §3.6), sonst meldet
   IMP-304 künftig jede importierte Person als unbekanntes Prädikat.

**Was das ausdrücklich nicht heißt:** Der Importvertrag hatte trotzdem Schemalücken — aber andere,
kleinere als angenommen: `zeitmarke_sekunden`, `unsicherheit` (Person und Aussage),
`gueltig_von`/`gueltig_bis`, und ein CHECK, das `diagnose`/`risikofaktor` als Aussagesubjekt
sperrte. Sie wurden in AP-1.3c als Migration `0005_import_luecken.sql` geschlossen
(`80_Offene_Fragen.md` U-1.4a-luecken).

**Konsequenzen:**
- Der Import schreibt je belegtem Objekt eine zusätzliche `aussage`- und `aussage_zitat`-Zeile.
  Gemessen: ≈205 Byte Mehrbedarf je Objekt gegenüber einer `entity_zitat`-Lösung, hochgerechnet
  ≈14–22 MB am Rand des 20.000er-Korpus. Unerheblich.
- Der Kostenpunkt ist nicht die Zeilenzahl, sondern `abl_aussage_ai`: es rechnet `person_flach` je
  eingefügter **Personen**-Aussage neu. Für Ereignis- und Kantenaussagen feuert der Trigger wegen
  seines `WHEN` gar nicht. Beim Großimport ist ohnehin `alleAbgeleitetenNeuAufbauen()` der Weg —
  in AP-1.5 zu messen.
- Existenz-Aussagen entstehen **importintern**, nicht über den `aussagen[]`-Pfad des Vertrags: dort
  erzwingt `$defs/Aussage` ein `anyOf` über `wert_*`, das eine reine Existenzbehauptung nicht füllen
  könnte.

### Nachtrag (AP-1.3c, 17.09.2026): Migration 0005 und ein sanktioniertes Tabellenneubau-Muster

Die fünf Schemalücken (s. o.) brauchten vier `ALTER TABLE ... ADD COLUMN` plus einen erweiterten
`aussage.subjekt_typ`-CHECK (6 → 8 Werte). SQLite kennt kein `ALTER TABLE ... ALTER CHECK` — das
CHECK erzwingt einen vollständigen Tabellenneubau von `aussage`.

**Ein naiver Neubau ist datenzerstörend.** Mit `foreign_keys = ON` (pro Verbindung fest,
`src/main/datenbank/verbindung.ts`, in einer Transaktion nicht abschaltbar — `PRAGMA foreign_keys`
ist dort ein dokumentierter No-op) löst `DROP TABLE aussage` implizite FK-Aktionen auf **anderen**
Tabellen aus, solange diese noch auf `aussage` zeigen: `aussage_zitat.aussage_id`
(`ON DELETE CASCADE`) liefe leer, `risikofaktor.quelle_beruf_id` (`ON DELETE SET NULL`) würde
genullt.

Ein erwogener Ausweg — `PRAGMA legacy_alter_table = ON` vor einem einfachen
`ALTER TABLE aussage RENAME TO aussage_alt`, in der Annahme, das verhindere auch das Nachziehen
fremder Fremdschlüssel-Definitionen — wurde **verworfen**: empirisch geprüft (gegen die
tatsächlich gebundelte SQLite-Version, `better-sqlite3`) rewritet SQLite die
`REFERENCES`-Klausel von `risikofaktor.quelle_beruf_id` beim Rename **unabhängig** vom Wert dieser
Pragma auf den neuen Namen — ein anschließendes `DROP TABLE aussage_alt` hätte weiterhin
kaskadiert.

**Das sanktionierte Muster** (`docs/schema/0005_import_luecken.sql`), validiert im Vorfeld an
einer isolierten Probe und danach am roten/grünen Testlauf (`test/migration/import-luecken.test.ts`):

1. **Neutralisieren:** `aussage_zitat` und `risikofaktor` je einmal neu bauen, **ohne** ihren
   Fremdschlüssel auf `aussage`. `aussage` hat danach null eingehende Fremdschlüssel.
2. **Neubauen:** `aussage` gefahrlos umbenennen, neu anlegen, Daten kopieren, alte Tabelle löschen
   (kein Fremdschlüssel zeigt mehr auf sie → kein Cascade) — und `abl_aussage_ai/au/ad` (die mit
   der alten Tabelle physisch verschwinden) verbatim wieder anlegen.
3. **Wiederherstellen:** `aussage_zitat` und `risikofaktor` ein zweites Mal neu bauen, jetzt **mit**
   Fremdschlüssel auf die neue `aussage`, plus ihre vier Indizes (die ebenfalls mit der jeweils
   alten Tabelle verschwinden).

Ein zweiter, erst im roten Testlauf sichtbarer Fund: derselbe `ALTER TABLE aussage RENAME`-Schritt
schreibt — SQLite-Standardverhalten seit 3.25.0 — auch die SQL-**Körper** unbeteiligter Trigger
still um, wenn diese `aussage` in einer Unterabfrage erwähnen: `abl_person_*`, `abl_name_*` und
`abl_ortsname_*` (alle drei lesen `person_flach`-Werte über `FROM aussage ...`) zeigten danach auf
`aussage_alt` und brachen, sobald diese Tabelle gelöscht war
(`SqliteError: no such table: main.aussage_alt`, reproduziert beim ersten `INSERT INTO person`).
Diese zehn Trigger werden in Migration 0005 **nicht** neu gebaut. Die Lösung ist ein eng
begrenztes `PRAGMA legacy_alter_table = ON` **nur** um die eine `RENAME`-Anweisung (sofort danach
wieder `OFF`) — das unterdrückt genau dieses Nachziehen von Trigger-/View-Körpern, ohne (anders als
beim oben verworfenen Ansatz) für den Schutz von Fremdschlüssel-Definitionen gebraucht zu werden;
diese Aufgabe übernimmt bereits Schritt 1.

Damit ist `PRAGMA legacy_alter_table` kein pauschal verworfenes Werkzeug, sondern eines mit genau
einem validierten Einsatzzweck (Trigger-/View-Körper vor dem stillen Umschreiben schützen) und
einem nachweislich **nicht** funktionierenden (Fremdschlüssel-Definitionen anderer Tabellen vor dem
Nachziehen schützen) — künftige Tabellenneubauten an Tabellen mit eingehenden Fremdschlüsseln
sollten das Drei-Phasen-Muster oben als Vorlage nehmen, nicht die Pragma allein.
