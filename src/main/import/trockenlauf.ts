// AP-1.4a, 56_Import_Vertrag.md §6: Orchestrierung des Trockenlaufs — "der echte Import in einer
// Transaktion, die zurückgerollt wird" (§6.1). Läuft auf einer bereits offenen, ARMIERTEN
// Transaktion (Aufrufer: `src/main/befehle/import-trockenlauf.ts`, CLAUDE.md §2 Regel 3 — dieses
// Modul öffnet selbst keine Transaktion und erzwingt kein `ROLLBACK`, das ist Sache des Aufrufers).
// Ablauf exakt in dieser Reihenfolge:
//   Datei lesen → pruefeImport() (Stufe 1+2) → nur bei `akzeptiert`: schreibeImport() (DERSELBE
//   Schreibweg wie der echte Import, kein zweiter Codeweg) → Stufe 3 (Plausibilität, rein,
//   `src/core/plausibilitaet/regeln.ts`) → Stufe 4 (Kollisionen mit dem Bestand,
//   `src/main/abfragen/import-kollision.ts`) → `aenderungenRoh()` (das tatsächliche Journal DIESER
//   Transaktion — der Bericht ist buchstäblich das, was geschrieben wurde) → `baueBericht()`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bauePositionsindex } from '../../core/import/positionsindex'
import { nachJdn } from '../../core/datum/kalender'
import { SENTINEL_JDN_MAX, SENTINEL_JDN_MIN } from '../../core/datum/typen'
import {
  pruefePlausibilitaet,
  type JdnIntervall,
  type PlausAussage,
  type PlausDiagnose,
  type PlausEreignis,
  type PlausElternschaft,
  type PlausibilitaetEingabe,
  type PlausNamenEintrag,
  type PlausOrt,
  type PlausPartnerschaft,
  type PlausPerson,
} from '../../core/plausibilitaet/regeln'
import { ALLE_IMP_CODES, type Befund, type ImpCode } from '../../shared/import/imp-codes'
import type { Trockenlaufbericht, TrockenlaufAngelegtEintrag, TrockenlaufErgaenzungEintrag } from '../../shared/import/trockenlauf-bericht'
import type { Datumswert as VertragsDatumswert, ImportDatei } from '../../shared/schemata/import-v1'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { vorhandeneKennungen } from '../abfragen/import-bestand'
import {
  bereitsImportiertAm,
  findeBevorzugungsKonflikte,
  findeOrtsDubletten,
  findePersonenDubletten,
  findeQuellenDubletten,
  type BevorzugteErgaenzung,
} from '../abfragen/import-kollision'
import { aenderungenRoh } from '../repositories/journal-repo'
import type { Tx } from '../repositories/basis'
import { baueBericht, type RohBerichtsdaten } from './bericht'
import { datumSpalten } from './datum-spalten'
import { pruefeStufe1, pruefeStufe2 } from './validierung'
import { schreibeImport } from './schreiben'

/** Top-Level-Tabellen des Vertrags (56_Import_Vertrag.md §2) für den Block "WIRD ANGELEGT" —
 * bewusst OHNE die internen Kindtabellen (`name`, `ortsname`, `beteiligung`, `partnerschaft_person`,
 * `zitat`, `aussage_zitat`): die sind für den Bericht kein eigenständig interessanter Zähler. */
const WIRD_ANGELEGT_TABELLEN = ['person', 'ort', 'ereignis', 'elternschaft', 'partnerschaft', 'quelle', 'interview_sitzung', 'medium', 'diagnose', 'risikofaktor', 'aussage'] as const

export interface TrockenlaufOptionen {
  readonly erstelltAm: number
  readonly transaktionId: string
}

function istImpCode(wert: string): wert is ImpCode {
  return ALLE_IMP_CODES.some((code) => code === wert)
}

/** Core-`PlausHinweis.code` (core-lokale Union) → shared `ImpCode`. Defensiv (CLAUDE.md §4: kein
 * `!`/`as`) — die beiden Unionen sind von Hand synchron gehalten (s. Kopfkommentar `regeln.ts`). */
function alsBefund(hinweis: { readonly code: string; readonly pfad: string; readonly kennung?: string }, datei: string): Befund {
  if (!istImpCode(hinweis.code)) {
    throw new WurzelFehler('INTERN_UNERWARTET', `trockenlauf: unbekannter Plausibilitätscode "${hinweis.code}" (regeln.ts/imp-codes.ts sind nicht mehr synchron).`)
  }
  const basis = { schweregrad: 'hinweis' as const, code: hinweis.code, pfad: hinweis.pfad, datei }
  return hinweis.kennung === undefined ? basis : { ...basis, kennung: hinweis.kennung }
}

function jdnAusVertragsDatum(dw: VertragsDatumswert | undefined): JdnIntervall | undefined {
  const spalten = datumSpalten(dw)
  if (spalten.sortVon === null || spalten.sortBis === null) return undefined
  return { von: spalten.sortVon, bis: spalten.sortBis }
}

function jdnAusJahresspanne(von: number | undefined, bis: number | undefined): JdnIntervall | undefined {
  if (von === undefined && bis === undefined) return undefined
  return {
    von: von !== undefined ? nachJdn(von, 1, 1, 'gregorian') : SENTINEL_JDN_MIN,
    bis: bis !== undefined ? nachJdn(bis + 1, 1, 1, 'gregorian') - 1 : SENTINEL_JDN_MAX,
  }
}

/** Datum + Kennung der (einzigen erwarteten) Person mit `rolle` in einem Ereignis vom Typ `typ` (Geburt/Tod/Beerdigung, §3.5). */
function ereignisDatumFuerPerson(ereignisse: ImportDatei['ereignisse'], personKennung: string, typ: string, rolle: string): JdnIntervall | undefined {
  for (const ereignis of ereignisse ?? []) {
    if (ereignis.typ !== typ || ereignis.datum === undefined) continue
    const beteiligt = ereignis.beteiligungen.some((b) => b.rolle === rolle && b.person === personKennung)
    if (beteiligt) return jdnAusVertragsDatum(ereignis.datum)
  }
  return undefined
}

/** Baut die core-lokale `PlausibilitaetEingabe` aus der (Stufe-1/2-akzeptierten) `ImportDatei` — der
 * main-Adapter, der die JDN-Intervalle füllt (Moduldoku `regeln.ts`). */
function baueePlausibilitaetEingabe(datei: ImportDatei): PlausibilitaetEingabe {
  const quelleTypNachKennung = new Map(datei.quellen.map((q) => [q.id, q.typ] as const))

  const personen: PlausPerson[] = (datei.personen ?? []).map((p, i) => ({
    kennung: p.id,
    pfad: `personen[${i}]`,
    geschlecht: p.geschlecht,
    geburt: ereignisDatumFuerPerson(datei.ereignisse, p.id, 'geburt', 'hauptperson'),
    tod: ereignisDatumFuerPerson(datei.ereignisse, p.id, 'tod', 'verstorbener'),
    beerdigung: ereignisDatumFuerPerson(datei.ereignisse, p.id, 'beerdigung', 'verstorbener'),
  }))

  const namen: PlausNamenEintrag[] = (datei.personen ?? []).flatMap((p, personIndex) =>
    (p.namen ?? []).map((n, namenIndex) => {
      const original = n.umschrift_von !== undefined ? p.namen?.[n.umschrift_von] : undefined
      return {
        personKennung: p.id,
        personPfad: `personen[${personIndex}]`,
        pfad: `personen[${personIndex}].namen[${namenIndex}]`,
        schrift: n.schrift,
        istTransliteriert: n.typ === 'transliteriert',
        umschriftVonSchrift: original?.schrift,
        istBevorzugt: n.ist_bevorzugt === true,
      }
    }),
  )

  const orte: PlausOrt[] = (datei.orte ?? []).map((o, i) => ({
    kennung: o.id,
    pfad: `orte[${i}]`,
    koordinate: o.koordinaten !== undefined ? { herkunftVorhanden: o.koordinaten.herkunft !== undefined } : undefined,
    existiert: jdnAusJahresspanne(o.existiert_von, o.existiert_bis),
  }))

  const ereignisse: PlausEreignis[] = (datei.ereignisse ?? []).map((e, i) => ({
    kennung: e.id,
    pfad: `ereignisse[${i}]`,
    ort: e.ort,
    datum: jdnAusVertragsDatum(e.datum),
    beteiligte: e.beteiligungen.map((b) => b.person),
  }))

  const elternschaften: PlausElternschaft[] = (datei.elternschaften ?? []).map((el, i) => ({
    pfad: `elternschaften[${i}]`,
    elternteil: el.elternteil,
    kind: el.kind,
  }))

  const partnerschaften: PlausPartnerschaft[] = (datei.partnerschaften ?? []).map((pa, i) => ({
    pfad: `partnerschaften[${i}]`,
    beginn: jdnAusVertragsDatum(pa.beginn),
    beteiligte: pa.beteiligte.map((b) => b.person),
  }))

  const aussagen: PlausAussage[] = (datei.aussagen ?? []).map((a, i) => ({
    pfad: `aussagen[${i}]`,
    praedikat: a.praedikat,
  }))

  const diagnosen: PlausDiagnose[] = (datei.diagnosen ?? []).map((d, i) => ({
    pfad: `diagnosen[${i}]`,
    personKennung: d.person,
    konfidenz: d.konfidenz,
    nurMuendlicheQuellen: d.belege.every((beleg) => quelleTypNachKennung.get(beleg.quelle) === 'muendlich'),
  }))

  return {
    personen,
    namen,
    orte,
    ereignisse,
    elternschaften,
    partnerschaften,
    aussagen,
    diagnosen,
    notizenUnverarbeitetAnzahl: datei.notizen_unverarbeitet?.length ?? 0,
    pruefsummeVorhanden: datei.pruefsumme_quelltext !== undefined,
  }
}

function leererBericht(datei: string, fehler: readonly Befund[]): Trockenlaufbericht {
  return baueBericht({
    datei,
    vertragErzeugtAm: null,
    vertragWerkzeug: null,
    pruefsummeQuelltext: null,
    bereitsImportiertAmMs: undefined,
    fehler,
    hinweise: [],
    wirdAngelegt: [],
    wirdErgaenzt: [],
    moeglicheDubletten: [],
    geaenderteZeilenAnzahl: 0,
    nichtVerarbeitetesMaterial: [],
    gesundheitsdaten: { diagnosenAnzahl: 0, risikofaktorenAnzahl: 0 },
  })
}

/**
 * Führt den Trockenlauf für die Datei unter `pfad` durch (56_Import_Vertrag.md §6). Läuft auf der
 * bereits offenen, armierten Transaktion `tx` — öffnet/schließt selbst nichts (CLAUDE.md §2 Regel
 * 3, s. Kopfkommentar). Der Aufrufer (`src/main/befehle/import-trockenlauf.ts`) rollt IMMER zurück,
 * unabhängig vom Ergebnis dieser Funktion.
 */
export function fuehreTrockenlaufDurch(tx: Tx, pfad: string, opt: TrockenlaufOptionen): Trockenlaufbericht {
  let rohtext: string
  try {
    rohtext = readFileSync(pfad, 'utf8')
  } catch (u) {
    throw new WurzelFehler('DATEI_NICHT_LESBAR', u instanceof Error ? u.message : String(u))
  }
  const importOrdner = dirname(pfad)
  const kontext = {
    kennungVorhanden: (dbKennung: string) => vorhandeneKennungen(tx, [dbKennung]).has(dbKennung),
    mediumVorhanden: (relativerPfad: string) => existsSync(join(importOrdner, relativerPfad)),
  }

  // Exakt der Ablauf von `pruefeImport()` (Stufe 1 → nur bei Erfolg Stufe 2, Zeilennummern
  // anreichern) — hier direkt über `pruefeStufe1`/`pruefeStufe2` statt über `pruefeImport()|,
  // damit die bereits von Zod geparste, typisierte Struktur (`stufe1.daten`) unten weiterverwendet
  // werden kann, statt den Rohtext ein zweites Mal zu parsen (kein zweiter `JSON.parse` + `as`,
  // CLAUDE.md §4).
  const positionsindex = bauePositionsindex(rohtext)
  const anreichern = (roheBefunde: readonly Befund[]): readonly Befund[] =>
    roheBefunde.map((roh) => {
      const zeile = positionsindex.zeileFuer(roh.pfad)
      return zeile === undefined ? roh : { ...roh, zeile }
    })

  const stufe1 = pruefeStufe1(rohtext, pfad)
  if (!stufe1.akzeptiert || stufe1.daten === undefined) {
    return leererBericht(pfad, anreichern(stufe1.befunde))
  }
  const stufe2Befunde = pruefeStufe2(stufe1.daten, kontext)
  if (stufe2Befunde.length > 0) {
    return leererBericht(pfad, anreichern(stufe2Befunde.map((roh) => ({ ...roh, datei: pfad }))))
  }

  const datei: ImportDatei = stufe1.daten

  const schreibErgebnis = schreibeImport(tx, datei, { erstelltAm: opt.erstelltAm })

  const plausibilitaetHinweise = pruefePlausibilitaet(baueePlausibilitaetEingabe(datei)).map((hinweis) => alsBefund(hinweis, pfad))

  const neuePersonenKandidaten = (datei.personen ?? [])
    .filter((p) => !p.id.startsWith('db:'))
    .map((p) => {
      const uuid = schreibErgebnis.kennungen.get(p.id)
      return uuid === undefined ? undefined : { kennung: p.id, uuid }
    })
    .filter((k): k is { readonly kennung: string; readonly uuid: string } => k !== undefined)
  const neueOrteKandidaten = (datei.orte ?? [])
    .filter((o) => !o.id.startsWith('db:'))
    .map((o) => {
      const uuid = schreibErgebnis.kennungen.get(o.id)
      return uuid === undefined ? undefined : { kennung: o.id, uuid }
    })
    .filter((k): k is { readonly kennung: string; readonly uuid: string } => k !== undefined)
  const neueQuellenKandidaten = datei.quellen
    .filter((q) => !q.id.startsWith('db:'))
    .map((q) => {
      const uuid = schreibErgebnis.kennungen.get(q.id)
      return uuid === undefined ? undefined : { kennung: q.id, uuid }
    })
    .filter((k): k is { readonly kennung: string; readonly uuid: string } => k !== undefined)

  const moeglicheDubletten = [
    ...findePersonenDubletten(tx, neuePersonenKandidaten),
    ...findeOrtsDubletten(tx, neueOrteKandidaten),
    ...findeQuellenDubletten(tx, neueQuellenKandidaten),
  ]

  const bevorzugteErgaenzungen: readonly BevorzugteErgaenzung[] = schreibErgebnis.ergaenzungen
    .filter((e) => e.istBevorzugt === true)
    .map((e) => ({
      subjektKennung: e.subjektKennung,
      subjektTyp: e.subjektTyp,
      subjektId: e.subjektId,
      praedikat: e.praedikat,
      neueAussageId: e.aussageId,
      wertText: e.wertText ?? null,
      wertZahl: e.wertZahl ?? null,
    }))
  const konflikte = findeBevorzugungsKonflikte(tx, bevorzugteErgaenzungen)
  const konfliktSchluessel = new Set(konflikte.map((k) => `${k.subjektKennung}|${k.praedikat}`))

  const wirdErgaenzt: readonly TrockenlaufErgaenzungEintrag[] = schreibErgebnis.ergaenzungen.map((e) => ({
    subjektKennung: e.subjektKennung,
    praedikat: e.praedikat,
    wertText: e.wertText ?? null,
    wertZahl: e.wertZahl ?? null,
    istKonflikt: konfliktSchluessel.has(`${e.subjektKennung}|${e.praedikat}`),
  }))

  const wirdAngelegt: readonly TrockenlaufAngelegtEintrag[] = WIRD_ANGELEGT_TABELLEN.map((tabelle) => {
    const gesamt = schreibErgebnis.zeilen[tabelle] ?? 0
    const anzahl = tabelle === 'aussage' ? gesamt - schreibErgebnis.ergaenzungen.length : gesamt
    return { tabelle, anzahl }
  }).filter((eintrag) => eintrag.anzahl > 0)

  const aenderungsZeilen = aenderungenRoh(tx, opt.transaktionId)
  const bereitsAmMs = datei.pruefsumme_quelltext !== undefined ? bereitsImportiertAm(tx, datei.pruefsumme_quelltext) : undefined

  const roh: RohBerichtsdaten = {
    datei: pfad,
    vertragErzeugtAm: datei.erzeugt.am,
    vertragWerkzeug: datei.erzeugt.werkzeug,
    pruefsummeQuelltext: datei.pruefsumme_quelltext ?? null,
    bereitsImportiertAmMs: bereitsAmMs,
    fehler: [],
    hinweise: plausibilitaetHinweise,
    wirdAngelegt,
    wirdErgaenzt,
    moeglicheDubletten,
    geaenderteZeilenAnzahl: aenderungsZeilen.length,
    nichtVerarbeitetesMaterial: (datei.notizen_unverarbeitet ?? []).map((notiz) => ({ text: notiz.text, warum: notiz.warum })),
    gesundheitsdaten: {
      diagnosenAnzahl: datei.diagnosen?.length ?? 0,
      risikofaktorenAnzahl: datei.risikofaktoren?.length ?? 0,
    },
  }
  return baueBericht(roh)
}
