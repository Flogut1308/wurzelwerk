// Gemeinsame Bausteine für src/shared/schemata/*.ts (AP-0.6): Datumsgruppe (50_Datenmodell.md
// §2.3 + N.1), Konfidenzskala (E-1/E-9, vier Stufen, N.1), der wiederverwendete
// subjekt_typ-Diskriminator (E-7) und die INTEGER-0/1-Boolean-Konvention (CLAUDE.md §4 STRICT).
import { z } from 'zod'

export const KalenderEnum = z.enum(['gregorian', 'julian', 'hebrew', 'french_r'])
export const DatumModifikatorEnum = z.enum([
  'exakt',
  'etwa',
  'vor',
  'nach',
  'zwischen',
  'von_bis',
  'geschaetzt',
  'berechnet',
])
export const DatumPraezisionEnum = z.enum(['tag', 'monat', 'jahr', 'jahrzehnt'])

/** Vier Stufen, verbindlich (N.1, E-1/E-9) — CHECK (konfidenz BETWEEN 1 AND 4) im SQL. */
export const KonfidenzSchema = z.number().int().min(1).max(4)

/** STRICT kennt kein BOOLEAN — Spalten sind INTEGER mit CHECK (spalte IN (0,1)). */
export const BoolWert = z.union([z.literal(0), z.literal(1)])

/**
 * E-7: Diskriminator für die polymorphe `subjekt_id`-Spalte in `medium_zuordnung` (Annahme, siehe
 * SQL-Kommentar) — sechs Werte. `aussage.subjekt_typ` hat seit Migration 0005 (AP-1.3c, ADR-026)
 * zwei weitere Werte und führt darum ein eigenes `AussageSubjektTypEnum` (s.u.), statt dieses hier
 * wiederzuverwenden.
 */
export const SubjektTypEnum = z.enum(['person', 'ereignis', 'elternschaft', 'partnerschaft', 'ort', 'name'])

/**
 * E-7: Diskriminator für die polymorphe `subjekt_id`-Spalte in `aussage`. Acht Werte seit Migration
 * 0005 (AP-1.3c, ADR-026, `docs/schema/0005_import_luecken.sql`): `56_Import_Vertrag.md` §2.3
 * verlangt `belege` auch für Diagnose und Risikofaktor, darum um `'diagnose'`/`'risikofaktor'`
 * erweitert gegenüber `SubjektTypEnum` (das für `medium_zuordnung`/Import bei sechs Werten bleibt).
 */
export const AussageSubjektTypEnum = z.enum([
  'person',
  'ereignis',
  'elternschaft',
  'partnerschaft',
  'ort',
  'name',
  'diagnose',
  'risikofaktor',
])

/**
 * Deckt sich mit `feld_definition.gilt_fuer` — für `feld_wert.subjekt_typ` wiederverwendet
 * (Annahme, siehe SQL-Kommentar): der Wert muss zur `gilt_fuer`-Domäne der referenzierten
 * `feld_definition` passen.
 */
export const FeldGiltFuerEnum = z.enum(['person', 'ereignis', 'ort', 'quelle', 'partnerschaft'])
