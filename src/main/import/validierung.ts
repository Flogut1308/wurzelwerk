// Stufe 1 des Import-Vertrags (56_Import_Vertrag.md §4): Schemaprüfung einer rohen Importdatei.
// Kein `throw` — jeder Ausgang ist ein Befund. Kein DB-Zugriff, kein `fs`: der Rohtext kommt von
// außen (Aufrufer liest die Datei), diese Funktion prüft nur Text → Struktur.
import { z } from 'zod'
import { importDateiSchema, KENNUNG_REGEX } from '../../shared/schemata/import-v1'
import { ALLE_IMP_CODES, type ImpCode, type Stufe1Befund } from '../../shared/import/imp-codes'

export interface Stufe1Ergebnis {
  readonly akzeptiert: boolean
  readonly befunde: readonly Stufe1Befund[]
}

/** Die Feldnamen, die sowohl unter `zusammenfassung.*` als auch als Array auf der Wurzel stehen
 * (§3.1). Als eigener Typ statt `keyof ImportDatei`, weil `ImportDatei` auch Felder trägt
 * (`vertrag`, `erzeugt`, …), die in `Zusammenfassung` gar nicht vorkommen. */
type ZusammenfassungFeld =
  | 'personen'
  | 'orte'
  | 'ereignisse'
  | 'elternschaften'
  | 'partnerschaften'
  | 'aussagen'
  | 'diagnosen'
  | 'risikofaktoren'
  | 'medien'
  | 'notizen_unverarbeitet'

const ZUSAMMENFASSUNG_FELDER: readonly ZusammenfassungFeld[] = [
  'personen',
  'orte',
  'ereignisse',
  'elternschaften',
  'partnerschaften',
  'aussagen',
  'diagnosen',
  'risikofaktoren',
  'medien',
  'notizen_unverarbeitet',
]

const VERTRAGS_KENNUNG = 'wurzelwerk-import/v1'

/**
 * Prüft eine rohe Importdatei gegen Stufe 1 des Vertrags (§4 IMP-101…IMP-107). Ablauf exakt in
 * dieser Reihenfolge, jede Stufe bricht bei einem Treffer sofort ab (§4):
 * (a) JSON.parse — Fehler ⇒ IMP-101.
 * (b) `vertrag` fehlt/unbekannt ⇒ IMP-102.
 * (c) Zod-Schemaprüfung — jedes Issue wird auf genau einen IMP-Code abgebildet.
 * (d) nur wenn (c) keine Befunde ergab: `zusammenfassung` gegen die tatsächlichen Arraylängen
 *     abgleichen ⇒ IMP-105.
 */
export function pruefeStufe1(rohtext: string, datei: string): Stufe1Ergebnis {
  let daten: unknown
  try {
    daten = JSON.parse(rohtext)
  } catch {
    return { akzeptiert: false, befunde: [{ schweregrad: 'fehler', code: 'IMP-101', pfad: '', datei }] }
  }

  if (!istRecord(daten) || daten['vertrag'] !== VERTRAGS_KENNUNG) {
    return { akzeptiert: false, befunde: [{ schweregrad: 'fehler', code: 'IMP-102', pfad: 'vertrag', datei }] }
  }

  const ergebnis = importDateiSchema.safeParse(daten)
  if (!ergebnis.success) {
    const befunde = dedupliziere(ergebnis.error.issues.map((issue) => issueZuBefund(issue, daten, datei)))
    return { akzeptiert: false, befunde }
  }

  const zusammenfassungBefunde = pruefeZusammenfassung(ergebnis.data, datei)
  if (zusammenfassungBefunde.length > 0) {
    return { akzeptiert: false, befunde: zusammenfassungBefunde }
  }

  return { akzeptiert: true, befunde: [] }
}

function pruefeZusammenfassung(daten: z.infer<typeof importDateiSchema>, datei: string): readonly Stufe1Befund[] {
  const befunde: Stufe1Befund[] = []
  for (const feld of ZUSAMMENFASSUNG_FELDER) {
    const erwartet = daten.zusammenfassung[feld]
    if (erwartet === undefined) continue
    const tatsaechlich = daten[feld]?.length ?? 0
    if (tatsaechlich !== erwartet) {
      befunde.push({ schweregrad: 'fehler', code: 'IMP-105', pfad: `zusammenfassung.${feld}`, datei })
    }
  }
  return befunde
}

function issueZuBefund(issue: z.core.$ZodIssue, daten: unknown, datei: string): Stufe1Befund {
  const pfad = pfadZuText(issue.path)
  const code = ermittleImpCode(issue, daten)
  const kennung = kennungAusPfad(issue.path, daten)
  const basis = { schweregrad: 'fehler' as const, code, pfad, datei }
  return kennung === undefined ? basis : { ...basis, kennung }
}

function ermittleImpCode(issue: z.core.$ZodIssue, daten: unknown): ImpCode {
  switch (issue.code) {
    case 'custom':
      return leseImpCodeParam(issue) ?? 'IMP-104'
    case 'invalid_type':
      // Ein Zod-`invalid_type`-Issue entsteht sowohl bei fehlendem Pflichtfeld (Wert an diesem
      // Pfad existiert im Rohobjekt gar nicht) als auch bei einem vorhandenen, falsch typisierten
      // Wert. Zod liefert dafür kein unterscheidbares Merkmal am Issue selbst — deshalb wird der
      // Rohtext (vor Zod) direkt am Pfad geprüft.
      return pfadHatWert(daten, issue.path) ? 'IMP-104' : 'IMP-103'
    case 'invalid_format':
      return issue.pattern === KENNUNG_REGEX.toString() ? 'IMP-107' : 'IMP-104'
    default:
      return 'IMP-104'
  }
}

function leseImpCodeParam(issue: z.core.$ZodIssue): ImpCode | undefined {
  if (issue.code !== 'custom') return undefined
  // `issue.params` ist bei Zod als `Record<string, any> | undefined` typisiert — sofort auf
  // `unknown` verengt, damit kein `any` weitergereicht wird (CLAUDE.md §4).
  const params: Record<string, unknown> | undefined = issue.params
  if (params === undefined) return undefined
  const wert = params['impCode']
  return typeof wert === 'string' && istImpCode(wert) ? wert : undefined
}

function istImpCode(wert: string): wert is ImpCode {
  return (ALLE_IMP_CODES as readonly string[]).includes(wert)
}

function dedupliziere(befunde: readonly Stufe1Befund[]): readonly Stufe1Befund[] {
  const gesehen = new Set<string>()
  const ergebnis: Stufe1Befund[] = []
  for (const befund of befunde) {
    const schluessel = `${befund.code}|${befund.pfad}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    ergebnis.push(befund)
  }
  return ergebnis
}

function pfadZuText(pfad: readonly PropertyKey[]): string {
  let text = ''
  for (const teil of pfad) {
    if (typeof teil === 'number') {
      text += `[${teil}]`
    } else {
      text += text.length > 0 ? `.${String(teil)}` : String(teil)
    }
  }
  return text
}

/** Bestbemühte „betroffene Kennung" (§5 Punkt 3): die letzte `id` eines Objekts entlang des
 * Pfads. Nicht jede Entität hat ein `id`-Feld (z. B. Elternschaft, Beteiligung) — dann bleibt
 * `kennung` unbestimmt, was das optionale Feld auf `Stufe1Befund` zulässt. */
function kennungAusPfad(pfad: readonly PropertyKey[], daten: unknown): string | undefined {
  let aktuell: unknown = daten
  let gefunden: string | undefined
  for (const teil of pfad) {
    if (typeof teil === 'number') {
      if (!istArray(aktuell) || teil >= aktuell.length) break
      aktuell = aktuell[teil]
      if (istRecord(aktuell) && typeof aktuell['id'] === 'string') {
        gefunden = aktuell['id']
      }
      continue
    }
    if (!istRecord(aktuell)) break
    aktuell = aktuell[String(teil)]
  }
  return gefunden
}

/** Prüft, ob am gegebenen JSON-Pfad im rohen (noch nicht von Zod verarbeiteten) Objekt
 * überhaupt ein Wert steht — die Grundlage für IMP-103 (fehlt) vs. IMP-104 (falscher Wert). */
function pfadHatWert(daten: unknown, pfad: readonly PropertyKey[]): boolean {
  let aktuell: unknown = daten
  for (const teil of pfad) {
    if (typeof teil === 'number') {
      if (!istArray(aktuell) || teil >= aktuell.length) return false
      aktuell = aktuell[teil]
      continue
    }
    if (!istRecord(aktuell)) return false
    const schluessel = String(teil)
    if (!Object.prototype.hasOwnProperty.call(aktuell, schluessel)) return false
    aktuell = aktuell[schluessel]
  }
  return true
}

function istRecord(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

function istArray(wert: unknown): wert is readonly unknown[] {
  return Array.isArray(wert)
}
