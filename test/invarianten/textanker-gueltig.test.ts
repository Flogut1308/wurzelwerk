// AP-1.34 PR-B2 — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). ADR-009 §2, Nachtrag
// 24.09.2026 (Beleg-Invarianten): „Jeder gesetzte Textanker liegt gültig in seinem Transkript und
// überlebt eine Transkriptänderung nur bei gleichem Ausschnitt an gleicher Stelle (E4)" und
// „`feld` nur an Existenz-Aussagen, passend zum Subjekttyp" (docs/80_Offene_Fragen.md §31
// U-1.34-E4/F1/F4/C1b-feld-praedikat).
//
// WARUM NEBEN `undo-bitgleich.test.ts`: dort nimmt das Journal jedes UPDATE zurück — ein
// Logikfehler in der Entwertung (Anker bleibt stehen, obwohl sich der Ausschnitt geändert hat;
// falsche Verknüpfung entwertet; `feld` mit gelöscht) wird bitgleich zurückgenommen und fällt dort
// NIE auf. Diese Invariante prüft den Zustand selbst, nach JEDEM Schritt einer Befehlsfolge aus
// demselben Generator (`_befehlsfolge-generator.ts`, Beleg-Teil `_befehlsfolge-beleg.ts`):
//
// - I1 (F4, 0007): jede Verknüpfung mit Anker hat ein Transkript (nicht NULL), ganzzahlige Grenzen,
//   `0 ≤ von < bis ≤ Länge` (UTF-16-Codeeinheiten) und keine Grenze zwischen High- und
//   Low-Surrogate. UNABHÄNGIG nachgebildet (`ankerVerstoesse()`), nicht über `ankerPruefen` — sonst
//   prüfte der Test die Produktivregel mit sich selbst.
// - I2 (E4) um jeden Schritt, Vorher/Nachher: hat sich das Transkript eines Zitats geändert, bleibt
//   ein Anker genau dann, wenn das neue Transkript nicht NULL ist, `bis ≤ neu.length` und
//   `neu.slice(von, bis) === alt.slice(von, bis)` — dann ist die ganze Zeile unverändert; sonst sind
//   beide Grenzen NULL, `feld` und `erstellt_am` unverändert. Verknüpfungen ohne Anker und alle
//   Verknüpfungen von Zitaten mit unverändertem Transkript bleiben vollständig unverändert
//   (einschließlich `geaendert_am`). Einzige Ausnahme: die Verknüpfung, die der Schritt per
//   `aussage_zitat.aendern` bearbeitet hat — sie trägt danach genau die angeforderten Werte
//   (`zustand.belegAenderung`; beim No-op die alten).
// - I3 (F1, C1b-feld-praedikat): `feld ≠ NULL` nur an einer Existenz-Aussage und nur mit einem Wert
//   aus `BELEG_FELDER_JE_SUBJEKT[subjekt_typ]`.
//
// I1 und I3 gelten zusätzlich nach JEDEM Undo-Schritt bis zum Anfang (Undo darf keinen ungültigen
// Anker/`feld` zurückbringen). Nach dem Undo eines Schritts, der einen Anker entwertet hat, muss
// `aussage_zitat` wieder genau dem Stand vor diesem Schritt entsprechen (Zweig „Undo einer
// Entwertung").
//
// DECKUNG (Eigentümer-Entscheidung E-B2-1 (c)): jeder Beleg-Zweig (`BELEG_PFLICHTZWEIGE`) und
// „Undo einer Entwertung" müssen über `{ seed, numRuns }` mehr als 0 Treffer haben — sonst ist die
// Invariante für diesen Fall leer grün. Fällt ein Zähler auf 0, wird die Gewichtung im Generator
// korrigiert, nie Seed oder `numRuns` (CLAUDE.md §13).
//
// BEWUSST NICHT GEDECKT (E-B2-4): `feld` an `person`/`name`. Der Generator erzeugt Existenz-Aussagen
// nur über `elternschaft`/`partnerschaft`/`ereignis.anlegen`; eine Existenz-Aussage über eine Person
// oder einen Namen gibt es in keinem Befehl — `feld` an diesen Subjekttypen ist damit über
// `aussage_zitat.anlegen` nicht erreichbar (docs/80 §31 U-1.34-B2-feld-person-name).
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

// Mocks wie in `undo-bitgleich.test.ts` (s. dort).
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import type { Tx } from '../../src/main/repositories/basis'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { BELEG_FELDER_JE_SUBJEKT } from '../../src/shared/schemata/aussage-zitat'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand, type Zweig } from './_befehlsfolge-generator'
import { BELEG_PFLICHTZWEIGE, type BelegAenderungInfo } from './_befehlsfolge-beleg'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Eine `aussage_zitat`-Zeile samt Transkript ihres Zitats und Kopf ihrer Aussage. */
interface BelegZeile {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
  readonly transkript: string | null
  readonly zitat_vorhanden: number
  readonly praedikat: string | null
  readonly subjekt_typ: string | null
}

function schluessel(aussageId: string, zitatId: string): string {
  return `${aussageId}|${zitatId}`
}

/** Alle Verknüpfungen (LEFT JOIN: eine Zeile ohne Zitat/Aussage fiele bei einem INNER JOIN still
 * heraus — hier wird sie als Verstoß sichtbar). */
function belegeLesen(db: Tx): ReadonlyMap<string, BelegZeile> {
  const zeilen = db
    .prepare<[], BelegZeile>(
      `SELECT az.aussage_id, az.zitat_id, az.feld, az.textanker_von, az.textanker_bis, az.erstellt_am, az.geaendert_am,
              z.transkript, (z.id IS NOT NULL) AS zitat_vorhanden, a.praedikat, a.subjekt_typ
       FROM aussage_zitat az
       LEFT JOIN zitat z ON z.id = az.zitat_id
       LEFT JOIN aussage a ON a.id = az.aussage_id`,
    )
    .all()
  return new Map(zeilen.map((z) => [schluessel(z.aussage_id, z.zitat_id), z]))
}

/** Transkript je Zitat. */
function transkripteLesen(db: Tx): ReadonlyMap<string, string | null> {
  const zeilen = db.prepare<[], { readonly id: string; readonly transkript: string | null }>('SELECT id, transkript FROM zitat').all()
  return new Map(zeilen.map((z) => [z.id, z.transkript]))
}

/** Die eigenen Spalten einer Verknüpfung (ohne die gejointen) als vergleichbarer Text. */
function eigeneSpalten(z: BelegZeile): string {
  return JSON.stringify([z.aussage_id, z.zitat_id, z.feld, z.textanker_von, z.textanker_bis, z.erstellt_am, z.geaendert_am])
}

function belegAbzug(belege: ReadonlyMap<string, BelegZeile>): string {
  return [...belege.values()].map(eigeneSpalten).sort().join('\n')
}

// --- I1: unabhängige Nachbildung der Ankerregel (F4) ---------------------------------------------

function hoch(einheit: number): boolean {
  return einheit >= 0xd800 && einheit <= 0xdbff
}

function tief(einheit: number): boolean {
  return einheit >= 0xdc00 && einheit <= 0xdfff
}

function grenzeTeiltPaar(text: string, i: number): boolean {
  return i > 0 && i < text.length && hoch(text.charCodeAt(i - 1)) && tief(text.charCodeAt(i))
}

function ankerVerstoesse(z: BelegZeile): readonly string[] {
  const von = z.textanker_von
  const bis = z.textanker_bis
  if (von === null && bis === null) {
    return []
  }
  if (von === null || bis === null) {
    return ['nur eine Ankergrenze gesetzt']
  }
  if (z.zitat_vorhanden !== 1) {
    return ['Zitat der Verknüpfung fehlt']
  }
  const text = z.transkript
  if (text === null) {
    return ['Anker ohne Transkript']
  }
  const fehler: string[] = []
  if (!Number.isInteger(von) || !Number.isInteger(bis)) {
    fehler.push('Grenze nicht ganzzahlig')
  }
  if (!(von >= 0 && von < bis && bis <= text.length)) {
    fehler.push(`[${von}, ${bis}) nicht in 0..${text.length}`)
  }
  if (grenzeTeiltPaar(text, von) || grenzeTeiltPaar(text, bis)) {
    fehler.push('Grenze teilt Ersatzpaar')
  }
  return fehler
}

// --- I3 ------------------------------------------------------------------------------------------

function feldVerstoesse(z: BelegZeile): readonly string[] {
  if (z.feld === null) {
    return []
  }
  if (z.praedikat !== 'existenz') {
    return [`feld "${z.feld}" an Aussage mit praedikat "${String(z.praedikat)}"`]
  }
  const liste = Object.entries(BELEG_FELDER_JE_SUBJEKT).find(([typ]) => typ === z.subjekt_typ)?.[1]
  if (liste === undefined || !liste.some((f) => f === z.feld)) {
    return [`feld "${z.feld}" passt nicht zu subjekt_typ "${String(z.subjekt_typ)}"`]
  }
  return []
}

function pruefeI1I3(belege: ReadonlyMap<string, BelegZeile>, wann: string): void {
  for (const [k, z] of belege) {
    const verstoesse = [...ankerVerstoesse(z), ...feldVerstoesse(z)]
    if (verstoesse.length > 0) {
      throw new Error(`I1/I3 verletzt ${wann} an ${k}: ${verstoesse.join('; ')}`)
    }
  }
}

// --- I2: E4-Stabilität um einen Schritt ----------------------------------------------------------

function pruefeI2(
  vorher: ReadonlyMap<string, BelegZeile>,
  nachher: ReadonlyMap<string, BelegZeile>,
  transkriptVorher: ReadonlyMap<string, string | null>,
  transkriptNachher: ReadonlyMap<string, string | null>,
  bearbeitet: BelegAenderungInfo | undefined,
): void {
  for (const [k, b] of vorher) {
    const a = nachher.get(k)
    if (a === undefined) {
      continue // gelöst oder mit Aussage/Zitat gelöscht — nicht Gegenstand von I2
    }
    if (bearbeitet !== undefined && k === schluessel(bearbeitet.aussageId, bearbeitet.zitatId)) {
      const erhalten = [a.feld, a.textanker_von, a.textanker_bis]
      const angefordert = [bearbeitet.feld, bearbeitet.von, bearbeitet.bis]
      if (JSON.stringify(erhalten) !== JSON.stringify(angefordert)) {
        throw new Error(`I2: aussage_zitat.aendern an ${k} ergab ${JSON.stringify(erhalten)} statt ${JSON.stringify(angefordert)}`)
      }
      continue
    }
    const alt = transkriptVorher.get(b.zitat_id) ?? null
    const neu = transkriptNachher.get(b.zitat_id) ?? null
    const unveraendertErwartet = (grund: string): void => {
      if (eigeneSpalten(a) !== eigeneSpalten(b)) {
        throw new Error(`I2 (${grund}): ${k} geändert: ${eigeneSpalten(b)} → ${eigeneSpalten(a)}`)
      }
    }
    if (alt === neu) {
      unveraendertErwartet('Transkript unverändert')
      continue
    }
    if (b.textanker_von === null || b.textanker_bis === null) {
      unveraendertErwartet('ohne Anker')
      continue
    }
    const von = b.textanker_von
    const bis = b.textanker_bis
    const bleibt = alt !== null && neu !== null && bis <= neu.length && neu.slice(von, bis) === alt.slice(von, bis)
    if (bleibt) {
      unveraendertErwartet('Anker bleibt (E4)')
      continue
    }
    if (a.textanker_von !== null || a.textanker_bis !== null || a.feld !== b.feld || a.erstellt_am !== b.erstellt_am) {
      throw new Error(`I2 (Anker muss entwertet sein, feld bleibt, E4): ${k}: ${eigeneSpalten(b)} → ${eigeneSpalten(a)}`)
    }
  }
}

// --- Zähler -------------------------------------------------------------------------------------

type Zaehlschluessel = Zweig | 'undo.entwertung'

const zaehler = new Map<Zaehlschluessel, number>()

function zaehle(schluesselWert: Zaehlschluessel): void {
  zaehler.set(schluesselWert, (zaehler.get(schluesselWert) ?? 0) + 1)
}

interface Schritt {
  readonly belegeVorher: ReadonlyMap<string, BelegZeile>
  readonly zweige: Set<Zweig>
}

describe('Invariante: Textanker gültig, E4-stabil, feld passend (ADR-009 §2, Nachtrag 24.09.2026; §31 E4/F1/F4)', () => {
  it('I1–I3 nach jedem Schritt einer Befehlsfolge, I1/I3 nach jedem Undo bis zum Anfang', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const zustand = neuerZustand()
          const schritte: Schritt[] = []
          let oberstesVorher = undoZiel(db)?.id
          let belege = belegeLesen(db)
          let transkripte = transkripteLesen(db)
          pruefeI1I3(belege, 'am Anfang')

          for (const [nr, aktion] of folge.entries()) {
            const zweige = aktionAusfuehren(db, zustand, aktion)
            for (const z of zweige) {
              zaehle(z)
            }
            const belegeNachher = belegeLesen(db)
            const transkripteNachher = transkripteLesen(db)
            pruefeI1I3(belegeNachher, `nach Schritt ${nr} (${aktion.art})`)
            pruefeI2(belege, belegeNachher, transkripte, transkripteNachher, zustand.belegAenderung)

            // Undo-Schritte wie in `undo-bitgleich.test.ts`: neue oberste Transaktion = neuer
            // Schritt; gleiche (No-op/Koaleszenz) = derselbe Schritt, Zweige kommen dazu.
            const oberstesJetzt = undoZiel(db)?.id
            if (oberstesJetzt !== oberstesVorher) {
              schritte.push({ belegeVorher: belege, zweige: new Set(zweige) })
            } else if (oberstesJetzt !== undefined) {
              const letzter = schritte[schritte.length - 1]
              if (letzter === undefined) {
                throw new Error('unerreichbar: eine oberste Transaktion existiert, also auch ein Schritt.')
              }
              for (const z of zweige) {
                letzter.zweige.add(z)
              }
            }
            oberstesVorher = oberstesJetzt
            belege = belegeNachher
            transkripte = transkripteNachher
          }

          for (let i = schritte.length - 1; i >= 0; i -= 1) {
            const schritt = schritte[i]
            if (schritt === undefined) {
              throw new Error('unerreichbar: Index liegt innerhalb von schritte.')
            }
            undo(db)
            const nachUndo = belegeLesen(db)
            pruefeI1I3(nachUndo, `nach Undo von Schritt ${i}`)
            if (schritt.zweige.has('zitat.entwertet')) {
              expect(belegAbzug(nachUndo)).toBe(belegAbzug(schritt.belegeVorher))
              zaehle('undo.entwertung')
            }
          }
          expect(undoZiel(db)).toBeUndefined()
        } finally {
          db.close()
        }
      }),
      // Fester Seed (CLAUDE.md §13, Determinismus), eigener Seed neben undo-bitgleich (20260910).
      { seed: 20260925, numRuns: 100 },
    )

    // E-B2-1 (c): kein Pflichtzweig darf leer grün sein.
    for (const z of [...BELEG_PFLICHTZWEIGE, 'undo.entwertung' as const]) {
      expect(zaehler.get(z) ?? 0, `Deckungszweig ${z}`).toBeGreaterThan(0)
    }
  }, 180_000)
})
