// Stufe 1 + Stufe 2 des Import-Vertrags (56_Import_Vertrag.md §4): Schema- und Referenzprüfung
// einer rohen Importdatei. Kein `throw` — jeder Ausgang ist ein Befund. Kein DB-Zugriff, kein
// `fs` hier: der Rohtext kommt von außen (Aufrufer liest die Datei, `src/main/import/pruefen.ts`),
// diese Datei prüft nur Text/Struktur → Befunde. Der Referenzabgleich mit dem Bestand
// (`db:`-Kennungen, Mediendateien) läuft über injizierte Prüfer (`BestandsKontext`), damit dieses
// Modul frei von `better-sqlite3`/`fs` bleibt (CLAUDE.md §2).
import { z } from 'zod'
import { bauePositionsindex, pfadFormat } from '../../core/import/positionsindex'
import { importDateiSchema, KENNUNG_REGEX, type ImportDatei } from '../../shared/schemata/import-v1'
import { ALLE_IMP_CODES, type Befund, type ImpCode, type PruefBericht } from '../../shared/import/imp-codes'

export interface Stufe1Ergebnis {
  readonly akzeptiert: boolean
  readonly befunde: readonly Befund[]
  /** Die typisierte, Zod-geprüfte Struktur — nur gesetzt, wenn `akzeptiert` `true` ist. Grundlage
   * für Stufe 2 (`pruefeStufe2`), die NICHT erneut parst/validiert (AP-1.3b). */
  readonly daten?: ImportDatei
}

/** Die injizierten Prüfer gegen den Bestand (AP-1.3b): hält `pruefeStufe2`/`validierung.ts` frei
 * von `better-sqlite3`/`fs` (CLAUDE.md §2 — SQL nur in `src/main/abfragen/`, Dateizugriff nur im
 * dünnen Handler `src/main/import/pruefen.ts`). */
export interface BestandsKontext {
  /** `true`, wenn die volle `db:<uuid>`-Kennung im Projekt existiert (IMP-202). */
  readonly kennungVorhanden: (dbKennung: string) => boolean
  /** `true`, wenn unter dem übergebenen `relativer_pfad` (relativ zur Importdatei, §3.8) eine
   * Datei existiert (IMP-208). */
  readonly mediumVorhanden: (relativerPfad: string) => boolean
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

  return { akzeptiert: true, befunde: [], daten: ergebnis.data }
}

function pruefeZusammenfassung(daten: z.infer<typeof importDateiSchema>, datei: string): readonly Befund[] {
  const befunde: Befund[] = []
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

function issueZuBefund(issue: z.core.$ZodIssue, daten: unknown, datei: string): Befund {
  const pfad = pfadFormat(issue.path)
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
  return ALLE_IMP_CODES.some((code) => code === wert)
}

function dedupliziere(befunde: readonly Befund[]): readonly Befund[] {
  const gesehen = new Set<string>()
  const ergebnis: Befund[] = []
  for (const befund of befunde) {
    const schluessel = `${befund.code}|${befund.pfad}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    ergebnis.push(befund)
  }
  return ergebnis
}

/** Bestbemühte „betroffene Kennung" (§5 Punkt 3): die letzte `id` eines Objekts entlang des
 * Pfads. Nicht jede Entität hat ein `id`-Feld (z. B. Elternschaft, Beteiligung) — dann bleibt
 * `kennung` unbestimmt, was das optionale Feld auf `Befund` zulässt. */
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

// -------------------------------------------------------------------------------------------
// Stufe 2 — Referenzen und Struktur (§4 IMP-201…IMP-209, AP-1.3b)
// -------------------------------------------------------------------------------------------

type Segment = string | number

/** Baut einen `Befund` mit leerem `datei` (wird von `pruefeImport` überschrieben — `pruefeStufe2`
 * kennt den Dateinamen bewusst nicht, nur die schon geprüfte Struktur). */
function befund(code: ImpCode, pfadSegmente: readonly Segment[], kennung?: string): Befund {
  const basis = { schweregrad: 'fehler' as const, code, pfad: pfadFormat(pfadSegmente), datei: '' }
  return kennung === undefined ? basis : { ...basis, kennung }
}

interface KennungOrt {
  readonly array: string
  readonly index: number
}

/** Alle Kennungen, die diese Datei selbst DEFINIERT (die sieben Kern-Arrays mit eigenem `id`-Feld,
 * §2.1) — Grundlage sowohl für IMP-201 (Existenzprüfung von `tmp:`-Referenzen) als auch IMP-203
 * (doppelte Kennung). Jede `id` zusammen mit JEDER Fundstelle (nicht nur der ersten), damit IMP-203
 * auf die ZWEITE Fundstelle zeigen kann (§5: die Fundstelle des Duplikats, nicht des Originals).
 * Explizit ein Feld nach dem anderen (statt dynamischer `keyof`-Indizierung) — vermeidet ein
 * unbegründetes `as` beim Zusammenführen der unterschiedlich optionalen Array-Felder (CLAUDE.md
 * §4). */
function sammleDefinitionen(datei: ImportDatei): ReadonlyMap<string, readonly KennungOrt[]> {
  const ergebnis = new Map<string, KennungOrt[]>()
  const merke = (arrayName: string, eintraege: readonly { readonly id: string }[] | undefined): void => {
    eintraege?.forEach((eintrag, index) => {
      const vorhanden = ergebnis.get(eintrag.id) ?? []
      vorhanden.push({ array: arrayName, index })
      ergebnis.set(eintrag.id, vorhanden)
    })
  }
  merke('quellen', datei.quellen)
  merke('personen', datei.personen)
  merke('orte', datei.orte)
  merke('ereignisse', datei.ereignisse)
  merke('partnerschaften', datei.partnerschaften)
  merke('medien', datei.medien)
  merke('interviews', datei.interviews)
  return ergebnis
}

function pruefeDoppelteKennungen(definitionen: ReadonlyMap<string, readonly KennungOrt[]>): readonly Befund[] {
  const befunde: Befund[] = []
  for (const [id, orte] of definitionen) {
    if (orte.length <= 1) continue
    const zweite = orte[1]
    if (zweite === undefined) continue
    befunde.push(befund('IMP-203', [zweite.array, zweite.index, 'id'], id))
  }
  return befunde
}

interface Referenz {
  readonly pfad: readonly Segment[]
  readonly wert: string
}

/** Alle Kennung-Referenzen (Fremdverweise) in der typisierten Struktur — NICHT per Regex auf dem
 * Rohtext (§4 Stufe 2 „Umsetzungsdetail, das leicht falsch gemacht wird"), sondern über die vom
 * Schema bekannten Kennung-Felder. Enthält bewusst NICHT die `id`-Felder selbst (das sind
 * Definitionen, keine Referenzen, s. `sammleDefinitionen`). */
function sammleReferenzen(datei: ImportDatei): readonly Referenz[] {
  const referenzen: Referenz[] = []
  const push = (pfad: readonly Segment[], wert: string | undefined): void => {
    if (wert !== undefined) referenzen.push({ pfad, wert })
  }
  const pushBelege = (basisPfad: readonly Segment[], belege: readonly { readonly quelle: string }[]): void => {
    belege.forEach((beleg, i) => push([...basisPfad, 'belege', i, 'quelle'], beleg.quelle))
  }

  datei.quellen.forEach((quelle, i) => {
    push(['quellen', i, 'informant_person'], quelle.informant_person)
    push(['quellen', i, 'audio_medium'], quelle.audio_medium)
  })
  datei.interviews?.forEach((interview, i) => {
    push(['interviews', i, 'informant_person'], interview.informant_person)
    push(['interviews', i, 'ort'], interview.ort)
    push(['interviews', i, 'audio_medium'], interview.audio_medium)
  })
  datei.personen?.forEach((person, i) => {
    pushBelege(['personen', i], person.belege)
  })
  datei.orte?.forEach((ort, i) => {
    ort.zugehoerigkeiten?.forEach((zugehoerigkeit, j) => push(['orte', i, 'zugehoerigkeiten', j, 'uebergeordnet'], zugehoerigkeit.uebergeordnet))
  })
  datei.ereignisse?.forEach((ereignis, i) => {
    push(['ereignisse', i, 'ort'], ereignis.ort)
    ereignis.beteiligungen.forEach((beteiligung, j) => push(['ereignisse', i, 'beteiligungen', j, 'person'], beteiligung.person))
    pushBelege(['ereignisse', i], ereignis.belege)
  })
  datei.elternschaften?.forEach((elternschaft, i) => {
    push(['elternschaften', i, 'elternteil'], elternschaft.elternteil)
    push(['elternschaften', i, 'kind'], elternschaft.kind)
    pushBelege(['elternschaften', i], elternschaft.belege)
  })
  datei.partnerschaften?.forEach((partnerschaft, i) => {
    partnerschaft.beteiligte.forEach((beteiligter, j) => push(['partnerschaften', i, 'beteiligte', j, 'person'], beteiligter.person))
    pushBelege(['partnerschaften', i], partnerschaft.belege)
  })
  datei.aussagen?.forEach((aussage, i) => {
    push(['aussagen', i, 'subjekt'], aussage.subjekt)
    push(['aussagen', i, 'wert_ref'], aussage.wert_ref)
    pushBelege(['aussagen', i], aussage.belege)
  })
  datei.medien?.forEach((medium, i) => {
    push(['medien', i, 'ort'], medium.ort)
    medium.zuordnungen?.forEach((zuordnung, j) => push(['medien', i, 'zuordnungen', j, 'subjekt'], zuordnung.subjekt))
  })
  datei.diagnosen?.forEach((diagnose, i) => {
    push(['diagnosen', i, 'person'], diagnose.person)
    pushBelege(['diagnosen', i], diagnose.belege)
  })
  datei.risikofaktoren?.forEach((risikofaktor, i) => {
    push(['risikofaktoren', i, 'person'], risikofaktor.person)
    pushBelege(['risikofaktoren', i], risikofaktor.belege)
  })

  return referenzen
}

function pruefeReferenzen(datei: ImportDatei, definitionen: ReadonlyMap<string, readonly KennungOrt[]>, kontext: BestandsKontext): readonly Befund[] {
  const befunde: Befund[] = []
  for (const referenz of sammleReferenzen(datei)) {
    if (referenz.wert.startsWith('tmp:')) {
      if (!definitionen.has(referenz.wert)) {
        befunde.push(befund('IMP-201', referenz.pfad, referenz.wert))
      }
    } else if (referenz.wert.startsWith('db:')) {
      if (!kontext.kennungVorhanden(referenz.wert)) {
        befunde.push(befund('IMP-202', referenz.pfad, referenz.wert))
      }
    }
  }
  return befunde
}

/** Zyklus in `elternschaften` (IMP-204): jemand wäre sein eigener Vorfahre. Klassische
 * Tiefensuche mit Rekursionsstapel über den gerichteten Graphen `elternteil -> kind`; findet die
 * DFS eine Kante zurück in den aktuellen Pfad, ist das der Zyklus. Gibt die Kante (Index in
 * `elternschaften`) zurück, die den Zyklus schließt — nicht jeden Knoten des Zyklus, damit genau
 * EIN Befund entsteht (§4/§5: ein Fund pro Verletzung). */
function findeElternschaftsZyklus(elternschaften: ImportDatei['elternschaften']): { readonly index: number; readonly person: string } | undefined {
  if (elternschaften === undefined || elternschaften.length === 0) return undefined

  const kinderVon = new Map<string, string[]>()
  const kanteZuIndex = new Map<string, number>()
  elternschaften.forEach((elternschaft, index) => {
    const kinder = kinderVon.get(elternschaft.elternteil) ?? []
    kinder.push(elternschaft.kind)
    kinderVon.set(elternschaft.elternteil, kinder)
    kanteZuIndex.set(`${elternschaft.elternteil}|${elternschaft.kind}`, index)
  })

  const besucht = new Set<string>()
  const imPfad = new Set<string>()

  function dfs(knoten: string, pfad: readonly string[]): readonly string[] | undefined {
    if (imPfad.has(knoten)) return [...pfad, knoten]
    if (besucht.has(knoten)) return undefined
    imPfad.add(knoten)
    for (const kind of kinderVon.get(knoten) ?? []) {
      const treffer = dfs(kind, [...pfad, knoten])
      if (treffer !== undefined) return treffer
    }
    imPfad.delete(knoten)
    besucht.add(knoten)
    return undefined
  }

  for (const startKnoten of kinderVon.keys()) {
    if (besucht.has(startKnoten)) continue
    const zyklus = dfs(startKnoten, [])
    if (zyklus === undefined) continue
    const wiederholterKnoten = zyklus[zyklus.length - 1]
    const vorheriger = zyklus[zyklus.length - 2]
    if (wiederholterKnoten === undefined || vorheriger === undefined) continue
    const index = kanteZuIndex.get(`${vorheriger}|${wiederholterKnoten}`)
    if (index !== undefined) return { index, person: wiederholterKnoten }
  }
  return undefined
}

/** IMP-205: `ueberschreiben: true` ist nur an einer `db:`-Kennung sinnvoll (§2.1) — an einer
 * `tmp:`-Kennung gibt es nichts, das überschrieben werden könnte. */
function pruefeUeberschreiben(personen: ImportDatei['personen']): readonly Befund[] {
  const befunde: Befund[] = []
  personen?.forEach((person, i) => {
    if (person.ueberschreiben === true && !person.id.startsWith('db:')) {
      befunde.push(befund('IMP-205', ['personen', i, 'ueberschreiben'], person.id))
    }
  })
  return befunde
}

/** IMP-206: NUR `personen` (ENTSCHIEDEN, nicht `aussagen`) — `konfidenz <= 2` ohne (nicht-leeren)
 * `unsicherheit`-Text. */
function pruefeKonfidenzOhneUnsicherheit(personen: ImportDatei['personen']): readonly Befund[] {
  const befunde: Befund[] = []
  personen?.forEach((person, i) => {
    const hatUnsicherheit = person.unsicherheit !== undefined && person.unsicherheit.trim().length > 0
    if (person.konfidenz <= 2 && !hatUnsicherheit) {
      befunde.push(befund('IMP-206', ['personen', i, 'unsicherheit'], person.id))
    }
  })
  return befunde
}

/** IMP-207: `ist_bevorzugt` ohne `begruendung`, wenn mindestens eine weitere Aussage zu
 * demselben Subjekt+Prädikat konkurriert (§3.6). */
function pruefeAussageBevorzugung(aussagen: ImportDatei['aussagen']): readonly Befund[] {
  if (aussagen === undefined) return []
  const gruppen = new Map<string, number[]>()
  aussagen.forEach((aussage, index) => {
    const schluessel = `${aussage.subjekt_typ}|${aussage.subjekt}|${aussage.praedikat}`
    const indices = gruppen.get(schluessel) ?? []
    indices.push(index)
    gruppen.set(schluessel, indices)
  })

  const befunde: Befund[] = []
  for (const indices of gruppen.values()) {
    if (indices.length < 2) continue
    for (const index of indices) {
      const aussage = aussagen[index]
      if (aussage === undefined) continue
      const hatBegruendung = aussage.begruendung !== undefined && aussage.begruendung.trim().length > 0
      if (aussage.ist_bevorzugt === true && !hatBegruendung) {
        befunde.push(befund('IMP-207', ['aussagen', index, 'begruendung'], aussage.subjekt))
      }
    }
  }
  return befunde
}

/** IMP-208: Mediendatei unter `relativer_pfad` nicht gefunden (Prüfung über den injizierten
 * `BestandsKontext`, kein `fs`-Zugriff hier). */
function pruefeMedien(medien: ImportDatei['medien'], kontext: BestandsKontext): readonly Befund[] {
  const befunde: Befund[] = []
  medien?.forEach((medium, i) => {
    if (!kontext.mediumVorhanden(medium.relativer_pfad)) {
      befunde.push(befund('IMP-208', ['medien', i, 'relativer_pfad'], medium.id))
    }
  })
  return befunde
}

/** Index der ersten Wiederholung in `personen` — `undefined`, wenn alle verschieden sind. */
function ersteWiederholung(personen: readonly string[]): number | undefined {
  const gesehen = new Set<string>()
  for (let i = 0; i < personen.length; i += 1) {
    const wert = personen[i]
    if (wert === undefined) continue
    if (gesehen.has(wert)) return i
    gesehen.add(wert)
  }
  return undefined
}

/** IMP-209: `beteiligte`/`beteiligungen` verweist zweimal auf dieselbe Person. */
function pruefeDoppelteBeteiligung(datei: ImportDatei): readonly Befund[] {
  const befunde: Befund[] = []
  datei.ereignisse?.forEach((ereignis, i) => {
    const index = ersteWiederholung(ereignis.beteiligungen.map((beteiligung) => beteiligung.person))
    if (index !== undefined) {
      befunde.push(befund('IMP-209', ['ereignisse', i, 'beteiligungen', index, 'person'], ereignis.id))
    }
  })
  datei.partnerschaften?.forEach((partnerschaft, i) => {
    const index = ersteWiederholung(partnerschaft.beteiligte.map((beteiligter) => beteiligter.person))
    if (index !== undefined) {
      befunde.push(befund('IMP-209', ['partnerschaften', i, 'beteiligte', index, 'person'], partnerschaft.id))
    }
  })
  return befunde
}

/**
 * Stufe 2 des Import-Vertrags (§4 IMP-201…IMP-209): Referenz- und Strukturprüfung über die
 * TYPISIERTE Struktur (aus `pruefeStufe1` bzw. `Stufe1Ergebnis.daten`) — bewusst kein Regex auf
 * dem Rohtext (§4 „Umsetzungsdetail, das leicht falsch gemacht wird"). Läuft nur, wenn Stufe 1
 * akzeptiert hat (Aufrufer: `pruefeImport`). Dedupliziert nach `code|pfad`, damit eine einzelne
 * Verletzung nicht versehentlich mehrfach gemeldet wird.
 */
export function pruefeStufe2(datei: ImportDatei, kontext: BestandsKontext): readonly Befund[] {
  const definitionen = sammleDefinitionen(datei)

  const befunde: Befund[] = [
    ...pruefeDoppelteKennungen(definitionen),
    ...pruefeReferenzen(datei, definitionen, kontext),
    ...pruefeUeberschreiben(datei.personen),
    ...pruefeKonfidenzOhneUnsicherheit(datei.personen),
    ...pruefeAussageBevorzugung(datei.aussagen),
    ...pruefeMedien(datei.medien, kontext),
    ...pruefeDoppelteBeteiligung(datei),
  ]

  const zyklus = findeElternschaftsZyklus(datei.elternschaften)
  if (zyklus !== undefined) {
    befunde.push(befund('IMP-204', ['elternschaften', zyklus.index], zyklus.person))
  }

  return dedupliziere(befunde)
}

// -------------------------------------------------------------------------------------------
// Gesamtablauf — Stufe 1 → Stufe 2, Zeilennummern (§4, §5 Punkt 4, AP-1.3b)
// -------------------------------------------------------------------------------------------

/**
 * Der vollständige Prüfvorgang: Stufe 1, und nur wenn diese akzeptiert, Stufe 2. Baut den
 * Positionsindex GENAU EINMAL (nicht pro Befund) und reichert jeden Befund — aus Stufe 1 UND aus
 * Stufe 2 — um seine Zeilennummer an (§5 Punkt 4). Ein Pfad, der im Rohtext nicht auffindbar ist
 * (z. B. ein komplett fehlendes Pflichtfeld), bleibt ohne `zeile` — das ist kein Fehler dieser
 * Funktion, sondern eine Eigenschaft des Positionsindex (`bauePositionsindex`).
 */
export function pruefeImport(rohtext: string, datei: string, kontext: BestandsKontext): PruefBericht {
  const index = bauePositionsindex(rohtext)
  const anreichern = (roheBefunde: readonly Befund[]): readonly Befund[] =>
    roheBefunde.map((roh) => {
      const basis = { ...roh, datei }
      const zeile = index.zeileFuer(roh.pfad)
      return zeile === undefined ? basis : { ...basis, zeile }
    })

  const stufe1 = pruefeStufe1(rohtext, datei)
  if (!stufe1.akzeptiert || stufe1.daten === undefined) {
    return { akzeptiert: false, befunde: anreichern(stufe1.befunde) }
  }

  const stufe2Befunde = pruefeStufe2(stufe1.daten, kontext)
  return { akzeptiert: stufe2Befunde.length === 0, befunde: anreichern(stufe2Befunde) }
}
