-- Migration 0009 (Vorarbeiten AP-1.30, PR 3). Reine Datenmigration: keine Tabelle, keine Spalte,
-- kein Index, kein Trigger. Die Oberfläche legte bis Schema 8 jedes Ereignis mit der Profilperson
-- als `hauptperson` an — auch den Tod. Fachlich ist die Rolle dort `verstorbener`. Umgestellt wird
-- nur der Tod; die Geburt bleibt offen (docs/80 V-E4-geburt) und behält `hauptperson`.
--
-- Läuft wie jede Migration bei ausgeschaltetem Journal (laeufer.ts, `journalAus`): die Umstellung
-- erzeugt keine `aenderung`-Zeilen, und `aenderung` wird hier weder geändert noch gelöscht.
--
-- 1. Journal-Schnitt (zuerst). Die bestehenden `aenderung`-Zeilen tragen den alten Zustand
--    (`hauptperson` am Tod) als vollständige Zeilenbilder. Ein Undo oder Redo würde ihn
--    zurückschreiben. Ein „Tod-Hauptperson-Ereignis“ ist ein Ereignis, das heute `typ = 'tod'`
--    hat oder im Journal je hatte, UND an dem heute oder laut Journal je eine
--    `hauptperson`-Beteiligung stand. Betroffen ist jede Transaktion, die
--      a) eine `beteiligung`-Zeile mit `rolle = 'hauptperson'` (alt oder neu) an einem solchen
--         Ereignis berührt, oder
--      b) ein solches Ereignis selbst berührt (z. B. `ereignis.aendern` geburt → tod: ein Undo
--         setzte den Typ zurück und ließe `verstorbener` an einer Geburt stehen).
--    Ein Tod, an dem nie eine `hauptperson` stand, löst keinen Schnitt aus.
--    Alle angewendeten Transaktionen bis einschließlich der jüngsten betroffenen (nach `lfd`)
--    verlieren `rueckgaengig_moeglich` — ein zusammenhängender Anfang wie beim Aufräumen
--    (src/main/journal/aufraeumen.ts), damit das lineare Undo nicht über einen Schnitt springt.
--    Ist eine zurückgenommene Transaktion betroffen, wird der ganze Redo-Stapel verworfen
--    (`zurueckgenommen` → `verworfen`, wie `redoStapelVerwerfen`): REDO_ZIEL_SQL prüft
--    `rueckgaengig_moeglich` nicht. Keine neue `transaktion`-Zeile. Nichts betroffen → nichts
--    geändert.
-- 2. Datenumstellung: `hauptperson` → `verstorbener` an Ereignissen `typ = 'tod'`. Hat dieselbe
--    Person im selben Ereignis schon `verstorbener`, bleibt die `hauptperson`-Zeile unverändert
--    stehen (nichts wird gelöscht). `id`, `person_id`, `reihenfolge` und Zeitstempel bleiben.
--
-- Ohne TEMP-Tabellen: die Menge der betroffenen Transaktionen steht je Anweisung als CTE, damit
-- kein Hilfsobjekt im Verbindungsschema zurückbleibt oder mit einem gleichnamigen kollidiert.

WITH
  tod_ereignis(id) AS (
    SELECT id FROM ereignis WHERE typ = 'tod'
    UNION
    SELECT datensatz_id FROM aenderung
     WHERE tabelle = 'ereignis'
       AND 'tod' IN (json_extract(wert_alt_json, '$.typ'), json_extract(wert_neu_json, '$.typ'))
  ),
  hauptperson_ereignis(id) AS (
    SELECT ereignis_id FROM beteiligung WHERE rolle = 'hauptperson'
    UNION
    SELECT json_extract(wert_alt_json, '$.ereignis_id') FROM aenderung
     WHERE tabelle = 'beteiligung' AND json_extract(wert_alt_json, '$.rolle') = 'hauptperson'
    UNION
    SELECT json_extract(wert_neu_json, '$.ereignis_id') FROM aenderung
     WHERE tabelle = 'beteiligung' AND json_extract(wert_neu_json, '$.rolle') = 'hauptperson'
  ),
  haupt_tod_ereignis(id) AS (
    SELECT id FROM tod_ereignis WHERE id IN (SELECT id FROM hauptperson_ereignis)
  ),
  betroffen(id) AS (
    SELECT transaktion_id FROM aenderung
     WHERE tabelle = 'beteiligung'
       AND 'hauptperson' IN (json_extract(wert_alt_json, '$.rolle'), json_extract(wert_neu_json, '$.rolle'))
       AND (json_extract(wert_alt_json, '$.ereignis_id') IN (SELECT id FROM haupt_tod_ereignis)
            OR json_extract(wert_neu_json, '$.ereignis_id') IN (SELECT id FROM haupt_tod_ereignis))
    UNION
    SELECT transaktion_id FROM aenderung
     WHERE tabelle = 'ereignis' AND datensatz_id IN (SELECT id FROM haupt_tod_ereignis)
  )
UPDATE transaktion SET rueckgaengig_moeglich = 0
 WHERE status = 'angewendet'
   AND rueckgaengig_moeglich <> 0
   AND lfd <= (SELECT MAX(t.lfd) FROM transaktion t
                WHERE t.status = 'angewendet' AND t.id IN (SELECT id FROM betroffen));

WITH
  tod_ereignis(id) AS (
    SELECT id FROM ereignis WHERE typ = 'tod'
    UNION
    SELECT datensatz_id FROM aenderung
     WHERE tabelle = 'ereignis'
       AND 'tod' IN (json_extract(wert_alt_json, '$.typ'), json_extract(wert_neu_json, '$.typ'))
  ),
  hauptperson_ereignis(id) AS (
    SELECT ereignis_id FROM beteiligung WHERE rolle = 'hauptperson'
    UNION
    SELECT json_extract(wert_alt_json, '$.ereignis_id') FROM aenderung
     WHERE tabelle = 'beteiligung' AND json_extract(wert_alt_json, '$.rolle') = 'hauptperson'
    UNION
    SELECT json_extract(wert_neu_json, '$.ereignis_id') FROM aenderung
     WHERE tabelle = 'beteiligung' AND json_extract(wert_neu_json, '$.rolle') = 'hauptperson'
  ),
  haupt_tod_ereignis(id) AS (
    SELECT id FROM tod_ereignis WHERE id IN (SELECT id FROM hauptperson_ereignis)
  ),
  betroffen(id) AS (
    SELECT transaktion_id FROM aenderung
     WHERE tabelle = 'beteiligung'
       AND 'hauptperson' IN (json_extract(wert_alt_json, '$.rolle'), json_extract(wert_neu_json, '$.rolle'))
       AND (json_extract(wert_alt_json, '$.ereignis_id') IN (SELECT id FROM haupt_tod_ereignis)
            OR json_extract(wert_neu_json, '$.ereignis_id') IN (SELECT id FROM haupt_tod_ereignis))
    UNION
    SELECT transaktion_id FROM aenderung
     WHERE tabelle = 'ereignis' AND datensatz_id IN (SELECT id FROM haupt_tod_ereignis)
  )
UPDATE transaktion SET status = 'verworfen'
 WHERE status = 'zurueckgenommen'
   AND EXISTS (SELECT 1 FROM transaktion t
                WHERE t.status = 'zurueckgenommen' AND t.id IN (SELECT id FROM betroffen));

UPDATE beteiligung SET rolle = 'verstorbener'
 WHERE rolle = 'hauptperson'
   AND ereignis_id IN (SELECT id FROM ereignis WHERE typ = 'tod')
   AND NOT EXISTS (SELECT 1 FROM beteiligung b2
                    WHERE b2.ereignis_id = beteiligung.ereignis_id
                      AND b2.person_id = beteiligung.person_id
                      AND b2.rolle = 'verstorbener');
