-- Kernschema-Migration 0002 (AP-0.6). Alle Tabellen aus 50_Datenmodell.md §2 + N.4-Ergänzungen
-- (import_lauf, import_herkunft, ansicht_zustand). Journalisierungs-Einordnung als Kommentarkopf je
-- Tabelle (CLAUDE.md §6) - die maschinelle JOURNALISIERT/NICHT_JOURNALISIERT-Liste + Trigger folgen in
-- AP-0.8. Getroffene Annahmen bei Modell-Lücken stehen als Kommentar direkt bei der jeweiligen Spalte.

-- JOURNALISIERT
-- §2.1 Person. Bewusst keine vorname/geburtsdatum-Spalten (materialisiert in person_flach, AP-0.7).
CREATE TABLE person (
  id TEXT PRIMARY KEY,
  geschlecht TEXT CHECK (geschlecht IN ('M','F','U','X')),
  lebend_status TEXT CHECK (lebend_status IN ('lebend','verstorben','vermutet_verstorben')),
  privat INTEGER NOT NULL CHECK (privat IN (0,1)),
  notiz TEXT,
  gesperrt_bis INTEGER,
  ist_platzhalter INTEGER NOT NULL CHECK (ist_platzhalter IN (0,1)),
  platzhalter_grund TEXT CHECK (platzhalter_grund IN ('unbekannt','unehelich','nicht_identifiziert','forschungsluecke')), -- §2.14
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
-- §2.2 Name.
CREATE TABLE name (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5: Komposition (personengebunden) -> CASCADE
  typ TEXT NOT NULL CHECK (typ IN ('geburtsname','ehename','vulgo','latinisiert','transliteriert','ordensname','beruf','aka','sonstiges')),
  schrift TEXT CHECK (schrift IN ('latn','cyrl')), -- Annahme: Modelltext nennt nur latn/cyrl als Beispiele (kein "usw."); als vollständige Werteliste übernommen (E-6-Analogie) - bitte prüfen, falls weitere Schriften gebraucht werden.
  umschrift_von TEXT REFERENCES name(id) ON DELETE SET NULL, -- Selbstverweis, optional -> SET NULL
  umschrift_norm TEXT CHECK (umschrift_norm IN ('iso9','din1460','manuell')),
  vornamen TEXT,
  rufname_index INTEGER,
  rufname_text TEXT,
  nachname TEXT,
  praefix TEXT,
  titel_vor TEXT,
  zusatz_nach TEXT,
  original_text TEXT,
  sprache TEXT,
  ist_bevorzugt INTEGER CHECK (ist_bevorzugt IS NULL OR ist_bevorzugt IN (0,1)),
  gueltig_von INTEGER,
  gueltig_bis INTEGER,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_name_person_id ON name(person_id);
CREATE INDEX idx_name_umschrift_von ON name(umschrift_von);

-- NICHT_JOURNALISIERT
-- §2.2 name_phonetik. Verknüpfungstabelle ohne eigenes id (Modell nennt nur name_id, verfahren, code). E-3: NICHT_JOURNALISIERT (abgeleiteter Suchindex).
CREATE TABLE name_phonetik (
  name_id TEXT NOT NULL REFERENCES name(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  verfahren TEXT NOT NULL CHECK (verfahren IN ('koelner','dm_soundex','soundex')),
  code TEXT NOT NULL,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (name_id, verfahren)
) STRICT;
CREATE INDEX idx_name_phonetik_name_id ON name_phonetik(name_id);

-- JOURNALISIERT
-- §2.4 Ort.
CREATE TABLE ort (
  id TEXT PRIMARY KEY,
  typ TEXT CHECK (typ IN ('dorf','stadt','gemeinde','kirchspiel','amt','kreis','provinz','staat','hof','friedhof','kirche')),
  koordinaten_lat REAL,
  koordinaten_lon REAL,
  existiert_von INTEGER,
  existiert_bis INTEGER,
  nachfolger_ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- Selbstverweis, optional (Auflösung/Umbenennung) -> SET NULL
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_ort_nachfolger_ort_id ON ort(nachfolger_ort_id);

-- JOURNALISIERT
-- §2.4 ortsname.
CREATE TABLE ortsname (
  id TEXT PRIMARY KEY,
  ort_id TEXT NOT NULL REFERENCES ort(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  name TEXT,
  sprache TEXT,
  gueltig_von INTEGER,
  gueltig_bis INTEGER,
  ist_bevorzugt INTEGER CHECK (ist_bevorzugt IS NULL OR ist_bevorzugt IN (0,1)),
  original_text TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_ortsname_ort_id ON ortsname(ort_id);

-- JOURNALISIERT
-- §2.4 ortszugehoerigkeit.
CREATE TABLE ortszugehoerigkeit (
  id TEXT PRIMARY KEY,
  ort_id TEXT NOT NULL REFERENCES ort(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  uebergeordnet_id TEXT NOT NULL REFERENCES ort(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: RESTRICT
  art TEXT NOT NULL CHECK (art IN ('politisch','kirchlich')),
  gueltig_von INTEGER,
  gueltig_bis INTEGER,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_ortszugehoerigkeit_ort_id ON ortszugehoerigkeit(ort_id);
CREATE INDEX idx_ortszugehoerigkeit_uebergeordnet_id ON ortszugehoerigkeit(uebergeordnet_id);

-- JOURNALISIERT
-- §2.4 ort_externe_id. Verknüpfungstabelle ohne eigenes id.
CREATE TABLE ort_externe_id (
  ort_id TEXT NOT NULL REFERENCES ort(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  system TEXT NOT NULL CHECK (system IN ('gov','geonames','wikidata')),
  wert TEXT NOT NULL,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (ort_id, system)
) STRICT;
CREATE INDEX idx_ort_externe_id_ort_id ON ort_externe_id(ort_id);

-- JOURNALISIERT
-- §2.5 Ereignis.
CREATE TABLE ereignis (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('geburt','taufe','konfirmation','trauung','kirchl_trauung','verlobung','scheidung','tod','beerdigung','auswanderung','einwanderung','umzug','beruf','militaerdienst','volkszaehlung','testament','sonstiges')),
  ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  datum_kalender TEXT CHECK (datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  datum_modifikator TEXT CHECK (datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  datum_praezision TEXT CHECK (datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  datum_wert1 TEXT,
  datum_wert2 TEXT,
  datum_originaltext TEXT,
  datum_sort_von INTEGER,
  datum_sort_bis INTEGER,
  datum_zweitkalender TEXT CHECK (datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  datum_zweitwert TEXT,
  datum_doppeljahr TEXT,
  beschreibung TEXT,
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_ereignis_ort_id ON ereignis(ort_id);

-- JOURNALISIERT
-- §2.5 Beteiligung.
CREATE TABLE beteiligung (
  id TEXT PRIMARY KEY,
  ereignis_id TEXT NOT NULL REFERENCES ereignis(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  rolle TEXT NOT NULL CHECK (rolle IN ('hauptperson','kind','vater','mutter','braeutigam','braut','pate','patenvertreter','trauzeuge','verstorbener','ehepartner','informant','pfarrer','hebamme','dienstherr')),
  reihenfolge INTEGER,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_beteiligung_ereignis_id ON beteiligung(ereignis_id);
CREATE INDEX idx_beteiligung_person_id ON beteiligung(person_id);

-- JOURNALISIERT
-- §2.6 Elternschaft.
CREATE TABLE elternschaft (
  id TEXT PRIMARY KEY,
  elternteil_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  kind_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  typ TEXT NOT NULL CHECK (typ IN ('biologisch','adoptiv','stief','pflege','zieh','anerkannt','leihmutter','unbekannt')),
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4), -- Annahme: E-1 zählt elternschaft.konfidenz nicht namentlich auf, N.1 gilt aber blanko für jede Konfidenz-Spalte im Schema - hier mit angewendet, bitte prüfen.
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_elternschaft_elternteil_id ON elternschaft(elternteil_id);
CREATE INDEX idx_elternschaft_kind_id ON elternschaft(kind_id);

-- JOURNALISIERT
-- §2.6 Partnerschaft.
CREATE TABLE partnerschaft (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('ehe_zivil','ehe_kirchlich','verlobung','lebensgemeinschaft','eingetr_lebenspartnerschaft','unbekannt')),
  beginn_kalender TEXT CHECK (beginn_kalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_modifikator TEXT CHECK (beginn_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  beginn_praezision TEXT CHECK (beginn_praezision IN ('tag','monat','jahr','jahrzehnt')),
  beginn_wert1 TEXT,
  beginn_wert2 TEXT,
  beginn_originaltext TEXT,
  beginn_sort_von INTEGER,
  beginn_sort_bis INTEGER,
  beginn_zweitkalender TEXT CHECK (beginn_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_zweitwert TEXT,
  beginn_doppeljahr TEXT,
  ende_kalender TEXT CHECK (ende_kalender IN ('gregorian','julian','hebrew','french_r')),
  ende_modifikator TEXT CHECK (ende_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  ende_praezision TEXT CHECK (ende_praezision IN ('tag','monat','jahr','jahrzehnt')),
  ende_wert1 TEXT,
  ende_wert2 TEXT,
  ende_originaltext TEXT,
  ende_sort_von INTEGER,
  ende_sort_bis INTEGER,
  ende_zweitkalender TEXT CHECK (ende_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  ende_zweitwert TEXT,
  ende_doppeljahr TEXT,
  ende_grund TEXT CHECK (ende_grund IN ('scheidung','annullierung','tod','trennung','unbekannt')),
  reihenfolge INTEGER,
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
-- §2.6 partnerschaft_person. Verknüpfungstabelle ohne eigenes id.
CREATE TABLE partnerschaft_person (
  partnerschaft_id TEXT NOT NULL REFERENCES partnerschaft(id) ON DELETE CASCADE, -- Annahme: im Plan nicht explizit gelistet (nur person_id ist gelistet). Komposition (Teilnehmer gehören zur Partnerschaft) -> CASCADE, analog beteiligung.ereignis_id. Bitte prüfen.
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  rolle TEXT, -- Lücke: Datenmodell nennt keine Werteliste für diese Rolle (anders als bei anderen *_typ/rolle-Spalten) - kein CHECK, bitte Wertebereich nachtragen.
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (partnerschaft_id, person_id)
) STRICT;
CREATE INDEX idx_partnerschaft_person_partnerschaft_id ON partnerschaft_person(partnerschaft_id);
CREATE INDEX idx_partnerschaft_person_person_id ON partnerschaft_person(person_id);

-- JOURNALISIERT
-- §2.6 Assoziation.
CREATE TABLE assoziation (
  id TEXT PRIMARY KEY,
  person_a_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  person_b_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: Beziehungskante -> RESTRICT
  art TEXT, -- offene Menge (50_Datenmodell.md §1 Ellipse), kein CHECK
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_assoziation_person_a_id ON assoziation(person_a_id);
CREATE INDEX idx_assoziation_person_b_id ON assoziation(person_b_id);

-- JOURNALISIERT
-- §2.7 Archiv.
CREATE TABLE archiv (
  id TEXT PRIMARY KEY,
  name TEXT,
  ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  kontakt TEXT,
  url TEXT,
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_archiv_ort_id ON archiv(ort_id);

-- JOURNALISIERT
-- §2.7 Quelle + §2.15 Ergänzung "mündlich".
CREATE TABLE quelle (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('kirchenbuch','standesamt','volkszaehlung','zeitung','grabstein','familienbesitz','literatur','website','muendlich','sonstiges')),
  titel TEXT,
  autor TEXT,
  verlag TEXT,
  jahr INTEGER,
  art TEXT CHECK (art IN ('original','derivat','verfasst')),
  informationsart TEXT CHECK (informationsart IN ('primaer','sekundaer','unbestimmt')),
  archiv_id TEXT REFERENCES archiv(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  signatur TEXT,
  notiz TEXT,
  informant_person_id TEXT REFERENCES person(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  gespraechsdatum_kalender TEXT CHECK (gespraechsdatum_kalender IN ('gregorian','julian','hebrew','french_r')),
  gespraechsdatum_modifikator TEXT CHECK (gespraechsdatum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  gespraechsdatum_praezision TEXT CHECK (gespraechsdatum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  gespraechsdatum_wert1 TEXT,
  gespraechsdatum_wert2 TEXT,
  gespraechsdatum_originaltext TEXT,
  gespraechsdatum_sort_von INTEGER,
  gespraechsdatum_sort_bis INTEGER,
  gespraechsdatum_zweitkalender TEXT CHECK (gespraechsdatum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  gespraechsdatum_zweitwert TEXT,
  gespraechsdatum_doppeljahr TEXT,
  form TEXT CHECK (form IN ('gespraech','telefonat','brief','email','audio','video')),
  unmittelbarkeit TEXT CHECK (unmittelbarkeit IN ('selbst_erlebt','vom_hoerensagen','unbekannt')),
  audio_medium_id TEXT REFERENCES medium(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_quelle_archiv_id ON quelle(archiv_id);
CREATE INDEX idx_quelle_informant_person_id ON quelle(informant_person_id);
CREATE INDEX idx_quelle_audio_medium_id ON quelle(audio_medium_id);

-- JOURNALISIERT
-- §2.7 Zitat.
CREATE TABLE zitat (
  id TEXT PRIMARY KEY,
  quelle_id TEXT NOT NULL REFERENCES quelle(id) ON DELETE CASCADE, -- E-4/E-5 Einzelfall explizit: CASCADE
  seite TEXT,
  eintragsnummer TEXT,
  band TEXT,
  jahr INTEGER,
  zugriffsdatum_kalender TEXT CHECK (zugriffsdatum_kalender IN ('gregorian','julian','hebrew','french_r')),
  zugriffsdatum_modifikator TEXT CHECK (zugriffsdatum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  zugriffsdatum_praezision TEXT CHECK (zugriffsdatum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  zugriffsdatum_wert1 TEXT,
  zugriffsdatum_wert2 TEXT,
  zugriffsdatum_originaltext TEXT,
  zugriffsdatum_sort_von INTEGER,
  zugriffsdatum_sort_bis INTEGER,
  zugriffsdatum_zweitkalender TEXT CHECK (zugriffsdatum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  zugriffsdatum_zweitwert TEXT,
  zugriffsdatum_doppeljahr TEXT,
  digitalisat_url TEXT,
  transkript TEXT,
  uebersetzung TEXT,
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  medium_id TEXT REFERENCES medium(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_zitat_quelle_id ON zitat(quelle_id);
CREATE INDEX idx_zitat_medium_id ON zitat(medium_id);

-- JOURNALISIERT
-- §2.7 Aussage.
CREATE TABLE aussage (
  id TEXT PRIMARY KEY,
  subjekt_typ TEXT NOT NULL CHECK (subjekt_typ IN ('person','ereignis','elternschaft','partnerschaft','ort','name')), -- E-7 Diskriminator zu subjekt_id
  subjekt_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK
  praedikat TEXT NOT NULL, -- E-6: freier TEXT, KEIN CHECK (offene Menge)
  wert_text TEXT,
  wert_zahl REAL,
  wert_ref_id TEXT, -- E-7: polymorph, bewusst kein FK; Verweisziel variabel (z.B. ort) - kein _typ nötig laut Modell
  datum_kalender TEXT CHECK (datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  datum_modifikator TEXT CHECK (datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  datum_praezision TEXT CHECK (datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  datum_wert1 TEXT,
  datum_wert2 TEXT,
  datum_originaltext TEXT,
  datum_sort_von INTEGER,
  datum_sort_bis INTEGER,
  datum_zweitkalender TEXT CHECK (datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  datum_zweitwert TEXT,
  datum_doppeljahr TEXT,
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  ist_bevorzugt INTEGER CHECK (ist_bevorzugt IS NULL OR ist_bevorzugt IN (0,1)),
  begruendung TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
-- §2.7 aussage_zitat. Verknüpfungstabelle ohne eigenes id.
CREATE TABLE aussage_zitat (
  aussage_id TEXT NOT NULL REFERENCES aussage(id) ON DELETE CASCADE, -- E-4/E-5 explizit (aussage_zitat.*): CASCADE
  zitat_id TEXT NOT NULL REFERENCES zitat(id) ON DELETE CASCADE, -- E-4/E-5 explizit (aussage_zitat.*): CASCADE
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (aussage_id, zitat_id)
) STRICT;
CREATE INDEX idx_aussage_zitat_aussage_id ON aussage_zitat(aussage_id);
CREATE INDEX idx_aussage_zitat_zitat_id ON aussage_zitat(zitat_id);

-- JOURNALISIERT
-- §2.7 Negativbefund. E-8: zeitraum_von/_bis sind einfache Spalten, keine Datumsgruppe.
CREATE TABLE negativbefund (
  id TEXT PRIMARY KEY,
  quelle_id TEXT REFERENCES quelle(id) ON DELETE SET NULL, -- Annahme: im Plan nicht gelistet - wie aufgabe.quelle_id als optionaler Verweis behandelt -> SET NULL.
  gesuchte_person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- Annahme: im Plan nicht gelistet - personengebundene Forschungsnotiz, analog diagnose.person_id -> CASCADE.
  gesuchtes_praedikat TEXT,
  zeitraum_von INTEGER, -- E-8: einfache Spalte
  zeitraum_bis INTEGER, -- E-8: einfache Spalte
  beschreibung TEXT,
  datum_der_pruefung TEXT, -- nicht in der Datumsgruppen-Liste der Konventionen - einfache Spalte
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_negativbefund_quelle_id ON negativbefund(quelle_id);
CREATE INDEX idx_negativbefund_gesuchte_person_id ON negativbefund(gesuchte_person_id);

-- JOURNALISIERT
-- §2.8 Persona (Phase 3, Tabelle ab Phase 0 angelegt - N.6).
CREATE TABLE persona (
  id TEXT PRIMARY KEY,
  zitat_id TEXT NOT NULL REFERENCES zitat(id) ON DELETE CASCADE, -- Annahme: im Plan nicht gelistet - "genau ein Beleg, unveränderlich" -> Komposition, CASCADE.
  rohdaten_json TEXT,
  person_id TEXT REFERENCES person(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  zuordnung_konfidenz INTEGER CHECK (zuordnung_konfidenz BETWEEN 1 AND 4), -- E-9
  zuordnung_begruendung TEXT,
  zuordnung_datum TEXT, -- E-8: einfache Spalte
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_persona_zitat_id ON persona(zitat_id);
CREATE INDEX idx_persona_person_id ON persona(person_id);

-- JOURNALISIERT
-- §2.9 Medium.
CREATE TABLE medium (
  id TEXT PRIMARY KEY,
  dateiname TEXT,
  relativer_pfad TEXT,
  hash TEXT,
  mime_typ TEXT,
  groesse INTEGER,
  titel TEXT,
  beschreibung TEXT,
  datum_kalender TEXT CHECK (datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  datum_modifikator TEXT CHECK (datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  datum_praezision TEXT CHECK (datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  datum_wert1 TEXT,
  datum_wert2 TEXT,
  datum_originaltext TEXT,
  datum_sort_von INTEGER,
  datum_sort_bis INTEGER,
  datum_zweitkalender TEXT CHECK (datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  datum_zweitwert TEXT,
  datum_doppeljahr TEXT,
  ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_medium_ort_id ON medium(ort_id);

-- JOURNALISIERT
-- §2.9 medium_zuordnung. Verknüpfungstabelle ohne eigenes id.
CREATE TABLE medium_zuordnung (
  medium_id TEXT NOT NULL REFERENCES medium(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  subjekt_typ TEXT NOT NULL CHECK (subjekt_typ IN ('person','ereignis','elternschaft','partnerschaft','ort','name')), -- E-7 Diskriminator zu subjekt_id. Annahme: keine eigene Werteliste im Modelltext - Wiederverwendung von aussage.subjekt_typ als naheliegendste Lösung, bitte prüfen.
  subjekt_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK
  ist_titelbild INTEGER CHECK (ist_titelbild IS NULL OR ist_titelbild IN (0,1)),
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (medium_id, subjekt_typ, subjekt_id)
) STRICT;
CREATE INDEX idx_medium_zuordnung_medium_id ON medium_zuordnung(medium_id);

-- JOURNALISIERT
-- §2.9 medium_region (Phase 5).
CREATE TABLE medium_region (
  id TEXT PRIMARY KEY,
  medium_id TEXT NOT NULL REFERENCES medium(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  person_id TEXT REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  x REAL, -- Annahme: normalisierte Koordinate (0..1), nicht Pixel - bitte prüfen
  y REAL,
  w REAL,
  h REAL,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_medium_region_medium_id ON medium_region(medium_id);
CREATE INDEX idx_medium_region_person_id ON medium_region(person_id);

-- NICHT_JOURNALISIERT
-- §2.10 merge_protokoll. E-3: NICHT_JOURNALISIERT (Protokoll einer Zusammenführung, kein Fachdatum).
CREATE TABLE merge_protokoll (
  id TEXT PRIMARY KEY,
  transaktion_id TEXT NOT NULL REFERENCES transaktion(id), -- wie aenderung.transaktion_id in 0001: kein ON DELETE (NO ACTION)
  ziel_person_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- Annahme: im Plan nicht gelistet - Beziehungskante zu einer konkreten Person -> RESTRICT.
  quell_person_id TEXT NOT NULL REFERENCES person(id) ON DELETE RESTRICT, -- Annahme: im Plan nicht gelistet - Beziehungskante zu einer konkreten Person -> RESTRICT.
  feldentscheidungen_json TEXT,
  begruendung TEXT,
  rueckgaengig_moeglich INTEGER CHECK (rueckgaengig_moeglich IS NULL OR rueckgaengig_moeglich IN (0,1)),
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_merge_protokoll_transaktion_id ON merge_protokoll(transaktion_id);
CREATE INDEX idx_merge_protokoll_ziel_person_id ON merge_protokoll(ziel_person_id);
CREATE INDEX idx_merge_protokoll_quell_person_id ON merge_protokoll(quell_person_id);

-- NICHT_JOURNALISIERT
-- §2.10 id_alias. E-3: NICHT_JOURNALISIERT.
CREATE TABLE id_alias (
  alte_id TEXT PRIMARY KEY, -- E-7: polymorph, bewusst kein FK
  neue_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK
  typ TEXT NOT NULL, -- Lücke: Datenmodell nennt keine Werteliste für diesen Diskriminator - kein CHECK, bitte nachtragen.
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
-- §2.11 Aufgabe.
CREATE TABLE aufgabe (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES person(id) ON DELETE SET NULL, -- E-4/E-5 explizit (aufgabe.*): SET NULL
  ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- E-4/E-5 explizit (aufgabe.*): SET NULL
  quelle_id TEXT REFERENCES quelle(id) ON DELETE SET NULL, -- E-4/E-5 explizit (aufgabe.*): SET NULL
  titel TEXT,
  beschreibung TEXT,
  prioritaet INTEGER, -- Lücke: keine Werteliste/Skala im Datenmodell genannt - kein CHECK, bitte nachtragen.
  status TEXT, -- Lücke: keine Werteliste im Datenmodell genannt - kein CHECK, bitte nachtragen.
  faellig_am TEXT, -- E-8: einfache Spalte
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_aufgabe_person_id ON aufgabe(person_id);
CREATE INDEX idx_aufgabe_ort_id ON aufgabe(ort_id);
CREATE INDEX idx_aufgabe_quelle_id ON aufgabe(quelle_id);

-- JOURNALISIERT
-- §2.12 Diagnose. M-08: aus jedem Export ausgeschlossen (Exportcode, nicht Schema).
CREATE TABLE diagnose (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  kategorie TEXT CHECK (kategorie IN ('herz_kreislauf','krebs','stoffwechsel','neuro_psych','atemwege','nieren','autoimmun','angeboren_genetisch','infektion','unfall','sonstiges')),
  organ TEXT, -- frei laut Modell ("…"), kein CHECK
  bezeichnung TEXT, -- freier Text laut Modell, kein CHECK
  icd10 TEXT,
  erstdiagnose_kalender TEXT CHECK (erstdiagnose_kalender IN ('gregorian','julian','hebrew','french_r')),
  erstdiagnose_modifikator TEXT CHECK (erstdiagnose_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  erstdiagnose_praezision TEXT CHECK (erstdiagnose_praezision IN ('tag','monat','jahr','jahrzehnt')),
  erstdiagnose_wert1 TEXT,
  erstdiagnose_wert2 TEXT,
  erstdiagnose_originaltext TEXT,
  erstdiagnose_sort_von INTEGER,
  erstdiagnose_sort_bis INTEGER,
  erstdiagnose_zweitkalender TEXT CHECK (erstdiagnose_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  erstdiagnose_zweitwert TEXT,
  erstdiagnose_doppeljahr TEXT,
  alter_bei_diagnose INTEGER,
  status TEXT CHECK (status IN ('bestehend','geheilt','todesursache','unbekannt')),
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_diagnose_person_id ON diagnose(person_id);

-- JOURNALISIERT
-- §2.12 Risikofaktor. M-08: aus jedem Export ausgeschlossen (Exportcode, nicht Schema).
CREATE TABLE risikofaktor (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  art TEXT CHECK (art IN ('rauchen','alkohol','beruf_exposition','umwelt','uebergewicht','bewegungsmangel','ernaehrung','sonstiges')),
  detail TEXT, -- freier Text laut Modell, kein CHECK
  intensitaet TEXT CHECK (intensitaet IN ('gering','mittel','hoch','unbekannt')),
  beginn_kalender TEXT CHECK (beginn_kalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_modifikator TEXT CHECK (beginn_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  beginn_praezision TEXT CHECK (beginn_praezision IN ('tag','monat','jahr','jahrzehnt')),
  beginn_wert1 TEXT,
  beginn_wert2 TEXT,
  beginn_originaltext TEXT,
  beginn_sort_von INTEGER,
  beginn_sort_bis INTEGER,
  beginn_zweitkalender TEXT CHECK (beginn_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_zweitwert TEXT,
  beginn_doppeljahr TEXT,
  ende_kalender TEXT CHECK (ende_kalender IN ('gregorian','julian','hebrew','french_r')),
  ende_modifikator TEXT CHECK (ende_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  ende_praezision TEXT CHECK (ende_praezision IN ('tag','monat','jahr','jahrzehnt')),
  ende_wert1 TEXT,
  ende_wert2 TEXT,
  ende_originaltext TEXT,
  ende_sort_von INTEGER,
  ende_sort_bis INTEGER,
  ende_zweitkalender TEXT CHECK (ende_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  ende_zweitwert TEXT,
  ende_doppeljahr TEXT,
  quelle_beruf_id TEXT REFERENCES aussage(id) ON DELETE SET NULL, -- E-10 explizit: FK auf aussage(id), SET NULL, kein polymorpher Fall
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_risikofaktor_person_id ON risikofaktor(person_id);
CREATE INDEX idx_risikofaktor_quelle_beruf_id ON risikofaktor(quelle_beruf_id);

-- JOURNALISIERT
-- §2.13 feld_definition.
CREATE TABLE feld_definition (
  id TEXT PRIMARY KEY,
  schluessel TEXT NOT NULL UNIQUE, -- Annahme: "technisch, unveränderlich" impliziert Eindeutigkeit -> UNIQUE, bitte prüfen.
  bezeichnung TEXT,
  beschreibung TEXT,
  gilt_fuer TEXT CHECK (gilt_fuer IN ('person','ereignis','ort','quelle','partnerschaft')),
  datentyp TEXT CHECK (datentyp IN ('text','langtext','zahl','datum','auswahl','mehrfachauswahl','ja_nein','ort_ref','person_ref','url','medium_ref')),
  ist_mehrfach INTEGER CHECK (ist_mehrfach IS NULL OR ist_mehrfach IN (0,1)),
  hat_zeitraum INTEGER CHECK (hat_zeitraum IS NULL OR hat_zeitraum IN (0,1)),
  gruppe TEXT,
  reihenfolge INTEGER,
  ist_system INTEGER CHECK (ist_system IS NULL OR ist_system IN (0,1)),
  ist_sensibel INTEGER CHECK (ist_sensibel IS NULL OR ist_sensibel IN (0,1)),
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
-- §2.13 feld_auswahloption.
CREATE TABLE feld_auswahloption (
  id TEXT PRIMARY KEY,
  feld_definition_id TEXT NOT NULL REFERENCES feld_definition(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  wert TEXT,
  bezeichnung TEXT,
  reihenfolge INTEGER,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_feld_auswahloption_feld_definition_id ON feld_auswahloption(feld_definition_id);

-- JOURNALISIERT
-- §2.13 feld_wert.
CREATE TABLE feld_wert (
  id TEXT PRIMARY KEY,
  feld_definition_id TEXT NOT NULL REFERENCES feld_definition(id) ON DELETE RESTRICT, -- E-4/E-5 explizit: RESTRICT
  subjekt_typ TEXT NOT NULL CHECK (subjekt_typ IN ('person','ereignis','ort','quelle','partnerschaft')), -- E-7 Diskriminator zu subjekt_id. Annahme: gleiche Werteliste wie feld_definition.gilt_fuer (der Wert muss dazu passen), bitte prüfen.
  subjekt_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK
  wert_text TEXT,
  wert_zahl REAL,
  wert_ref_id TEXT, -- E-7: polymorph, bewusst kein FK, kein _typ nötig laut Plan
  wert_datum_kalender TEXT CHECK (wert_datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  wert_datum_modifikator TEXT CHECK (wert_datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  wert_datum_praezision TEXT CHECK (wert_datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  wert_datum_wert1 TEXT,
  wert_datum_wert2 TEXT,
  wert_datum_originaltext TEXT,
  wert_datum_sort_von INTEGER,
  wert_datum_sort_bis INTEGER,
  wert_datum_zweitkalender TEXT CHECK (wert_datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  wert_datum_zweitwert TEXT,
  wert_datum_doppeljahr TEXT,
  gueltig_von INTEGER,
  gueltig_bis INTEGER,
  reihenfolge INTEGER,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_feld_wert_feld_definition_id ON feld_wert(feld_definition_id);

-- JOURNALISIERT
-- §2.15 interview_sitzung.
CREATE TABLE interview_sitzung (
  id TEXT PRIMARY KEY,
  informant_person_id TEXT REFERENCES person(id) ON DELETE SET NULL, -- Annahme: im Plan nicht gelistet - analog quelle.informant_person_id (explizit SET NULL) behandelt.
  datum_kalender TEXT CHECK (datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  datum_modifikator TEXT CHECK (datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  datum_praezision TEXT CHECK (datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  datum_wert1 TEXT,
  datum_wert2 TEXT,
  datum_originaltext TEXT,
  datum_sort_von INTEGER,
  datum_sort_bis INTEGER,
  datum_zweitkalender TEXT CHECK (datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  datum_zweitwert TEXT,
  datum_doppeljahr TEXT,
  ort_id TEXT REFERENCES ort(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  audio_medium_id TEXT REFERENCES medium(id) ON DELETE SET NULL, -- E-4/E-5 explizit: SET NULL
  notizen TEXT,
  status TEXT, -- Lücke: keine Werteliste im Datenmodell genannt - kein CHECK, bitte nachtragen.
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_interview_sitzung_informant_person_id ON interview_sitzung(informant_person_id);
CREATE INDEX idx_interview_sitzung_ort_id ON interview_sitzung(ort_id);
CREATE INDEX idx_interview_sitzung_audio_medium_id ON interview_sitzung(audio_medium_id);

-- JOURNALISIERT
-- N.4 import_lauf.
CREATE TABLE import_lauf (
  id TEXT PRIMARY KEY,
  datei TEXT,
  pruefsumme TEXT,
  vertragsversion TEXT,
  zeitpunkt INTEGER,
  transaktion_id TEXT NOT NULL REFERENCES transaktion(id), -- wie aenderung.transaktion_id in 0001: kein ON DELETE (NO ACTION)
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_import_lauf_transaktion_id ON import_lauf(transaktion_id);

-- JOURNALISIERT
-- N.4 import_herkunft: verdichtete Zuordnung Datensatz <-> Importlauf. Spaltenliste im Modelltext nur narrativ beschrieben, hier aus dem Zweck abgeleitet (Annahme, bitte prüfen).
CREATE TABLE import_herkunft (
  id TEXT PRIMARY KEY,
  import_lauf_id TEXT NOT NULL REFERENCES import_lauf(id) ON DELETE CASCADE, -- Plan explizit: CASCADE
  datensatz_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK (Plan explizit)
  datensatz_typ TEXT NOT NULL, -- E-7 Diskriminator zu datensatz_id. Lücke: keine Werteliste im Datenmodell genannt (Zieltabellenname) - kein CHECK, bitte nachtragen.
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_import_herkunft_import_lauf_id ON import_herkunft(import_lauf_id);

-- JOURNALISIERT
-- N.4 ansicht_zustand: gespeicherte Ansichten. Spaltenliste im Modelltext nur narrativ beschrieben ("Zentrumsperson, Filter") - hier minimal abgeleitet (Annahme, bitte prüfen).
CREATE TABLE ansicht_zustand (
  id TEXT PRIMARY KEY,
  name TEXT,
  zentrumsperson_id TEXT REFERENCES person(id) ON DELETE SET NULL, -- Plan explizit (Zentrumsperson): SET NULL
  filter_json TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
CREATE INDEX idx_ansicht_zustand_zentrumsperson_id ON ansicht_zustand(zentrumsperson_id);
