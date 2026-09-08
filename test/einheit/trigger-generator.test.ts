// AP-0.8, test/einheit/trigger-generator.test.ts: reine Funktion `jrnTriggerFuerTabelle`
// (skripte/trigger-generieren.ts) gegen eine feste, fiktive Beispieltabelle — Golden-String, keine
// Datenbank beteiligt (55_Architektur.md §4.3, ADR-017-Vorlage).
import { describe, expect, it } from 'vitest'
import { jrnTriggerFuerTabelle } from '../../skripte/trigger-generieren'

const AKTIV_BEDINGUNG = '(SELECT aktiv FROM journal_kontext WHERE id = 1) = 1'
const TRANSAKTION_ID_SQL = '(SELECT transaktion_id FROM journal_kontext WHERE id = 1)'
const REIHENFOLGE_SQL = `(SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = ${TRANSAKTION_ID_SQL})`
const SPALTEN_LISTE = 'id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation'

describe('skripte/trigger-generieren — jrnTriggerFuerTabelle', () => {
  it('einfacher Primärschlüssel (eine Spalte): erzeugt die drei erwarteten Trigger wortgleich', () => {
    const ergebnis = jrnTriggerFuerTabelle('beispiel', ['id', 'wert'], ['id'])

    const erwartet = `CREATE TRIGGER jrn_beispiel_ai AFTER INSERT ON beispiel
WHEN ${AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${SPALTEN_LISTE})
  VALUES (uuid7(), ${TRANSAKTION_ID_SQL}, ${REIHENFOLGE_SQL}, 'beispiel', NEW.id, NULL, json_object('id', NEW.id, 'wert', NEW.wert), 'insert');
END;

CREATE TRIGGER jrn_beispiel_au AFTER UPDATE ON beispiel
WHEN ${AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${SPALTEN_LISTE})
  VALUES (uuid7(), ${TRANSAKTION_ID_SQL}, ${REIHENFOLGE_SQL}, 'beispiel', OLD.id, json_object('id', OLD.id, 'wert', OLD.wert), json_object('id', NEW.id, 'wert', NEW.wert), 'update');
END;

CREATE TRIGGER jrn_beispiel_ad AFTER DELETE ON beispiel
WHEN ${AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${SPALTEN_LISTE})
  VALUES (uuid7(), ${TRANSAKTION_ID_SQL}, ${REIHENFOLGE_SQL}, 'beispiel', OLD.id, json_object('id', OLD.id, 'wert', OLD.wert), NULL, 'delete');
END;`

    expect(ergebnis).toBe(erwartet)
  })

  it('zusammengesetzter Primärschlüssel: INSERT-Trigger benutzt NEW.a || \'|\' || NEW.b als datensatz_id', () => {
    const ergebnis = jrnTriggerFuerTabelle('verknuepfung', ['a', 'b', 'c'], ['a', 'b'])
    const aiTrigger = ergebnis.split('\n\n')[0]
    expect(aiTrigger).toContain("'verknuepfung', NEW.a || '|' || NEW.b, NULL,")
    expect(aiTrigger).toContain("json_object('a', NEW.a, 'b', NEW.b, 'c', NEW.c)")
  })

  it('zusammengesetzter Primärschlüssel: UPDATE/DELETE-Trigger benutzen OLD.a || \'|\' || OLD.b als datensatz_id', () => {
    const ergebnis = jrnTriggerFuerTabelle('verknuepfung', ['a', 'b', 'c'], ['a', 'b'])
    const [, auTrigger, adTrigger] = ergebnis.split('\n\n')
    expect(auTrigger).toContain("'verknuepfung', OLD.a || '|' || OLD.b,")
    expect(adTrigger).toContain("'verknuepfung', OLD.a || '|' || OLD.b,")
  })

  it('reproduzierbar: zweimaliger Aufruf mit denselben Argumenten liefert dasselbe Ergebnis', () => {
    const einmal = jrnTriggerFuerTabelle('beispiel', ['id', 'wert'], ['id'])
    const zweimal = jrnTriggerFuerTabelle('beispiel', ['id', 'wert'], ['id'])
    expect(einmal).toBe(zweimal)
  })
})
